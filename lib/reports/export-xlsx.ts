import type { BuiltReport, ReportCell, ReportColumn } from './types'

function sheetName(title: string, used: Set<string>): string {
  const cleaned = title.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet'
  const base = cleaned.slice(0, 31)
  let name = base
  let n = 2
  while (used.has(name)) {
    const suffix = ` ${n}`
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`
    n += 1
  }
  used.add(name)
  return name
}

function widthFor(values: string[]): number {
  const longest = values.reduce((max, value) => Math.max(max, value.length), 8)
  return Math.min(60, Math.max(10, longest + 2))
}

function numberValue(column: ReportColumn | undefined, value: ReportCell): string | number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  return value
}

export async function reportToXlsx(report: BuiltReport, company: string, generated: string): Promise<Uint8Array> {
  const imported = await import('exceljs')
  const ExcelJS = ('default' in imported && imported.default ? imported.default : imported) as typeof import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ProTrack'
  const used = new Set<string>()
  const summary = workbook.addWorksheet(sheetName('Summary', used))
  summary.addRow(['Report', report.title])
  summary.addRow(['Company', company])
  summary.addRow(['Range', report.rangeLabel])
  summary.addRow(['Generated', generated])
  summary.addRow([])
  summary.addRow(['KPI', 'Value', 'Detail']).font = { bold: true }
  for (const kpi of report.kpis) summary.addRow([kpi.label, kpi.value, kpi.detail || ''])
  summary.getRow(6).font = { bold: true }
  summary.views = [{ state: 'frozen', ySplit: 6 }]
  summary.columns = [
    { width: widthFor(['Report', ...report.kpis.map((kpi) => kpi.label)]) },
    { width: widthFor(report.kpis.map((kpi) => kpi.value)) },
    { width: widthFor(report.kpis.map((kpi) => kpi.detail || '')) },
  ]

  for (const section of report.sections) {
    const sheet = workbook.addWorksheet(sheetName(section.title, used))
    const header = sheet.addRow(section.columns.map((column) => column.label))
    header.font = { bold: true }
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } }
    })
    const body = [...section.rows.map((row) => row.cells), ...(section.totals ? [section.totals] : [])]
    body.forEach((row, rowIndex) => {
      const added = sheet.addRow(row.map((value, index) => numberValue(section.columns[index], value)))
      section.columns.forEach((column, index) => {
        const cell = added.getCell(index + 1)
        if (column.kind === 'money' && typeof cell.value === 'number') cell.numFmt = '"$"#,##0.00'
        if (column.kind === 'hours' && typeof cell.value === 'number') cell.numFmt = '0.00'
        if (column.kind === 'percent' && typeof cell.value === 'number') cell.numFmt = '0.0'
      })
      if (section.totals && rowIndex === body.length - 1) added.font = { bold: true }
    })
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.columns = section.columns.map((column, index) => ({
      width: widthFor([
        column.label,
        ...body.map((row) => (row[index] == null ? '' : String(row[index]))),
      ]),
    }))
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}
