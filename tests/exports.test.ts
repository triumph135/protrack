import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toCsv } from '../lib/csv.ts'
import { categoryBudgetState, grossProfitPercent, monthlyBurn } from '../lib/overview.ts'
import { rollupCategoryAmounts, type CostCategoryRecord } from '../lib/categories.ts'
import { renderReportPdf } from '../lib/pdf-report.ts'

describe('csv export', () => {
  it('writes one header row, raw numbers, and ISO dates', () => {
    const csv = toCsv(
      ['Date', 'Details', 'Amount'],
      [
        ['2026-01-15', 'Steel, plate', 250],
        ['2026-02-02', 'Crew', 100.5],
      ],
    )
    assert.equal(csv, 'Date,Details,Amount\n2026-01-15,"Steel, plate",250\n2026-02-02,Crew,100.5')
  })
})

describe('category rollups', () => {
  it('rolls child actuals and budgets into the parent', () => {
    const categories = [
      { id: 'lab', parent_id: null },
      { id: 'direct', parent_id: 'lab' },
      { id: 'indirect', parent_id: 'lab' },
    ] as CostCategoryRecord[]
    const actual = rollupCategoryAmounts(categories, { lab: 100, direct: 40, indirect: 25 })
    const budget = rollupCategoryAmounts(categories, { lab: 1000, direct: 400, indirect: 200 })
    assert.equal(actual.lab.own, 100)
    assert.equal(actual.lab.total, 165)
    assert.equal(actual.direct.total, 40)
    assert.equal(budget.lab.total, 1600)
    assert.equal(categoryBudgetState(165, 1600), 'within')
    assert.equal(categoryBudgetState(1400, 1600), 'near')
    assert.equal(categoryBudgetState(1700, 1600), 'over')
    assert.equal(categoryBudgetState(10, 0), 'unset')
  })
})

describe('overview math', () => {
  it('builds a monthly burn and a gross-profit percent', () => {
    const burn = monthlyBurn([
      { date: '2026-01-15', cost: 250 },
      { date: '2026-01-20', cost: 50 },
      { date: '2026-02-02', cost: 100 },
    ])
    assert.deepEqual(burn, [
      { month: '2026-01', added: 300, cumulative: 300 },
      { month: '2026-02', added: 100, cumulative: 400 },
    ])
    assert.equal(grossProfitPercent(2300, 4834.5)?.toFixed(1), '-110.2')
    assert.equal(grossProfitPercent(0, 10), null)
  })
})

describe('pdf export', () => {
  it('writes a vector report with the dashboard sections and no embedded image', async () => {
    const plain = await renderReportPdf({
      title: 'Costs',
      company: 'Acme Test',
      project: 'JOB-A-001 - Acme Test Job',
      generatedOn: '2026-11-18',
      filters: ['Search: none'],
      columns: ['Category', 'Amount'],
      rows: [['Material', '250.00']],
      totals: [{ label: 'Total', value: '250.00' }],
    })
    const bytes = await renderReportPdf({
      title: 'Project overview',
      company: 'Acme Test',
      project: 'JOB-A-001 - Acme Test Job',
      generatedOn: '2026-11-18',
      filters: ['Scope: this project'],
      columns: ['Category', 'Budget', 'Actual', 'Remaining'],
      rows: [['Material', '$10,000.00', '$250.00', '$9,750.00']],
      totals: [{ label: 'Contract', value: '$112,000.00' }],
      visual: {
        kpis: [
          { label: 'Contract', value: '$112,000.00', detail: '$100,000.00 base' },
          { label: 'Cost to date', value: '$4,834.50' },
          { label: 'Collected', value: '$900.00' },
        ],
        alerts: ['Subcontractor is nearing its budget ($2,200.00 of $8,000.00).'],
        bars: { title: 'Budget versus actual', items: [{ label: 'Material', actual: 250, budget: 10000, caption: '$250.00 / $10,000.00' }] },
        series: { title: 'Cost trend', points: [{ label: '01', value: 300 }, { label: '02', value: 400 }] },
        activity: [{ title: 'Latest costs', lines: ['2026-02-07 Grinding discs $64.50'] }],
      },
    })
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-')
    assert.equal(Buffer.from(bytes).includes('/Subtype /Image'), false)
    assert.equal(Buffer.from(bytes).includes('/DCTDecode'), false)
    assert.ok(bytes.length > plain.length)
  })
})
