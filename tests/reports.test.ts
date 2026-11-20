import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PDFDocument } from 'pdf-lib'
import ExcelJS from 'exceljs'
import { grossProfit, grossProfitPercent } from '../lib/overview.ts'
import { buildActivity, buildCustom, buildJobCostSummary, buildPortfolio, buildReport, buildVendorSpend } from '../lib/reports/compute.ts'
import { parseCustomConfig } from '../lib/reports/custom.ts'
import { companyToday, resolveRange } from '../lib/reports/date-range.ts'
import { applyDelivery, runOutcome } from '../lib/reports/delivery.ts'
import { EMAIL_NOT_SET_UP, EMAIL_OFF, resolveEmailTransport } from '../lib/reports/email-mode.ts'
import { reportToCsv } from '../lib/reports/export-csv.ts'
import { reportToXlsx } from '../lib/reports/export-xlsx.ts'
import { toStructuredPdf } from '../lib/reports/files.ts'
import { renderStructuredReportPdf } from '../lib/pdf-report.ts'
import { vendorDisplayName, vendorKey } from '../lib/reports/vendor.ts'
import type { ReportCategory, ReportCost, ReportDataset, ReportInvoice, ReportParams } from '../lib/reports/types.ts'

const TZ = 'America/New_York'
const NOW = new Date('2026-06-15T15:00:00Z')

function category(id: string, name: string, extra: Partial<ReportCategory> = {}): ReportCategory {
  return {
    id,
    name,
    kind: 'standard',
    parent_id: null,
    builtin_key: null,
    sort_order: 1,
    is_hidden: false,
    ...extra,
  }
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

function dataset(extra: Partial<ReportDataset> = {}): ReportDataset {
  return {
    companyName: 'Acme Test',
    timezone: TZ,
    generatedAt: NOW.toISOString(),
    useCategoryBudgets: true,
    invoicesRead: true,
    isMaster: true,
    projects: [{ id: 'p1', jobNumber: 'JOB-A-001', jobName: 'Acme Test Job', customer: 'Acme Customer', status: 'Active', totalContractValue: 10000 }],
    categories: [
      category('materials', 'Materials', { builtin_key: 'material', sort_order: 1 }),
      category('lumber', 'Lumber', { parent_id: 'materials', sort_order: 2 }),
      category('labor', 'Labor', { kind: 'labor', builtin_key: 'labor', sort_order: 3 }),
    ],
    costs: [],
    invoices: [],
    changeOrders: [],
    events: [],
    attachments: [],
    employees: [{ id: 'e1', name: 'Alex Rivera', job_role: 'Welder' }],
    budgets: [{ project_id: 'p1', category_id: 'materials', amount: 500 }, { project_id: 'p1', category_id: 'lumber', amount: 200 }],
    legacyBudgets: [],
    actors: { u1: 'Ada Master' },
    gpGoalPercent: 20,
    laborFields: [],
    ...extra,
  }
}

const allTime: ReportParams = { range: 'all_time', projects: 'all', project_status: 'all' }

function kpi(report: { kpis: Array<{ label: string; value: string; detail?: string }> }, label: string) {
  const found = report.kpis.find((item) => item.label === label)
  assert.ok(found, label)
  return found
}

describe('report date ranges', () => {
  it('keeps New Year morning in the previous local date', () => {
    const instant = new Date('2026-01-01T03:30:00Z')
    assert.deepEqual(companyToday(instant, TZ), { year: 2025, month: 12, day: 31 })
    const ytd = resolveRange({ range: 'ytd' }, TZ, instant)
    assert.equal(ytd.from, '2025-01-01')
    assert.equal(ytd.to, '2025-12-31')
  })

  it('covers each preset, including a leap day and last quarter in Q1', () => {
    const leapNow = new Date('2024-02-15T15:00:00Z')
    assert.equal(resolveRange({ range: 'this_month' }, TZ, leapNow).to, '2024-02-29')
    assert.equal(resolveRange({ range: 'this_year' }, TZ, leapNow).to, '2024-12-31')
    const q1 = new Date('2026-02-01T15:00:00Z')
    const lastQuarter = resolveRange({ range: 'last_quarter' }, TZ, q1)
    assert.equal(lastQuarter.from, '2025-10-01')
    assert.equal(lastQuarter.to, '2025-12-31')
    const yearBoundary = resolveRange({ range: 'last_year' }, TZ, new Date('2026-01-01T05:00:00Z'))
    assert.equal(yearBoundary.from, '2025-01-01')
    assert.equal(yearBoundary.to, '2025-12-31')
    assert.equal(resolveRange({ range: 'this_quarter' }, TZ, NOW).from, '2026-04-01')
    assert.equal(resolveRange({ range: 'last_30_days' }, TZ, NOW).from, '2026-05-17')
    assert.equal(resolveRange({ range: 'year:2025' }, TZ, NOW).from, '2025-01-01')
    assert.equal(resolveRange({ range: 'all_time' }, TZ, NOW).from, null)
    const custom = resolveRange({ range: 'custom', from: '2024-02-29', to: '2024-03-01' }, TZ, NOW)
    assert.equal(custom.from, '2024-02-29')
    assert.throws(() => resolveRange({ range: 'custom', from: '2026-02-02', to: '2026-02-01' }, TZ, NOW), /on or before/)
    assert.throws(() => resolveRange({ range: 'custom', from: '2010-01-01', to: '2026-01-02' }, TZ, NOW), /10 years/)
  })
})

describe('vendor names and netting', () => {
  it('folds case and spacing and breaks ties by code point', () => {
    assert.equal(vendorKey('  HOME   Depot '), 'home depot')
    assert.equal(vendorDisplayName(['home depot', 'Home Depot', 'Home Depot']), 'Home Depot')
    assert.equal(vendorDisplayName(['B Store', 'A Store']), 'A Store')
    assert.equal(vendorDisplayName([null, '  ']), '(No vendor)')
  })

  it('nets a full reversal to zero, keeps a partial, and drops a netted pair only when asked', () => {
    const rows = [
      cost({ id: 'full', cost: 25, date: '2026-03-01', category_id: 'lumber' }),
      cost({ id: 'full-rev', cost: -25, date: '2026-03-02', category_id: 'lumber', reversal_of_id: 'full', reversal_reason: 'Wrong ticket' }),
      cost({ id: 'part', cost: 100, date: '2026-03-03', category_id: 'lumber' }),
      cost({ id: 'part-rev', cost: -40, date: '2026-03-04', category_id: 'lumber', reversal_of_id: 'part', reversal_reason: 'Returned lumber' }),
      cost({ id: 'labor-row', cost: 360, date: '2026-03-05', category_id: 'labor', employee_id: 'e1', employee_name: 'Alex Rivera', st_hours: 8, vendor: 'Should not count' }),
      cost({ id: 'labor-rev', cost: -90, date: '2026-03-06', category_id: 'labor', employee_id: 'e1', employee_name: 'Alex Rivera', st_hours: -2, reversal_of_id: 'labor-row' }),
    ]
    const report = buildActivity(dataset({ costs: rows }), { ...allTime, hide_netted_pairs: false })
    assert.equal(kpi(report, 'Costs').value, '$330.00')
    const section = report.sections[0]
    assert.equal(section.totals?.[4], 330)
    const detail = report.sections.find((item) => item.title === 'Chronological detail')
    assert.ok(detail?.rows.some((row) => String(row.cells[4]).includes('Reversal of')))
    const detailReport = buildReport(dataset({ costs: rows }), 'cost_detail', { ...allTime, hide_netted_pairs: true })
    const amounts = detailReport.sections.flatMap((item) => item.rows.map((row) => row.cells.at(-1)))
    assert.equal(amounts.includes(25), false)
    assert.equal(amounts.includes(-25), false)
    assert.equal(amounts.includes(100), true)
  })

  it('lets a credit memo reduce invoiced and leaves gross profit percent blank when invoiced is not positive', () => {
    const invoices: ReportInvoice[] = [
      { id: 'inv', project_id: 'p1', invoice_number: 'INV-1', amount: 200, amount_collected: 50, date_billed: '2026-04-01', change_order_id: null, reversal_of_id: null, reversal_reason: null, created_at: '2026-04-01T15:00:00Z' },
      { id: 'cm', project_id: 'p1', invoice_number: 'CM-1', amount: -200, amount_collected: 0, date_billed: '2026-04-02', change_order_id: null, reversal_of_id: 'inv', reversal_reason: 'Billing error', created_at: '2026-04-02T15:00:00Z' },
    ]
    const costs = [cost({ id: 'c', cost: 80, date: '2026-04-01', category_id: 'lumber' })]
    const report = buildActivity(dataset({ costs, invoices }), allTime)
    assert.equal(kpi(report, 'Invoiced').value, '$0.00')
    assert.equal(kpi(report, 'Credit memos').value, '-$200.00')
    const profit = kpi(report, 'Gross profit')
    assert.equal(profit.value, '-$80.00')
    assert.equal(profit.detail, undefined)
    assert.equal(grossProfitPercent(0, 80), null)
    assert.equal(grossProfit(0, 80), -80)
  })

  it('combines Home Depot spellings and leaves labor out of vendor spend', () => {
    const costs = [
      cost({ id: 'a', cost: 10, date: '2026-01-02', vendor: 'Home Depot', category_id: 'lumber' }),
      cost({ id: 'b', cost: 15, date: '2026-01-03', vendor: 'Home Depot', category_id: 'lumber' }),
      cost({ id: 'c', cost: 5, date: '2026-01-04', vendor: 'HOME  DEPOT', category_id: 'materials' }),
      cost({ id: 'd', cost: 999, date: '2026-01-05', vendor: 'Home Depot', category_id: 'labor' }),
    ]
    const report = buildVendorSpend(dataset({ costs }), allTime)
    assert.equal(report.sections[0].rows.length, 1)
    assert.equal(report.sections[0].rows[0].cells[0], 'Home Depot')
    assert.equal(report.sections[0].rows[0].cells[4], 30)
    assert.equal(report.sections[0].rows[0].vendorKey, 'home depot')
  })
})

describe('prebuilt totals', () => {
  it('matches job cost summary actual to the category rollup and portfolio cost to the same rows', () => {
    const costs = [
      cost({ id: 'parent', cost: 50, date: '2026-02-01', category_id: 'materials' }),
      cost({ id: 'child', cost: 30, date: '2026-02-02', category_id: 'lumber' }),
    ]
    const data = dataset({ costs, invoices: [{ id: 'inv', project_id: 'p1', invoice_number: 'INV', amount: 200, amount_collected: 10, date_billed: '2026-02-03', change_order_id: null, reversal_of_id: null, reversal_reason: null, created_at: null }] })
    const summary = buildJobCostSummary(data, { ...allTime, per_project_sections: false })
    const actual = summary.sections[0].totals?.[2]
    assert.equal(actual, 80)
    assert.equal(summary.sections[0].rows[0].cells[0], 'Materials')
    assert.equal(summary.sections[0].rows[0].cells[2], 80)
    assert.equal(summary.sections[0].rows[1].cells[2], 30)
    const portfolio = buildPortfolio(data, allTime)
    const costKpi = kpi(portfolio, 'Cost')
    assert.equal(costKpi.value, '$80.00')
    assert.equal(kpi(summary, 'Gross profit').value, grossProfit(200, 80).toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
    const activity = buildActivity(data, allTime)
    assert.equal(activity.sections[0].totals?.[4], 80)
    assert.equal(kpi(activity, 'Costs').value, '$80.00')
  })

  it('fits a 20-category job cost summary on one PDF page', async () => {
    const categories = []
    const costs = []
    const budgets = []
    for (let index = 1; index <= 20; index += 1) {
      const parent = `p${index}`
      const child = `c${index}`
      categories.push(category(parent, `Category ${index}`, { sort_order: index }))
      categories.push(category(child, `Child ${index}`, { parent_id: parent, sort_order: index }))
      costs.push(cost({ id: `cost-${index}`, cost: index, date: '2026-01-15', category_id: child }))
      budgets.push({ project_id: 'p1', category_id: parent, amount: 100 })
    }
    const report = buildJobCostSummary(dataset({ categories, costs, budgets, invoices: [] }), { ...allTime, per_project_sections: true })
    assert.equal(report.sections[0].rows.length, 40)
    const pdf = await renderStructuredReportPdf(toStructuredPdf(report, 'Acme Test', 'Jun 15, 2026'))
    const loaded = await PDFDocument.load(pdf)
    assert.equal(loaded.getPageCount(), 1)
  })
})

describe('custom reports and exports', () => {
  it('rejects unknown sources, columns, and reversal-only filters', () => {
    assert.throws(() => parseCustomConfig({ source: 'payroll', columns: ['amount'] }), /data source/)
    assert.throws(() => parseCustomConfig({ source: 'costs', columns: ['secret'] }), /Unknown column/)
    assert.throws(() => parseCustomConfig({ source: 'costs', columns: ['amount'], filters: { hideReversals: true } }), /reversal/)
    assert.throws(() => parseCustomConfig({ source: 'costs', columns: ['amount'], groupBy: ['vendor', 'month', 'year'] }), /at most two/)
    const config = parseCustomConfig({ source: 'costs', columns: ['vendor', 'amount'], groupBy: ['vendor', 'month'] })
    const report = buildCustom(dataset({
      costs: [
        cost({ id: 'a', cost: 10, date: '2026-01-02', vendor: 'Home Depot', category_id: 'lumber' }),
        cost({ id: 'b', cost: 5, date: '2026-01-20', vendor: 'home depot', category_id: 'lumber' }),
      ],
    }), config, 'Vendor months')
    assert.equal(report.title, 'Vendor months')
    assert.equal(report.sections[0].rows.length, 1)
    assert.equal(report.sections[0].rows[0].cells[0], 'Home Depot')
  })

  it('writes a CSV preamble and an Excel currency cell', async () => {
    const report = buildActivity(dataset({
      costs: [cost({ id: 'q', cost: 12.5, date: '2026-05-01', description: 'Quote, "steel"', category_id: 'lumber' })],
    }), allTime)
    const csv = reportToCsv(report, 'Acme, Test', 'Jun 15, 2026')
    const lines = csv.split('\n')
    assert.equal(lines[0], 'Activity for a period')
    assert.equal(lines[1], '"Acme, Test"')
    assert.match(lines[2], /Generated Jun 15, 2026/)
    assert.match(csv, /Quote, ""steel""/)
    const bytes = await reportToXlsx(report, 'Acme Test', 'Jun 15, 2026')
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer)
    const summary = book.getWorksheet('Summary')
    assert.equal(summary?.getCell('B1').value, 'Activity for a period')
    const detail = book.worksheets.find((sheet) => sheet.name.startsWith('Chronological'))
    assert.ok(detail)
    const values = detail.getColumn(6).values
    assert.ok(values.some((value) => value === 12.5))
  })
})

describe('email delivery', () => {
  const base = {
    id: 'delivery-1',
    userId: 'u1',
    email: 'pm@example.test',
    status: 'pending' as const,
    error: null,
    resendId: null,
    unsubscribed: false,
    inactive: false,
    emptyScope: false,
  }
  const mail = async () => ({
    subject: 'Activity: Last year',
    html: '<p>Activity</p>',
    text: 'Activity',
    attachments: [{ filename: 'report.pdf', content: new Uint8Array([1, 2, 3]) }],
    bytes: 3,
  })

  it('skips when email is not set up and logs without calling send', async () => {
    assert.deepEqual(resolveEmailTransport({ REPORTS_EMAIL_MODE: 'off' }), { kind: 'unconfigured', reason: EMAIL_NOT_SET_UP })
    assert.equal(resolveEmailTransport({ REPORTS_EMAIL_MODE: 'send' }).kind, 'unconfigured')
    assert.equal(resolveEmailTransport({ REPORTS_EMAIL_MODE: 'off', RESEND_API_KEY: 'key' }).reason, EMAIL_OFF)
    assert.equal(resolveEmailTransport({ REPORTS_EMAIL_MODE: 'log' }).kind, 'log')
    const skipped = await applyDelivery({
      delivery: base,
      transport: { kind: 'unconfigured', reason: EMAIL_NOT_SET_UP },
      render: mail,
      send: async () => { throw new Error('should not send') },
      headers: {},
    })
    assert.equal(skipped.status, 'skipped')
    assert.equal(skipped.error, EMAIL_NOT_SET_UP)
    let key = ''
    const logged = await applyDelivery({
      delivery: base,
      transport: { kind: 'log' },
      render: mail,
      send: async (request) => { key = request.idempotencyKey; return { id: 'nope' } },
      headers: {},
    })
    assert.equal(logged.status, 'sent')
    assert.equal(key, '')
    const sent = await applyDelivery({
      delivery: base,
      transport: { kind: 'send', apiKey: 'key', from: 'ProTrack Reports <reports@protrackusa.com>' },
      render: mail,
      send: async (request) => { key = request.idempotencyKey; return { id: 're_1' } },
      headers: {},
    })
    assert.equal(key, 'delivery-1')
    assert.equal(sent.resendId, 're_1')
    const huge = await applyDelivery({
      delivery: base,
      transport: { kind: 'send', apiKey: 'key', from: 'from' },
      render: async () => ({ ...(await mail()), bytes: 10 * 1024 * 1024 + 1 }),
      send: async () => ({ id: null }),
      headers: {},
    })
    assert.equal(huge.status, 'failed')
    assert.match(huge.error || '', /too large to email/)
    assert.equal(runOutcome([{ status: 'sent' }, { status: 'skipped' }]), 'partial')
    assert.equal(runOutcome([{ status: 'skipped' }]), 'skipped')
  })
})
