import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aggregatePortfolio, budgetsFromLegacy } from '../lib/portfolio-overview.ts'
import { buildActivity, buildPortfolio } from '../lib/reports/compute.ts'
import { toCents } from '../lib/reports/money.ts'
import type { ReportCategory, ReportCost, ReportDataset, ReportInvoice, ReportParams } from '../lib/reports/types.ts'

const allTime: ReportParams = { range: 'all_time', projects: 'all', project_status: 'all' }

function category(id: string, name: string, extra: Partial<ReportCategory> = {}): ReportCategory {
  return { id, name, kind: 'standard', parent_id: null, builtin_key: null, sort_order: 1, is_hidden: false, ...extra }
}

function cost(partial: Partial<ReportCost> & Pick<ReportCost, 'id' | 'cost' | 'date'>): ReportCost {
  return {
    project_id: 'p1',
    category_id: 'materials',
    category: 'material',
    vendor: null,
    invoice_number: null,
    description: null,
    employee_name: null,
    employee_id: null,
    st_hours: null,
    ot_hours: null,
    dt_hours: null,
    per_diem: null,
    mob_qty: null,
    change_order_id: null,
    reversal_of_id: null,
    reversed_at: null,
    reversal_reason: null,
    created_at: `${partial.date}T15:00:00Z`,
    ...partial,
  }
}

function invoice(partial: Partial<ReportInvoice> & Pick<ReportInvoice, 'id' | 'amount' | 'date_billed'>): ReportInvoice {
  return {
    project_id: 'p1',
    invoice_number: partial.id,
    amount_collected: 0,
    change_order_id: null,
    reversal_of_id: null,
    reversal_reason: null,
    created_at: `${partial.date_billed}T15:00:00Z`,
    ...partial,
  }
}

const categories = [
  category('materials', 'Materials', { builtin_key: 'material', sort_order: 1 }),
  category('lumber', 'Lumber', { parent_id: 'materials', sort_order: 2 }),
  category('labor', 'Labor', { kind: 'labor', builtin_key: 'labor', sort_order: 3 }),
]

function dataset(extra: Partial<ReportDataset> = {}): ReportDataset {
  return {
    companyName: 'Acme Test',
    timezone: 'America/New_York',
    generatedAt: '2026-06-15T15:00:00Z',
    useCategoryBudgets: true,
    invoicesRead: true,
    isMaster: true,
    projects: [
      { id: 'p1', jobNumber: 'JOB-A-001', jobName: 'Acme Test Job', customer: 'Acme', status: 'Active', totalContractValue: 10000 },
      { id: 'p2', jobNumber: 'JOB-A-002', jobName: 'Second job', customer: 'Acme', status: 'Active', totalContractValue: 4000 },
    ],
    categories,
    costs: [],
    invoices: [],
    changeOrders: [],
    events: [],
    attachments: [],
    employees: [],
    budgets: [],
    legacyBudgets: [],
    actors: {},
    gpGoalPercent: null,
    ...extra,
  }
}

function centsOf(report: { kpis: Array<{ label: string; cents?: number }> }, label: string) {
  const found = report.kpis.find((item) => item.label === label)
  assert.ok(found, label)
  assert.equal(typeof found.cents, 'number')
  return found.cents as number
}

describe('all-projects overview', () => {
  const costs = [
    cost({ id: 'lumber', cost: 100, date: '2026-03-01', category_id: 'lumber', description: 'Framing' }),
    cost({ id: 'lumber-rev', cost: -40, date: '2026-03-04', category_id: 'lumber', reversal_of_id: 'lumber', description: 'Returned lumber' }),
    cost({ id: 'labor', cost: 50, date: '2026-04-02', category_id: 'labor', employee_name: 'Alex Rivera' }),
    cost({ id: 'p2-mat', project_id: 'p2', cost: 25, date: '2026-05-01', category_id: 'materials', description: 'Screws' }),
  ]
  const invoices = [
    invoice({ id: 'inv', amount: 200, amount_collected: 80, date_billed: '2026-04-01' }),
    invoice({ id: 'credit', project_id: 'p1', amount: -20, amount_collected: 0, date_billed: '2026-04-15', reversal_of_id: 'inv' }),
  ]
  const data = dataset({
    costs,
    invoices,
    changeOrders: [{ id: 'co1', project_id: 'p1', name: 'Added bay', additional_contract_value: 1000, created_at: '2026-02-01T15:00:00Z' }],
    budgets: [
      { project_id: 'p1', category_id: 'materials', amount: 500 },
      { project_id: 'p1', category_id: 'lumber', amount: 200 },
      { project_id: 'p1', category_id: 'labor', amount: 1000 },
      { project_id: 'p2', category_id: 'materials', amount: 300 },
    ],
  })

  it('matches the portfolio report and the sum of each project', () => {
    const portfolio = buildPortfolio(data, allTime)
    const activity = buildActivity(data, allTime)
    const overview = aggregatePortfolio(data)

    assert.equal(overview.costCents, centsOf(portfolio, 'Cost'))
    assert.equal(overview.invoicedCents, centsOf(portfolio, 'Invoiced'))
    assert.equal(overview.contractCents, centsOf(portfolio, 'Contract'))
    assert.equal(overview.budgetCents, centsOf(portfolio, 'Budget'))
    assert.equal(overview.profitCents, centsOf(portfolio, 'Gross profit'))
    assert.equal(overview.costCents, centsOf(activity, 'Costs'))
    assert.equal(overview.invoicedCents, centsOf(activity, 'Invoiced'))
    assert.equal(overview.profitCents, centsOf(activity, 'Gross profit'))

    assert.equal(overview.projects.reduce((sum, project) => sum + project.costCents, 0), overview.costCents)
    assert.equal(overview.projects.reduce((sum, project) => sum + project.invoicedCents, 0), overview.invoicedCents)
    assert.equal(overview.projects.reduce((sum, project) => sum + project.contractCents, 0), overview.contractCents)
    assert.equal(overview.projects.reduce((sum, project) => sum + project.budgetCents, 0), overview.budgetCents)
    assert.equal(overview.projects.reduce((sum, project) => sum + project.profitCents, 0), overview.profitCents)

    const first = overview.projects[0]
    assert.equal(first.costCents, 11000)
    assert.equal(first.invoicedCents, 18000)
    assert.equal(first.collectedCents, 8000)
    assert.equal(first.contractCents, 1100000)
    assert.equal(first.budgetCents, 170000)
    assert.equal(first.profitCents, 7000)
    assert.equal(overview.projects[1].invoicedCents, 0)
    assert.equal(overview.projects[1].margin, null)
    assert.equal(overview.margin != null, true)

    const materials = overview.categories.find((line) => line.id === 'materials')
    const lumber = overview.categories.find((line) => line.id === 'lumber')
    assert.equal(materials?.actualCents, 8500)
    assert.equal(lumber?.actualCents, 6000)
    assert.equal(materials?.budgetCents, 100000)
  })

  it('keeps a hundred projects equal to the portfolio totals', () => {
    const projects = Array.from({ length: 100 }, (_, index) => ({
      id: `p${index}`,
      jobNumber: `JOB-${index}`,
      jobName: `Job ${index}`,
      customer: 'Acme',
      status: 'Active',
      totalContractValue: 1000,
    }))
    const manyCosts = projects.map((project, index) => cost({
      id: `c${index}`,
      project_id: project.id,
      cost: index % 5 === 0 ? -15 : 40,
      date: `2026-${String((index % 12) + 1).padStart(2, '0')}-02`,
      category_id: index % 2 === 0 ? 'materials' : 'labor',
    }))
    const manyInvoices = projects.map((project, index) => invoice({
      id: `i${index}`,
      project_id: project.id,
      amount: index % 7 === 0 ? -10 : 80,
      amount_collected: 20,
      date_billed: `2026-${String((index % 12) + 1).padStart(2, '0')}-15`,
    }))
    const wide = dataset({
      projects,
      costs: manyCosts,
      invoices: manyInvoices,
      budgets: projects.map((project) => ({ project_id: project.id, category_id: 'materials', amount: 500 })),
    })
    const overview = aggregatePortfolio(wide)
    const portfolio = buildPortfolio(wide, allTime)
    assert.equal(overview.projects.length, 100)
    assert.equal(overview.costCents, centsOf(portfolio, 'Cost'))
    assert.equal(overview.invoicedCents, centsOf(portfolio, 'Invoiced'))
    assert.equal(overview.budgetCents, centsOf(portfolio, 'Budget'))
    assert.equal(overview.contractCents, centsOf(portfolio, 'Contract'))
    assert.equal(overview.projects.reduce((sum, project) => sum + project.costCents, 0), overview.costCents)
    assert.equal(overview.projects.reduce((sum, project) => sum + project.invoicedCents, 0), overview.invoicedCents)
    assert.equal(overview.costCents, toCents(manyCosts.reduce((sum, row) => sum + Number(row.cost), 0)))
  })

  it('reads legacy budget columns the same way as the portfolio report', () => {
    const legacy = dataset({
      useCategoryBudgets: false,
      budgets: [],
      legacyBudgets: [{ project_id: 'p1', material_budget: 800, labor_budget: 100 }],
      costs: [cost({ id: 'one', cost: 10, date: '2026-01-02' })],
    })
    const fromColumns = budgetsFromLegacy(legacy.categories, legacy.legacyBudgets)
    const overview = aggregatePortfolio({ ...legacy, budgets: fromColumns })
    const portfolio = buildPortfolio(legacy, allTime)
    assert.equal(overview.budgetCents, centsOf(portfolio, 'Budget'))
    assert.equal(overview.budgetCents, 90000)
  })
})
