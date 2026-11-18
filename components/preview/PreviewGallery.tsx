'use client'

import { useState } from 'react'
import Logo from '@/components/ui/Logo'
import { PageHeader } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'

const screens = ['Login', 'Overview', 'Projects', 'Costs', 'Invoices', 'Employees', 'Team', 'Settings'] as const

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
    <div className={bare ? 'min-h-screen bg-background' : 'min-h-screen bg-zinc-200 p-4'}>
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
        {screen === 'Login' ? <LoginScreen /> : <AppFrame mobile={mobile} screen={screen} />}
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
              <div key={item} className={`rounded-lg px-2 py-2 ${item === screen || (screen === 'Costs' && item === 'Material') ? 'bg-accent font-medium text-accent-foreground' : ''} ${item === 'Material' || item === 'Labor' ? 'pl-6' : ''}`}>
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
      <PageHeader title="Projects" description="2 jobs" action={<Button type="button">New project</Button>} />
      <Table headers={['Job', 'Customer', 'Contract', 'Assigned to']} rows={[
        ['JOB-A-001 Acme Test Job', 'Acme Customer', '$100,000.00', '2'],
        ['JOB-A-002 Second job', 'Acme Customer', '$40,000.00', '0'],
      ]} />
    </div>
  )
}

function Costs() {
  return (
    <div className="space-y-4">
      <PageHeader title="Material" description="1 entry in this view" action={<Button type="button">Add cost</Button>} />
      <Table headers={['Date', 'Details', 'Amount']} rows={[['Jan 15, 2026', 'Synthetic cost A', '$250.00']]} />
    </div>
  )
}

function Invoices() {
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" description="Billed against JOB-A-001" action={<Button type="button">New invoice</Button>} />
      <Table headers={['Number', 'Date', 'Amount']} rows={[['INV-A-001', 'Jan 20, 2026', '$500.00'], ['INV-A-002', 'Feb 15, 2026', '$1,800.00']]} />
    </div>
  )
}

function Employees() {
  return (
    <div className="space-y-4">
      <PageHeader title="Employees" description="Rates used on labor entries" action={<Button type="button">Add employee</Button>} />
      <Table headers={['Name', 'ST', 'OT', 'DT']} rows={[['Alex Rivera', '$45.00', '$67.50', '$90.00'], ['Jordan Lee', '$40.00', '$60.00', '$80.00']]} />
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
