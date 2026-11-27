import { buildCategoryTree, rollupCategoryAmounts, type CostCategoryRecord } from '@/lib/categories'
import { categoryBudgetState, grossProfitPercent, monthlyBurn, type BurnPoint } from '@/lib/overview'
import { resolveCategoryId } from '@/lib/reports/compute'
import { fromCents, toCents } from '@/lib/reports/money'
import type { ReportBudget, ReportCategory, ReportChangeOrder, ReportCost, ReportInvoice, ReportLegacyBudget, ReportProject } from '@/lib/reports/types'

/**
 * Company overview uses the same cents, reversals, and credit memos as the
 * portfolio and activity reports. Cost and invoiced totals are the sum of the
 * row amounts (a reversal or credit memo is already a negative row). Gross
 * profit is invoiced minus cost. Collected cash is not part of gross profit.
 * Budget is the current category budget, rolled up so a parent includes its children.
 */

const LEGACY_BUDGET: Record<string, keyof ReportLegacyBudget> = {
  material: 'material_budget',
  labor: 'labor_budget',
  equipment: 'equipment_budget',
  subcontractor: 'subcontractor_budget',
  others: 'others_budget',
  cap_leases: 'cap_leases_budget',
  consumable: 'consumable_budget',
}

export interface PortfolioSource {
  projects: ReportProject[]
  categories: ReportCategory[]
  costs: ReportCost[]
  invoices: ReportInvoice[]
  changeOrders: ReportChangeOrder[]
  budgets: ReportBudget[]
}

export interface ProjectRollup {
  id: string
  jobNumber: string
  jobName: string
  contractCents: number
  budgetCents: number
  costCents: number
  invoicedCents: number
  collectedCents: number
  profitCents: number
  margin: number | null
  spentPercent: number | null
}

export interface CategoryLine {
  id: string
  name: string
  depth: number
  actualCents: number
  budgetCents: number
  state: 'over' | 'near' | 'within' | 'unset'
}

export interface PortfolioActivity {
  id: string
  projectId: string
  label: string
  projectLabel: string
  date: string
  amountCents: number
}

export interface PortfolioOverview {
  contractCents: number
  budgetCents: number
  costCents: number
  invoicedCents: number
  collectedCents: number
  profitCents: number
  margin: number | null
  projects: ProjectRollup[]
  categories: CategoryLine[]
  costBurn: BurnPoint[]
  invoiceBurn: BurnPoint[]
  recentCosts: PortfolioActivity[]
  recentInvoices: PortfolioActivity[]
  recentOrders: PortfolioActivity[]
}

export function categoriesForReader<T extends { id: string; parent_id: string | null }>(
  categories: T[],
  readableIds: Iterable<string>
): T[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const keep = new Set<string>()
  for (const id of readableIds) {
    let current = byId.get(id)
    const seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      keep.add(current.id)
      current = current.parent_id ? byId.get(current.parent_id) : undefined
    }
  }
  return categories.filter((category) => keep.has(category.id))
}

/** Legacy project_budgets columns, same mapping the portfolio report uses. */
export function budgetsFromLegacy(categories: ReportCategory[], rows: ReportLegacyBudget[]): ReportBudget[] {
  const out: ReportBudget[] = []
  for (const row of rows) {
    for (const category of categories) {
      const column = category.builtin_key ? LEGACY_BUDGET[category.builtin_key] : undefined
      if (!column || category.parent_id) continue
      out.push({ project_id: row.project_id, category_id: category.id, amount: Number(row[column] || 0) })
    }
  }
  return out
}

function asRecords(categories: ReportCategory[]): CostCategoryRecord[] {
  return categories.map((category) => ({
    id: category.id,
    tenant_id: '',
    name: category.name,
    kind: category.kind === 'labor' || category.kind === 'named' ? category.kind : 'standard',
    parent_id: category.parent_id,
    builtin_key: category.builtin_key,
    sort_order: category.sort_order,
    is_hidden: category.is_hidden,
    is_builtin: !!category.builtin_key,
    gl_code: null,
  }))
}

function budgetOwn(budgets: ReportBudget[], projectId: string): Record<string, number> {
  const own: Record<string, number> = {}
  for (const row of budgets) {
    if (row.project_id !== projectId) continue
    own[row.category_id] = (own[row.category_id] || 0) + Number(row.amount || 0)
  }
  return own
}

function topBudgetCents(records: CostCategoryRecord[], own: Record<string, number>): number {
  const rollup = rollupCategoryAmounts(records, own)
  let total = 0
  for (const category of buildCategoryTree(records)) total += toCents(rollup[category.id]?.total || 0)
  return total
}

export function aggregatePortfolio(source: PortfolioSource): PortfolioOverview {
  const records = asRecords(source.categories)
  const projectIds = new Set(source.projects.map((project) => project.id))
  const costs = source.costs.filter((row) => projectIds.has(row.project_id))
  const invoices = source.invoices.filter((row) => projectIds.has(row.project_id))
  const orders = source.changeOrders.filter((row) => projectIds.has(row.project_id))

  const projects: ProjectRollup[] = source.projects.map((project) => {
    const costCents = costs.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + toCents(row.cost), 0)
    const projectInvoices = invoices.filter((row) => row.project_id === project.id)
    const invoicedCents = projectInvoices.reduce((sum, row) => sum + toCents(row.amount), 0)
    const collectedCents = projectInvoices.reduce((sum, row) => sum + toCents(row.amount_collected), 0)
    const changeCents = orders
      .filter((order) => order.project_id === project.id)
      .reduce((sum, order) => sum + toCents(order.additional_contract_value), 0)
    const contractCents = toCents(project.totalContractValue) + changeCents
    const budgetCents = topBudgetCents(records, budgetOwn(source.budgets, project.id))
    const profitCents = invoicedCents - costCents
    return {
      id: project.id,
      jobNumber: project.jobNumber,
      jobName: project.jobName,
      contractCents,
      budgetCents,
      costCents,
      invoicedCents,
      collectedCents,
      profitCents,
      margin: grossProfitPercent(fromCents(invoicedCents), fromCents(costCents)),
      spentPercent: budgetCents > 0 ? (costCents / budgetCents) * 100 : null,
    }
  })

  const contractCents = projects.reduce((sum, project) => sum + project.contractCents, 0)
  const budgetCents = projects.reduce((sum, project) => sum + project.budgetCents, 0)
  const costCents = projects.reduce((sum, project) => sum + project.costCents, 0)
  const invoicedCents = projects.reduce((sum, project) => sum + project.invoicedCents, 0)
  const collectedCents = projects.reduce((sum, project) => sum + project.collectedCents, 0)
  const profitCents = invoicedCents - costCents

  const ownActual: Record<string, number> = {}
  for (const row of costs) {
    const id = resolveCategoryId(row, source.categories)
    if (!id) continue
    ownActual[id] = (ownActual[id] || 0) + fromCents(toCents(row.cost))
  }
  const mergedBudget: Record<string, number> = {}
  for (const project of source.projects) {
    const own = budgetOwn(source.budgets, project.id)
    for (const [id, amount] of Object.entries(own)) mergedBudget[id] = (mergedBudget[id] || 0) + amount
  }
  const actualRollup = rollupCategoryAmounts(records, ownActual)
  const budgetRollup = rollupCategoryAmounts(records, mergedBudget)
  const categories: CategoryLine[] = []
  for (const category of buildCategoryTree(records)) {
    const actualCents = toCents(actualRollup[category.id]?.total || 0)
    const categoryBudget = toCents(budgetRollup[category.id]?.total || 0)
    categories.push({
      id: category.id,
      name: category.name,
      depth: 0,
      actualCents,
      budgetCents: categoryBudget,
      state: categoryBudgetState(fromCents(actualCents), fromCents(categoryBudget)),
    })
    for (const child of category.children) {
      const childActual = toCents(actualRollup[child.id]?.own || 0)
      const childBudget = toCents(mergedBudget[child.id] || 0)
      categories.push({
        id: child.id,
        name: child.name,
        depth: 1,
        actualCents: childActual,
        budgetCents: childBudget,
        state: categoryBudgetState(fromCents(childActual), fromCents(childBudget)),
      })
    }
  }

  const names = new Map(source.projects.map((project) => [project.id, `${project.jobNumber} ${project.jobName}`]))
  const recentCosts = [...costs]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      projectId: row.project_id,
      label: row.description || row.vendor || row.employee_name || 'Cost',
      date: row.date,
      amountCents: toCents(row.cost),
      projectLabel: names.get(row.project_id) || '',
    }))
  const recentInvoices = [...invoices]
    .sort((a, b) => b.date_billed.localeCompare(a.date_billed) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      projectId: row.project_id,
      label: row.invoice_number,
      date: row.date_billed,
      amountCents: toCents(row.amount),
      projectLabel: names.get(row.project_id) || '',
    }))
  const recentOrders = [...orders]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      projectId: row.project_id,
      label: row.name,
      date: row.created_at || '',
      amountCents: toCents(row.additional_contract_value),
      projectLabel: names.get(row.project_id) || '',
    }))

  return {
    contractCents,
    budgetCents,
    costCents,
    invoicedCents,
    collectedCents,
    profitCents,
    margin: grossProfitPercent(fromCents(invoicedCents), fromCents(costCents)),
    projects,
    categories,
    costBurn: monthlyBurn(costs.map((row) => ({ date: row.date, cost: fromCents(toCents(row.cost)) }))),
    invoiceBurn: monthlyBurn(invoices.map((row) => ({ date: row.date_billed, cost: fromCents(toCents(row.amount)) }))),
    recentCosts,
    recentInvoices,
    recentOrders,
  }
}
