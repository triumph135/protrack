'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { toast } from 'sonner'
import { Download, FileDown } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useCategories } from '@/contexts/CategoryContext'
import { useCosts } from '@/hooks/useCosts'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { createClient } from '@/lib/supabase'
import { canAccessCategory } from '@/lib/permissions'
import { flattenCategoryTree, ownAmountsByCategory, rollupCategoryAmounts } from '@/lib/categories'
import { formatCurrency, formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/feedback'
import { isMissingRelation } from '@/lib/security'

const BUDGET_COLUMNS: Record<string, string> = {
  material: 'material_budget',
  labor: 'labor_budget',
  equipment: 'equipment_budget',
  subcontractor: 'subcontractor_budget',
  others: 'others_budget',
  cap_leases: 'cap_leases_budget',
  consumable: 'consumable_budget',
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { activeProject, loading: projectsLoading } = useProjects()
  const { categories, tree, schemaPending } = useCategories()
  const { entries, loading: costsLoading, refreshCosts } = useCosts(activeProject?.id, null)
  const { getTotalAdditionalValue } = useChangeOrders(activeProject?.id)
  const [invoices, setInvoices] = useState<Array<{ amount?: number | null }>>([])
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const printRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (activeProject?.id) refreshCosts()
  }, [activeProject?.id, refreshCosts])

  useEffect(() => {
    if (!activeProject?.id || !tenant?.id) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('customer_invoices')
        .select('amount')
        .eq('tenant_id', tenant.id)
        .eq('project_id', activeProject.id)
      if (!cancelled) setInvoices(error ? [] : data || [])

      const categoryBudgets = await supabase
        .from('project_category_budgets')
        .select('category_id, amount')
        .eq('project_id', activeProject.id)
      if (!categoryBudgets.error && categoryBudgets.data) {
        const next: Record<string, number> = {}
        for (const row of categoryBudgets.data) next[row.category_id] = Number(row.amount || 0)
        if (!cancelled) setBudgets(next)
        return
      }
      if (categoryBudgets.error && !isMissingRelation(categoryBudgets.error)) {
        console.error(categoryBudgets.error)
      }
      const legacy = await supabase
        .from('project_budgets')
        .select('*')
        .eq('project_id', activeProject.id)
        .maybeSingle()
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
  }, [activeProject?.id, tenant?.id, supabase, categories])

  const visible = useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, category]))
    return categories.filter((category) =>
      canAccessCategory(user, {
        id: category.id,
        builtinKey: category.builtin_key,
        parentBuiltinKey: category.parent_id ? byId.get(category.parent_id)?.builtin_key : null,
      }, 'read')
    )
  }, [categories, user])

  const rollup = useMemo(() => {
    const own = ownAmountsByCategory(entries, categories)
    return rollupCategoryAmounts(categories, own)
  }, [entries, categories])

  const budgetRollup = useMemo(() => rollupCategoryAmounts(categories, budgets), [categories, budgets])

  const baseContract = activeProject?.totalContractValue || 0
  const changeOrders = getTotalAdditionalValue()
  const contract = baseContract + changeOrders
  const totalCosts = visible.reduce((sum, category) => {
    if (category.parent_id) return sum
    return sum + (rollup[category.id]?.total || 0)
  }, 0)
  const invoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
  const unbilled = contract - invoiced
  const profit = invoiced - totalCosts
  const margin = invoiced > 0 ? (profit / invoiced) * 100 : 0

  const print = useReactToPrint({ contentRef: printRef, documentTitle: activeProject ? `${activeProject.jobNumber} summary` : 'ProTrack' })

  const exportCsv = () => {
    if (!activeProject) {
      toast.error('Choose a project before exporting')
      return
    }
    const rows = [
      ['Metric', 'Amount'],
      ['Base contract', baseContract],
      ['Change orders', changeOrders],
      ['Total contract', contract],
      ['Costs', totalCosts],
      ['Invoiced', invoiced],
      ['Not yet billed', unbilled],
      ['Gross profit', profit],
      ...flattenCategoryTree(tree).filter((category) => visible.some((item) => item.id === category.id)).map((category) => [
        category.name,
        rollup[category.id]?.total || 0,
      ]),
    ]
    const csv = rows.map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeProject.jobNumber}_dashboard_summary.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (projectsLoading || costsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (!activeProject) {
    return <EmptyState title="No project yet" body="Create a project to see contract value, costs, and invoices." />
  }

  const topLevel = flattenCategoryTree(tree).filter((category) => !category.parent_id && visible.some((item) => item.id === category.id))

  return (
    <div className="space-y-4">
      <PageHeader
        title={activeProject.jobName}
        description={`${activeProject.jobNumber} · ${activeProject.customer}`}
        action={
          <>
            <Button variant="outline" type="button" onClick={exportCsv}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" type="button" onClick={() => print()}>
              <FileDown className="h-4 w-4" /> PDF
            </Button>
          </>
        }
      />
      <div ref={printRef} className="space-y-4 bg-background">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Contract" value={formatCurrency(contract)} detail={`${formatCurrency(baseContract)} base · ${formatCurrency(changeOrders)} changes`} />
          <Metric label="Costs" value={formatCurrency(totalCosts)} />
          <Metric label="Invoiced" value={formatCurrency(invoiced)} detail={`${formatCurrency(unbilled)} not yet billed`} />
          <Metric label="Gross profit" value={formatCurrency(profit)} detail={formatPercent(margin)} tone={profit >= 0 ? 'good' : 'bad'} />
        </section>
        <section className="overflow-hidden rounded-lg border border-border bg-card">
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
                      <td className="px-3 py-2" data-label="Category">{category.name}</td>
                      <td className="px-3 py-2 text-right tabular" data-label="Budget">{formatCurrency(budget)}</td>
                      <td className="px-3 py-2 text-right tabular" data-label="Actual">{formatCurrency(actual)}</td>
                      <td className="px-3 py-2 text-right tabular" data-label="Remaining">{formatCurrency(budget - actual)}</td>
                    </tr>
                    {children.map((child) => (
                      <tr key={child.id} className="border-b border-border text-muted-foreground">
                        <td className="px-3 py-2 pl-8" data-label="Category">{child.name}</td>
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
          {schemaPending ? null : (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Parent rows include their children. Labor entries filed before a direct/indirect split stay on Labor.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular ${tone === 'bad' ? 'text-destructive' : tone === 'good' ? 'text-success' : ''}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground tabular">{detail}</p> : null}
    </div>
  )
}
