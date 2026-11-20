import { formatCurrency, formatHours, formatPercent } from '@/lib/format'
import { renderStructuredReportPdf, type StructuredPdfReport } from '@/lib/pdf-report'
import { formatGenerated, type ResolvedRange } from './date-range'
import { reportToCsv } from './export-csv'
import { reportToXlsx } from './export-xlsx'
import type { BuiltReport, ReportCell, ReportColumn } from './types'

export function exportBasename(reportKey: string, range: ResolvedRange): string {
  const from = range.from || 'all'
  const to = range.to || 'time'
  return `protrack-${reportKey}-${from}-${to}`
}

function display(column: ReportColumn | undefined, value: ReportCell): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number') {
    if (column?.kind === 'money') return formatCurrency(value)
    if (column?.kind === 'percent') return formatPercent(value)
    if (column?.kind === 'hours') return formatHours(value)
    return String(value)
  }
  return value
}

export function toStructuredPdf(report: BuiltReport, company: string, generated: string): StructuredPdfReport {
  return {
    title: report.title,
    company,
    rangeLabel: report.rangeLabel,
    generatedOn: generated,
    filters: report.filters,
    kpis: report.kpis.map((kpi) => ({ label: kpi.label, value: kpi.value, detail: kpi.detail })),
    notes: report.notes,
    sections: report.sections.map((section) => ({
      title: section.title,
      columns: section.columns.map((column) => column.label),
      rows: section.rows.map((row) => row.cells.map((value, index) => display(section.columns[index], value))),
      rowDepth: section.rows.map((row) => row.depth || 0),
      totals: section.totals?.map((value, index) => display(section.columns[index], value)),
      fitOnePage: section.fitOnePage,
    })),
  }
}

export async function renderReportFile(
  report: BuiltReport,
  format: 'pdf' | 'csv' | 'xlsx',
  company: string,
  generatedAt: Date,
  timeZone: string,
  range: ResolvedRange,
): Promise<{ body: Uint8Array; contentType: string; filename: string }> {
  const generated = formatGenerated(generatedAt, timeZone)
  const base = exportBasename(report.key, range)
  if (format === 'csv') {
    const csv = reportToCsv(report, company, generated)
    return { body: new TextEncoder().encode(csv), contentType: 'text/csv; charset=utf-8', filename: `${base}.csv` }
  }
  if (format === 'xlsx') {
    const body = await reportToXlsx(report, company, generated)
    return {
      body,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${base}.xlsx`,
    }
  }
  const body = await renderStructuredReportPdf(toStructuredPdf(report, company, generated))
  return { body, contentType: 'application/pdf', filename: `${base}.pdf` }
}

export function filenameFor(reportKey: string, range: ResolvedRange, format: 'pdf' | 'csv' | 'xlsx'): string {
  return `${exportBasename(reportKey, range)}.${format}`
}
