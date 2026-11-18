'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useCategories } from '@/contexts/CategoryContext'
import { useCosts } from '@/hooks/useCosts'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { createClient } from '@/lib/supabase'
import { canAccessCategory } from '@/lib/permissions'
import { flattenCategoryTree, ownAmountsByCategory, rollupCategoryAmounts } from '@/lib/categories'
import { categoryBudgetState, grossProfit, grossProfitPercent, monthlyBurn } from '@/lib/overview'
import { readCompanySettings } from '@/lib/company-settings'
import { formatCurrency, formatDate, formatPercent } from '@/lib/format'
import { isMissingColumnError, isMissingRelation } from '@/lib/security'
import { Button } from '@/components/ui/button'
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/feedback'
import { ExportMenu, type ExportSpec } from '@/components/export/ExportMenu'
import type { ChangeOrder, CustomerInvoice, ProjectCost } from '@/types/app.types'

const BUDGET_COLUMNS: Record<string, string> = {
  material: 'material_budget',
  labor: 'labor_budget',
  equipment: 'equipment_budget',
  subcontractor: 'subcontractor_budget',
  others: 'others_budget',
  cap_leases: 'cap_leases_budget',
  consumable: 'consumable_budget',
}

type InvoiceRow = Pick<CustomerInvoice, 'id' | 'project_id' | 'invoice_number' | 'amount' | 'date_billed'> & {
  amount_collected?: number | null
  created_at?: string | null
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { projects, activeProject, setActiveProject, loading: projectsLoading } = useProjects()
  const { categories, tree } = useCategories()
  const { entries, loading: costsLoading, refreshCosts } = useCosts(activeProject?.id, null)
  const { changeOrders, getTotalAdditionalValue } = useChangeOrders(activeProject?.id)
  const [scope, setScope] = useState<'project' | 'company'>('project')
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [companyCosts, setCompanyCosts] = useState<Array<Pick<ProjectCost, 'project_id' | 'cost' | 'date' | 'description' | 'created_at'>>>([])
  const [companyOrders, setCompanyOrders] = useState<ChangeOrder[]>([])
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const supabase = createClient()
  const goal = readCompanySettings(tenant?.settings).gp_goal_percent

  useEffect(() => {
    if (activeProject?.id) refreshCosts()
  }, [activeProject?.id, refreshCosts])

  useEffect(() => {
    if (!tenant?.id) return
    let cancelled = false
    ;(async () => {
      const withCollected = await supabase.from('customer_invoices').select('id, project_id, invoice_number, amount, amount_collected, date_billed, created_at').eq('tenant_id', tenant.id)
      let invoiceRows: InvoiceRow[] = []
      if (withCollected.error && isMissingColumnError(withCollected.error)) {
        const withoutCollected = await supabase.from('customer_invoices').select('id, project_id, invoice_number, amount, date_billed, created_at').eq('tenant_id', tenant.id)
        invoiceRows = (withoutCollected.data || []).map((row) => ({ ...row, amount_collected: 0 }))
      } else if (!withCollected.error) {
        invoiceRows = withCollected.data || []
      }
      if (!cancelled) setInvoices(invoiceRows)

      if (scope !== 'company') return
      const [costs, orders] = await Promise.all([
        supabase.from('project_costs').select('project_id, cost, date, description, created_at').eq('tenant_id', tenant.id),
        supabase.from('change_orders').select('*').eq('tenant_id', tenant.id),
      ])
      if (cancelled) return
      setCompanyCosts(costs.error ? [] : costs.data || [])
      setCompanyOrders(orders.error ? [] : orders.data || [])
    })()
    return () => {
      cancelled = true
    }
  }, [tenant?.id, supabase, scope])

  useEffect(() => {
    if (!activeProject?.id) return
    let cancelled = false
    ;(async () => {
      const categoryBudgets = await supabase.from('project_category_budgets').select('category_id, amount').eq('project_id', activeProject.id)
      if (cancelled) return
      if (!categoryBudgets.error && categoryBudgets.data) {
        const next: Record<string, number> = {}
        for (const row of categoryBudgets.data) next[row.category_id] = Number(row.amount || 0)
        setBudgets(next)
        return
      }
      if (categoryBudgets.error && !isMissingRelation(categoryBudgets.error)) console.error(categoryBudgets.error)
      const legacy = await supabase.from('project_budgets').select('*').eq('project_id', activeProject.id).maybeSingle()
      if (cancelled || !legacy.data) return
      const next: Record<string, number> = {}
      for (const category of categories) {
        const column = category.builtin_key ? BUDGET_COLUMNS[category.builtin_key] : null
        if (column) next[category.id] = Number((legacy.data as Record<string, number | null>)[column] || 0)
      }
      setBudgets(next)
    })()
    return () => {
      cancelled = true
    }
  }, [activeProject?.id, supabase, categories])

  const visible = useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, category]))
    return categories.filter((category) => canAccessCategory(user, {
      id: category.id,
      builtinKey: category.builtin_key,
      parentBuiltinKey: category.parent_id ? byId.get(category.parent_id)?.builtin_key : null,
    }, 'read'))
  }, [categories, user])

  const projectInvoices = invoices.filter((invoice) => invoice.project_id === activeProject?.id)
  const rollup = useMemo(() => rollupCategoryAmounts(categories, ownAmountsByCategory(entries, categories)), [entries, categories])
  const budgetRollup = useMemo(() => rollupCategoryAmounts(categories, budgets), [categories, budgets])
  const topLevel = flattenCategoryTree(tree).filter((category) => !category.parent_id && visible.some((item) => item.id === category.id))

  const baseContract = activeProject?.totalContractValue || 0
  const changeOrderTotal = getTotalAdditionalValue()
  const contract = baseContract + changeOrderTotal
  const totalCosts = topLevel.reduce((sum, category) => sum + (rollup[category.id]?.total || 0), 0)
  const totalBudget = topLevel.reduce((sum, category) => sum + (budgetRollup[category.id]?.total || 0), 0)
  const invoiced = projectInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
  const collected = projectInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_collected || 0), 0)
  const profit = grossProfit(invoiced, totalCosts)
  const margin = grossProfitPercent(invoiced, totalCosts)
  const burn = monthlyBurn(entries)
  const alerts = topLevel.flatMap((category) => {
    const children = category.children.filter((child) => visible.some((item) => item.id === child.id))
    return [category, ...children].flatMap((item) => {
      const actual = item.parent_id ? rollup[item.id]?.own || 0 : rollup[item.id]?.total || 0
      const budget = item.parent_id ? budgets[item.id] || 0 : budgetRollup[item.id]?.total || 0
      const state = categoryBudgetState(actual, budget)
      if (state !== 'over' && state !== 'near') return []
      return [{ id: item.id, name: item.name, actual, budget, state }]
    })
  })

  const recentCosts = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5)
  const recentInvoices = [...projectInvoices].sort((a, b) => b.date_billed.localeCompare(a.date_billed)).slice(0, 5)
  const recentOrders = [...changeOrders].slice(0, 5)

  const companyRows = projects.map((project) => {
    const cost = companyCosts.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + Number(row.cost || 0), 0)
    const billed = invoices.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const received = invoices.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + Number(row.amount_collected || 0), 0)
    const changes = companyOrders.filter((order) => order.project_id === project.id).reduce((sum, order) => sum + Number(order.additional_contract_value || 0), 0)
    const value = (project.totalContractValue || 0) + changes
    return { project, value, cost, billed, received, profit: grossProfit(billed, cost) }
  })

  const exportSpec: ExportSpec | null = !activeProject ? null : scope === 'company' ? {
    filename: 'company-overview',
    title: 'Company overview',
    company: tenant?.name || 'Company',
    filters: ['Scope: all projects'],
    columns: ['Job number', 'Job name', 'Contract', 'Cost', 'Invoiced', 'Collected', 'Gross profit'],
    csvRows: companyRows.map((row) => [row.project.jobNumber, row.project.jobName, row.value, row.cost, row.billed, row.received, row.profit]),
    pdfRows: companyRows.map((row) => [row.project.jobNumber, row.project.jobName, formatCurrency(row.value), formatCurrency(row.cost), formatCurrency(row.billed), formatCurrency(row.received), formatCurrency(row.profit)]),
    totals: [{ label: 'Projects', value: String(companyRows.length) }],
  } : {
    filename: `${activeProject.jobNumber}-overview`,
    title: 'Project overview',
    company: tenant?.name || 'Company',
    project: `${activeProject.jobNumber} — ${activeProject.jobName}`,
    filters: ['Scope: this project'],
    columns: ['Category', 'Budget', 'Actual', 'Remaining'],
    csvRows: [
      ['Contract', '', contract, ''],
      ['Cost to date', '', totalCosts, ''],
      ['Budget', totalBudget, totalCosts, totalBudget - totalCosts],
      ['Invoiced', '', invoiced, ''],
      ['Collected', '', collected, ''],
      ['Gross profit', '', profit, ''],
      ...topLevel.flatMap((category) => {
        const children = category.children.filter((child) => visible.some((item) => item.id === child.id))
        return [
          [category.name, budgetRollup[category.id]?.total || 0, rollup[category.id]?.total || 0, (budgetRollup[category.id]?.total || 0) - (rollup[category.id]?.total || 0)],
          ...children.map((child) => [child.name, budgets[child.id] || 0, rollup[child.id]?.own || 0, (budgets[child.id] || 0) - (rollup[child.id]?.own || 0)]),
        ]
      }),
    ],
    pdfRows: topLevel.flatMap((category) => {
      const children = category.children.filter((child) => visible.some((item) => item.id === child.id))
      return [
        [category.name, formatCurrency(budgetRollup[category.id]?.total || 0), formatCurrency(rollup[category.id]?.total || 0), formatCurrency((budgetRollup[category.id]?.total || 0) - (rollup[category.id]?.total || 0))],
        ...children.map((child) => [`  ${child.name}`, formatCurrency(budgets[child.id] || 0), formatCurrency(rollup[child.id]?.own || 0), formatCurrency((budgets[child.id] || 0) - (rollup[child.id]?.own || 0))]),
      ]
    }),
    totals: [
      { label: 'Contract', value: formatCurrency(contract) },
      { label: 'Gross profit', value: `${formatCurrency(profit)}${margin == null ? '' : ` (${formatPercent(margin)})`}` },
    ],
  }

  if (projectsLoading || (scope === 'project' && costsLoading)) {
    return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>
  }
  if (!activeProject && scope === 'project') {
    return <EmptyState title="No project yet" body="Create a project to see contract value, costs, and invoices." />
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={scope === 'company' ? (tenant?.name || 'All projects') : activeProject?.jobName || 'Overview'}
        description={scope === 'company' ? 'Every project you can see' : `${activeProject?.jobNumber} · ${activeProject?.customer}`}
        action={
          <>
            <div className="flex rounded-lg border border-border p-1">
              <Button type="button" size="sm" variant={scope === 'project' ? 'primary' : 'ghost'} onClick={() => setScope('project')}>This project</Button>
              <Button type="button" size="sm" variant={scope === 'company' ? 'primary' : 'ghost'} onClick={() => setScope('company')}>All projects</Button>
            </div>
            <ExportMenu spec={exportSpec} />
            {scope === 'project' && activeProject ? <Button variant="outline" asChild><Link href="/costs">Open costs</Link></Button> : null}
          </>
        }
      />

      {scope === 'company' ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="responsive-cards w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                {['Job', 'Contract', 'Cost', 'Invoiced', 'Collected', 'Gross profit'].map((header) => (
                  <th key={header} className="px-3 py-2 font-medium">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companyRows.map((row) => (
                <tr key={row.project.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2" data-label="Job">
                    <button type="button" className="text-left font-medium text-primary" onClick={() => { setActiveProject(row.project); setScope('project') }}>
                      {row.project.jobNumber}
                    </button>
                    <p className="text-muted-foreground">{row.project.jobName}</p>
                  </td>
                  <td className="px-3 py-2 text-right tabular" data-label="Contract">{formatCurrency(row.value)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Cost">{formatCurrency(row.cost)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Invoiced">{formatCurrency(row.billed)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Collected">{formatCurrency(row.received)}</td>
                  <td className={`px-3 py-2 text-right tabular ${row.profit < 0 ? 'text-destructive' : 'text-success'}`} data-label="Gross profit">{formatCurrency(row.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : activeProject ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="Contract" value={formatCurrency(contract)} detail={`${formatCurrency(baseContract)} base · ${formatCurrency(changeOrderTotal)} change orders`} />
            <Metric label="Cost to date" value={formatCurrency(totalCosts)} detail="Open Costs for the entries" href="/costs" />
            <Metric label="Budget" value={formatCurrency(totalBudget)} detail={`${formatCurrency(totalBudget - totalCosts)} remaining`} href="/costs" />
            <Metric label="Gross profit" value={formatCurrency(profit)} detail={margin == null ? 'No invoices yet' : `${formatPercent(margin)}${goal == null ? '' : ` · goal ${formatPercent(goal)}`}`} tone={margin == null ? undefined : goal != null && margin < goal ? 'bad' : profit >= 0 ? 'good' : 'bad'} />
            <Metric label="Invoiced" value={formatCurrency(invoiced)} detail={`${formatCurrency(contract - invoiced)} of the contract not billed`} href="/invoices" />
            <Metric label="Collected" value={formatCurrency(collected)} detail={`${formatCurrency(invoiced - collected)} still outstanding`} href="/invoices" />
          </section>

          {alerts.length > 0 ? (
            <section className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
              <h2 className="text-sm font-medium">Budget alerts</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {alerts.map((alert) => (
                  <li key={alert.id}>
                    <Link className="text-primary" href={`/costs?category=${alert.id}` as never}>
                      {alert.name}
                    </Link>
                    {' '}{alert.state === 'over' ? 'is over budget' : 'is nearing its budget'} ({formatCurrency(alert.actual)} of {formatCurrency(alert.budget)}).
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-5">
            <div className="rounded-lg border border-border bg-card p-4 lg:col-span-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Budget versus actual</h2>
                <Link href="/costs" className="text-sm text-primary">View in Costs</Link>
              </div>
              <div className="space-y-3">
                {topLevel.map((category) => {
                  const actual = rollup[category.id]?.total || 0
                  const budget = budgetRollup[category.id]?.total || 0
                  const max = Math.max(budget, actual, 1)
                  return (
                    <Link key={category.id} href={`/costs?category=${category.id}` as never} className="block rounded-md px-1 py-1 hover:bg-muted">
                      <div className="mb-1 flex justify-between gap-3 text-sm">
                        <span>{category.name}</span>
                        <span className="tabular text-muted-foreground">{formatCurrency(actual)} / {budget > 0 ? formatCurrency(budget) : 'No budget'}</span>
                      </div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                        <div className="absolute inset-y-0 left-0 bg-primary/25" style={{ width: `${Math.min(100, (budget / max) * 100)}%` }} />
                        <div className={`absolute inset-y-0 left-0 ${actual > budget && budget > 0 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${Math.min(100, (actual / max) * 100)}%` }} />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
              <h2 className="text-sm font-medium">Cost trend</h2>
              <p className="mt-1 text-xs text-muted-foreground">Cumulative cost by month</p>
              <BurnChart points={burn} />
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <h2 className="text-sm font-medium">By category</h2>
              <p className="text-xs text-muted-foreground">Parent rows include children. Select a row to open it in Costs.</p>
            </div>
            <table className="responsive-cards w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Budget</th>
                  <th className="px-3 py-2 text-right font-medium">Actual</th>
                  <th className="px-3 py-2 text-right font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {topLevel.map((category) => {
                  const actual = rollup[category.id]?.total || 0
                  const budget = budgetRollup[category.id]?.total || 0
                  const children = category.children.filter((child) => visible.some((item) => item.id === child.id))
                  return (
                    <Fragment key={category.id}>
                      <tr className="border-b border-border">
                        <td className="px-3 py-2" data-label="Category"><Link className="font-medium text-primary" href={`/costs?category=${category.id}` as never}>{category.name}</Link></td>
                        <td className="px-3 py-2 text-right tabular" data-label="Budget">{formatCurrency(budget)}</td>
                        <td className="px-3 py-2 text-right tabular" data-label="Actual">{formatCurrency(actual)}</td>
                        <td className="px-3 py-2 text-right tabular" data-label="Remaining">{formatCurrency(budget - actual)}</td>
                      </tr>
                      {children.map((child) => (
                        <tr key={child.id} className="border-b border-border text-muted-foreground">
                          <td className="px-3 py-2 pl-8" data-label="Category"><Link href={`/costs?category=${child.id}` as never}>{child.name}</Link></td>
                          <td className="px-3 py-2 text-right tabular" data-label="Budget">{formatCurrency(budgets[child.id] || 0)}</td>
                          <td className="px-3 py-2 text-right tabular" data-label="Actual">{formatCurrency(rollup[child.id]?.own || 0)}</td>
                          <td className="px-3 py-2 text-right tabular" data-label="Remaining">{formatCurrency((budgets[child.id] || 0) - (rollup[child.id]?.own || 0))}</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Activity title="Latest costs" empty="No costs yet" rows={recentCosts.map((row) => ({ id: row.id, primary: row.description || row.vendor || row.employee_name || 'Cost', secondary: formatDate(row.date), amount: formatCurrency(row.cost), href: '/costs' }))} />
            <Activity title="Latest invoices" empty="No invoices yet" rows={recentInvoices.map((row) => ({ id: row.id, primary: row.invoice_number, secondary: formatDate(row.date_billed), amount: formatCurrency(row.amount), href: '/invoices' }))} />
            <Activity title="Change orders" empty="No change orders" rows={recentOrders.map((row) => ({ id: row.id, primary: row.name, secondary: row.description || 'Change order', amount: formatCurrency(row.additional_contract_value), href: '/projects' }))} />
          </section>
        </>
      ) : null}
    </div>
  )
}

function Metric({ label, value, detail, tone, href }: { label: string; value: string; detail?: string; tone?: 'good' | 'bad'; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular ${tone === 'bad' ? 'text-destructive' : tone === 'good' ? 'text-success' : ''}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground tabular">{detail}</p> : null}
    </>
  )
  if (!href) return <div className="rounded-lg border border-border bg-card p-4">{body}</div>
  return <Link href={href as never} className="rounded-lg border border-border bg-card p-4 hover:border-primary">{body}</Link>
}

function BurnChart({ points }: { points: Array<{ month: string; cumulative: number }> }) {
  if (points.length === 0) return <p className="mt-6 text-sm text-muted-foreground">Costs will draw a trend once they have dates.</p>
  const max = Math.max(...points.map((point) => point.cumulative), 1)
  const width = 280
  const height = 120
  const step = points.length === 1 ? 0 : width / (points.length - 1)
  const coords = points.map((point, index) => `${index * step},${height - (point.cumulative / max) * (height - 8)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height + 20}`} className="mt-3 w-full text-primary" role="img" aria-label="Cumulative cost by month">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={coords} />
      {points.map((point, index) => (
        <text key={point.month} x={index * step} y={height + 16} className="fill-muted-foreground" fontSize="10">{point.month.slice(5)}</text>
      ))}
    </svg>
  )
}

function Activity({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; primary: string; secondary: string; amount: string; href: string }> }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{empty}</p> : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={row.href as never} className="flex items-start justify-between gap-3 text-sm hover:text-primary">
                <span>
                  <span className="block font-medium">{row.primary}</span>
                  <span className="text-xs text-muted-foreground">{row.secondary}</span>
                </span>
                <span className="tabular">{row.amount}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
