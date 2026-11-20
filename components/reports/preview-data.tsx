'use client'

import { ReportDocument, ReportsLandingView, RunHistory, ScheduleList, UnsubscribeCard } from './views'
import type { BuiltReport } from '@/lib/reports/types'

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
      <ReportsLandingView
        canSchedule
        invoicesRead
        saved={[{ id: 'saved-1', name: 'Home Depot by month', is_shared: false, mine: true }]}
      />
    )
  }
  if (screen === 'Activity') return <ReportDocument report={activity} />
  if (screen === 'Job cost') return <ReportDocument report={jobCost} />
  if (screen === 'Vendor') return <ReportDocument report={vendors} />
  if (screen === 'Builder') {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Vendor months</h1>
        <p className="text-sm text-muted-foreground">Grouped by vendor and month. Reversals stay in the total.</p>
        <div className="rounded-lg border border-border bg-card p-3 text-sm">Source: Costs · Columns: vendor, amount · Group by: vendor, month</div>
        <ReportDocument report={{ ...vendors, title: 'Vendor months', key: 'custom' }} />
      </div>
    )
  }
  if (screen === 'Schedule') {
    return (
      <div className="max-w-lg space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Schedule this report</h2>
        <p className="text-sm text-muted-foreground">Emails go out in America/New York.</p>
        <p className="text-sm">Every week on Monday at 7:00 · PDF</p>
        <p className="text-sm">Recipients: Ada Master, Acme Viewer</p>
        <p className="text-xs text-muted-foreground">Next: Mon 7:00 AM · Mon 7:00 AM · Mon 7:00 AM</p>
      </div>
    )
  }
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
          rows={[{ id: 's1', name: 'Monday activity', frequency: 'weekly', send_hour: 7, status: 'active', next_run_at: null, lastStatus: 'skipped', recipients: 2, unsubscribed: 0 }]}
          onOpen={() => undefined}
        />
      </div>
    )
  }
  return <UnsubscribeCard done={false} error="" onConfirm={() => undefined} />
}
