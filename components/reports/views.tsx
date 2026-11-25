'use client'

import Link from 'next/link'
import { formatCurrency, formatHours, formatPercent } from '@/lib/format'
import { PRESET_LABELS } from '@/lib/reports/date-range'
import { REPORT_CATALOG } from '@/lib/reports/catalog'
import type { BuiltReport, ReportCell, ReportColumn } from '@/lib/reports/types'
import { Badge, EmptyState, PageHeader } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { cadenceSummary } from '@/lib/reports/schedule'
import { ReportChartRow } from './ReportCharts'

export function cellText(column: ReportColumn, value: ReportCell): string {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  if (column.kind === 'money') return formatCurrency(value)
  if (column.kind === 'hours') return formatHours(value)
  if (column.kind === 'percent') return formatPercent(value)
  return String(value)
}

export function ReportDocument({ report }: { report: BuiltReport }) {
  return (
    <div className="space-y-4" data-report={report.key}>
      <PageHeader title={report.title} description={report.rangeLabel} />
      {report.filters.length ? <p className="text-sm text-muted-foreground">{report.filters.join(' · ')}</p> : null}
      {report.kpis.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
              <p className="mt-1 text-xl font-semibold">{kpi.value}</p>
              {kpi.detail ? <p className="mt-1 text-xs text-muted-foreground">{kpi.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      <ReportChartRow report={report} />
      {report.sections.map((section) => (
        <section key={section.title} className="overflow-hidden rounded-lg border border-border bg-card">
          <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">{section.title}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {section.columns.map((column) => <th key={column.key} className="px-3 py-2 font-medium">{column.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {section.rows.length === 0 ? (
                  <tr><td className="px-3 py-6 text-muted-foreground" colSpan={section.columns.length}>Nothing in this section.</td></tr>
                ) : section.rows.map((row, index) => (
                  <tr key={index} className="border-t border-border">
                    {row.cells.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2" style={{ paddingLeft: cellIndex === 0 && row.depth ? 12 + row.depth * 16 : undefined }}>
                        {cellText(section.columns[cellIndex], cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {section.totals ? (
                <tfoot>
                  <tr className="border-t border-border font-semibold">
                    {section.totals.map((cell, index) => (
                      <td key={index} className="px-3 py-2">{cellText(section.columns[index], cell)}</td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </section>
      ))}
      {report.notes.length ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {report.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

export const QUICK_STARTS: Array<{ href: string; title: string; blurb: string }> = [
  { href: '/reports/activity?range=this_year', title: "This year's activity", blurb: 'Costs, invoices, and changes since January 1.' },
  { href: '/reports/activity?range=last_year', title: "Last year's activity", blurb: 'The full previous calendar year.' },
  { href: '/reports/job_cost_summary?range=last_month&per_project=1', title: 'Last month by job', blurb: 'Budget versus actual on each job.' },
  { href: '/reports/labor_by_employee?range=this_month', title: 'Labor by employee (this month)', blurb: 'Hours and labor cost for this month.' },
  { href: '/reports/vendor_spend?range=ytd', title: 'Vendor spend (YTD)', blurb: 'Net spend by vendor, year to date.' },
  { href: '/reports/portfolio?range=all_time', title: 'Portfolio overview', blurb: 'Contract, cost, invoiced, and gross profit by job.' },
]

export function ReportsLandingView({
  canSchedule,
  invoicesRead,
  saved,
  pending,
}: {
  canSchedule: boolean
  invoicesRead: boolean
  saved: Array<{ id: string; name: string; is_shared: boolean; mine: boolean }>
  pending?: boolean
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Start with a common report. Results open immediately for every project you can see."
      />
      {pending ? <EmptyState title="Reports turn on after the database update" body="The Reports page is here. Numbers appear after the reporting database update is applied." /> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {QUICK_STARTS.map((item) => (
          <Link key={item.href} href={item.href as never} className="rounded-lg border border-border bg-card p-4 hover:bg-muted/40">
            <h2 className="font-medium">{item.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.blurb}</p>
          </Link>
        ))}
      </div>
      <section>
        <h2 className="mb-2 text-sm font-semibold">All reports</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {REPORT_CATALOG.map((item) => (
            <Link key={item.key} href={`/reports/${item.key}` as never} className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted/40">
              <span className="font-medium">{item.title}</span>
              {item.needsInvoices && !invoicesRead ? <span className="mt-0.5 block text-xs text-muted-foreground">Needs invoice access.</span> : null}
            </Link>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold">Saved reports</h2>
        {saved.length === 0 ? <p className="text-sm text-muted-foreground">No saved reports yet.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {saved.map((item) => (
              <li key={item.id}>
                <Link href={`/reports/custom/${item.id}` as never} className="flex items-center justify-between px-3 py-3 text-sm hover:bg-muted/40">
                  <span>{item.name}</span>
                  <span className="text-xs text-muted-foreground">{item.is_shared ? 'Shared' : 'Private'}{item.mine ? '' : ' · someone else'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link href="/reports/custom/new" className="block rounded-lg border border-dashed border-border px-4 py-3 text-sm hover:bg-muted/40">
        <span className="font-medium">{canSchedule ? 'Build a custom report' : 'Build a private report'}</span>
        <span className="mt-0.5 block text-muted-foreground">Pick columns and group costs, labor, invoices, or activity.</span>
      </Link>
    </div>
  )
}

export interface ScheduleRow {
  id: string
  name: string
  frequency: string
  weekday?: number | null
  month_day?: number | null
  send_hour: number
  status: string
  next_run_at: string | null
  lastStatus: string | null
  recipients: number
  unsubscribed: number
  timezone?: string
}

export function ScheduleList({
  rows,
  timezone,
  onEdit,
  onSend,
  onPause,
  onDelete,
}: {
  rows: ScheduleRow[]
  timezone?: string
  onEdit: (id: string) => void
  onSend?: (id: string) => void
  onPause?: (id: string, status: string) => void
  onDelete?: (id: string) => void
}) {
  if (rows.length === 0) return <EmptyState title="No schedules" body="A schedule emails a report on a day and hour you pick." />
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.name}</span>
              {row.status === 'paused' ? <Badge>Paused</Badge> : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {cadenceSummary({ frequency: row.frequency, weekday: row.weekday, monthDay: row.month_day, sendHour: row.send_hour, timezone: row.timezone || timezone })}
              {' · '}{row.recipients} recipient{row.recipients === 1 ? '' : 's'}
              {row.unsubscribed ? ` · ${row.unsubscribed} unsubscribed` : ''}
              {row.next_run_at ? ` · next ${new Date(row.next_run_at).toLocaleString()}` : ''}
              {row.lastStatus ? ` · last ${row.lastStatus}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onEdit(row.id)}>Edit</Button>
            {onSend ? <Button type="button" size="sm" variant="outline" onClick={() => onSend(row.id)}>Send now</Button> : null}
            {onPause ? <Button type="button" size="sm" variant="outline" onClick={() => onPause(row.id, row.status)}>{row.status === 'paused' ? 'Resume' : 'Pause'}</Button> : null}
            {onDelete ? <Button type="button" size="sm" variant="outline" onClick={() => onDelete(row.id)}>Delete</Button> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function RunHistory({
  runs,
}: {
  runs: Array<{ id: string; status: string; trigger: string; error: string | null; finished_at: string | null; delivered: number; total: number; deliveries: Array<{ email: string; status: string; error: string | null }> }>
}) {
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">No sends yet.</p>
  return (
    <ul className="space-y-3">
      {runs.map((run) => (
        <li key={run.id} className="rounded-lg border border-border p-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="font-medium">{run.trigger} · {run.status}</span>
            <span className="text-xs text-muted-foreground">{run.delivered}/{run.total} sent</span>
          </div>
          {run.error ? <p className="mt-1 text-xs text-muted-foreground">{run.error}</p> : null}
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {run.deliveries.map((row) => <li key={row.email}>{row.email}: {row.status}{row.error ? ` — ${row.error}` : ''}</li>)}
          </ul>
        </li>
      ))}
    </ul>
  )
}

export function rangeOptions(years: number[]) {
  const presets = Object.entries(PRESET_LABELS).filter(([key]) => key !== 'custom')
  return [
    ...presets.map(([value, label]) => ({ value, label })),
    ...years.map((year) => ({ value: `year:${year}`, label: String(year) })),
    { value: 'custom', label: 'Custom dates' },
  ]
}

export function UnsubscribeCard({ done, error, onConfirm }: { done: boolean; error: string; onConfirm: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16">
      <div className="rounded-lg border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">{done ? 'You are unsubscribed' : 'Unsubscribe from this report'}</h1>
        <div className="mt-3 space-y-3 text-sm">
          {done ? <p>You will not get this scheduled report again. Other reports you receive are unchanged.</p> : (
            <>
              <p>This stops one scheduled report. It does not change your ProTrack login.</p>
              {error ? <p className="text-destructive">{error}</p> : null}
              <Button type="button" onClick={onConfirm}>Unsubscribe</Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
