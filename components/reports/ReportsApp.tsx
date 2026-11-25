'use client'

import { Clock, Mail } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { EmptyState } from '@/components/ui/feedback'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { customSummary, draftToConfig, emptyBuilderDraft, paramsForCustom, type BuilderDraft } from '@/lib/reports/custom'
import { CustomBuilder } from './CustomBuilder'
import { defaultRangeFor, RANGE_PRESETS } from '@/lib/reports/date-range'
import { scheduleWriteBody, type ScheduleFrequency } from '@/lib/reports/schedule'
import type { BuiltReport, ReportParams } from '@/lib/reports/types'
import { DownloadMenu } from './DownloadMenu'
import { ScheduleWizard, type ScheduleFormState } from './ScheduleWizard'
import { ReportDocument, ReportsLandingView, RunHistory, ScheduleList, SectionHeading, rangeOptions, type ScheduleRow } from './views'

type Mode = 'landing' | 'report' | 'builder'

interface ContextPayload {
  schemaPending?: boolean
  error?: string
  companyName?: string
  scope?: {
    userId?: string
    role: string | null
    canSchedule: boolean
    invoicesRead: boolean
    employeesRead: boolean
    timezone: string
  }
  projects?: Array<{ id: string; jobNumber: string; jobName: string; status: string | null }>
  categories?: Array<{ id: string; name: string }>
  employees?: Array<{ id: string; name: string; job_role: string | null }>
  changeOrders?: Array<{ id: string; name: string }>
  users?: Array<{ id: string; name: string; email: string }>
  years?: number[]
}

interface SavedReport {
  id: string
  name: string
  report_key: string
  is_shared: boolean
  mine: boolean
  config: { params?: ReportParams; custom?: BuilderDraft }
}

interface ScheduleRecord extends ScheduleRow {
  report_key?: string
  report_definition_id?: string | null
  formats?: string[]
  recipientIds?: string[]
  config?: { params?: ReportParams; custom?: unknown; definitionId?: string | null }
}

const selectClass = 'h-11 w-full rounded-lg border border-input bg-card px-2 text-sm'

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((body as { error?: string }).error || 'Request failed')
  return body as T
}

function allowedRange(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  if ((RANGE_PRESETS as readonly string[]).includes(value) || /^year:\d{4}$/.test(value)) return value
  return fallback
}

function startingParams(reportKey: string, initialRange?: string, initialGroup?: string, initialPerProject?: string): ReportParams {
  const params: ReportParams = {
    range: allowedRange(initialRange, defaultRangeFor(reportKey)),
    projects: 'all',
    project_status: 'all',
  }
  if (initialGroup === 'project') params.group_detail_by = 'project'
  if (initialPerProject === '1') params.per_project_sections = true
  return params
}

function blankSchedule(name: string, userId: string | undefined): ScheduleFormState {
  return {
    name,
    frequency: 'weekly',
    weekday: 1,
    monthDay: 1,
    sendHour: 7,
    formats: ['pdf'],
    recipientIds: userId ? [userId] : [],
  }
}

export default function ReportsApp({
  mode,
  reportKey,
  definitionId,
  initialRange,
  initialGroup,
  initialPerProject,
}: {
  mode: Mode
  reportKey?: string
  definitionId?: string
  initialRange?: string
  initialGroup?: string
  initialPerProject?: string
}) {
  const router = useRouter()
  const [context, setContext] = useState<ContextPayload | null>(null)
  const [ready, setReady] = useState(false)
  const [saved, setSaved] = useState<SavedReport[]>([])
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([])
  const [subscriptions, setSubscriptions] = useState<Array<{ id: string; unsubscribed_at: string | null; schedule: { name: string; frequency: string } | null }>>([])
  const [params, setParams] = useState<ReportParams>(() => startingParams(reportKey || 'activity', initialRange, initialGroup, initialPerProject))
  const [report, setReport] = useState<BuiltReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [history, setHistory] = useState<Parameters<typeof RunHistory>[0]['runs']>([])
  const [draft, setDraft] = useState<BuilderDraft>(emptyBuilderDraft)
  const [notice, setNotice] = useState('')
  const runSeq = useRef(0)
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [hydrated, setHydrated] = useState(!definitionId)
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => blankSchedule('Scheduled report', undefined))
  const [scheduleMeta, setScheduleMeta] = useState<{ reportKey: string; params: ReportParams; definitionId: string | null; config?: unknown }>({
    reportKey: reportKey || 'custom',
    params: startingParams(reportKey || 'activity', initialRange, initialGroup, initialPerProject),
    definitionId: definitionId || null,
  })
  const [previewTimes, setPreviewTimes] = useState<string[]>([])
  const [activeSchedule, setActiveSchedule] = useState<string | null>(null)
  const [savingSchedule, setSavingSchedule] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch('/api/reports/context')
    const body = await response.json()
    if (!response.ok) {
      toast.error(body.error || 'Could not load reports.')
      return
    }
    setContext(body)
    setReady(true)
    if (!body.schemaPending) {
      const defs = await readJson<{ definitions: SavedReport[] }>(await fetch('/api/reports/definitions'))
      setSaved(defs.definitions)
      if (body.scope?.canSchedule) {
        const listed = await readJson<{ schedules: ScheduleRecord[] }>(await fetch('/api/reports/schedules'))
        setSchedules(listed.schedules)
      }
      const subs = await readJson<{ subscriptions: typeof subscriptions }>(await fetch('/api/reports/subscriptions'))
      setSubscriptions(subs.subscriptions)
    }
  }, [])

  useEffect(() => { void load().catch((loadError: Error) => toast.error(loadError.message)) }, [load])

  useEffect(() => {
    if (!definitionId || !ready) return
    const found = saved.find((item) => item.id === definitionId)
    if (found) {
      setName(found.name)
      setShared(found.is_shared)
      if (found.config?.params) setParams(found.config.params)
      if (found.config?.custom?.source) {
        const custom = found.config.custom
        const savedParams = found.config.params
        setDraft({
          source: custom.source,
          columns: custom.columns || [],
          groupBy: custom.groupBy || [],
          filters: {
            ...custom.filters,
            range: savedParams?.range || custom.filters?.range || 'this_year',
            from: savedParams?.from || custom.filters?.from,
            to: savedParams?.to || custom.filters?.to,
            projects: savedParams?.projects || custom.filters?.projects || 'all',
            project_status: savedParams?.project_status || custom.filters?.project_status || 'all',
          },
        })
      }
    }
    setHydrated(true)
  }, [definitionId, ready, saved])

  const key = reportKey || 'custom'
  const options = useMemo(() => rangeOptions(context?.years || []), [context?.years])
  const timezone = context?.scope?.timezone || 'America/New_York'

  const runBody = useMemo(() => {
    if (mode === 'builder') {
      if (!draft.source || draft.columns.length === 0) return null
      return {
        reportKey: 'custom',
        definitionId,
        params: paramsForCustom({ filters: draft.filters }),
        config: { source: draft.source, columns: draft.columns, groupBy: draft.groupBy, filters: draft.filters },
        name,
      }
    }
    return { reportKey: key, definitionId, params }
  }, [mode, definitionId, params, draft, name, key])

  const run = useCallback(async (body: Record<string, unknown> | null, signal?: AbortSignal, announce = false) => {
    if (!body) return
    const seq = ++runSeq.current
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/reports/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
      const result = await readJson<{ report: BuiltReport }>(response)
      if (seq !== runSeq.current) return
      setReport(result.report)
    } catch (runError) {
      if (signal?.aborted || seq !== runSeq.current) return
      const message = runError instanceof Error ? runError.message : 'Could not run the report.'
      setError(message)
      if (announce) toast.error(message)
      if (mode === 'builder') setReport(null)
    } finally {
      if (seq === runSeq.current) setBusy(false)
    }
  }, [mode])

  const runKey = runBody ? JSON.stringify(runBody) : ''
  useEffect(() => {
    if (mode === 'landing' || !ready || !hydrated || context?.schemaPending) return
    if (!runKey) {
      setReport(null)
      setBusy(false)
      setError('')
      return
    }
    const controller = new AbortController()
    const handle = setTimeout(() => { void run(JSON.parse(runKey) as Record<string, unknown>, controller.signal, false) }, 400)
    return () => {
      clearTimeout(handle)
      controller.abort()
    }
  }, [mode, ready, hydrated, context?.schemaPending, runKey, run])

  async function download(format: 'pdf' | 'csv' | 'xlsx') {
    if (!runBody) return
    const response = await fetch('/api/reports/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...runBody, format }) })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      toast.error((payload as { error?: string }).error || 'Could not export.')
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const match = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')
    link.href = url
    link.download = match?.[1] || `report.${format}`
    link.click()
    URL.revokeObjectURL(url)
  }

  function openCreate() {
    const currentName = name || report?.title || 'Scheduled report'
    setActiveSchedule(null)
    setHistory([])
    setPreviewTimes([])
    setScheduleForm(blankSchedule(currentName, context?.scope?.userId))
    setScheduleMeta({
      reportKey: key,
      params: mode === 'builder' ? paramsForCustom({ filters: draft.filters }) : params,
      definitionId: definitionId || null,
      config: mode === 'builder' ? { source: draft.source, columns: draft.columns, groupBy: draft.groupBy, filters: draft.filters } : undefined,
    })
    setScheduleOpen(true)
  }

  function openEdit(id: string) {
    const row = schedules.find((item) => item.id === id)
    if (!row) return
    const formats = Array.isArray(row.formats) && row.formats.length ? row.formats.map(String) : ['pdf']
    setActiveSchedule(id)
    setPreviewTimes([])
    setScheduleForm({
      name: row.name,
      frequency: (row.frequency === 'daily' || row.frequency === 'monthly' ? row.frequency : 'weekly') as ScheduleFrequency,
      weekday: row.weekday ?? 1,
      monthDay: row.month_day ?? 1,
      sendHour: row.send_hour,
      formats,
      recipientIds: row.recipientIds || [],
    })
    setScheduleMeta({
      reportKey: row.report_key || 'activity',
      params: row.config?.params || params,
      definitionId: row.report_definition_id || row.config?.definitionId || null,
      config: row.config?.custom,
    })
    setScheduleOpen(true)
    void openHistory(id)
  }

  useEffect(() => {
    if (!scheduleOpen || !context?.scope?.canSchedule) return
    const handle = setTimeout(() => { void previewSchedule() }, 250)
    return () => clearTimeout(handle)
    // Preview whenever the timing changes, including while the drawer is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleOpen, scheduleForm.frequency, scheduleForm.weekday, scheduleForm.monthDay, scheduleForm.sendHour, scheduleForm.name])

  if (context?.schemaPending) {
    return <ReportsLandingView canSchedule={false} invoicesRead={false} saved={[]} pending />
  }

  const projectLabel = params.projects === 'all'
    ? 'All projects I can see'
    : `${params.projects.length} project${params.projects.length === 1 ? '' : 's'}`

  return (
    <div className="space-y-4">
      {mode === 'landing' ? (
        <>
          <ReportsLandingView canSchedule={!!context?.scope?.canSchedule} invoicesRead={context?.scope?.invoicesRead !== false} saved={saved} />
          {context?.scope?.canSchedule ? (
            <section className="space-y-2">
              <SectionHeading icon={Clock}>Scheduled reports</SectionHeading>
              <ScheduleList
                rows={schedules}
                timezone={timezone}
                onEdit={openEdit}
                onSend={(id) => void sendNow(id)}
                onPause={(id, status) => void pause(id, status)}
                onDelete={(id) => void removeSchedule(id)}
              />
            </section>
          ) : null}
          <section className="space-y-2">
            <SectionHeading icon={Mail}>Email subscriptions</SectionHeading>
            <SubscriptionList rows={subscriptions} onToggle={toggleSubscription} />
          </section>
        </>
      ) : null}

      {mode === 'builder' ? (
        <>
          <div className="flex justify-end">
            <Link href="/reports" className="text-sm text-muted-foreground">All reports</Link>
          </div>
          <CustomBuilder
            draft={draft}
            onDraft={(next, message) => { setDraft(next); setNotice(message || '') }}
            notice={notice}
            name={name}
            onName={setName}
            shared={shared}
            onShared={setShared}
            canShare={!!context?.scope?.canSchedule}
            invoicesRead={context?.scope?.invoicesRead !== false}
            projects={context?.projects || []}
            employees={context?.employees || []}
            years={context?.years || []}
            onSave={() => void saveDefinition()}
          />
          <section className="space-y-3 rounded-lg border border-border border-t-2 border-t-primary/50 bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-sm font-medium">{customSummary(draft)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" disabled={busy || !runBody} onClick={() => void run(runBody, undefined, true)}>{busy ? 'Updating…' : 'Refresh'}</Button>
                <DownloadMenu disabled={!runBody} onDownload={(format) => void download(format)} />
                {context?.scope?.canSchedule && draft.source ? <Button type="button" variant="outline" onClick={openCreate}>Schedule</Button> : null}
              </div>
            </div>
            {busy ? <p className="text-sm text-muted-foreground">Updating the preview…</p> : null}
            {!draft.source ? <EmptyState title="Pick a source" body="Choose costs, labor, invoices, or activity. The preview uses the same numbers as the download." /> : null}
            {draft.source && error && !report ? <EmptyState title="Could not run the report" body={error} /> : null}
            {report ? <ReportDocument report={report} /> : null}
          </section>
        </>
      ) : null}

      {mode !== 'landing' && mode !== 'builder' ? (
        <>
          <div className="flex justify-end">
            <Link href="/reports" className="text-sm text-muted-foreground">All reports</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Date range" htmlFor="report-range">
              <select id="report-range" className={selectClass} value={params.range} onChange={(event) => setParams({ ...params, range: event.target.value })}>
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            {params.range === 'custom' ? (
              <>
                <Field label="From" htmlFor="report-from"><Input id="report-from" type="date" value={params.from || ''} onChange={(event) => setParams({ ...params, from: event.target.value })} /></Field>
                <Field label="To" htmlFor="report-to"><Input id="report-to" type="date" value={params.to || ''} onChange={(event) => setParams({ ...params, to: event.target.value })} /></Field>
              </>
            ) : null}
            <Field label="Projects" htmlFor="report-projects">
              <details className="relative">
                <summary id="report-projects" className={`${selectClass} flex cursor-pointer list-none items-center`}>{projectLabel}</summary>
                <div className="absolute z-20 mt-1 max-h-64 w-full min-w-56 overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-lg">
                  <label className="flex items-center gap-2 px-1 py-1 text-sm">
                    <input type="checkbox" checked={params.projects === 'all'} onChange={() => setParams({ ...params, projects: 'all' })} />
                    All projects I can see
                  </label>
                  {(context?.projects || []).map((project) => {
                    const selected = params.projects !== 'all' && params.projects.includes(project.id)
                    return (
                      <label key={project.id} className="flex items-center gap-2 px-1 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={params.projects === 'all' ? false : selected}
                          onChange={(event) => {
                            const current = params.projects === 'all' ? [] : params.projects
                            const next = event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id)
                            setParams({ ...params, projects: next.length ? next : 'all' })
                          }}
                        />
                        {project.jobNumber} {project.jobName}
                      </label>
                    )
                  })}
                </div>
              </details>
            </Field>
            <div className="flex items-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => void run(runBody, undefined, true)}>{busy ? 'Updating…' : 'Refresh'}</Button>
              <DownloadMenu onDownload={(format) => void download(format)} />
              {context?.scope?.canSchedule ? <Button type="button" variant="outline" onClick={openCreate}>Schedule</Button> : null}
            </div>
          </div>
          {busy && !report ? <EmptyState title="Running the report" body="Results use the same numbers as the download." /> : null}
          {error && !report ? <EmptyState title="Could not run the report" body={error} /> : null}
          {report ? <ReportDocument report={report} /> : null}
        </>
      ) : null}

      <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen} title={activeSchedule ? 'Edit schedule' : 'Schedule this report'} description={cadenceLine()}>
        <ScheduleWizard
          key={activeSchedule || 'new'}
          form={scheduleForm}
          setForm={setScheduleForm}
          timezone={timezone}
          users={context?.users || []}
          times={previewTimes}
          saving={savingSchedule}
          editing={!!activeSchedule}
          onSubmit={() => void saveSchedule()}
        />
        {activeSchedule ? (
          <div className="space-y-3 border-t border-border p-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void sendNow(activeSchedule)}>Send now</Button>
              <Button type="button" variant="outline" onClick={() => void pause(activeSchedule, schedules.find((row) => row.id === activeSchedule)?.status || 'active')}>{schedules.find((row) => row.id === activeSchedule)?.status === 'paused' ? 'Resume' : 'Pause'}</Button>
            </div>
            <RunHistory runs={history} />
          </div>
        ) : null}
      </Sheet>
    </div>
  )

  function cadenceLine() {
    return `${scheduleForm.frequency === 'weekly' ? 'Weekly' : scheduleForm.frequency === 'monthly' ? 'Monthly' : 'Daily'} email in ${timezone.replaceAll('_', ' ')}.`
  }

  async function saveDefinition() {
    try {
      const config = draftToConfig(draft)
      const payload = { name, reportKey: 'custom', is_shared: shared, params: paramsForCustom(config), config }
      if (definitionId) {
        await readJson(await fetch(`/api/reports/definitions/${definitionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
        toast.success('Report saved')
      } else {
        const created = await readJson<{ definition: { id: string } }>(await fetch('/api/reports/definitions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
        toast.success('Report saved')
        router.push(`/reports/custom/${created.definition.id}` as never)
      }
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Could not save.')
    }
  }

  async function previewSchedule() {
    try {
      const result = await readJson<{ times: string[] }>(await fetch('/api/reports/schedules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleWriteBody({ ...scheduleForm, ...scheduleMeta })),
      }))
      setPreviewTimes(result.times)
    } catch {
      setPreviewTimes([])
    }
  }

  async function saveSchedule() {
    setSavingSchedule(true)
    try {
      const payload = scheduleWriteBody({ ...scheduleForm, ...scheduleMeta })
      if (activeSchedule) {
        await readJson(await fetch(`/api/reports/schedules/${activeSchedule}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
      } else {
        const created = await readJson<{ id: string }>(await fetch('/api/reports/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
        setActiveSchedule(created.id)
      }
      toast.success('Schedule saved')
      setScheduleOpen(false)
      await load()
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Could not save the schedule.')
    } finally {
      setSavingSchedule(false)
    }
  }

  async function sendNow(id: string) {
    try {
      const result = await readJson<{ message?: string; status: string }>(await fetch(`/api/reports/schedules/${id}/send-now`, { method: 'POST' }))
      if (result.message) toast.message(result.message)
      else toast.success(`Send ${result.status}`)
      if (activeSchedule === id) await openHistory(id)
      await load()
    } catch (sendError) {
      toast.error(sendError instanceof Error ? sendError.message : 'Could not send.')
    }
  }

  async function pause(id: string, status: string) {
    const next = status === 'paused' ? 'active' : 'paused'
    await fetch(`/api/reports/schedules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })
    toast.success(next === 'paused' ? 'Schedule paused' : 'Schedule resumed')
    await load()
  }

  async function removeSchedule(id: string) {
    const ok = await confirmAction({ title: 'Delete this schedule?', description: 'Recipients will stop getting this report. Past sends stay in the history.', confirmLabel: 'Delete', destructive: true })
    if (!ok) return
    const response = await fetch(`/api/reports/schedules/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      toast.error((payload as { error?: string }).error || 'Could not delete the schedule.')
      return
    }
    toast.success('Schedule deleted')
    await load()
  }

  async function openHistory(id: string) {
    const result = await readJson<{ runs: Parameters<typeof RunHistory>[0]['runs'] }>(await fetch(`/api/reports/schedules/${id}/runs`))
    setHistory(result.runs)
  }

  async function toggleSubscription(id: string, unsubscribed: boolean) {
    await readJson(await fetch('/api/reports/subscriptions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, unsubscribed }) }))
    await load()
  }
}

function SubscriptionList({
  rows,
  onToggle,
}: {
  rows: Array<{ id: string; unsubscribed_at: string | null; schedule: { name: string; frequency: string } | null }>
  onToggle: (id: string, unsubscribed: boolean) => Promise<void>
}) {
  if (rows.length === 0) return <EmptyState title="No report emails" body="When someone adds you to a schedule, it shows up here." />
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
          <span>{row.schedule?.name || 'Report'} · {row.unsubscribed_at ? 'unsubscribed' : 'receiving'}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void onToggle(row.id, !row.unsubscribed_at)}>{row.unsubscribed_at ? 'Resume' : 'Unsubscribe'}</Button>
        </li>
      ))}
    </ul>
  )
}
