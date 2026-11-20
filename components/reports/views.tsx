'use client'

import Link from 'next/link'
import { formatCurrency, formatHours, formatPercent } from '@/lib/format'
import { PRESET_LABELS } from '@/lib/reports/date-range'
import { REPORT_CATALOG } from '@/lib/reports/catalog'
import type { BuiltReport, ReportCell, ReportColumn } from '@/lib/reports/types'
import { Badge, EmptyState, PageHeader } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'

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
        description="Activity, job cost, labor, invoicing, and the reports you save."
        action={canSchedule ? <Link href="/reports/custom/new" className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Build a report</Link> : <Link href="/reports/custom/new" className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm">Build a private report</Link>}
      />
      {pending ? <EmptyState title="Reports turn on after the database update" body="The Reports page is here. Numbers appear after the reporting database update is applied." /> : null}
      <Link href="/reports/activity" className="block rounded-lg border border-border bg-card p-5 hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Activity for a period</h2>
          <Badge>Start here</Badge>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Everything that happened in a year or date range: costs, labor, invoices, reversals, moves, and change orders.</p>
      </Link>
      <div className="grid gap-3 sm:grid-cols-2">
        {REPORT_CATALOG.filter((item) => item.key !== 'activity').map((item) => (
          <Link key={item.key} href={`/reports/${item.key}` as never} className="rounded-lg border border-border bg-card p-4 hover:bg-muted/40">
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            {item.needsInvoices && !invoicesRead ? <p className="mt-2 text-xs text-muted-foreground">Needs invoice access.</p> : null}
          </Link>
        ))}
      </div>
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
    </div>
  )
}

export function ScheduleList({
  rows,
  onOpen,
}: {
  rows: Array<{ id: string; name: string; frequency: string; send_hour: number; status: string; next_run_at: string | null; lastStatus: string | null; recipients: number; unsubscribed: number }>
  onOpen: (id: string) => void
}) {
  if (rows.length === 0) return <EmptyState title="No schedules" body="A schedule emails a report on a day and hour you pick." />
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {rows.map((row) => (
        <li key={row.id}>
          <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-muted/40" onClick={() => onOpen(row.id)}>
            <span>
              <span className="font-medium">{row.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{row.frequency} at {row.send_hour}:00 · {row.recipients} recipients{row.unsubscribed ? ` · ${row.unsubscribed} unsubscribed` : ''}</span>
            </span>
            <span className="text-xs text-muted-foreground">{row.status}{row.lastStatus ? ` · last ${row.lastStatus}` : ''}</span>
          </button>
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
