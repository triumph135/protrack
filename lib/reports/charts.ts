import type { BuiltReport, ReportCell, ReportColumn, ReportSection } from './types'

export interface ChartPoint {
  label: string
  value: number
}

export interface ReportChartSeries {
  bars: { title: string; points: ChartPoint[] } | null
  line: { title: string; points: ChartPoint[] } | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const COST_TYPES = new Set(['Cost', 'Labor', 'Cost reversal'])

function numeric(value: ReportCell | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function moneyIndex(columns: ReportColumn[]): number {
  const preferred = ['net', 'actual', 'amount', 'cost']
  for (const key of preferred) {
    const index = columns.findIndex((column) => column.kind === 'money' && (column.key === key || column.label.toLowerCase().includes(key)))
    if (index >= 0) return index
  }
  return columns.findIndex((column) => column.kind === 'money' && !/budget|variance|gross entered|reversal/i.test(column.label))
}

export function monthBucket(value: string): { key: string; label: string } | null {
  const text = value.trim()
  const iso = /^(\d{4})-(\d{2})/.exec(text)
  if (iso) {
    const month = Number(iso[2])
    if (month < 1 || month > 12) return null
    return { key: `${iso[1]}-${iso[2]}`, label: `${MONTHS[month - 1]} ${iso[1]}` }
  }
  const named = /^([A-Za-z]+)\s+(?:\d{1,2},?\s+)?(\d{4})$/.exec(text)
  if (!named) return null
  const month = MONTHS.findIndex((item) => named[1].toLowerCase().startsWith(item.toLowerCase()))
  if (month < 0) return null
  const mm = String(month + 1).padStart(2, '0')
  return { key: `${named[2]}-${mm}`, label: `${MONTHS[month]} ${named[2]}` }
}

function barsFromSections(sections: ReportSection[]): ReportChartSeries['bars'] {
  const splitJobs = sections.filter((section) => section.totals && section.columns.some((column) => column.key === 'actual'))
  if (splitJobs.length > 1) {
    const index = moneyIndex(splitJobs[0].columns)
    return {
      title: 'Actual by job',
      points: splitJobs.map((section) => ({
        label: section.title.split('·').pop()?.trim() || section.title,
        value: numeric(section.totals?.[index]) ?? 0,
      })),
    }
  }
  const section = sections.find((item) => moneyIndex(item.columns) >= 0 && item.columns.some((column) => column.kind === 'text'))
  if (!section) return null
  const labelIndex = section.columns.findIndex((column) => column.kind === 'text')
  const valueIndex = moneyIndex(section.columns)
  const points = section.rows
    .filter((row) => !row.depth)
    .map((row) => ({ label: String(row.cells[labelIndex] ?? ''), value: numeric(row.cells[valueIndex]) ?? 0 }))
    .filter((point) => point.label && point.label !== 'Total')
  if (points.length === 0) return null
  const title = section.columns[valueIndex]?.label === 'Actual' ? 'Actual by category' : `${section.columns[valueIndex]?.label || 'Amount'} by ${section.columns[labelIndex]?.label.toLowerCase() || 'row'}`
  return { title, points }
}

function lineFromSections(sections: ReportSection[]): ReportChartSeries['line'] {
  const monthly = sections.find((section) => section.columns.some((column) => column.key === 'month'))
  if (monthly) {
    const labelIndex = monthly.columns.findIndex((column) => column.key === 'month')
    const valueIndex = moneyIndex(monthly.columns)
    if (valueIndex < 0) return null
    const points = monthly.rows
      .map((row) => {
        const bucket = monthBucket(String(row.cells[labelIndex] ?? ''))
        return bucket ? { key: bucket.key, label: bucket.label, value: numeric(row.cells[valueIndex]) ?? 0 } : null
      })
      .filter((point): point is { key: string; label: string; value: number } => !!point)
      .sort((a, b) => a.key.localeCompare(b.key))
    return points.length ? { title: 'Amount by month', points } : null
  }

  const buckets = new Map<string, { label: string; value: number }>()
  let found = false
  for (const section of sections) {
    const dateIndex = section.columns.findIndex((column) => column.key === 'date' || column.label === 'Date')
    const valueIndex = moneyIndex(section.columns)
    if (dateIndex < 0 || valueIndex < 0) continue
    const typeIndex = section.columns.findIndex((column) => column.key === 'type')
    found = true
    for (const row of section.rows) {
      if (typeIndex >= 0 && !COST_TYPES.has(String(row.cells[typeIndex] ?? ''))) continue
      const bucket = monthBucket(String(row.cells[dateIndex] ?? ''))
      const amount = numeric(row.cells[valueIndex])
      if (!bucket || amount == null) continue
      const current = buckets.get(bucket.key) || { label: bucket.label, value: 0 }
      current.value += amount
      buckets.set(bucket.key, current)
    }
  }
  if (!found || buckets.size === 0) return null
  const points = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, point]) => point)
  return { title: 'Cost by month', points }
}

/** Chart points copied from the report tables, so the picture matches the export. */
export function reportCharts(report: BuiltReport): ReportChartSeries {
  return {
    bars: barsFromSections(report.sections),
    line: lineFromSections(report.sections),
  }
}
