'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { fetchAllRows } from '@/lib/page-query'
import { aggregatePortfolio, budgetsFromLegacy, categoriesForReader } from '@/lib/portfolio-overview'
import { fromCents, toCents } from '@/lib/reports/money'
import { resolveCategoryId } from '@/lib/reports/compute'
import type { ReportBudget, ReportCategory, ReportChangeOrder, ReportCost, ReportLegacyBudget } from '@/lib/reports/types'
import { Button } from '@/components/ui/button'
import { EmptyState, Notice, PageHeader, Skeleton } from '@/components/ui/feedback'
import { ExportMenu, type ExportSpec } from '@/components/export/ExportMenu'
import { OverviewDashboard, type OverviewGroup } from '@/components/overview/OverviewDashboard'
import type { CustomerInvoice } from '@/types/app.types'

interface CompanyCostRow {
  id: string
  project_id: string
  category_id: string | null
  category: string | null
  cost: number | null
  date: string
  description: string | null
  vendor: string | null
  employee_name: string | null
  created_at: string | null
  reversal_of_id?: string | null
}

interface CompanyOrderRow {
  id: string
  project_id: string
  name: string
  additional_contract_value: number | null
  created_at: string | null
}

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
  const router = useRouter()
  const searchParams = useSearchParams()
  const scope = searchParams.get('scope') === 'all' ? 'company' : 'project'
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [companyCosts, setCompanyCosts] = useState<ReportCost[]>([])
  const [companyOrders, setCompanyOrders] = useState<ReportChangeOrder[]>([])
  const [companyBudgets, setCompanyBudgets] = useState<ReportBudget[]>([])
  const [companyReady, setCompanyReady] = useState(false)
  const [companyError, setCompanyError] = useState('')
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const supabase = createClient()
  const goal = readCompanySettings(tenant?.settings).gp_goal_percent

  function setScope(next: 'project' | 'company') {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'company') params.set('scope', 'all')
    else params.delete('scope')
    const query = params.toString()
    router.push((query ? `/dashboard?${query}` : '/dashboard') as never)
  }

  function openProject(id: string) {
    const project = projects.find((item) => item.id === id)
    if (project) setActiveProject(project)
    router.push('/dashboard' as never)
  }

  useEffect(() => {
    if (activeProject?.id) refreshCosts()
  }, [activeProject?.id, refreshCosts])

  useEffect(() => {
    if (!tenant?.id) return
    let cancelled = false
    ;(async () => {
      const withCollected = await fetchAllRows<InvoiceRow>((from, to) => supabase
        .from('customer_invoices')
        .select('id, project_id, invoice_number, amount, amount_collected, date_billed, created_at')
        .eq('tenant_id', tenant.id)
        .order('id', { ascending: true })
        .range(from, to))
      let invoiceRows: InvoiceRow[] = []
      if (withCollected.error && isMissingColumnError(withCollected.error)) {
        const withoutCollected = await fetchAllRows<InvoiceRow>((from, to) => supabase
          .from('customer_invoices')
          .select('id, project_id, invoice_number, amount, date_billed, created_at')
          .eq('tenant_id', tenant.id)
          .order('id', { ascending: true })
          .range(from, to))
        invoiceRows = (withoutCollected.rows || []).map((row) => ({ ...row, amount_collected: 0 }))
      } else if (!withCollected.error) {
        invoiceRows = withCollected.rows
      }
      if (!cancelled) setInvoices(invoiceRows)
    })()
    return () => {
      cancelled = true
    }
  }, [tenant?.id, supabase])

  useEffect(() => {
    if (!tenant?.id || scope !== 'company') return
    let cancelled = false
    setCompanyError('')
    ;(async () => {
      const costSelect = 'id, project_id, category_id, category, cost, date, description, vendor, employee_name, created_at, reversal_of_id'
      let costs = await fetchAllRows<CompanyCostRow>(async (from, to) => {
        const result = await supabase.from('project_costs').select(costSelect).eq('tenant_id', tenant.id).order('id', { ascending: true }).range(from, to)
        return { data: result.data as CompanyCostRow[] | null, error: result.error }
      })
      if (costs.error && isMissingColumnError(costs.error)) {
        costs = await fetchAllRows<CompanyCostRow>(async (from, to) => {
          const result = await supabase.from('project_costs').select('id, project_id, category_id, category, cost, date, description, vendor, employee_name, created_at').eq('tenant_id', tenant.id).order('id', { ascending: true }).range(from, to)
          return { data: result.data as CompanyCostRow[] | null, error: result.error }
        })
      }
      const orders = await fetchAllRows<CompanyOrderRow>(async (from, to) => {
        const result = await supabase.from('change_orders').select('id, project_id, name, additional_contract_value, created_at').eq('tenant_id', tenant.id).order('id', { ascending: true }).range(from, to)
        return { data: result.data as CompanyOrderRow[] | null, error: result.error }
      })
      const categoryBudgets = await fetchAllRows<ReportBudget>((from, to) => supabase
        .from('project_category_budgets')
        .select('project_id, category_id, amount')
        .eq('tenant_id', tenant.id)
        .order('id', { ascending: true })
        .range(from, to))
      if (cancelled) return
      if (costs.error) {
        setCompanyError(costs.error.message || 'Could not load costs for every project.')
        setCompanyCosts([])
      } else {
        setCompanyCosts((costs.rows || []).map((row) => ({
          id: row.id,
          project_id: row.project_id,
          category_id: row.category_id ?? null,
          category: row.category ?? null,
          date: row.date,
          cost: row.cost ?? null,
          vendor: row.vendor ?? null,
          invoice_number: null,
          description: row.description ?? null,
          employee_name: row.employee_name ?? null,
          employee_id: null,
          st_hours: null,
          ot_hours: null,
          dt_hours: null,
          per_diem: null,
          mob_qty: null,
          change_order_id: null,
          reversal_of_id: row.reversal_of_id ?? null,
          reversed_at: null,
          reversal_reason: null,
          created_at: row.created_at ?? null,
        })))
      }
      setCompanyOrders(orders.error ? [] : (orders.rows || []).map((row) => ({
        id: row.id,
        project_id: row.project_id,
        name: row.name,
        additional_contract_value: row.additional_contract_value ?? null,
        created_at: row.created_at ?? null,
      })))
      if (!categoryBudgets.error) {
        setCompanyBudgets(categoryBudgets.rows || [])
      } else if (isMissingRelation(categoryBudgets.error)) {
        const legacy = await fetchAllRows<ReportLegacyBudget>((from, to) => supabase
          .from('project_budgets')
          .select('project_id, material_budget, labor_budget, equipment_budget, subcontractor_budget, others_budget, cap_leases_budget, consumable_budget')
          .eq('tenant_id', tenant.id)
          .order('project_id', { ascending: true })
          .range(from, to))
        if (!cancelled) {
          setCompanyBudgets(budgetsFromLegacy(categories.map(asReportCategory), legacy.rows || []))
        }
      } else {
        setCompanyBudgets([])
        if (!costs.error) setCompanyError(categoryBudgets.error.message || 'Could not load budgets.')
      }
      if (!cancelled) setCompanyReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [tenant?.id, supabase, scope, categories])

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

  const reportCategories = useMemo(() => categories.map(asReportCategory), [categories])

  const company = useMemo(() => {
    if (scope !== 'company' || !companyReady) return null
    const readable = visible.map((category) => category.id)
    const kept = readable.length ? categoriesForReader(reportCategories, readable) : reportCategories
    const readableIds = new Set(readable)
    const costs = companyCosts.filter((row) => {
      const id = resolveCategoryId(row, kept)
      return !!id && (readableIds.size === 0 || readableIds.has(id))
    })
    return aggregatePortfolio({
      projects: projects.map((project) => ({
        id: project.id,
        jobNumber: project.jobNumber,
        jobName: project.jobName,
        customer: project.customer || '',
        status: project.status ?? null,
        totalContractValue: project.totalContractValue ?? null,
      })),
      categories: kept,
      costs,
      invoices: invoices.filter((row) => projects.some((project) => project.id === row.project_id)).map((row) => ({
        id: row.id,
        project_id: row.project_id,
        invoice_number: row.invoice_number,
        amount: row.amount,
        amount_collected: row.amount_collected ?? 0,
        date_billed: row.date_billed,
        change_order_id: null,
        reversal_of_id: null,
        reversal_reason: null,
        created_at: row.created_at ?? null,
      })),
      changeOrders: companyOrders,
      budgets: companyBudgets,
    })
  }, [scope, companyReady, visible, reportCategories, companyCosts, projects, invoices, companyOrders, companyBudgets])

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
  const invoiceBurn = monthlyBurn(projectInvoices.map((row) => ({ date: row.date_billed, cost: Number(row.amount || 0) })))
  const alerts = topLevel.flatMap((category) => {
    const children = category.children.filter((child) => visible.some((item) => item.id === child.id))
    return [category, ...children].flatMap((item) => {
      const actual = item.parent_id ? rollup[item.id]?.own || 0 : rollup[item.id]?.total || 0
      const budget = item.parent_id ? budgets[item.id] || 0 : budgetRollup[item.id]?.total || 0
      const state = categoryBudgetState(actual, budget)
      if (state !== 'over' && state !== 'near') return []
      return [{ id: item.id, name: item.name, actual, budget, state, href: `/costs?category=${item.id}` }]
    })
  })

  const recentCosts = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5)
  const recentInvoices = [...projectInvoices].sort((a, b) => b.date_billed.localeCompare(a.date_billed)).slice(0, 5)
  const recentOrders = [...changeOrders].slice(0, 5)
  const projectGroups = topLevel.map((category) => ({
    id: category.id,
    name: category.name,
    actual: rollup[category.id]?.total || 0,
    budget: budgetRollup[category.id]?.total || 0,
    href: `/costs?category=${category.id}`,
    children: category.children.filter((child) => visible.some((item) => item.id === child.id)).map((child) => ({
      id: child.id,
      name: child.name,
      actual: rollup[child.id]?.own || 0,
      budget: budgets[child.id] || 0,
      href: `/costs?category=${child.id}`,
    })),
  }))

  const exportSpec: ExportSpec | null = scope === 'company' ? (company ? companyExport(company, tenant?.name || 'Company') : null) : !activeProject ? null : {
    filename: `${activeProject.jobNumber}-overview`,
    title: 'Project overview',
    company: tenant?.name || 'Company',
    project: `${activeProject.jobNumber} — ${activeProject.jobName}`,
    filters: ['Scope: this project', 'Gross profit is invoiced minus cost'],
    columns: ['Category', 'Budget', 'Actual', 'Remaining'],
    csvRows: [
      ['Contract', '', contract, ''],
      ['Cost to date', '', totalCosts, ''],
      ['Budget', totalBudget, totalCosts, totalBudget - totalCosts],
      ['Invoiced', '', invoiced, ''],
      ['Collected', '', collected, ''],
      ['Gross profit (invoiced minus cost)', '', profit, ''],
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
      { label: 'Gross profit (invoiced minus cost)', value: `${formatCurrency(profit)}${margin == null ? '' : ` (${formatPercent(margin)})`}` },
    ],
    overview: true,
    visual: {
      kpis: [
        { label: 'Contract', value: formatCurrency(contract), detail: `${formatCurrency(baseContract)} base · ${formatCurrency(changeOrderTotal)} change orders` },
        { label: 'Cost to date', value: formatCurrency(totalCosts) },
        { label: 'Budget', value: formatCurrency(totalBudget), detail: `${formatCurrency(totalBudget - totalCosts)} remaining` },
        { label: 'Gross profit', value: formatCurrency(profit), detail: margin == null ? 'Invoiced minus cost' : `Invoiced minus cost · ${formatPercent(margin)}${goal == null ? '' : ` · goal ${formatPercent(goal)}`}` },
        { label: 'Invoiced', value: formatCurrency(invoiced), detail: `${formatCurrency(contract - invoiced)} not billed` },
        { label: 'Collected', value: formatCurrency(collected), detail: `${formatCurrency(invoiced - collected)} outstanding` },
      ],
      alerts: alerts.map((alert) => `${alert.name} is ${alert.state === 'over' ? 'over budget' : 'nearing its budget'} (${formatCurrency(alert.actual)} of ${formatCurrency(alert.budget)}).`),
      series: {
        title: 'Cost trend',
        points: burn.map((point) => ({ label: point.month.slice(5), value: point.cumulative })),
      },
      activity: [
        { title: 'Latest costs', lines: recentCosts.map((row) => `${formatDate(row.date)}  ${row.description || row.vendor || row.employee_name || 'Cost'}  ${formatCurrency(row.cost)}`) },
        { title: 'Latest invoices', lines: recentInvoices.map((row) => `${formatDate(row.date_billed)}  ${row.invoice_number}  ${formatCurrency(row.amount)}`) },
        { title: 'Change orders', lines: recentOrders.map((row) => `${row.name}  ${formatCurrency(row.additional_contract_value)}`) },
      ],
    },
  }

  if (projectsLoading || (scope === 'project' && costsLoading)) {
    return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>
  }
  if (!activeProject && scope === 'project') {
    return <EmptyState title="No project yet" body="Create a project to see contract value, costs, and invoices." />
  }
  if (scope === 'company' && projects.length === 0) {
    return <EmptyState title="No project yet" body="Create a project to see contract value, costs, and invoices." />
  }

  const companyBase = company ? fromCents(projects.reduce((sum, project) => sum + toCents(project.totalContractValue), 0)) : 0
  const companyContract = company ? fromCents(company.contractCents) : 0
  const visibleIds = new Set(visible.map((category) => category.id))
  const companyGroups: OverviewGroup[] = []
  let hidingParent = false
  for (const line of company?.categories || []) {
    if (line.depth === 0) {
      hidingParent = !visibleIds.has(line.id)
      if (hidingParent) continue
      companyGroups.push({ id: line.id, name: line.name, actual: fromCents(line.actualCents), budget: fromCents(line.budgetCents), children: [] })
    } else if (!hidingParent && companyGroups.length > 0 && visibleIds.has(line.id)) {
      companyGroups[companyGroups.length - 1].children.push({ id: line.id, name: line.name, actual: fromCents(line.actualCents), budget: fromCents(line.budgetCents) })
    }
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

      {companyError ? <Notice>{companyError}</Notice> : null}

      {scope === 'company' && !company ? <Skeleton className="h-40" /> : null}

      {scope === 'company' && company ? (
        <OverviewDashboard
          accent
          contract={companyContract}
          baseContract={companyBase}
          changeOrderTotal={companyContract - companyBase}
          totalCosts={fromCents(company.costCents)}
          totalBudget={fromCents(company.budgetCents)}
          invoiced={fromCents(company.invoicedCents)}
          collected={fromCents(company.collectedCents)}
          profit={fromCents(company.profitCents)}
          margin={company.margin}
          goal={goal}
          alerts={company.categories.filter((line) => (line.state === 'over' || line.state === 'near') && visibleIds.has(line.id)).map((line) => ({
            id: line.id,
            name: line.name,
            actual: fromCents(line.actualCents),
            budget: fromCents(line.budgetCents),
            state: line.state as 'over' | 'near',
          }))}
          groups={companyGroups}
          burn={company.costBurn}
          invoiceBurn={company.invoiceBurn}
          recentCosts={company.recentCosts.map((row) => ({
            id: row.id,
            primary: row.label,
            secondary: `${row.projectLabel} · ${formatDate(row.date)}`,
            amount: formatCurrency(fromCents(row.amountCents)),
          }))}
          recentInvoices={company.recentInvoices.map((row) => ({
            id: row.id,
            primary: row.label,
            secondary: `${row.projectLabel} · ${formatDate(row.date)}`,
            amount: formatCurrency(fromCents(row.amountCents)),
          }))}
          recentOrders={company.recentOrders.map((row) => ({
            id: row.id,
            primary: row.label,
            secondary: row.projectLabel || 'Change order',
            amount: formatCurrency(fromCents(row.amountCents)),
          }))}
          projects={company.projects.map((row) => ({
            id: row.id,
            jobNumber: row.jobNumber,
            jobName: row.jobName,
            budget: fromCents(row.budgetCents),
            cost: fromCents(row.costCents),
            invoiced: fromCents(row.invoicedCents),
            profit: fromCents(row.profitCents),
            margin: row.margin,
            spent: row.spentPercent,
          }))}
          onOpenProject={openProject}
        />
      ) : activeProject ? (
        <OverviewDashboard
          contract={contract}
          baseContract={baseContract}
          changeOrderTotal={changeOrderTotal}
          totalCosts={totalCosts}
          totalBudget={totalBudget}
          invoiced={invoiced}
          collected={collected}
          profit={profit}
          margin={margin}
          goal={goal}
          alerts={alerts}
          groups={projectGroups}
          burn={burn}
          invoiceBurn={invoiceBurn}
          costsHref="/costs"
          invoicesHref="/invoices"
          recentCosts={recentCosts.map((row) => ({ id: row.id, primary: row.description || row.vendor || row.employee_name || 'Cost', secondary: formatDate(row.date), amount: formatCurrency(row.cost), href: row.category_id ? `/costs?category=${row.category_id}` : '/costs' }))}
          recentInvoices={recentInvoices.map((row) => ({ id: row.id, primary: row.invoice_number, secondary: formatDate(row.date_billed), amount: formatCurrency(row.amount), href: '/invoices' }))}
          recentOrders={recentOrders.map((row) => ({ id: row.id, primary: row.name, secondary: row.description || 'Change order', amount: formatCurrency(row.additional_contract_value), href: '/projects' }))}
        />
      ) : null}
    </div>
  )
}

function asReportCategory(category: { id: string; name: string; kind: string; parent_id: string | null; builtin_key: string | null; sort_order: number; is_hidden: boolean }): ReportCategory {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    parent_id: category.parent_id,
    builtin_key: category.builtin_key,
    sort_order: category.sort_order,
    is_hidden: category.is_hidden,
  }
}

function companyExport(company: ReturnType<typeof aggregatePortfolio>, companyName: string): ExportSpec {
  const contract = fromCents(company.contractCents)
  const cost = fromCents(company.costCents)
  const budget = fromCents(company.budgetCents)
  const invoiced = fromCents(company.invoicedCents)
  const profit = fromCents(company.profitCents)
  return {
    filename: 'company-overview',
    title: 'Company overview',
    company: companyName,
    filters: ['Scope: all projects', 'Reversals and credit memos are included, so totals are net.', 'Gross profit is invoiced minus cost'],
    columns: ['Job number', 'Job name', 'Budget', 'Cost', 'Invoiced', 'Gross profit', 'Margin', '% of budget'],
    csvRows: company.projects.map((row) => [
      row.jobNumber,
      row.jobName,
      fromCents(row.budgetCents),
      fromCents(row.costCents),
      fromCents(row.invoicedCents),
      fromCents(row.profitCents),
      row.margin,
      row.spentPercent,
    ]),
    pdfRows: company.projects.map((row) => [
      row.jobNumber,
      row.jobName,
      formatCurrency(fromCents(row.budgetCents)),
      formatCurrency(fromCents(row.costCents)),
      formatCurrency(fromCents(row.invoicedCents)),
      formatCurrency(fromCents(row.profitCents)),
      row.margin == null ? '' : formatPercent(row.margin),
      row.spentPercent == null ? '' : formatPercent(row.spentPercent),
    ]),
    totals: [
      { label: 'Projects', value: String(company.projects.length) },
      { label: 'Contract', value: formatCurrency(contract) },
      { label: 'Gross profit (invoiced minus cost)', value: `${formatCurrency(profit)}${company.margin == null ? '' : ` (${formatPercent(company.margin)})`}` },
    ],
    overview: true,
    visual: {
      kpis: [
        { label: 'Projects', value: String(company.projects.length) },
        { label: 'Contract', value: formatCurrency(contract) },
        { label: 'Cost', value: formatCurrency(cost) },
        { label: 'Budget', value: formatCurrency(budget) },
        { label: 'Invoiced', value: formatCurrency(invoiced) },
        { label: 'Gross profit', value: formatCurrency(profit), detail: company.margin == null ? 'Invoiced minus cost' : formatPercent(company.margin) },
      ],
      series: {
        title: 'Cost trend',
        points: company.costBurn.map((point) => ({ label: point.month.slice(5), value: point.cumulative })),
      },
    },
  }
}
