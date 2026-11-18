'use client'

import { useState } from 'react'
import Logo from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { PageHeader } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'

const screens = ['Login', 'Forgot password', 'Overview', 'Projects', 'Costs', 'Invoices', 'Employees', 'Team', 'Settings'] as const

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
        {screen === 'Login' ? <LoginScreen /> : screen === 'Forgot password' ? <ForgotScreen /> : <AppFrame mobile={mobile} screen={screen} />}
      </div>
    </div>
  )
}

function AppFrame({ screen, mobile }: { screen: string; mobile: boolean }) {
  return (
    <div className={mobile ? 'flex flex-col' : 'flex min-h-[760px]'}>
      {mobile ? null : (
        <aside className="w-60 border-r border-border bg-sidebar p-3">
          <Logo size="sm" />
          <nav className="mt-4 space-y-1 text-sm">
            {['Overview', 'Projects', 'Costs', 'Material', 'Labor', 'Invoices', 'Employees', 'Team', 'Settings'].map((item) => (
              <div key={item} className={`rounded-lg px-2 py-2 ${item === screen ? 'bg-accent font-medium text-accent-foreground' : ''} ${item === 'Material' || item === 'Labor' ? 'pl-6' : ''}`}>
                {item}
              </div>
            ))}
          </nav>
        </aside>
      )}
      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center gap-2 border-b border-border px-3 text-sm">
          <span className="rounded-lg border border-border px-2 py-2">JOB-A-001 — Acme Test Job</span>
          <span className="hidden rounded-lg border border-border px-2 py-2 sm:inline">All change orders</span>
          <span className="ml-auto text-right text-xs text-muted-foreground">Ada Master<br />Master · Acme Test</span>
          <ThemeToggle />
        </header>
        <div className="p-4">
          {screen === 'Overview' ? <Overview /> : null}
          {screen === 'Projects' ? <Projects /> : null}
          {screen === 'Costs' ? <Costs /> : null}
          {screen === 'Invoices' ? <Invoices /> : null}
          {screen === 'Employees' ? <Employees /> : null}
          {screen === 'Team' ? <Team /> : null}
          {screen === 'Settings' ? <Settings /> : null}
        </div>
      </div>
    </div>
  )
}

function Overview() {
  return (
    <div className="space-y-4">
      <PageHeader title="Acme Test Job" description="JOB-A-001 · Acme Customer" action={<Button variant="outline" type="button">CSV</Button>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Contract" value={formatCurrency(112000)} />
        <Stat label="Costs" value={formatCurrency(4834.5)} />
        <Stat label="Invoiced" value={formatCurrency(2300)} />
        <Stat label="Gross profit" value={formatCurrency(2300 - 4834.5)} />
      </div>
      <Table headers={['Category', 'Budget', 'Actual']} rows={[
        ['Material', '$10,000.00', '$250.00'],
        ['Labor', '$20,000.00', '$650.00'],
        ['Subcontractor', '$8,000.00', '$2,200.00'],
      ]} />
    </div>
  )
}

function Projects() {
  return (
    <div className="space-y-4">
      <PageHeader title="Projects" description="Jobs, contract values, and change orders." action={<><Button variant="outline" type="button">Export CSV</Button><Button type="button">Add project</Button></>} />
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
      <PageHeader title="Costs" description="Grouped by category" action={<><Button variant="outline" type="button">Expand all</Button><Button variant="outline" type="button">Collapse all</Button></>} />
      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div>
            <p className="font-medium">Material</p>
            <p className="text-xs text-muted-foreground">1 entry</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full bg-primary" style={{ width: '3%' }} />
            </div>
            <span className="text-xs tabular text-muted-foreground">$250.00 / $10,000.00</span>
          </div>
        </div>
        <Table headers={['Date', 'Details', 'Amount']} rows={[['Jan 15, 2026', 'Synthetic cost A', '$250.00']]} />
      </section>
      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div>
            <p className="font-medium">Labor</p>
            <p className="text-xs text-muted-foreground">1 entry · collapsed</p>
          </div>
          <span className="text-xs tabular text-muted-foreground">$650.00 / $20,000.00</span>
        </div>
      </section>
    </div>
  )
}

function Invoices() {
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" description="JOB-A-001 · All change orders" action={<><Button variant="outline" type="button">Filters</Button><Button variant="outline" type="button">Export CSV</Button><Button type="button">Add invoice</Button></>} />
      <p className="text-sm text-muted-foreground">2 invoices · $2,300.00 billed. The change order in the top bar filters this list.</p>
      <Table headers={['Number', 'Amount', 'Billed', 'Change order', 'Files']} rows={[
        ['INV-A-001', '$500.00', 'Jan 20, 2026', 'Base contract', '—'],
        ['INV-A-002', '$1,800.00', 'Feb 15, 2026', 'Added welding', '1'],
      ]} />
    </div>
  )
}

function Employees() {
  return (
    <div className="space-y-4">
      <PageHeader title="Employees" description="Rates used when someone enters labor." action={<Button type="button">Add employee</Button>} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="responsive-cards w-full text-sm">
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('|')} className="border-b border-border last:border-0">
              {row.map((cell, index) => (
                <td key={cell} className="px-3 py-2 tabular" data-label={headers[index]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
