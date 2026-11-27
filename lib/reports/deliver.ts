import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { appOrigin } from '@/lib/security'
import { renderReportEmail } from '@/lib/email/report'
import { buildReport } from './compute'
import { paramsForCustom, parseCustomConfig } from './custom'
import { SEND_GAP_MS, applyDelivery, runOutcome, scopeHash, type DeliveryWork } from './delivery'
import { resolveEmailTransport } from './email-mode'
import { loadDataset, loadScope } from './engine'
import { filenameFor, renderReportFile } from './files'
import { paramsToSearch, parseReportParams } from './params'
import { resolveRange } from './date-range'
import type { AccessScope, ReportParams } from './types'

type Admin = SupabaseClient<Database>
const OWNER_PAUSED = 'Owner can no longer send scheduled reports'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function asParams(config: unknown, reportKey: string): ReportParams {
  const record = config && typeof config === 'object' ? (config as Record<string, unknown>) : {}
  const params = record.params && typeof record.params === 'object' ? record.params : record
  return parseReportParams(reportKey, params)
}

function narrow(scope: AccessScope, params: ReportParams): { scope: AccessScope; params: ReportParams } | null {
  const projects = params.projects === 'all'
    ? scope.project_ids
    : params.projects.filter((id) => scope.project_ids.includes(id))
  if (projects.length === 0) return null
  let categories = scope.read_category_ids
  if (params.categories?.length) {
    categories = params.categories.filter((id) => scope.read_category_ids.includes(id))
    if (categories.length === 0) return null
  }
  return {
    scope: { ...scope, project_ids: projects, read_category_ids: categories },
    params: { ...params, projects, categories: params.categories ? categories : undefined },
  }
}

export async function processReportRun(admin: Admin, runId: string, deadline = Date.now() + 45_000): Promise<{ status: string; message?: string }> {
  const { data: run, error: runError } = await admin.from('report_runs').select('*').eq('id', runId).maybeSingle()
  if (runError || !run) throw new Error(runError?.message || 'Report run not found.')
  const { data: schedule, error: scheduleError } = await admin.from('report_schedules').select('*').eq('id', run.schedule_id).maybeSingle()
  if (scheduleError || !schedule) throw new Error(scheduleError?.message || 'Schedule not found.')
  const { data: owner } = await admin.from('users').select('id, name, email, is_active').eq('id', schedule.owner_id).maybeSingle()
  const ownerScope = await loadScope(admin, schedule.owner_id)
  if (!ownerScope.can_schedule) {
    await admin.from('report_schedules').update({ status: 'paused', paused_reason: OWNER_PAUSED }).eq('id', schedule.id)
    await admin.from('report_runs').update({ status: 'skipped', error: OWNER_PAUSED, finished_at: new Date().toISOString(), lease_until: null }).eq('id', run.id)
    return { status: 'skipped', message: OWNER_PAUSED }
  }

  const { data: recipients, error: recipientError } = await admin
    .from('report_schedule_recipients')
    .select('id, user_id, unsubscribe_token, unsubscribed_at')
    .eq('schedule_id', schedule.id)
  if (recipientError) throw new Error(recipientError.message)
  const { data: people } = await admin.from('users').select('id, email, is_active, tenant_id').in('id', (recipients || []).map((row) => row.user_id).concat('00000000-0000-0000-0000-000000000000'))

  for (const recipient of recipients || []) {
    const person = (people || []).find((row) => row.id === recipient.user_id)
    await admin.from('report_deliveries').upsert({
      tenant_id: schedule.tenant_id,
      run_id: run.id,
      user_id: recipient.user_id,
      email: person?.email || '',
      status: 'pending',
    }, { onConflict: 'run_id,user_id', ignoreDuplicates: true })
  }

  const { data: deliveries } = await admin.from('report_deliveries').select('*').eq('run_id', run.id)
  const transport = resolveEmailTransport()
  const params = asParams(schedule.config, schedule.report_key)
  const cache = new Map<string, Awaited<ReturnType<typeof buildFor>>>()
  const origin = appOrigin()
  let unfinished = false

  for (const row of deliveries || []) {
    if (Date.now() > deadline) {
      unfinished = true
      break
    }
    if (row.status !== 'pending' && row.status !== 'failed') continue
    const recipient = (recipients || []).find((item) => item.user_id === row.user_id)
    const person = (people || []).find((item) => item.id === row.user_id)
    const work: DeliveryWork = {
      id: row.id,
      userId: row.user_id,
      email: row.email,
      status: row.status as DeliveryWork['status'],
      error: row.error,
      resendId: row.resend_id,
      unsubscribed: !!recipient?.unsubscribed_at,
      inactive: !person || person.is_active === false || person.tenant_id !== schedule.tenant_id,
      emptyScope: false,
    }
    const recipientScope = work.inactive ? null : await loadScope(admin, row.user_id)
    const narrowed = recipientScope ? narrow(recipientScope, params) : null
    if (!work.inactive && !work.unsubscribed && !narrowed) work.emptyScope = true

    const next = await applyDelivery({
      delivery: work,
      transport,
      headers: recipient ? {
        'List-Unsubscribe': `<${origin}/reports/unsubscribe?token=${recipient.unsubscribe_token}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      } : {},
      replyTo: owner?.email || undefined,
      render: async () => {
        if (!narrowed || !recipient) throw new Error('Nothing this person can see')
        const hash = scopeHash({
          projects: narrowed.scope.project_ids,
          categories: narrowed.scope.read_category_ids,
          invoices: narrowed.scope.invoices_read,
        })
        let built = cache.get(hash)
        if (!built) {
          built = await buildFor(admin, narrowed.scope, schedule.report_key, narrowed.params, schedule.config, schedule.name)
          cache.set(hash, built)
        }
        const formats = (schedule.formats || []).filter((format: string): format is 'pdf' | 'csv' | 'xlsx' => format === 'pdf' || format === 'csv' || format === 'xlsx')
        const files: Array<{ filename: string; content: Uint8Array }> = []
        for (const format of formats) {
          const file = await renderReportFile(built.report, format, built.company, new Date(), narrowed.scope.timezone, built.range)
          files.push({ filename: filenameFor(schedule.report_key, built.range, format), content: file.body })
        }
        const bytes = files.reduce((sum, file) => sum + file.content.byteLength, 0)
        const unsubscribeUrl = `${origin}/reports/unsubscribe?token=${recipient.unsubscribe_token}`
        const openUrl = `${origin}${built.link}`
        const message = renderReportEmail({
          company: built.company,
          reportName: schedule.name,
          rangeLabel: built.report.rangeLabel,
          headlines: built.report.kpis.slice(0, 4).map((kpi) => ({ label: kpi.label, value: kpi.detail ? `${kpi.value} (${kpi.detail})` : kpi.value })),
          openUrl,
          attachments: files.map((file) => file.filename),
          ownerName: owner?.name || 'A teammate',
          scheduleName: schedule.name,
          unsubscribeUrl,
        })
        return { ...message, attachments: files, bytes }
      },
      send: async (request) => {
        if (transport.kind !== 'send') return { id: null, error: 'Email is not configured' }
        const resend = new Resend(transport.apiKey)
        const result = await resend.emails.send({
          from: transport.from,
          to: request.to,
          subject: request.subject,
          html: request.html,
          text: request.text,
          replyTo: request.replyTo,
          headers: request.headers,
          attachments: request.attachments.map((file) => ({ filename: file.filename, content: Buffer.from(file.content) })),
        }, { idempotencyKey: request.idempotencyKey })
        if (result.error) return { id: null, error: result.error.message || 'Email could not be sent' }
        return { id: result.data?.id || null }
      },
    })

    await admin.from('report_deliveries').update({
      status: next.status,
      error: next.error,
      resend_id: next.resendId,
      sent_at: next.status === 'sent' ? new Date().toISOString() : null,
    }).eq('id', row.id)
    if (transport.kind === 'send') await sleep(SEND_GAP_MS)
  }

  const { data: finalRows } = await admin.from('report_deliveries').select('status').eq('run_id', run.id)
  if (unfinished) return { status: 'running' }
  const status = runOutcome((finalRows || []).map((row) => ({ status: row.status as DeliveryWork['status'] })))
  const message = transport.kind === 'unconfigured' ? transport.reason : transport.kind === 'off' ? transport.reason : undefined
  await admin.from('report_runs').update({
    status,
    error: status === 'skipped' ? message || (finalRows || []).map((row) => row.status).join(',') : null,
    finished_at: new Date().toISOString(),
    lease_until: null,
  }).eq('id', run.id)
  return { status, message: status === 'skipped' ? message : undefined }
}

async function buildFor(admin: Admin, scope: AccessScope, reportKey: string, params: ReportParams, config: unknown, scheduleName: string) {
  const record = config && typeof config === 'object' ? (config as Record<string, unknown>) : {}
  let nextParams = params
  let customConfig: unknown = record.custom || record
  if (reportKey === 'custom') {
    const parsed = parseCustomConfig(customConfig)
    nextParams = parseReportParams('custom', { ...params, ...paramsForCustom(parsed, params) })
    customConfig = parsed
  }
  const dataset = await loadDataset(admin, scope, nextParams)
  const report = buildReport(dataset, reportKey, nextParams, reportKey === 'custom' ? { config: customConfig, name: scheduleName } : undefined)
  const range = resolveRange(nextParams, scope.timezone)
  const link = reportKey === 'custom' && typeof record.definitionId === 'string'
    ? `/reports/custom/${record.definitionId}`
    : `/reports/${reportKey}?${paramsToSearch(nextParams)}`
  return { report, range, company: dataset.companyName, link }
}

export async function claimAndProcess(admin: Admin): Promise<{ claimed: number; sent: number; failed: number; skipped: number }> {
  const counts = { claimed: 0, sent: 0, failed: 0, skipped: 0 }
  const { data, error } = await admin.rpc('claim_due_report_runs', { p_limit: 5 })
  if (error) throw new Error(error.message)
  const runs = data || []
  counts.claimed = runs.length
  const deadline = Date.now() + 45_000
  for (const run of runs) {
    if (Date.now() > deadline) break
    try {
      const result = await processReportRun(admin, run.id, deadline)
      if (result.status === 'sent') counts.sent += 1
      else if (result.status === 'failed') counts.failed += 1
      else if (result.status === 'skipped') counts.skipped += 1
    } catch (error) {
      counts.failed += 1
      await admin.from('report_runs').update({
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 300) : 'Report run failed',
        finished_at: new Date().toISOString(),
        lease_until: null,
      }).eq('id', run.id)
    }
  }
  return counts
}
