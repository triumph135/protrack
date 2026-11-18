import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface PdfReport {
  title: string
  company: string
  project?: string
  generatedOn: string
  filters: string[]
  columns: string[]
  rows: string[][]
  totals: Array<{ label: string; value: string }>
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 48

function wrap(text: string, width: number, size: number, measure: (value: string, size: number) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (measure(next, size) <= width) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines.slice(0, 3)
}

export async function renderReportPdf(report: PdfReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const measure = (value: string, size: number) => font.widthOfTextAtSize(value, size)
  const columns = Math.max(report.columns.length, 1)
  const tableWidth = PAGE_WIDTH - MARGIN * 2
  const colWidth = tableWidth / columns
  const ink = rgb(0.09, 0.1, 0.12)
  const muted = rgb(0.32, 0.34, 0.38)
  const line = rgb(0.82, 0.84, 0.86)
  const pages: ReturnType<PDFDocument['addPage']>[] = []

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  pages.push(page)
  let y = PAGE_HEIGHT - MARGIN

  const ensure = (needed: number) => {
    if (y - needed >= 56) return
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    pages.push(page)
    y = PAGE_HEIGHT - MARGIN
    drawHeader(false)
  }

  const drawHeader = (full: boolean) => {
    page.drawText('ProTrack', { x: MARGIN, y, size: 11, font: bold, color: rgb(0.11, 0.3, 0.65) })
    y -= 18
    page.drawText(report.title, { x: MARGIN, y, size: full ? 18 : 14, font: bold, color: ink })
    y -= 16
    page.drawText(report.company, { x: MARGIN, y, size: 10, font, color: ink })
    y -= 13
    if (report.project) {
      page.drawText(report.project, { x: MARGIN, y, size: 10, font, color: muted })
      y -= 13
    }
    page.drawText(report.generatedOn, { x: MARGIN, y, size: 9, font, color: muted })
    y -= 14
    if (full && report.filters.length > 0) {
      page.drawText(`Filters: ${report.filters.join(' · ')}`, { x: MARGIN, y, size: 9, font, color: muted })
      y -= 16
    }
    y -= 6
  }

  drawHeader(true)

  const drawRow = (cells: string[], header: boolean) => {
    const wrapped = cells.map((cell) => wrap(cell || '', colWidth - 8, header ? 9 : 8, header
      ? (value, size) => bold.widthOfTextAtSize(value, size)
      : measure))
    const lineCount = Math.max(1, ...wrapped.map((item) => item.length))
    const height = lineCount * 11 + 8
    ensure(height)
    page.drawRectangle({ x: MARGIN, y: y - height + 4, width: tableWidth, height, color: header ? rgb(0.94, 0.95, 0.96) : rgb(1, 1, 1) })
    page.drawLine({ start: { x: MARGIN, y: y - height + 4 }, end: { x: MARGIN + tableWidth, y: y - height + 4 }, thickness: 0.4, color: line })
    wrapped.forEach((item, index) => {
      item.forEach((text, lineIndex) => {
        page.drawText(text, {
          x: MARGIN + index * colWidth + 4,
          y: y - 12 - lineIndex * 11,
          size: header ? 9 : 8,
          font: header ? bold : font,
          color: ink,
        })
      })
    })
    y -= height
  }

  if (report.columns.length > 0) drawRow(report.columns, true)
  for (const row of report.rows) drawRow(row, false)

  y -= 16
  for (const total of report.totals) {
    ensure(16)
    page.drawText(`${total.label}: ${total.value}`, { x: MARGIN, y, size: 10, font: bold, color: ink })
    y -= 14
  }

  pages.forEach((item, index) => {
    item.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: MARGIN,
      y: 28,
      size: 9,
      font,
      color: muted,
    })
  })

  return doc.save()
}
