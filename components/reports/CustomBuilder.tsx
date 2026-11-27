'use client'

import { Activity, Receipt, Users, Wallet, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import {
  CUSTOM_EXAMPLES,
  SOURCE_SCHEMA,
  changeSource,
  columnBlockReason,
  setDraftGroupBy,
  type BuilderDraft,
  type CustomSource,
} from '@/lib/reports/custom'
import { rangeOptions } from './views'

const ICONS: Record<CustomSource, LucideIcon> = {
  costs: Wallet,
  labor: Users,
  invoices: Receipt,
  activity: Activity,
}

const selectClass = 'h-11 w-full rounded-lg border border-input bg-card px-2 text-sm'

export function CustomBuilder({
  draft,
  onDraft,
  notice,
  name,
  onName,
  shared,
  onShared,
  canShare,
  invoicesRead,
  projects,
  employees,
  years,
  onSave,
}: {
  draft: BuilderDraft
  onDraft: (draft: BuilderDraft, notice?: string) => void
  notice: string
  name: string
  onName: (value: string) => void
  shared: boolean
  onShared: (value: boolean) => void
  canShare: boolean
  invoicesRead: boolean
  projects: Array<{ id: string; jobNumber: string; jobName: string }>
  employees: Array<{ id: string; name: string }>
  years: number[]
  onSave: () => void
}) {
  const [helpOpen, setHelpOpen] = useState(false)
  const source = SOURCE_SCHEMA.find((item) => item.key === draft.source) || null
  const projectLabel = !draft.filters.projects || draft.filters.projects === 'all'
    ? 'All projects I can see'
    : `${draft.filters.projects.length} project${draft.filters.projects.length === 1 ? '' : 's'}`

  function pickSource(next: CustomSource) {
    const result = changeSource(draft, next)
    onDraft(result.draft, result.removed.length ? `Removed ${result.removed.join(', ')}. Those don't apply to ${result.draft.source === next ? SOURCE_SCHEMA.find((item) => item.key === next)?.title : 'that source'}.` : '')
  }

  function toggleColumn(key: string) {
    if (!draft.source) return
    if (columnBlockReason(draft.source, key, draft.groupBy)) return
    const columns = draft.columns.includes(key) ? draft.columns.filter((item) => item !== key) : [...draft.columns, key]
    onDraft({ ...draft, columns }, '')
  }

  function toggleGroup(key: string | null) {
    if (!draft.source) return
    if (key == null) {
      const result = setDraftGroupBy(draft, [])
      onDraft(result.draft, '')
      return
    }
    if (draft.groupBy.includes(key)) {
      const result = setDraftGroupBy(draft, draft.groupBy.filter((item) => item !== key))
      onDraft(result.draft, result.removed.length ? `Removed ${result.removed.join(', ')} because a grouped report sums numbers.` : '')
      return
    }
    if (draft.groupBy.length >= 2) {
      onDraft(draft, 'A report can be grouped by at most two fields.')
      return
    }
    const result = setDraftGroupBy(draft, [...draft.groupBy, key])
    onDraft(result.draft, result.removed.length ? `Removed ${result.removed.join(', ')} because a grouped report sums numbers.` : '')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Build a custom report</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick a source, then only the columns and groups that belong to it.</p>
        </div>
        <div className="relative">
          <Button type="button" variant="outline" aria-expanded={helpOpen} onClick={() => setHelpOpen((open) => !open)}>What can I build?</Button>
          {helpOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-primary/30 bg-card p-2 shadow-lg">
              {CUSTOM_EXAMPLES.map((example) => (
                <button
                  key={example.title}
                  type="button"
                  className="block w-full rounded-md px-2 py-2 text-left hover:bg-primary/5"
                  onClick={() => {
                    onDraft(example.draft, '')
                    setHelpOpen(false)
                  }}
                >
                  <span className="block text-sm font-medium text-primary">{example.title}</span>
                  <span className="block text-xs text-muted-foreground">{example.blurb}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {notice ? <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">{notice}</p> : null}

      <section className="space-y-2">
        <Step n={1} title="Pick what to report on" hint="Each source is a different list. The columns and groups below change with it." />
        <div className="grid gap-2 sm:grid-cols-2">
          {SOURCE_SCHEMA.map((item) => {
            const Icon = ICONS[item.key]
            const blocked = item.key === 'invoices' && !invoicesRead
            const selected = draft.source === item.key
            return (
              <button
                key={item.key}
                type="button"
                disabled={blocked}
                aria-pressed={selected}
                onClick={() => pickSource(item.key)}
                className={`rounded-lg border bg-card p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-primary bg-primary/5 shadow-[0_8px_24px_-18px_var(--primary)]' : 'border-border border-l-2 border-l-primary/50 hover:border-primary/40 hover:bg-primary/5'}`}
              >
                <span className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-medium">{item.title}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{blocked ? 'Needs invoice access.' : item.description}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-2">
        <Step n={2} title="Choose columns" hint="Checked columns show in the preview. A grouped report sums the number columns and leaves text columns out." />
        {source ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {source.columns.map((column) => {
              const reason = columnBlockReason(source.key, column.key, draft.groupBy)
              const checked = draft.columns.includes(column.key)
              return (
                <button
                  key={column.key}
                  type="button"
                  aria-pressed={checked}
                  disabled={!!reason}
                  title={reason || column.description}
                  onClick={() => toggleColumn(column.key)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card hover:border-primary/30 hover:bg-primary/5'}`}
                >
                  <span className="block font-medium">{column.label}</span>
                  <span className={`mt-0.5 block text-xs ${checked ? 'text-primary/80' : 'text-muted-foreground'}`}>{reason || column.description}</span>
                </button>
              )
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">Pick a source and the columns for it show up here.</p>}
      </section>

      <section className="space-y-2">
        <Step n={3} title="Group by" hint="Optional, up to two. No grouping lists every row. Numbers are summed. Text columns that are not the group are turned off." />
        {source ? (
          <div className="flex flex-wrap gap-2">
            <GroupChip label="No grouping" description="Every row" pressed={draft.groupBy.length === 0} onClick={() => toggleGroup(null)} />
            {source.groups.map((group) => (
              <GroupChip
                key={group.key}
                label={group.label}
                description={group.description}
                pressed={draft.groupBy.includes(group.key)}
                onClick={() => toggleGroup(group.key)}
              />
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Pick a source to see the groups that fit it.</p>}
      </section>

      <section className="space-y-2">
        <Step n={4} title="Filters" hint="The date range and projects apply to the preview, the download, and a saved copy." />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Date range" htmlFor="custom-range">
            <select
              id="custom-range"
              className={selectClass}
              value={draft.filters.range || 'this_year'}
              onChange={(event) => onDraft({ ...draft, filters: { ...draft.filters, range: event.target.value } }, '')}
            >
              {rangeOptions(years).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          {draft.filters.range === 'custom' ? (
            <>
              <Field label="From" htmlFor="custom-from"><Input id="custom-from" type="date" value={draft.filters.from || ''} onChange={(event) => onDraft({ ...draft, filters: { ...draft.filters, from: event.target.value } }, '')} /></Field>
              <Field label="To" htmlFor="custom-to"><Input id="custom-to" type="date" value={draft.filters.to || ''} onChange={(event) => onDraft({ ...draft, filters: { ...draft.filters, to: event.target.value } }, '')} /></Field>
            </>
          ) : null}
          <Field label="Projects" htmlFor="custom-projects">
            <details className="relative">
              <summary id="custom-projects" className={`${selectClass} flex cursor-pointer list-none items-center`}>{projectLabel}</summary>
              <div className="absolute z-20 mt-1 max-h-64 w-full min-w-56 overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-lg">
                <label className="flex items-center gap-2 px-1 py-1 text-sm">
                  <input type="checkbox" checked={!draft.filters.projects || draft.filters.projects === 'all'} onChange={() => onDraft({ ...draft, filters: { ...draft.filters, projects: 'all' } }, '')} />
                  All projects I can see
                </label>
                {projects.map((project) => {
                  const selected = draft.filters.projects !== 'all' && !!draft.filters.projects?.includes(project.id)
                  return (
                    <label key={project.id} className="flex items-center gap-2 px-1 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          const current = draft.filters.projects && draft.filters.projects !== 'all' ? draft.filters.projects : []
                          const next = event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id)
                          onDraft({ ...draft, filters: { ...draft.filters, projects: next.length ? next : 'all' } }, '')
                        }}
                      />
                      {project.jobNumber} {project.jobName}
                    </label>
                  )
                })}
              </div>
            </details>
          </Field>
          {source?.filters.some((filter) => filter.key === 'vendorContains') ? (
            <Field label="Vendor contains" htmlFor="vendor-contains" hint="Matches the vendor name, ignoring capital letters.">
              <Input id="vendor-contains" value={draft.filters.vendorContains || ''} onChange={(event) => onDraft({ ...draft, filters: { ...draft.filters, vendorContains: event.target.value } }, '')} />
            </Field>
          ) : null}
          {source?.filters.some((filter) => filter.key === 'employee') ? (
            <Field label="Employee" htmlFor="custom-employee">
              <select id="custom-employee" className={selectClass} value={draft.filters.employee || ''} onChange={(event) => onDraft({ ...draft, filters: { ...draft.filters, employee: event.target.value || undefined } }, '')}>
                <option value="">Any employee</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </Field>
          ) : null}
          {source?.filters.some((filter) => filter.key === 'amountMin') ? (
            <Field label="Amount at least" htmlFor="amount-min" hint="Leave blank for no minimum.">
              <Input id="amount-min" inputMode="decimal" value={draft.filters.amountMin ?? ''} onChange={(event) => onDraft({ ...draft, filters: { ...draft.filters, amountMin: event.target.value === '' ? undefined : Number(event.target.value) } }, '')} />
            </Field>
          ) : null}
        </div>
      </section>

      <div className="grid gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 md:grid-cols-[1fr_auto] md:items-end">
        <Field label="Report name" htmlFor="custom-name" hint="Required only when you save.">
          <Input id="custom-name" value={name} onChange={(event) => onName(event.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          {canShare ? <label className="text-sm"><input type="checkbox" className="mr-1" checked={shared} onChange={(event) => onShared(event.target.checked)} />Share with the company</label> : null}
          <Button type="button" disabled={!draft.source} onClick={onSave}>Save report</Button>
        </div>
      </div>
    </div>
  )
}

function Step({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">{n}</span>
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  )
}

function GroupChip({ label, description, pressed, onClick }: { label: string; description: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={description}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm ${pressed ? 'border-primary/40 bg-primary/15 font-medium text-primary' : 'border-border bg-card hover:border-primary/30 hover:bg-primary/5'}`}
    >
      {label}
    </button>
  )
}
