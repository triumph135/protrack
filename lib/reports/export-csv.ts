import { csvCell, toCsv, type CsvCell } from '@/lib/csv'
import type { BuiltReport, ReportCell, ReportColumn } from './types'

function cell(column: ReportColumn | undefined, value: ReportCell): CsvCell {
  if (value == null) return ''
  if (column?.kind === 'money' && typeof value === 'number') return value.toFixed(2)
  if ((column?.kind === 'hours' || column?.kind === 'percent') && typeof value === 'number') return Number(value.toFixed(2))
  return value
}

/** Three preamble lines, then one block per section with its header and totals. */
export function reportToCsv(report: BuiltReport, company: string, generated: string): string {
  const preamble = [report.title, company, `${report.rangeLabel} · Generated ${generated}`].map((line) => csvCell(line))
  const blocks = report.sections.map((section) => {
    const title = csvCell(section.title)
    const headers = section.columns.map((column) => column.label)
    const rows = section.rows.map((row) => row.cells.map((value, index) => cell(section.columns[index], value)))
    if (section.totals) rows.push(section.totals.map((value, index) => cell(section.columns[index], value)))
    return [title, toCsv(headers, rows)].join('\n')
  })
  const notes = report.notes.map((note) => csvCell(note))
  return [...preamble, '', ...blocks, '', ...notes].join('\n')
}
