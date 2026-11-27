'use client'

import { Clock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { buildCustom } from '@/lib/reports/compute'
import { customSummary, draftToConfig, emptyBuilderDraft, type BuilderDraft } from '@/lib/reports/custom'
import type { BuiltReport, ReportDataset } from '@/lib/reports/types'
import { CustomBuilder } from './CustomBuilder'
import { ScheduleWizard, type ScheduleFormState } from './ScheduleWizard'
import { EmptyState } from '@/components/ui/feedback'
import { ReportCrumb } from './ReportCrumb'
import { ReportDocument, ReportsLandingView, RunHistory, ScheduleList, SectionHeading, UnsubscribeCard } from './views'

const activity: BuiltReport = {
  key: 'activity',
  title: 'Activity for a period',
  rangeLabel: 'Jan 1, 2025 – Dec 31, 2025 (Last year)',
  filters: ['JOB-A-003', 'All statuses'],
  kpis: [
    { label: 'Costs', value: '$90.00' },
    { label: 'Labor cost', value: '$440.00' },
    { label: 'Labor hours', value: '8' },
    { label: 'Invoiced', value: '$750.00' },
    { label: 'Credit memos', value: '-$150.00' },
    { label: 'Gross profit', value: '$220.00', detail: '29.3%' },
    { label: 'Change orders added', value: '2', detail: '$3,300.00' },
  ],
  sections: [
    {
      title: 'Totals by category',
      fitOnePage: true,
      columns: [
        { key: 'category', label: 'Category', kind: 'text' },
        { key: 'entries', label: 'Entries', kind: 'number' },
        { key: 'gross', label: 'Gross entered', kind: 'money' },
        { key: 'reversals', label: 'Reversals', kind: 'money' },
        { key: 'net', label: 'Net', kind: 'money' },
      ],
      rows: [
        { cells: ['Materials', 4, 175, -60, 115] },
        { depth: 1, cells: ['Lumber', 2, 120, -60, 60] },
        { cells: ['Labor', 1, 440, 0, 440] },
      ],
      totals: ['Total', 5, 615, -60, 555],
    },
    {
      title: 'Chronological detail',
      columns: [
        { key: 'date', label: 'Date', kind: 'text' },
        { key: 'type', label: 'Type', kind: 'text' },
        { key: 'project', label: 'Project', kind: 'text' },
        { key: 'category', label: 'Category', kind: 'text' },
        { key: 'detail', label: 'Detail', kind: 'text' },
        { key: 'amount', label: 'Amount', kind: 'money' },
        { key: 'by', label: 'By', kind: 'text' },
      ],
      rows: [
        { cells: ['Nov 2, 2025', 'Cost', 'JOB-A-003 Acme 2025 Shop', 'Materials', 'Screws', 15, 'Ada Master'] },
        { cells: ['May 6, 2026', 'Cost reversal', 'JOB-A-003 Acme 2025 Shop', 'Lumber', 'Reversal of May 5, 2026, $20.00. Wrong ticket', -20, 'Ada Master'] },
        { cells: ['Mar 2, 2026', 'Category move', 'JOB-A-003 Acme 2025 Shop', 'Others', 'Moved from Materials to Others: Moved to others', null, 'Ada Master'] },
      ],
    },
  ],
  notes: ['Reversals and credit memos are included, so totals are net.'],
}

const jobCost: BuiltReport = {
  key: 'job_cost_summary',
  title: 'Job cost summary',
  rangeLabel: 'All time',
  filters: ['JOB-A-001', 'Active projects'],
  kpis: [
    { label: 'Contract', value: '$112,000.00' },
    { label: 'Budget', value: '$45,500.00' },
    { label: 'Cost', value: '$4,834.50' },
    { label: 'Invoiced', value: '$2,300.00' },
    { label: 'Gross profit', value: '-$2,534.50' },
  ],
  sections: [{
    title: 'Budget versus actual · JOB-A-001 Acme Test Job',
    fitOnePage: true,
    columns: [
      { key: 'category', label: 'Category', kind: 'text' },
      { key: 'budget', label: 'Budget', kind: 'money' },
      { key: 'actual', label: 'Actual', kind: 'money' },
      { key: 'variance', label: 'Variance', kind: 'money' },
      { key: 'used', label: '% used', kind: 'percent' },
      { key: 'status', label: 'Status', kind: 'text' },
    ],
    rows: [
      { cells: ['Materials', 10000, 250, 9750, 2.5, 'Within'] },
      { cells: ['Labor', 20000, 650, 19350, 3.3, 'Within'] },
      { cells: ['Subcontractor', 15500, 3934.5, 11565.5, 25.4, 'Within'] },
    ],
    totals: ['Total', 45500, 4834.5, 40665.5, 10.6, ''],
  }],
  notes: ['Budgets and contract value are current figures. They are not limited to this date range.'],
}

const vendors: BuiltReport = {
  key: 'vendor_spend',
  title: 'Vendor spend',
  rangeLabel: 'Jan 1, 2026 – Dec 31, 2026 (This year)',
  filters: ['All projects I can see', 'All statuses'],
  kpis: [{ label: 'Net spend', value: '$30.00' }, { label: 'Vendors', value: '1' }],
  sections: [{
    title: 'Vendors',
    columns: [
      { key: 'vendor', label: 'Vendor', kind: 'text' },
      { key: 'entries', label: 'Entries', kind: 'number' },
      { key: 'projects', label: 'Projects', kind: 'number' },
      { key: 'category', label: 'Top category', kind: 'text' },
      { key: 'net', label: 'Net spend', kind: 'money' },
    ],
    rows: [{ cells: ['Home Depot', 3, 1, 'Materials', 30], vendorKey: 'home depot' }],
    totals: ['Total', 3, '', '', 30],
  }],
  notes: ['Vendor names that differ only by capital letters or extra spaces are one vendor.'],
}

export function ReportsPreview({ screen }: { screen: string }) {
  if (screen === 'Reports') {
    return (
      <div className="space-y-6">
        <ReportsLandingView
          canSchedule
          invoicesRead
          saved={[{ id: 'saved-1', name: 'Home Depot by month', is_shared: false, mine: true }]}
        />
        <section>
          <SectionHeading icon={Clock}>Scheduled reports</SectionHeading>
          <ScheduleList
            timezone="America/New_York"
            onEdit={() => undefined}
            onSend={() => undefined}
            onPause={() => undefined}
            onDelete={() => undefined}
            rows={[
              { id: 's1', name: 'Monday activity', frequency: 'weekly', weekday: 1, send_hour: 7, status: 'active', next_run_at: '2026-11-23T12:00:00.000Z', lastStatus: null, recipients: 2, unsubscribed: 0 },
              { id: 's2', name: 'Month-end portfolio', frequency: 'monthly', month_day: 1, send_hour: 8, status: 'paused', next_run_at: null, lastStatus: 'skipped', recipients: 1, unsubscribed: 0 },
            ]}
          />
        </section>
      </div>
    )
  }
  if (screen === 'Activity') return <ResultsChrome title="Activity for a period" range="Last year"><ReportDocument report={activity} /></ResultsChrome>
  if (screen === 'Job cost') return <ResultsChrome title="Job cost summary" range="All time"><ReportDocument report={jobCost} /></ResultsChrome>
  if (screen === 'Vendor') return <ResultsChrome title="Vendor spend" range="This year"><ReportDocument report={vendors} /></ResultsChrome>
  if (screen === 'Builder') return <BuilderScreen />
  if (screen === 'Schedule') return <SchedulePreview />
  if (screen === 'History') {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Monday activity</h1>
        <RunHistory runs={[{
          id: 'run-1',
          status: 'skipped',
          trigger: 'manual',
          error: "Email isn't set up yet",
          finished_at: null,
          delivered: 0,
          total: 2,
          deliveries: [
            { email: 'viewer-a@example.test', status: 'skipped', error: "Email isn't set up yet" },
            { email: 'master-a@example.test', status: 'skipped', error: "Email isn't set up yet" },
          ],
        }]} />
        <ScheduleList
          rows={[{ id: 's1', name: 'Monday activity', frequency: 'weekly', weekday: 1, month_day: null, send_hour: 7, status: 'active', next_run_at: '2026-11-23T12:00:00Z', lastStatus: 'skipped', recipients: 2, unsubscribed: 0, timezone: 'America/New_York' }]}
          timezone="America/New_York"
          onEdit={() => undefined}
          onSend={() => undefined}
          onPause={() => undefined}
          onDelete={() => undefined}
        />
      </div>
    )
  }
  return <UnsubscribeCard done={false} error="" onConfirm={() => undefined} />
}

function ResultsChrome({ title, range, children }: { title: string; range: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <ReportCrumb current={title} />
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <p className="mb-1 text-sm font-medium">Date range</p>
          <div className="flex h-11 items-center rounded-lg border border-input bg-card px-2 text-sm">{range}</div>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Projects</p>
          <div className="flex h-11 items-center rounded-lg border border-input bg-card px-2 text-sm">All projects I can see</div>
        </div>
        <div className="flex items-end gap-2">
          <span className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-4 text-sm">Refresh</span>
          <span className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-4 text-sm">Download</span>
          <span className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-4 text-sm">Schedule</span>
        </div>
      </div>
      {children}
    </div>
  )
}

const builderDataset: ReportDataset = {
  companyName: 'Acme Test',
  timezone: 'America/New_York',
  generatedAt: '2026-11-25T15:00:00.000Z',
  useCategoryBudgets: true,
  invoicesRead: true,
  isMaster: true,
  projects: [{ id: 'p1', jobNumber: 'JOB-A-001', jobName: 'Acme Test Job', customer: 'Acme', status: 'Active', totalContractValue: 10000 }],
  categories: [
    { id: 'materials', name: 'Materials', kind: 'standard', parent_id: null, builtin_key: 'material', sort_order: 1, is_hidden: false },
    { id: 'labor', name: 'Labor', kind: 'labor', parent_id: null, builtin_key: 'labor', sort_order: 2, is_hidden: false },
  ],
  costs: [
    { id: 'm', project_id: 'p1', category_id: 'materials', category: 'material', date: '2026-03-02', cost: 40, vendor: 'Home Depot', invoice_number: null, description: 'Screws', employee_name: null, employee_id: null, st_hours: null, ot_hours: null, dt_hours: null, per_diem: null, mob_qty: null, change_order_id: null, reversal_of_id: null, reversed_at: null, reversal_reason: null, created_at: '2026-03-02T15:00:00Z' },
    { id: 'l', project_id: 'p1', category_id: 'labor', category: 'labor', date: '2026-04-04', cost: 80, vendor: null, invoice_number: null, description: 'Shop time', employee_name: 'Alex Rivera', employee_id: 'e1', st_hours: 8, ot_hours: 0, dt_hours: 0, per_diem: null, mob_qty: null, change_order_id: null, reversal_of_id: null, reversed_at: null, reversal_reason: null, created_at: '2026-04-04T15:00:00Z' },
  ],
  invoices: [{ id: 'i1', project_id: 'p1', invoice_number: 'INV-100', amount: 750, amount_collected: 0, date_billed: '2026-05-01', change_order_id: null, reversal_of_id: null, reversal_reason: null, created_at: '2026-05-01T15:00:00Z' }],
  changeOrders: [],
  events: [],
  attachments: [],
  employees: [{ id: 'e1', name: 'Alex Rivera', job_role: 'Welder' }],
  budgets: [],
  legacyBudgets: [],
  actors: {},
  gpGoalPercent: null,
  laborFields: [],
}

function BuilderScreen() {
  const [draft, setDraft] = useState<BuilderDraft>(emptyBuilderDraft())
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const report = useMemo(() => {
    if (!draft.source || draft.columns.length === 0) return null
    try {
      return buildCustom(builderDataset, draftToConfig(draft), name || 'Custom report')
    } catch {
      return null
    }
  }, [draft, name])
  return (
    <div className="space-y-4">
      <ReportCrumb current={name.trim() || 'Build a custom report'} />
      <CustomBuilder
        draft={draft}
        onDraft={(next, message) => { setDraft(next); setNotice(message || '') }}
        notice={notice}
        name={name}
        onName={setName}
        shared={false}
        onShared={() => undefined}
        canShare
        invoicesRead
        projects={[{ id: 'p1', jobNumber: 'JOB-A-001', jobName: 'Acme Test Job' }]}
        employees={[{ id: 'e1', name: 'Alex Rivera' }]}
        years={[2025, 2026]}
        onSave={() => undefined}
      />
      <section className="space-y-3 rounded-lg border border-border border-t-2 border-t-primary/50 bg-card p-3">
        <p className="text-sm font-medium">{customSummary(draft)}</p>
        {!draft.source ? <EmptyState title="Pick a source" body="Choose costs, labor, invoices, or activity. The preview uses the same numbers as the download." /> : null}
        {report ? <ReportDocument report={report} /> : null}
      </section>
    </div>
  )
}

function SchedulePreview() {
  const [form, setForm] = useState<ScheduleFormState>({
    name: 'Monday activity',
    frequency: 'weekly',
    weekday: 1,
    monthDay: 1,
    sendHour: 7,
    formats: ['pdf'],
    recipientIds: ['ada'],
  })
  return (
    <div className="max-w-lg rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">Schedule this report</h2>
        <p className="text-sm text-muted-foreground">Emails go out in America/New_York.</p>
      </div>
      <ScheduleWizard
        form={form}
        setForm={setForm}
        timezone="America/New_York"
        users={[{ id: 'ada', name: 'Ada Master', email: 'master-a@example.test' }, { id: 'view', name: 'Acme Viewer', email: 'viewer-a@example.test' }]}
        times={['2026-11-23T12:00:00Z', '2026-11-30T12:00:00Z', '2026-12-07T12:00:00Z']}
        onSubmit={() => undefined}
      />
    </div>
  )
}
