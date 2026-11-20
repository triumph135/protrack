import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { describe, it } from 'node:test'
import { toCsv } from '../lib/csv.ts'
import { categoryBudgetState, grossProfitPercent, monthlyBurn } from '../lib/overview.ts'
import { rollupCategoryAmounts, type CostCategoryRecord } from '../lib/categories.ts'
import { PDFDocument } from 'pdf-lib'
import { formatCurrency } from '../lib/format.ts'
import { pdfText, renderReportPdf } from '../lib/pdf-report.ts'
import { overviewPdfFixture } from './overview-pdf-fixture.ts'

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

  it('puts a minus sign before the dollar sign', () => {
    assert.equal(formatCurrency(-2534.5), '-$2,534.50')
    assert.equal(formatCurrency(112000), '$112,000.00')
    assert.equal(pdfText('$-2,534.50'), '-$2,534.50')
    assert.equal(pdfText('Gross profit $-2,534.50'), 'Gross profit -$2,534.50')
  })

  it('fits a 7-category overview on one letter page and keeps a 20-category overview readable', async () => {
    const seven = await renderReportPdf(overviewPdfFixture(7))
    const twenty = await renderReportPdf(overviewPdfFixture(20))
    const sevenPages = (await PDFDocument.load(seven)).getPageCount()
    const twentyPages = (await PDFDocument.load(twenty)).getPageCount()
    assert.equal(sevenPages, 1)
    assert.equal(twentyPages, 1)
    const text = pdfPlainText(seven)
    assert.ok(text.includes('-$2,534.50'))
    assert.equal(text.includes('$-'), false)
    assert.ok(text.includes('Jun'))
    assert.ok(text.includes('Nov'))
    assert.ok(text.includes('$4,834.00'))
    assert.ok(text.includes('INV-A-002'))
    assert.ok(text.includes('INV-A-005'))
    assert.equal(text.includes('sixth line'), false)
    const overflow = await renderReportPdf(overviewPdfFixture(60))
    assert.ok((await PDFDocument.load(overflow)).getPageCount() >= 2)
  })
})

function pdfPlainText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes)
  const parts: string[] = []
  let offset = 0
  while (offset < raw.length) {
    const start = raw.indexOf('stream', offset)
    if (start < 0) break
    let dataStart = start + 'stream'.length
    if (raw[dataStart] === 0x0d && raw[dataStart + 1] === 0x0a) dataStart += 2
    else if (raw[dataStart] === 0x0a) dataStart += 1
    else {
      offset = start + 'stream'.length
      continue
    }
    const end = raw.indexOf('endstream', dataStart)
    if (end < 0) break
    const body = raw.subarray(dataStart, end)
    let text = ''
    try {
      text = inflateSync(body).toString('latin1')
    } catch {
      text = body.toString('latin1')
    }
    parts.push(text.replace(/<([0-9A-Fa-f]+)>/g, (_, hex: string) => Buffer.from(hex, 'hex').toString('latin1')))
    offset = end + 'endstream'.length
  }
  return parts.join('\n')
}
