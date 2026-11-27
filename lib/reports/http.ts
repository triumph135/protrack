import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getApiUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { isMissingRelation, isMissingRpc, isSchemaPending } from '@/lib/security'
import { buildReport } from './compute'
import { paramsForCustom, parseCustomConfig } from './custom'
import { claimAndProcess, processReportRun } from './deliver'
import { EMAIL_NOT_SET_UP, resolveEmailTransport } from './email-mode'
import { loadDataset, loadScope, parseScope } from './engine'
import { filenameFor, renderReportFile } from './files'
import { catalogItem } from './catalog'
import { parseScheduleDraft } from './schedule'
import { paramsFromSearch, paramsToSearch, parseReportParams } from './params'
import { resolveRange, yearChoices } from './date-range'
import type { AccessScope, ReportKey, ReportParams } from './types'
import type { User } from '@/types/app.types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'

type Admin = SupabaseClient<Database>

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

async function context(): Promise<
  | { user: User; admin: Admin; scope: AccessScope; response?: undefined }
  | { response: NextResponse; user?: undefined; admin?: undefined; scope?: undefined }
> {
  const user = await getApiUser()
  if (!user) return { response: jsonError('Authentication required', 401) }
  if (!user.tenant_id || user.is_active === false) return { response: jsonError('Your account cannot run reports.', 403) }
  let admin: Admin
  try {
    admin = createAdminClient()
  } catch {
    return { response: jsonError('Reports are not configured on this server.', 503) }
  }
  try {
    const scope = await loadScope(admin, user.id)
    if (!scope.tenant_id) return { response: jsonError('Your account cannot run reports.', 403) }
    return { user, admin, scope }
  } catch (error) {
    const known = error as { code?: string; message?: string }
    if (isMissingRpc(known) || isMissingRelation(known) || isSchemaPending(known)) {
      return { response: NextResponse.json({ error: 'Reports turn on after the database update.', schemaPending: true }, { status: 503 }) }
    }
    const message = error instanceof Error ? error.message : 'Could not read report access.'
    return { response: jsonError(message, 500) }
  }
}

function readJson(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Request body must be an object.')
  return body as Record<string, unknown>
}

async function buildFromBody(admin: Admin, scope: AccessScope, body: Record<string, unknown>) {
  let reportKey = typeof body.reportKey === 'string' ? body.reportKey : ''
  let custom: { config: unknown; name?: string } | undefined
  const definitionId = typeof body.definitionId === 'string' ? body.definitionId : ''
  if (definitionId) {
    const { data, error } = await admin.from('report_definitions').select('id, name, report_key, config, owner_id, is_shared, tenant_id').eq('id', definitionId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data || data.tenant_id !== scope.tenant_id || (data.owner_id !== scope.user_id && !data.is_shared)) {
      throw new Error('That saved report is not available to you.')
    }
    reportKey = data.report_key
    const config = data.config && typeof data.config === 'object' ? data.config as Record<string, unknown> : {}
    custom = reportKey === 'custom' ? { config: config.custom || config, name: data.name } : undefined
    if (!body.params) body = { ...body, params: config.params || config }
  }
  if (!reportKey) throw new Error('Choose a report.')
  if (reportKey === 'invoicing_gp' && !scope.invoices_read) throw new Error('You do not have invoice access.')
  if (reportKey === 'custom' && body.config != null) {
    custom = { config: body.config, name: typeof body.name === 'string' && body.name.trim() ? body.name : custom?.name }
  } else if (reportKey === 'custom' && !custom) {
    custom = { config: body.config, name: typeof body.name === 'string' ? body.name : undefined }
  }
  let params = parseReportParams(reportKey, body.params ?? {})
  if (reportKey === 'custom' && custom) {
    const parsed = parseCustomConfig(custom.config)
    params = parseReportParams('custom', { ...params, ...paramsForCustom(parsed, params) })
    custom = { ...custom, config: parsed }
  }
  const allowedProjects = params.projects === 'all' ? scope.project_ids : params.projects.filter((id) => scope.project_ids.includes(id))
  const scopedParams: ReportParams = { ...params, projects: params.projects === 'all' ? 'all' : allowedProjects }
  const dataset = await loadDataset(admin, { ...scope, project_ids: allowedProjects.length ? allowedProjects : scope.project_ids }, scopedParams)
  const report = buildReport(dataset, reportKey, scopedParams, custom)
  const range = resolveRange(scopedParams, scope.timezone)
  return { report, range, company: dataset.companyName, params: scopedParams, reportKey }
}

export async function postRun(request: Request) {
  const gate = await context()
  if (gate.response) return gate.response
  try {
    const body = readJson(await request.json())
    const built = await buildFromBody(gate.admin, gate.scope, body)
    return NextResponse.json({ report: built.report, params: built.params })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not run the report.', 400)
  }
}

export async function postExport(request: Request) {
  const gate = await context()
  if (gate.response) return gate.response
  try {
    const body = readJson(await request.json())
    const format = body.format
    if (format !== 'pdf' && format !== 'csv' && format !== 'xlsx') throw new Error('Format must be pdf, csv, or xlsx.')
    const built = await buildFromBody(gate.admin, gate.scope, body)
    const file = await renderReportFile(built.report, format, built.company, new Date(), gate.scope.timezone, built.range)
    const named = filenameFor(built.reportKey, built.range, format)
    return new NextResponse(Buffer.from(file.body), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${named}"`,
      },
    })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not export the report.', 400)
  }
}

export async function getContext(request: Request) {
  const gate = await context()
  if (gate.response) {
    const pending = gate.response.status === 503
    if (pending) return gate.response
    return gate.response
  }
  const { admin, scope } = gate
  const projectIds = scope.project_ids.length ? scope.project_ids : ['00000000-0000-0000-0000-000000000000']
  const [{ data: projects }, { data: categories }, { data: employees }, { data: orders }, { data: users }, { data: tenant }, { data: earliestCost }, { data: earliestInvoice }] = await Promise.all([
    admin.from('projects').select('id, jobNumber, jobName, customer, status').eq('tenant_id', scope.tenant_id!).in('id', projectIds),
    admin.from('cost_categories').select('id, name, parent_id, kind, is_hidden, sort_order').eq('tenant_id', scope.tenant_id!).in('id', scope.read_category_ids.length ? scope.read_category_ids : ['00000000-0000-0000-0000-000000000000']),
    admin.from('employees').select('id, name, job_role').eq('tenant_id', scope.tenant_id!),
    admin.from('change_orders').select('id, project_id, name').eq('tenant_id', scope.tenant_id!).in('project_id', projectIds),
    scope.can_schedule ? admin.from('users').select('id, name, email, role, is_active').eq('tenant_id', scope.tenant_id!).eq('is_active', true) : Promise.resolve({ data: [] }),
    admin.from('tenants').select('name').eq('id', scope.tenant_id!).maybeSingle(),
    admin.from('project_costs').select('date').eq('tenant_id', scope.tenant_id!).order('date', { ascending: true }).limit(1),
    scope.invoices_read ? admin.from('customer_invoices').select('date_billed').eq('tenant_id', scope.tenant_id!).order('date_billed', { ascending: true }).limit(1) : Promise.resolve({ data: [] }),
  ])
  const earliest = [earliestCost?.[0]?.date, earliestInvoice?.[0]?.date_billed].filter(Boolean).sort()[0] || null
  const url = new URL(request.url)
  return NextResponse.json({
    schemaPending: false,
    companyName: tenant?.name || '',
    scope: {
      userId: scope.user_id,
      role: scope.role,
      canSchedule: scope.can_schedule,
      invoicesRead: scope.invoices_read,
      employeesRead: scope.employees_read,
      timezone: scope.timezone,
      projectIds: scope.project_ids,
      readCategoryIds: scope.read_category_ids,
    },
    projects: projects || [],
    categories: categories || [],
    employees: scope.employees_read ? employees || [] : [],
    changeOrders: orders || [],
    users: users || [],
    years: yearChoices(earliest, scope.timezone),
    initialParams: url.searchParams.get('range') ? paramsFromSearch('activity', url.searchParams) : null,
  })
}

export async function getDefinitions() {
  const gate = await context()
  if (gate.response) return gate.response
  const { data, error } = await gate.admin
    .from('report_definitions')
    .select('id, name, report_key, is_shared, owner_id, updated_at, config')
    .eq('tenant_id', gate.scope.tenant_id!)
    .or(`owner_id.eq.${gate.scope.user_id},is_shared.eq.true`)
    .order('updated_at', { ascending: false })
  if (error) return jsonError(error.message, 400)
  return NextResponse.json({
    definitions: (data || []).map((row) => ({ ...row, mine: row.owner_id === gate.scope.user_id })),
  })
}

export async function postDefinition(request: Request) {
  const gate = await context()
  if (gate.response) return gate.response
  try {
    const body = readJson(await request.json())
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name.length < 1 || name.length > 120) throw new Error('Name the report in 120 characters or fewer.')
    const reportKey = typeof body.reportKey === 'string' ? body.reportKey : 'custom'
    if (body.is_shared === true && !gate.scope.can_schedule) throw new Error('Only a master or project manager can share a report.')
    const params = parseReportParams(reportKey, body.params ?? {})
    assertProjects(params, gate.scope)
    let custom: unknown = null
    if (reportKey === 'custom') custom = parseCustomConfig(body.config)
    const { data, error } = await gate.admin.from('report_definitions').insert({
      tenant_id: gate.scope.tenant_id!,
      owner_id: gate.scope.user_id,
      name,
      report_key: reportKey,
      is_shared: body.is_shared === true,
      config: { params, custom } as unknown as Json,
    }).select('id, name, report_key, is_shared').single()
    if (error) return jsonError(error.message.includes('duplicate') || error.code === '23505' ? 'You already have a report with that name.' : error.message, 400)
    return NextResponse.json({ definition: data })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not save the report.', 400)
  }
}

export async function patchDefinition(id: string, request: Request) {
  const gate = await context()
  if (gate.response) return gate.response
  const existing = await ownedDefinition(gate.admin, gate.scope, id)
  if (existing instanceof NextResponse) return existing
  try {
    const body = readJson(await request.json())
    const name = typeof body.name === 'string' ? body.name.trim() : existing.name
    if (name.length < 1 || name.length > 120) throw new Error('Name the report in 120 characters or fewer.')
    if (body.is_shared === true && !gate.scope.can_schedule) throw new Error('Only a master or project manager can share a report.')
    const patch: Database['public']['Tables']['report_definitions']['Update'] = { name }
    if (typeof body.is_shared === 'boolean') patch.is_shared = body.is_shared
    if (body.params || body.config) {
      const reportKey = existing.report_key
      const params = parseReportParams(reportKey, body.params ?? (existing.config as { params?: unknown })?.params ?? {})
      assertProjects(params, gate.scope)
      const custom = reportKey === 'custom' ? parseCustomConfig(body.config ?? (existing.config as { custom?: unknown })?.custom) : null
      patch.config = { params, custom } as unknown as Json
    }
    const { error } = await gate.admin.from('report_definitions').update(patch).eq('id', id)
    if (error) return jsonError(error.message, 400)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not update the report.', 400)
  }
}

export async function deleteDefinition(id: string) {
  const gate = await context()
  if (gate.response) return gate.response
  const existing = await ownedDefinition(gate.admin, gate.scope, id)
  if (existing instanceof NextResponse) return existing
  const { error } = await gate.admin.from('report_definitions').delete().eq('id', id)
  if (error) return jsonError(error.message, 400)
  return NextResponse.json({ ok: true })
}

async function ownedDefinition(admin: Admin, scope: AccessScope, id: string) {
  const { data, error } = await admin.from('report_definitions').select('*').eq('id', id).maybeSingle()
  if (error) return jsonError(error.message, 400)
  if (!data || data.tenant_id !== scope.tenant_id) return jsonError('Saved report not found.', 404)
  if (data.owner_id !== scope.user_id) return jsonError('Only the owner can change this report.', 403)
  return data
}

function assertProjects(params: ReportParams, scope: AccessScope) {
  if (params.projects === 'all') return
  const missing = params.projects.filter((id) => !scope.project_ids.includes(id))
  if (missing.length) throw new Error('That project is outside the projects you can see.')
}

function assertSchedule(body: Record<string, unknown>, scope: AccessScope) {
  if (!scope.can_schedule) throw new Error('Only a master or project manager can schedule a report.')
  const draft = parseScheduleDraft(body)
  if (!catalogItem(draft.reportKey) && draft.reportKey !== 'custom') throw new Error('Unknown report.')
  let params = parseReportParams(draft.reportKey, draft.params ?? {})
  const custom = draft.reportKey === 'custom' ? parseCustomConfig(draft.config) : null
  if (custom) params = parseReportParams('custom', { ...params, ...paramsForCustom(custom, params) })
  assertProjects(params, scope)
  return { ...draft, params, custom }
}

async function nextRun(admin: Admin, input: { frequency: string; weekday: number | null; monthDay: number | null; sendHour: number; timezone: string; after?: string }) {
  const { data, error } = await admin.rpc('report_next_run_at', {
    p_frequency: input.frequency,
    p_weekday: input.weekday,
    p_month_day: input.monthDay,
    p_send_hour: input.sendHour,
    p_tz: input.timezone,
    p_after: input.after || new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return data
}

export async function postSchedulePreview(request: Request) {
  const gate = await context()
  if (gate.response) return gate.response
  if (!gate.scope.can_schedule) return jsonError('Only a master or project manager can schedule a report.', 403)
  try {
    const body = readJson(await request.json())
    const parsed = assertSchedule({ ...body, name: body.name || 'Preview', recipientIds: [gate.scope.user_id], formats: body.formats || ['pdf'], params: body.params || { range: 'this_year', projects: 'all', project_status: 'all' } }, gate.scope)
    const times: string[] = []
    let after = new Date().toISOString()
    for (let index = 0; index < 3; index += 1) {
      const at = await nextRun(gate.admin, { ...parsed, timezone: gate.scope.timezone, after })
      if (!at) break
      times.push(at)
      after = at
    }
    return NextResponse.json({ times })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not preview the schedule.', 400)
  }
}

export async function getSchedules() {
  const gate = await context()
  if (gate.response) return gate.response
  if (!gate.scope.can_schedule) return NextResponse.json({ schedules: [] })
  let query = gate.admin.from('report_schedules').select('id, name, report_key, report_definition_id, config, frequency, weekday, month_day, send_hour, formats, status, paused_reason, next_run_at, last_run_at, owner_id').eq('tenant_id', gate.scope.tenant_id!)
  if (gate.scope.role !== 'master') query = query.eq('owner_id', gate.scope.user_id)
  const { data, error } = await query.order('name')
  if (error) return jsonError(error.message, 400)
  const ids = (data || []).map((row) => row.id)
  const { data: recipients } = ids.length
    ? await gate.admin.from('report_schedule_recipients').select('schedule_id, user_id, unsubscribed_at').in('schedule_id', ids)
    : { data: [] }
  const { data: runs } = ids.length
    ? await gate.admin.from('report_runs').select('schedule_id, status, finished_at').in('schedule_id', ids).order('created_at', { ascending: false }).limit(200)
    : { data: [] }
  return NextResponse.json({
    schedules: (data || []).map((row) => ({
      ...row,
      recipients: (recipients || []).filter((item) => item.schedule_id === row.id).length,
      recipientIds: (recipients || []).filter((item) => item.schedule_id === row.id).map((item) => item.user_id),
      unsubscribed: (recipients || []).filter((item) => item.schedule_id === row.id && item.unsubscribed_at).length,
      lastStatus: (runs || []).find((item) => item.schedule_id === row.id)?.status || null,
    })),
    timezone: gate.scope.timezone,
  })
}

export async function postSchedule(request: Request) {
  const gate = await context()
  if (gate.response) return gate.response
  try {
    const parsed = assertSchedule(readJson(await request.json()), gate.scope)
    await assertRecipients(gate.admin, gate.scope, parsed.recipientIds)
    const when = await nextRun(gate.admin, { ...parsed, timezone: gate.scope.timezone })
    const { data, error } = await gate.admin.from('report_schedules').insert({
      tenant_id: gate.scope.tenant_id!,
      owner_id: gate.scope.user_id,
      name: parsed.name,
      report_key: parsed.reportKey,
      report_definition_id: parsed.definitionId,
      config: { params: parsed.params, custom: parsed.custom, definitionId: parsed.definitionId } as unknown as Json,
      frequency: parsed.frequency,
      weekday: parsed.weekday,
      month_day: parsed.monthDay,
      send_hour: parsed.sendHour,
      formats: parsed.formats,
      status: 'active',
      next_run_at: when,
    }).select('id').single()
    if (error) return jsonError(error.message, 400)
    const { error: recipientError } = await gate.admin.from('report_schedule_recipients').insert(parsed.recipientIds.map((userId) => ({
      tenant_id: gate.scope.tenant_id!,
      schedule_id: data.id,
      user_id: userId,
    })))
    if (recipientError) return jsonError(recipientError.message, 400)
    return NextResponse.json({ id: data.id, nextRunAt: when })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not create the schedule.', 400)
  }
}

async function assertRecipients(admin: Admin, scope: AccessScope, ids: string[]) {
  const { data, error } = await admin.from('users').select('id, is_active, tenant_id').in('id', ids)
  if (error) throw new Error(error.message)
  if ((data || []).length !== ids.length || (data || []).some((row) => row.tenant_id !== scope.tenant_id || row.is_active === false)) {
    throw new Error('Recipients must be active people in your company.')
  }
}

async function editableSchedule(admin: Admin, scope: AccessScope, id: string) {
  const { data, error } = await admin.from('report_schedules').select('*').eq('id', id).maybeSingle()
  if (error) return jsonError(error.message, 400)
  if (!data || data.tenant_id !== scope.tenant_id) return jsonError('Schedule not found.', 404)
  if (data.owner_id !== scope.user_id && scope.role !== 'master') return jsonError('You can only change your own schedules.', 403)
  return data
}

export async function patchSchedule(id: string, request: Request) {
  const gate = await context()
  if (gate.response) return gate.response
  const existing = await editableSchedule(gate.admin, gate.scope, id)
  if (existing instanceof NextResponse) return existing
  try {
    const body = readJson(await request.json())
    if (body.status === 'paused') {
      const { error } = await gate.admin.from('report_schedules').update({ status: 'paused', paused_reason: 'Paused' }).eq('id', id)
      if (error) return jsonError(error.message, 400)
      return NextResponse.json({ ok: true })
    }
    if (body.status === 'active' && Object.keys(body).length === 1) {
      const when = await nextRun(gate.admin, {
        frequency: existing.frequency,
        weekday: existing.weekday,
        monthDay: existing.month_day,
        sendHour: existing.send_hour,
        timezone: gate.scope.timezone,
      })
      const { error } = await gate.admin.from('report_schedules').update({ status: 'active', paused_reason: null, next_run_at: when }).eq('id', id)
      if (error) return jsonError(error.message, 400)
      return NextResponse.json({ ok: true, nextRunAt: when })
    }
    const parsed = assertSchedule(body, gate.scope)
    await assertRecipients(gate.admin, gate.scope, parsed.recipientIds)
    const when = await nextRun(gate.admin, { ...parsed, timezone: gate.scope.timezone })
    const { error } = await gate.admin.from('report_schedules').update({
      name: parsed.name,
      report_key: parsed.reportKey,
      report_definition_id: parsed.definitionId,
      config: { params: parsed.params, custom: parsed.custom, definitionId: parsed.definitionId } as unknown as Json,
      frequency: parsed.frequency,
      weekday: parsed.weekday,
      month_day: parsed.monthDay,
      send_hour: parsed.sendHour,
      formats: parsed.formats,
      next_run_at: existing.status === 'active' ? when : existing.next_run_at,
    }).eq('id', id)
    if (error) return jsonError(error.message, 400)
    await gate.admin.from('report_schedule_recipients').delete().eq('schedule_id', id)
    const { error: recipientError } = await gate.admin.from('report_schedule_recipients').insert(parsed.recipientIds.map((userId) => ({
      tenant_id: gate.scope.tenant_id!,
      schedule_id: id,
      user_id: userId,
    })))
    if (recipientError) return jsonError(recipientError.message, 400)
    return NextResponse.json({ ok: true, nextRunAt: when })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not update the schedule.', 400)
  }
}

export async function deleteSchedule(id: string) {
  const gate = await context()
  if (gate.response) return gate.response
  const existing = await editableSchedule(gate.admin, gate.scope, id)
  if (existing instanceof NextResponse) return existing
  const { error } = await gate.admin.from('report_schedules').delete().eq('id', id)
  if (error) return jsonError(error.message, 400)
  return NextResponse.json({ ok: true })
}

export async function postSendNow(id: string) {
  const gate = await context()
  if (gate.response) return gate.response
  const existing = await editableSchedule(gate.admin, gate.scope, id)
  if (existing instanceof NextResponse) return existing
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await gate.admin.from('report_runs').select('id', { count: 'exact', head: true }).eq('schedule_id', id).eq('trigger', 'manual').gte('created_at', since)
  if (countError) return jsonError(countError.message, 400)
  if ((count || 0) >= 3) return jsonError('This schedule was already sent 3 times in the last hour. Try again later.', 429)
  const minute = new Date(Date.now() - (Date.now() % 60_000)).toISOString()
  const { data, error } = await gate.admin.from('report_runs').insert({
    tenant_id: existing.tenant_id,
    schedule_id: id,
    scheduled_for: minute,
    trigger: 'manual',
    status: 'running',
    attempts: 1,
    lease_until: new Date(Date.now() + 5 * 60_000).toISOString(),
    started_at: new Date().toISOString(),
    created_by: gate.scope.user_id,
  }).select('id').single()
  if (error) {
    if (error.code === '23505') return jsonError('A report for this schedule was already started this minute. Try again in a minute.', 409)
    return jsonError(error.message, 400)
  }
  try {
    const result = await processReportRun(gate.admin, data.id)
    const transport = resolveEmailTransport()
    if (transport.kind === 'unconfigured' || result.message === EMAIL_NOT_SET_UP) {
      return NextResponse.json({ runId: data.id, status: 'skipped', message: EMAIL_NOT_SET_UP })
    }
    return NextResponse.json({ runId: data.id, status: result.status, message: result.message || null })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not send the report.', 500)
  }
}

export async function getRuns(id: string) {
  const gate = await context()
  if (gate.response) return gate.response
  const existing = await editableSchedule(gate.admin, gate.scope, id)
  if (existing instanceof NextResponse) return existing
  const { data: runs, error } = await gate.admin.from('report_runs').select('id, scheduled_for, trigger, status, error, finished_at, created_at').eq('schedule_id', id).order('created_at', { ascending: false }).limit(50)
  if (error) return jsonError(error.message, 400)
  const ids = (runs || []).map((row) => row.id)
  const { data: deliveries } = ids.length
    ? await gate.admin.from('report_deliveries').select('run_id, user_id, email, status, error').in('run_id', ids)
    : { data: [] }
  return NextResponse.json({
    timezone: gate.scope.timezone,
    runs: (runs || []).map((run) => {
      const rows = (deliveries || []).filter((item) => item.run_id === run.id)
      return {
        ...run,
        delivered: rows.filter((item) => item.status === 'sent').length,
        total: rows.length,
        deliveries: rows,
      }
    }),
  })
}

export async function getSubscriptions() {
  const gate = await context()
  if (gate.response) return gate.response
  const { data, error } = await gate.admin
    .from('report_schedule_recipients')
    .select('id, schedule_id, unsubscribed_at, created_at')
    .eq('user_id', gate.scope.user_id)
    .eq('tenant_id', gate.scope.tenant_id!)
  if (error) return jsonError(error.message, 400)
  const ids = (data || []).map((row) => row.schedule_id)
  const { data: schedules } = ids.length
    ? await gate.admin.from('report_schedules').select('id, name, report_key, frequency, weekday, send_hour, status').in('id', ids)
    : { data: [] }
  return NextResponse.json({
    subscriptions: (data || []).map((row) => ({
      ...row,
      schedule: (schedules || []).find((item) => item.id === row.schedule_id) || null,
    })),
  })
}

export async function patchSubscriptions(request: Request) {
  const gate = await context()
  if (gate.response) return gate.response
  try {
    const body = readJson(await request.json())
    const id = typeof body.id === 'string' ? body.id : ''
    if (typeof body.unsubscribed !== 'boolean') throw new Error('Say whether you want to unsubscribe.')
    const { data, error } = await gate.admin.from('report_schedule_recipients').select('id, user_id').eq('id', id).maybeSingle()
    if (error) return jsonError(error.message, 400)
    if (!data || data.user_id !== gate.scope.user_id) return jsonError('Subscription not found.', 404)
    const { error: updateError } = await gate.admin.from('report_schedule_recipients').update({
      unsubscribed_at: body.unsubscribed ? new Date().toISOString() : null,
    }).eq('id', id)
    if (updateError) return jsonError(updateError.message, 400)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not update the subscription.', 400)
  }
}

export async function postUnsubscribe(request: Request) {
  let token = ''
  try {
    const body = readJson(await request.json())
    token = typeof body.token === 'string' ? body.token.trim() : ''
  } catch {
    return jsonError('This link is no longer valid.', 400)
  }
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return jsonError('This link is no longer valid.', 400)
  let admin: Admin
  try {
    admin = createAdminClient()
  } catch {
    return jsonError('Reports are not configured on this server.', 503)
  }
  const { data, error } = await admin.from('report_schedule_recipients').select('id').eq('unsubscribe_token', token).maybeSingle()
  if (error) return jsonError(error.message, 400)
  if (!data) return jsonError('This link is no longer valid.', 404)
  const { error: updateError } = await admin.from('report_schedule_recipients').update({ unsubscribed_at: new Date().toISOString() }).eq('id', data.id)
  if (updateError) return jsonError(updateError.message, 400)
  return NextResponse.json({ ok: true })
}

function bearerMatches(header: string | null, secret: string): boolean {
  const presented = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  const left = Buffer.from(presented)
  const right = Buffer.from(secret)
  if (left.length !== right.length) {
    timingSafeEqual(right, right)
    return false
  }
  return timingSafeEqual(left, right)
}

export async function postCron(request: Request) {
  const secret = process.env.REPORTS_CRON_SECRET
  if (!secret) return jsonError('Not found', 404)
  if (!bearerMatches(request.headers.get('authorization'), secret)) return jsonError('Not found', 401)
  try {
    const admin = createAdminClient()
    const counts = await claimAndProcess(admin)
    return NextResponse.json(counts)
  } catch (error) {
    console.error('report cron', error)
    return NextResponse.json({ claimed: 0, sent: 0, failed: 0, skipped: 0 })
  }
}

export function searchParamsFor(reportKey: ReportKey, search: string) {
  return paramsFromSearch(reportKey, new URLSearchParams(search))
}

void parseScope
void paramsToSearch
