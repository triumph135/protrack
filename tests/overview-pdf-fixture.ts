import { formatCurrency } from '../lib/format.ts'
import type { PdfReport } from '../lib/pdf-report.ts'

const money = (amount: number) => formatCurrency(amount)

/** A project overview with the usual KPI row, alerts, trend, and five recent lines. */
export function overviewPdfFixture(categoryCount: number): PdfReport {
  const names = ['Material', 'Labor', 'Direct labor', 'Indirect labor', 'Equipment', 'Subcontractor', 'Others', 'Consumable', 'Cap leases']
  const rows: string[][] = []
  for (let index = 0; index < categoryCount; index += 1) {
    const child = index > 0 && index % 4 === 0
    const name = child ? `  ${names[index % names.length]} ${index + 1}` : `${names[index % names.length]} ${index + 1}`
    const budget = 8000 + index * 250
    const actual = 400 + index * 125
    rows.push([name, money(budget), money(actual), money(budget - actual)])
  }
  return {
    overview: true,
    title: 'Project overview',
    company: 'Acme Test',
    project: 'JOB-A-001 — Acme Test Job',
    generatedOn: '2026-11-20',
    filters: ['Scope: this project', 'Gross profit is invoiced minus cost'],
    columns: ['Category', 'Budget', 'Actual', 'Remaining'],
    rows,
    totals: [
      { label: 'Contract', value: '$112,000.00' },
      { label: 'Gross profit (invoiced minus cost)', value: `${money(-2534.5)} (-110.2%)` },
    ],
    visual: {
      kpis: [
        { label: 'Contract', value: '$112,000.00', detail: '$100,000.00 base · $12,000.00 change orders' },
        { label: 'Cost to date', value: '$4,834.50' },
        { label: 'Budget', value: '$48,000.00', detail: '$43,165.50 remaining' },
        { label: 'Gross profit', value: money(-2534.5), detail: 'Invoiced minus cost · -110.2%' },
        { label: 'Invoiced', value: '$2,300.00', detail: '$109,700.00 not billed' },
        { label: 'Collected', value: '$900.00', detail: '$1,400.00 outstanding' },
      ],
      alerts: [
        'Subcontractor is nearing its budget ($2,200.00 of $8,000.00).',
        'Equipment is over budget ($1,100.00 of $1,000.00).',
      ],
      series: {
        title: 'Cost trend',
        points: [
          { label: '06', value: 800 },
          { label: '07', value: 1400 },
          { label: '08', value: 2100 },
          { label: '09', value: 3200 },
          { label: '10', value: 4100 },
          { label: '11', value: 4834 },
        ],
      },
      activity: [
        {
          title: 'Latest costs',
          lines: [
            'Nov 18, 2026  Grinding discs  $64.50',
            'Nov 12, 2026  Steel plate  $250.00',
            'Nov 4, 2026  Crew overtime  $480.00',
            'Oct 28, 2026  Pump rental  $175.00',
            'Oct 21, 2026  Mobilization  $300.00',
            'Oct 2, 2026  This sixth line stays off the page',
          ],
        },
        {
          title: 'Latest invoices',
          lines: [
            'Nov 15, 2026  INV-A-002  $1,800.00',
            'Oct 30, 2026  INV-A-001  $500.00',
            'Oct 12, 2026  INV-A-003  $640.00',
            'Sep 28, 2026  INV-A-004  $220.00',
            'Sep 9, 2026  INV-A-005  $90.00',
          ],
        },
        {
          title: 'Change orders',
          lines: [
            'CO-4 Added paving  $4,200.00',
            'CO-3 Night work  $2,800.00',
            'CO-2 Extra crew  $1,500.00',
            'CO-1 Mobilization  $900.00',
          ],
        },
      ],
    },
  }
}
