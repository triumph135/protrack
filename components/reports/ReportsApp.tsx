'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { EmptyState, PageHeader } from '@/components/ui/feedback'
import { ACTIVITY_COLUMNS, COST_COLUMNS, GROUP_FIELDS, INVOICE_COLUMNS } from '@/lib/reports/custom'
import { defaultRangeFor } from '@/lib/reports/date-range'
import type { BuiltReport, ReportParams } from '@/lib/reports/types'
import { ReportDocument, ReportsLandingView, RunHistory, ScheduleList, rangeOptions } from './views'

type Mode = 'landing' | 'report' | 'builder'

interface ContextPayload {
  schemaPending?: boolean
  error?: string
  companyName?: string
  scope?: {
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
  config: { params?: ReportParams; custom?: CustomDraft }
}

interface CustomDraft {
  source: 'costs' | 'labor' | 'invoices' | 'activity'
  columns: string[]
  groupBy: string[]
  filters: { vendorContains?: string; range?: string; project_status?: 'active' | 'all' }
}

const selectClass = 'h-11 w-full rounded-lg border border-input bg-card px-2 text-sm'

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((body as { error?: string }).error || 'Request failed')
  return body as T
}

export default function ReportsApp({ mode, reportKey, definitionId }: { mode: Mode; reportKey?: string; definitionId?: string }) {
  const router = useRouter()
  const [context, setContext] = useState<ContextPayload | null>(null)
  const [saved, setSaved] = useState<SavedReport[]>([])
  const [tab, setTab] = useState<'reports' | 'schedules' | 'subscriptions'>('reports')
  const [schedules, setSchedules] = useState<Array<{ id: string; name: string; frequency: string; send_hour: number; status: string; next_run_at: string | null; lastStatus: string | null; recipients: number; unsubscribed: number }>>([])
  const [subscriptions, setSubscriptions] = useState<Array<{ id: string; unsubscribed_at: string | null; schedule: { name: string; frequency: string } | null }>>([])
  const [params, setParams] = useState<ReportParams>({ range: defaultRangeFor(reportKey || 'activity'), projects: 'all', project_status: 'active' })
  const [report, setReport] = useState<BuiltReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [history, setHistory] = useState<Parameters<typeof RunHistory>[0]['runs']>([])
  const [draft, setDraft] = useState<CustomDraft>({ source: 'costs', columns: ['date', 'project', 'vendor', 'amount'], groupBy: ['vendor', 'month'], filters: { range: 'this_year', project_status: 'all' } })
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ name: '', frequency: 'weekly', weekday: 1, monthDay: 1, sendHour: 7, formats: ['pdf'] as string[], recipientIds: [] as string[] })
  const [previewTimes, setPreviewTimes] = useState<string[]>([])
  const [activeSchedule, setActiveSchedule] = useState<string | null>(null)

  const load = useCallback(async () => {
    const response = await fetch('/api/reports/context')
    const body = await response.json()
    setContext(body)
    if (response.ok && !body.schemaPending) {
      const defs = await readJson<{ definitions: SavedReport[] }>(await fetch('/api/reports/definitions'))
      setSaved(defs.definitions)
      if (body.scope?.canSchedule) {
        const listed = await readJson<{ schedules: typeof schedules }>(await fetch('/api/reports/schedules'))
        setSchedules(listed.schedules)
      }
      const subs = await readJson<{ subscriptions: typeof subscriptions }>(await fetch('/api/reports/subscriptions'))
      setSubscriptions(subs.subscriptions)
    }
  }, [])

  useEffect(() => { void load().catch((error: Error) => toast.error(error.message)) }, [load])

  useEffect(() => {
    if (!definitionId || saved.length === 0) return
    const found = saved.find((item) => item.id === definitionId)
    if (!found) return
    setName(found.name)
    setShared(found.is_shared)
    if (found.config?.params) setParams(found.config.params)
    if (found.config?.custom) setDraft(found.config.custom)
  }, [definitionId, saved])

  const key = reportKey || 'custom'
  const options = useMemo(() => rangeOptions(context?.years || []), [context?.years])
  const columns = draft.source === 'invoices' ? INVOICE_COLUMNS : draft.source === 'activity' ? ACTIVITY_COLUMNS : COST_COLUMNS

  async function run(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const result = await readJson<{ report: BuiltReport }>(await fetch('/api/reports/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
      setReport(result.report)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not run the report.')
    } finally {
      setBusy(false)
    }
  }

  async function download(format: 'pdf' | 'csv' | 'xlsx', body: Record<string, unknown>) {
    const response = await fetch('/api/reports/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, format }) })
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

  const runBody = mode === 'builder'
    ? { reportKey: 'custom', definitionId, params: { ...params, range: draft.filters.range || params.range, project_status: draft.filters.project_status || params.project_status, vendor: draft.filters.vendorContains }, config: draft, name }
    : { reportKey: key, definitionId, params }

  if (context?.schemaPending) {
    return <ReportsLandingView canSchedule={false} invoicesRead={false} saved={[]} pending />
  }

  return (
    <div className="space-y-4">
      {mode === 'landing' ? (
        <>
          <div className="flex gap-2">
            <Button type="button" variant={tab === 'reports' ? 'primary' : 'outline'} onClick={() => setTab('reports')}>Reports</Button>
            {context?.scope?.canSchedule ? <Button type="button" variant={tab === 'schedules' ? 'primary' : 'outline'} onClick={() => setTab('schedules')}>Schedules</Button> : null}
            <Button type="button" variant={tab === 'subscriptions' ? 'primary' : 'outline'} onClick={() => setTab('subscriptions')}>Email subscriptions</Button>
          </div>
          {tab === 'reports' ? <ReportsLandingView canSchedule={!!context?.scope?.canSchedule} invoicesRead={context?.scope?.invoicesRead !== false} saved={saved} /> : null}
          {tab === 'schedules' ? <ScheduleList rows={schedules} onOpen={(id) => { setActiveSchedule(id); setScheduleOpen(true); void openHistory(id) }} /> : null}
          {tab === 'subscriptions' ? <SubscriptionList rows={subscriptions} onToggle={toggleSubscription} /> : null}
        </>
      ) : null}

      {mode !== 'landing' ? (
        <>
          <PageHeader
            title={mode === 'builder' ? (name || 'Custom report') : (report?.title || 'Report')}
            description={context?.scope?.timezone ? `Dates use ${context.scope.timezone.replaceAll('_', ' ')}.` : undefined}
            action={<Link href="/reports" className="text-sm text-muted-foreground">All reports</Link>}
          />
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
              <select id="report-projects" className={selectClass} value={params.projects === 'all' ? 'all' : params.projects[0] || 'all'} onChange={(event) => setParams({ ...params, projects: event.target.value === 'all' ? 'all' : [event.target.value] })}>
                <option value="all">All projects I can see</option>
                {(context?.projects || []).map((project) => <option key={project.id} value={project.id}>{project.jobNumber} {project.jobName}</option>)}
              </select>
            </Field>
          </div>
          {mode === 'builder' ? <Builder draft={draft} columns={[...columns]} setDraft={setDraft} name={name} setName={setName} shared={shared} setShared={setShared} canShare={!!context?.scope?.canSchedule} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void run(runBody)}>{busy ? 'Running…' : 'Run report'}</Button>
            <Button type="button" variant="outline" onClick={() => void download('pdf', runBody)}>PDF</Button>
            <Button type="button" variant="outline" onClick={() => void download('csv', runBody)}>CSV</Button>
            <Button type="button" variant="outline" onClick={() => void download('xlsx', runBody)}>Excel</Button>
            {context?.scope?.canSchedule ? <Button type="button" variant="outline" onClick={() => { setActiveSchedule(null); setScheduleForm({ ...scheduleForm, name: name || report?.title || 'Scheduled report' }); setScheduleOpen(true) }}>Schedule</Button> : null}
            {mode === 'builder' ? <Button type="button" variant="secondary" onClick={() => void saveDefinition()}>Save report</Button> : null}
          </div>
          {report ? <ReportDocument report={report} /> : <EmptyState title="Run the report" body="Pick a date range, then run it. The same numbers are used for the page, the PDF, the CSV, and the Excel file." />}
        </>
      ) : null}

      <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen} title={activeSchedule ? 'Schedule' : 'Schedule this report'} description="Emails go out in the company timezone.">
        <div className="space-y-3 overflow-y-auto p-4">
          <Field label="Name" htmlFor="sched-name"><Input id="sched-name" value={scheduleForm.name} onChange={(event) => setScheduleForm({ ...scheduleForm, name: event.target.value })} /></Field>
          <Field label="How often" htmlFor="sched-freq">
            <select id="sched-freq" className={selectClass} value={scheduleForm.frequency} onChange={(event) => setScheduleForm({ ...scheduleForm, frequency: event.target.value })}>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </Field>
          {scheduleForm.frequency === 'weekly' ? (
            <Field label="Day" htmlFor="sched-day">
              <select id="sched-day" className={selectClass} value={scheduleForm.weekday} onChange={(event) => setScheduleForm({ ...scheduleForm, weekday: Number(event.target.value) })}>
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((label, index) => <option key={label} value={index}>{label}</option>)}
              </select>
            </Field>
          ) : null}
          {scheduleForm.frequency === 'monthly' ? (
            <Field label="Day of month" htmlFor="sched-dom"><Input id="sched-dom" type="number" min={1} max={31} value={scheduleForm.monthDay} onChange={(event) => setScheduleForm({ ...scheduleForm, monthDay: Number(event.target.value) })} /></Field>
          ) : null}
          <Field label="Hour" htmlFor="sched-hour">
            <select id="sched-hour" className={selectClass} value={scheduleForm.sendHour} onChange={(event) => setScheduleForm({ ...scheduleForm, sendHour: Number(event.target.value) })}>
              {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hour}:00</option>)}
            </select>
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Files</legend>
            {['pdf', 'csv', 'xlsx'].map((format) => (
              <label key={format} className="mr-3 text-sm">
                <input type="checkbox" className="mr-1" checked={scheduleForm.formats.includes(format)} onChange={(event) => {
                  const formats = event.target.checked ? [...scheduleForm.formats, format] : scheduleForm.formats.filter((item) => item !== format)
                  setScheduleForm({ ...scheduleForm, formats })
                }} />
                {format.toUpperCase()}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Recipients</legend>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {(context?.users || []).map((person) => (
                <label key={person.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={scheduleForm.recipientIds.includes(person.id)} onChange={(event) => {
                    const recipientIds = event.target.checked ? [...scheduleForm.recipientIds, person.id] : scheduleForm.recipientIds.filter((id) => id !== person.id)
                    setScheduleForm({ ...scheduleForm, recipientIds })
                  }} />
                  {person.name} · {person.email}
                </label>
              ))}
            </div>
          </fieldset>
          {previewTimes.length ? <p className="text-xs text-muted-foreground">Next: {previewTimes.map((time) => new Date(time).toLocaleString()).join(' · ')}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void previewSchedule()}>Preview next 3</Button>
            <Button type="button" onClick={() => void saveSchedule()}>{activeSchedule ? 'Save' : 'Create schedule'}</Button>
            {activeSchedule ? <Button type="button" variant="outline" onClick={() => void sendNow(activeSchedule)}>Send now</Button> : null}
            {activeSchedule ? <Button type="button" variant="outline" onClick={() => void pause(activeSchedule)}>Pause</Button> : null}
          </div>
          {activeSchedule ? <RunHistory runs={history} /> : null}
        </div>
      </Sheet>
    </div>
  )

  async function saveDefinition() {
    try {
      const payload = { name, reportKey: 'custom', is_shared: shared, params, config: draft }
      if (definitionId) {
        await readJson(await fetch(`/api/reports/definitions/${definitionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
        toast.success('Report saved')
      } else {
        const created = await readJson<{ definition: { id: string } }>(await fetch('/api/reports/definitions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
        toast.success('Report saved')
        router.push(`/reports/custom/${created.definition.id}` as never)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save.')
    }
  }

  async function previewSchedule() {
    try {
      const result = await readJson<{ times: string[] }>(await fetch('/api/reports/schedules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scheduleForm, reportKey: key, params, config: mode === 'builder' ? draft : undefined, recipientIds: scheduleForm.recipientIds.length ? scheduleForm.recipientIds : ['00000000-0000-0000-0000-000000000000'] }),
      }))
      setPreviewTimes(result.times)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not preview.')
    }
  }

  async function saveSchedule() {
    try {
      const payload = { ...scheduleForm, reportKey: key, params, config: mode === 'builder' ? draft : undefined, definitionId }
      if (activeSchedule) {
        await readJson(await fetch(`/api/reports/schedules/${activeSchedule}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
      } else {
        const created = await readJson<{ id: string }>(await fetch('/api/reports/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
        setActiveSchedule(created.id)
      }
      toast.success('Schedule saved')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the schedule.')
    }
  }

  async function sendNow(id: string) {
    try {
      const result = await readJson<{ message?: string; status: string }>(await fetch(`/api/reports/schedules/${id}/send-now`, { method: 'POST' }))
      if (result.message) toast.message(result.message)
      else toast.success(`Send ${result.status}`)
      await openHistory(id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send.')
    }
  }

  async function pause(id: string) {
    await fetch(`/api/reports/schedules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paused' }) })
    toast.success('Schedule paused')
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

function Builder({
  draft, columns, setDraft, name, setName, shared, setShared, canShare,
}: {
  draft: CustomDraft
  columns: string[]
  setDraft: (draft: CustomDraft) => void
  name: string
  setName: (value: string) => void
  shared: boolean
  setShared: (value: boolean) => void
  canShare: boolean
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-2">
      <Field label="Report name" htmlFor="custom-name"><Input id="custom-name" value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Source" htmlFor="custom-source">
        <select id="custom-source" className={selectClass} value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as CustomDraft['source'], columns: event.target.value === 'invoices' ? ['date', 'project', 'amount'] : ['date', 'project', 'vendor', 'amount'] })}>
          <option value="costs">Costs</option>
          <option value="labor">Labor</option>
          <option value="invoices">Invoices</option>
          <option value="activity">Activity</option>
        </select>
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Columns</legend>
        <div className="grid grid-cols-2 gap-1">
          {columns.map((column) => (
            <label key={column} className="text-sm">
              <input type="checkbox" className="mr-1" checked={draft.columns.includes(column)} onChange={(event) => {
                const next = event.target.checked ? [...draft.columns, column] : draft.columns.filter((item) => item !== column)
                setDraft({ ...draft, columns: next })
              }} />
              {column.replaceAll('_', ' ')}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Group by</legend>
        {GROUP_FIELDS.map((field) => (
          <label key={field} className="mr-3 text-sm">
            <input type="checkbox" className="mr-1" checked={draft.groupBy.includes(field)} onChange={(event) => {
              const next = event.target.checked ? [...draft.groupBy, field].slice(0, 2) : draft.groupBy.filter((item) => item !== field)
              setDraft({ ...draft, groupBy: next })
            }} />
            {field.replaceAll('_', ' ')}
          </label>
        ))}
        <Field label="Vendor contains" htmlFor="vendor-contains">
          <Input id="vendor-contains" value={draft.filters.vendorContains || ''} onChange={(event) => setDraft({ ...draft, filters: { ...draft.filters, vendorContains: event.target.value } })} />
        </Field>
        {canShare ? <label className="mt-2 block text-sm"><input type="checkbox" className="mr-1" checked={shared} onChange={(event) => setShared(event.target.checked)} />Share with the company</label> : null}
      </fieldset>
    </div>
  )
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
