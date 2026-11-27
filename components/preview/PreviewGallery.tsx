'use client'

import { useEffect, useState } from 'react'
import Logo from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { PageHeader } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { CategoryName } from '@/components/costs/CategoryName'
import { ReverseSheet } from '@/components/ReverseSheet'
import { MoveCostSheet } from '@/components/MoveCostSheet'
import { QueuedFilesField } from '@/components/QueuedFilesField'
import { ProjectRatesEditor } from '@/components/ProjectRatesEditor'
import { ReportsPreview } from '@/components/reports/preview-data'
import { OverviewDashboard, type OverviewGroup } from '@/components/overview/OverviewDashboard'
import { aggregatePortfolio } from '@/lib/portfolio-overview'
import { fromCents } from '@/lib/reports/money'
import { formatCurrency, formatDate } from '@/lib/format'
import { showsJobSelectors } from '@/lib/shell-scope'
import type { ReportCategory } from '@/lib/reports/types'

const screens = ['Login', 'Forgot password', 'Overview', 'All projects', 'Projects', 'Costs', 'Category', 'Invoices', 'Reports', 'Activity', 'Job cost', 'Vendor', 'Builder', 'Schedule', 'History', 'Unsubscribe', 'Employees', 'Team', 'Settings', 'Reverse', 'Credit', 'Move', 'Attachments', 'Rates'] as const

export default function PreviewGallery({
  initialScreen = 'Overview',
  initialMobile = false,
  bare = false,
}: {
  initialScreen?: string
  initialMobile?: boolean
  bare?: boolean
}) {
  const starting = screens.find((item) => item.toLowerCase() === initialScreen.toLowerCase()) || 'Overview'
  const [screen, setScreen] = useState<(typeof screens)[number]>(starting)
  const [mobile, setMobile] = useState(initialMobile)

  return (
    <div className={bare ? 'min-h-screen bg-background' : 'min-h-screen bg-background p-4'}>
      {bare ? null : <div className="mb-3 flex flex-wrap gap-2">
        {screens.map((item) => (
          <Button key={item} type="button" size="sm" variant={screen === item ? 'primary' : 'outline'} onClick={() => setScreen(item)}>
            {item}
          </Button>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setMobile((value) => !value)}>
          {mobile ? 'Desktop width' : 'Mobile width'}
        </Button>
      </div>}
      <div className={bare ? 'bg-background' : mobile ? 'mx-auto w-[390px] overflow-hidden rounded-lg border border-border bg-background shadow-none' : 'overflow-hidden rounded-lg border border-border bg-background'}>
        {screen === 'Login' ? <LoginScreen /> : screen === 'Forgot password' ? <ForgotScreen /> : screen === 'Unsubscribe' ? <div className="bg-background p-4"><ReportsPreview screen="Unsubscribe" /></div> : <AppFrame mobile={mobile} screen={screen} />}
      </div>
    </div>
  )
}

function NavTree({ screen }: { screen: string }) {
  const costsOpen = screen === 'Costs' || screen === 'Category'
  const materialsOpen = screen === 'Category'
  const row = (label: string, active: boolean, indent = '') => (
    <div className={`flex min-h-11 items-center rounded-lg px-2 ${indent} ${active ? 'bg-accent font-medium text-accent-foreground' : ''}`}>{label}</div>
  )
  return (
    <nav className="mt-4 space-y-0.5 text-sm">
      {row('Overview', screen === 'Overview' || screen === 'All projects')}
      {row('Projects', screen === 'Projects')}
      <div className="flex items-center">
        <span className="inline-flex h-11 w-8 items-center justify-center" aria-hidden>{costsOpen ? '▾' : '▸'}</span>
        {row('Costs', screen === 'Costs')}
      </div>
      {costsOpen ? (
        <>
          <div className="flex items-center pl-2">
            <span className="inline-flex h-11 w-8 items-center justify-center" aria-hidden>{materialsOpen ? '▾' : '▸'}</span>
            {row('Materials', screen === 'Category')}
          </div>
          {materialsOpen ? (
            <div className="ml-12 border-l border-muted-foreground/45">
              <div className="relative flex items-center">
                <span aria-hidden className="absolute left-0 top-1/2 h-px w-3 bg-muted-foreground/45" />
                <div className="ml-3 min-w-0 flex-1">{row('Lumber', false, 'text-[13px] font-normal text-muted-foreground')}</div>
              </div>
            </div>
          ) : null}
          <div className="flex items-center pl-2">
            <span className="inline-flex h-11 w-8 items-center justify-center" aria-hidden>▸</span>
            {row('Labor', false)}
          </div>
        </>
      ) : null}
      {row('Invoices', screen === 'Invoices')}
      {row('Reports', screen === 'Reports' || screen === 'Activity' || screen === 'Job cost' || screen === 'Vendor' || screen === 'Builder')}
      {row('Employees', screen === 'Employees')}
      {row('Team', screen === 'Team')}
      {row('Settings', screen === 'Settings')}
    </nav>
  )
}

function previewPath(screen: string): string {
  if (['Reports', 'Activity', 'Job cost', 'Vendor', 'Builder', 'Schedule', 'History'].includes(screen)) return '/reports'
  if (screen === 'Employees') return '/employees'
  if (screen === 'Team') return '/team'
  if (screen === 'Settings') return '/settings'
  return '/dashboard'
}

function AppFrame({ screen, mobile }: { screen: string; mobile: boolean }) {
  const showDrawer = mobile && (screen === 'Costs' || screen === 'Category')
  const showJobs = showsJobSelectors(previewPath(screen))
  return (
    <div className={mobile ? 'relative flex min-h-[760px] flex-col' : 'flex min-h-[760px]'}>
      {mobile ? null : (
        <aside className="w-60 border-r border-border bg-sidebar p-3">
          <Logo size="sm" />
          <NavTree screen={screen} />
        </aside>
      )}
      {showDrawer ? (
        <aside className="absolute inset-y-0 left-0 z-10 w-64 border-r border-border bg-sidebar p-3 shadow-[var(--shadow)]">
          <Logo size="sm" />
          <NavTree screen={screen} />
        </aside>
      ) : null}
      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center gap-2 border-b border-border px-3 text-sm">
          {showJobs ? (
            <>
              <span className="rounded-lg border border-border px-2 py-2">JOB-A-001 — Acme Test Job</span>
              {screen === 'All projects' ? null : <span className="hidden rounded-lg border border-border px-2 py-2 sm:inline">All change orders</span>}
            </>
          ) : null}
          <span className="ml-auto text-right text-xs text-muted-foreground">Ada Master<br />Master · Acme Test</span>
          <ThemeToggle />
        </header>
        <div className="p-4">
          {screen === 'Overview' ? <Overview /> : null}
          {screen === 'All projects' ? <AllProjects /> : null}
          {screen === 'Projects' ? <Projects /> : null}
          {screen === 'Reverse' ? <ReversePreview /> : null}
          {screen === 'Credit' ? <CreditPreview /> : null}
          {screen === 'Move' ? <MovePreview /> : null}
          {screen === 'Attachments' ? <AttachmentsPreview /> : null}
          {screen === 'Rates' ? <RatesPreview /> : null}
          {screen === 'Costs' ? <Costs /> : null}
          {screen === 'Category' ? <CategoryPage /> : null}
          {screen === 'Invoices' ? <Invoices /> : null}
          {['Reports', 'Activity', 'Job cost', 'Vendor', 'Builder', 'Schedule', 'History'].includes(screen) ? <ReportsPreview screen={screen} /> : null}
          {screen === 'Employees' ? <Employees /> : null}
          {screen === 'Team' ? <Team /> : null}
          {screen === 'Settings' ? <Settings /> : null}
        </div>
      </div>
    </div>
  )
}

function AllProjects() {
  const source = previewPortfolio()
  const overview = aggregatePortfolio(source)
  const dollars = fromCents
  const baseContract = source.projects.reduce((sum, project) => sum + Number(project.totalContractValue || 0), 0)
  const contract = dollars(overview.contractCents)
  const groups: OverviewGroup[] = []
  for (const line of overview.categories) {
    if (line.depth === 0) groups.push({ id: line.id, name: line.name, actual: dollars(line.actualCents), budget: dollars(line.budgetCents), children: [] })
    else if (groups.length) groups[groups.length - 1].children.push({ id: line.id, name: line.name, actual: dollars(line.actualCents), budget: dollars(line.budgetCents) })
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="All projects"
        description="Every project you can see"
        action={<><Button size="sm" variant="ghost" type="button">This project</Button><Button size="sm" type="button">All projects</Button><Button variant="outline" type="button">Export</Button></>}
      />
      <OverviewDashboard
        accent
        contract={contract}
        baseContract={baseContract}
        changeOrderTotal={contract - baseContract}
        totalCosts={dollars(overview.costCents)}
        totalBudget={dollars(overview.budgetCents)}
        invoiced={dollars(overview.invoicedCents)}
        collected={dollars(overview.collectedCents)}
        profit={dollars(overview.profitCents)}
        margin={overview.margin}
        goal={20}
        alerts={overview.categories.filter((line) => line.state === 'over' || line.state === 'near').map((line) => ({
          id: line.id,
          name: line.name,
          actual: dollars(line.actualCents),
          budget: dollars(line.budgetCents),
          state: line.state as 'over' | 'near',
        }))}
        groups={groups}
        burn={overview.costBurn}
        invoiceBurn={overview.invoiceBurn}
        recentCosts={overview.recentCosts.map((row) => ({ id: row.id, primary: row.label, secondary: `${row.projectLabel} · ${formatDate(row.date)}`, amount: formatCurrency(dollars(row.amountCents)) }))}
        recentInvoices={overview.recentInvoices.map((row) => ({ id: row.id, primary: row.label, secondary: `${row.projectLabel} · ${formatDate(row.date)}`, amount: formatCurrency(dollars(row.amountCents)) }))}
        recentOrders={overview.recentOrders.map((row) => ({ id: row.id, primary: row.label, secondary: row.projectLabel, amount: formatCurrency(dollars(row.amountCents)) }))}
        projects={overview.projects.map((row) => ({
          id: row.id,
          jobNumber: row.jobNumber,
          jobName: row.jobName,
          budget: dollars(row.budgetCents),
          cost: dollars(row.costCents),
          invoiced: dollars(row.invoicedCents),
          profit: dollars(row.profitCents),
          margin: row.margin,
          spent: row.spentPercent,
        }))}
      />
    </div>
  )
}

function previewPortfolio() {
  const category = (id: string, name: string, extra: Partial<ReportCategory> = {}): ReportCategory => ({
    id, name, kind: 'standard', parent_id: null, builtin_key: null, sort_order: 1, is_hidden: false, ...extra,
  })
  const blank = {
    vendor: null, invoice_number: null, employee_id: null, st_hours: null, ot_hours: null, dt_hours: null, per_diem: null, mob_qty: null,
    change_order_id: null, reversal_of_id: null, reversed_at: null, reversal_reason: null,
  }
  return {
    projects: [
      { id: 'p1', jobNumber: 'JOB-A-001', jobName: 'Acme Test Job', customer: 'Acme Customer', status: 'Active', totalContractValue: 100000 },
      { id: 'p2', jobNumber: 'JOB-A-002', jobName: 'Second job', customer: 'Acme Customer', status: 'Active', totalContractValue: 40000 },
    ],
    categories: [
      category('material', 'Materials', { builtin_key: 'material', sort_order: 1 }),
      category('labor', 'Labor', { kind: 'labor', builtin_key: 'labor', sort_order: 2 }),
      category('equipment', 'Equipment', { builtin_key: 'equipment', sort_order: 3 }),
      category('subcontractor', 'Subcontractor', { builtin_key: 'subcontractor', sort_order: 4 }),
      category('others', 'Others', { builtin_key: 'others', sort_order: 5 }),
      category('cap', 'Cap Leases', { builtin_key: 'cap_leases', sort_order: 6 }),
      category('consumable', 'Consumable', { builtin_key: 'consumable', sort_order: 7 }),
    ],
    costs: [
      { ...blank, id: 'c1', project_id: 'p1', category_id: 'material', category: 'material', date: '2026-01-15', cost: 4000, description: 'Steel', employee_name: null, created_at: '2026-01-15T15:00:00Z' },
      { ...blank, id: 'c1r', project_id: 'p1', category_id: 'material', category: 'material', date: '2026-01-20', cost: -500, description: 'Returned steel', employee_name: null, reversal_of_id: 'c1', created_at: '2026-01-20T15:00:00Z' },
      { ...blank, id: 'c2', project_id: 'p1', category_id: 'labor', category: 'labor', date: '2026-03-04', cost: 8000, description: null, employee_name: 'Alex Rivera', created_at: '2026-03-04T15:00:00Z' },
      { ...blank, id: 'c3', project_id: 'p1', category_id: 'equipment', category: 'equipment', date: '2026-04-02', cost: 1000, description: 'Lift rental', employee_name: null, created_at: '2026-04-02T15:00:00Z' },
      { ...blank, id: 'c4', project_id: 'p2', category_id: 'subcontractor', category: 'subcontractor', date: '2026-02-11', cost: 2200, description: 'Electrical', employee_name: null, created_at: '2026-02-11T15:00:00Z' },
      { ...blank, id: 'c5', project_id: 'p2', category_id: 'others', category: 'others', date: '2026-05-06', cost: 300, description: 'Permits', employee_name: null, created_at: '2026-05-06T15:00:00Z' },
      { ...blank, id: 'c6', project_id: 'p2', category_id: 'cap', category: 'cap_leases', date: '2026-06-01', cost: 400, description: 'Trailer', employee_name: null, created_at: '2026-06-01T15:00:00Z' },
      { ...blank, id: 'c7', project_id: 'p2', category_id: 'consumable', category: 'consumable', date: '2026-06-12', cost: 150, description: 'Bits', employee_name: null, created_at: '2026-06-12T15:00:00Z' },
    ],
    invoices: [
      { id: 'i1', project_id: 'p1', invoice_number: 'INV-100', amount: 20000, amount_collected: 9000, date_billed: '2026-03-01', change_order_id: null, reversal_of_id: null, reversal_reason: null, created_at: '2026-03-01T15:00:00Z' },
      { id: 'i1c', project_id: 'p1', invoice_number: 'CM-100', amount: -2000, amount_collected: 0, date_billed: '2026-04-01', change_order_id: null, reversal_of_id: 'i1', reversal_reason: 'Credit', created_at: '2026-04-01T15:00:00Z' },
      { id: 'i2', project_id: 'p2', invoice_number: 'INV-200', amount: 10000, amount_collected: 10000, date_billed: '2026-05-15', change_order_id: null, reversal_of_id: null, reversal_reason: null, created_at: '2026-05-15T15:00:00Z' },
    ],
    changeOrders: [{ id: 'co1', project_id: 'p1', name: 'Added bay', additional_contract_value: 12000, created_at: '2026-02-01T15:00:00Z' }],
    budgets: [
      { project_id: 'p1', category_id: 'material', amount: 10000 },
      { project_id: 'p1', category_id: 'labor', amount: 20000 },
      { project_id: 'p1', category_id: 'equipment', amount: 5000 },
      { project_id: 'p2', category_id: 'subcontractor', amount: 8000 },
      { project_id: 'p2', category_id: 'others', amount: 1000 },
      { project_id: 'p2', category_id: 'cap', amount: 2000 },
      { project_id: 'p2', category_id: 'consumable', amount: 500 },
    ],
  }
}

function Overview() {
  return (
    <div className="space-y-4">
      <PageHeader title="Acme Test Job" description="JOB-A-001 · Acme Customer" action={<><Button size="sm" type="button">This project</Button><Button size="sm" variant="ghost" type="button">All projects</Button><Button variant="outline" type="button">Export</Button><Button variant="outline" type="button">Open costs</Button></>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Contract" value={formatCurrency(112000)} />
        <Stat label="Cost to date" value={formatCurrency(4834.5)} />
        <Stat label="Budget" value={formatCurrency(38000)} />
        <Stat label="Gross profit" value={formatCurrency(2300 - 4834.5)} detail="Invoiced minus cost" />
        <Stat label="Invoiced" value={formatCurrency(2300)} />
        <Stat label="Collected" value={formatCurrency(900)} />
      </div>
      <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">Subcontractor is nearing its budget ($2,200.00 of $8,000.00).</div>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between text-sm"><span className="font-medium">Budget versus actual</span><span className="text-primary">View in Costs</span></div>
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-sm"><span>Materials</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 w-[4%] rounded-full bg-primary" /></div>
        </div>
        <div className="mb-3">
          <div className="mb-1 flex justify-between text-sm"><span>Labor</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 w-[8%] rounded-full bg-primary" /></div>
          <div className="ml-6 mt-1 border-l border-muted-foreground/45 pl-3">
            <div className="mb-1 flex justify-between text-[13px] text-muted-foreground"><span>Direct</span></div>
            <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 w-[6%] rounded-full bg-primary" /></div>
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-sm"><span>Subcontractor</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 w-[28%] rounded-full bg-primary" /></div>
        </div>
      </div>
      <Table headers={['Category', 'Budget', 'Actual', 'Remaining']} depths={[0, 0, 1, 0]} rows={[
        ['Materials', '$10,000.00', '$410.00', '$9,590.00'],
        ['Labor', '$20,000.00', '$650.00', '$19,350.00'],
        ['Direct', '$12,000.00', '$400.00', '$11,600.00'],
        ['Subcontractor', '$8,000.00', '$2,200.00', '$5,800.00'],
      ]} />
    </div>
  )
}

function Projects() {
  return (
    <div className="space-y-4">
      <PageHeader title="Projects" description="Jobs, contract values, and change orders." action={<><Button variant="outline" type="button">Export</Button><Button type="button">Add project</Button></>} />
      <Table headers={['Job', 'Customer', 'Contract', 'Status']} rows={[
        ['JOB-A-001 Acme Test Job', 'Acme Customer', '$112,000.00', 'Active · Current'],
        ['JOB-A-002 Second job', 'Acme Customer', '$40,000.00', 'Active'],
      ]} />
    </div>
  )
}

function Costs() {
  return (
    <div className="space-y-4">
      <PageHeader title="Costs" description="JOB-A-001 · All change orders. Open a category for its entries." action={<Button variant="outline" type="button">Export</Button>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Cost to date" value={formatCurrency(4834.5)} />
        <Stat label="Budget" value={formatCurrency(38000)} />
        <Stat label="Remaining" value={formatCurrency(38000 - 4834.5)} />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium">Budget versus actual</p>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-sm"><span className="text-primary">Materials</span><span className="tabular text-muted-foreground">$410 / $10,000</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 w-[4%] rounded-full bg-primary" /></div>
          <div className="ml-6 mt-1 border-l border-muted-foreground/45 pl-3">
            <div className="mb-1 flex justify-between text-[13px] text-muted-foreground"><span>Lumber</span><span className="tabular">$160 / $4,000</span></div>
            <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 w-[4%] rounded-full bg-primary" /></div>
          </div>
        </div>
        {[['Labor', '$650 / $20,000', 8], ['Subcontractor', '$2,200 / $8,000', 28]].map(([name, caption, width]) => (
          <div key={String(name)} className="mt-3">
            <div className="mb-1 flex justify-between text-sm"><span className="text-primary">{name}</span><span className="tabular text-muted-foreground">{caption}</span></div>
            <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} /></div>
          </div>
        ))}
      </div>
      <Table headers={['Category', 'Entries', 'Budget', 'Actual', 'Remaining']} depths={[0, 1, 0]} rows={[
        ['Materials', '2', '$10,000.00', '$410.00', '$9,590.00'],
        ['Lumber', '1', '$4,000.00', '$160.00', '$3,840.00'],
        ['Labor', '2', '$20,000.00', '$650.00', '$19,350.00'],
      ]} />
    </div>
  )
}

function CategoryPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-primary">Costs</p>
      <PageHeader title="Materials" description="2 entries · All change orders" action={<><Button variant="outline" type="button">Expand all</Button><Button variant="outline" type="button">Collapse all</Button><Button variant="outline" type="button">Export</Button><Button type="button">Add cost</Button></>} />
      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="font-medium">▾ Materials · 2 entries · includes children</p>
          <span className="text-xs tabular text-muted-foreground">$410.00 / $10,000.00</span>
        </div>
        <Table headers={['Date', 'Details', 'Amount']} rows={[['Jan 15, 2026', 'Steel', '$250.00']]} />
        <div className="ml-6 border-l border-muted-foreground/45">
          <div className="relative border-t border-border bg-card px-3 py-2 pl-5">
            <span aria-hidden className="absolute left-0 top-1/2 h-px w-3 bg-muted-foreground/45" />
            <p className="text-[13px] font-medium text-muted-foreground">▾ Lumber · 1 entry</p>
          </div>
          <Table framed={false} headers={['Date', 'Details', 'Amount']} rows={[['Jan 16, 2026', 'Framing', '$160.00']]} />
        </div>
      </section>
    </div>
  )
}

function Invoices() {
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" description="JOB-A-001 · All change orders" action={<><Button variant="outline" type="button">Filters</Button><Button variant="outline" type="button">Export</Button><Button type="button">Add invoice</Button></>} />
      <p className="text-sm text-muted-foreground">2 invoices · $2,300.00 billed · $900.00 collected. The change order in the top bar filters this list.</p>
      <Table headers={['Number', 'Amount', 'Collected', 'Billed', 'Change order', 'Files']} rows={[
        ['INV-A-001', '$500.00', '$0.00', 'Jan 20, 2026', 'Base contract', '—'],
        ['INV-A-002', '$1,800.00', '$900.00', 'Feb 15, 2026', 'Added welding', '1'],
      ]} />
    </div>
  )
}

function Employees() {
  return (
    <div className="space-y-4">
      <PageHeader title="Employees" description="Rates used when someone enters labor." action={<><Button variant="outline" type="button">Export</Button><Button type="button">Add employee</Button></>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total" value="3" />
        <Stat label="Global" value="1" />
        <Stat label="This project" value="1" />
      </div>
      <Table headers={['Name', 'ST', 'OT', 'DT', 'Mob', 'Scope']} rows={[
        ['Alex Rivera', '$45.00', '$67.50', '$90.00', '—', 'Global'],
        ['Jordan Lee', '$40.00', '$60.00', '$80.00', '$25.00', 'JOB-A-001 — Acme Test Job'],
        ['Sam Patel', '$38.00', '$57.00', '$76.00', '—', 'JOB-A-002 — Acme Shop Job'],
      ]} />
    </div>
  )
}

function Team() {
  return (
    <div className="space-y-4">
      <PageHeader title="Team" description="3 full users · 1 viewer" action={<Button type="button">Invite</Button>} />
      <Table headers={['Name', 'Role', 'Status']} rows={[
        ['Ada Master', 'Master', 'Active'],
        ['Pat Manager', 'Project Manager', 'Active'],
        ['Acme Viewer', 'Viewer', 'Active'],
      ]} />
    </div>
  )
}

function Settings() {
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="Acme Test" />
      <p className="text-sm text-muted-foreground">7 of 20 used. Hidden categories do not count.</p>
      <Table headers={['Category', 'Type']} rows={[['Material', 'standard'], ['Labor', 'labor'], ['Equipment', 'named'], ['Subcontractor', 'named']]} />
    </div>
  )
}

function ForgotScreen() {
  return (
    <div className="flex min-h-[640px] items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center"><Logo size="lg" /></div>
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your email and we will send a reset link.</p>
          <div className="mt-6 space-y-4">
            <label className="text-sm font-medium" htmlFor="preview-reset-email">Email</label>
            <input id="preview-reset-email" className="h-11 w-full rounded-lg border border-input px-3" defaultValue="master-a@example.test" />
            <Button className="w-full" type="button">Send reset link</Button>
            <p className="text-center text-sm text-primary">Back to sign in</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function LoginScreen() {
  return (
    <div className="flex min-h-[640px] items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex justify-center"><Logo size="lg" /></div>
        <h1 className="text-center text-xl font-semibold">Sign in</h1>
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <label className="text-sm font-medium" htmlFor="preview-email">Email</label>
          <input id="preview-email" className="h-11 w-full rounded-lg border border-input px-3" defaultValue="master-a@example.test" />
          <label className="text-sm font-medium" htmlFor="preview-password">Password</label>
          <input id="preview-password" type="password" className="h-11 w-full rounded-lg border border-input px-3" defaultValue="password" />
          <Button className="w-full" type="button">Sign in</Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
      {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  )
}

function ReversePreview() {
  return (
    <div className="space-y-4">
      <PageHeader title="Materials" description="Net $0.00 after the reversal" />
      <Table headers={['Date', 'Details', 'Amount']} rows={[
        ['Jan 15, 2026', 'Steel  Reversed', '$250.00'],
        ['Nov 18, 2026', 'Reversal · Steel', '−$250.00'],
      ]} />
      <p className="text-sm text-muted-foreground">Shown total {formatCurrency(0)}</p>
      <ReverseSheet open title="Reverse this cost" noun="cost" remaining={250} onClose={() => undefined} onConfirm={async () => undefined} />
    </div>
  )
}

function CreditPreview() {
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" description="Billed $1,800.00 after the credit memo" />
      <Table headers={['Number', 'Amount', 'Collected']} rows={[
        ['INV-A-002  Partially reversed', '$1,800.00', '$900.00'],
        ['CM-INV-A-002  Credit memo', '−$500.00', '$0.00'],
      ]} />
      <ReverseSheet open title="Post a credit memo" noun="invoice" remaining={1800} dateLabel="Date billed" onClose={() => undefined} onConfirm={async () => undefined} />
    </div>
  )
}

function MovePreview() {
  return (
    <MoveCostSheet
      open
      categories={[
        { id: 'labor', tenant_id: 't', builtin_key: 'labor', name: 'Labor', kind: 'labor', parent_id: null, sort_order: 1, is_hidden: false, is_builtin: true, gl_code: null },
        { id: 'others', tenant_id: 't', builtin_key: 'others', name: 'Others', kind: 'standard', parent_id: null, sort_order: 2, is_hidden: false, is_builtin: true, gl_code: null },
      ]}
      currentCategoryId="labor"
      currentKind="labor"
      onClose={() => undefined}
      onConfirm={async () => undefined}
    />
  )
}

function AttachmentsPreview() {
  const [files, setFiles] = useState<File[]>([])
  useEffect(() => {
    setFiles([new File(['ticket'], 'steel-ticket.pdf', { type: 'application/pdf' })])
  }, [])
  return (
    <div className="space-y-6">
      <PageHeader title="Add Materials" description="Files upload when this entry is saved." />
      <QueuedFilesField files={files} onChange={setFiles} />
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="font-medium">JOB-A-001 — Acme Test Job</p>
        <p className="text-sm text-muted-foreground">1 file on the project · 1 file on Added welding</p>
      </section>
    </div>
  )
}

function RatesPreview() {
  return (
    <ProjectRatesEditor
      employeeId="alex"
      tenantId="acme"
      projects={[{ id: 'job', jobNumber: 'JOB-A-001', jobName: 'Acme Test Job' }]}
      previewRows={[{
        id: 'rate-1',
        project_id: 'job',
        effective_date: '2026-06-01',
        standard_rate: 99,
        ot_rate: 100,
        dt_rate: 101,
        mob_rate: 10,
      }]}
    />
  )
}

function Table({ headers, rows, depths = [], framed = true }: { headers: string[]; rows: string[][]; depths?: number[]; framed?: boolean }) {
  const table = (
      <table className="responsive-cards w-full text-sm">
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.join('|')} className={`border-b border-border last:border-0 ${depths[rowIndex] ? 'text-[13px] text-muted-foreground' : ''}`}>
              {row.map((cell, index) => (
                <td key={`${rowIndex}-${cell}`} className={`px-3 py-2 ${index > 0 ? 'tabular' : ''}`} data-label={headers[index]}>
                  {index === 0 ? <CategoryName depth={depths[rowIndex] || 0}>{cell}</CategoryName> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
  )
  if (!framed) return table
  return <div className="overflow-hidden rounded-lg border border-border bg-card">{table}</div>
}
