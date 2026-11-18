import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export interface PdfKpi {
  label: string
  value: string
  detail?: string
}

export interface PdfBar {
  label: string
  actual: number
  budget: number
  caption: string
}

export interface PdfPoint {
  label: string
  value: number
}

export interface PdfActivity {
  title: string
  lines: string[]
}

export interface PdfVisual {
  kpis?: PdfKpi[]
  alerts?: string[]
  bars?: { title: string; items: PdfBar[] }
  series?: { title: string; points: PdfPoint[] }
  activity?: PdfActivity[]
}

export interface PdfReport {
  title: string
  company: string
  project?: string
  generatedOn: string
  filters: string[]
  columns: string[]
  rows: string[][]
  totals: Array<{ label: string; value: string }>
  visual?: PdfVisual
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 40

const ink = rgb(0.11, 0.12, 0.14)
const muted = rgb(0.33, 0.35, 0.39)
const line = rgb(0.82, 0.84, 0.86)
const blue = rgb(0.11, 0.31, 0.62)
const track = rgb(0.9, 0.91, 0.93)
const over = rgb(0.62, 0.16, 0.14)
const card = rgb(0.96, 0.97, 0.98)
const alertFill = rgb(0.99, 0.96, 0.9)
const alertEdge = rgb(0.76, 0.62, 0.28)

/** Standard fonts only encode WinAnsi. Strip the rest so a name cannot fail the export. */
export function pdfText(value: string): string {
  return value
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
}

function wrap(text: string, width: number, size: number, measure: (value: string, size: number) => number): string[] {
  const words = pdfText(text).split(/\s+/).filter(Boolean)
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
  return lines.slice(0, 4)
}

function fit(text: string, width: number, size: number, font: PDFFont): string {
  const value = pdfText(text)
  if (font.widthOfTextAtSize(value, size) <= width) return value
  let trimmed = value
  while (trimmed.length > 1 && font.widthOfTextAtSize(`${trimmed}...`, size) > width) trimmed = trimmed.slice(0, -1)
  return `${trimmed}...`
}

export async function renderReportPdf(report: PdfReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const measure = (value: string, size: number) => font.widthOfTextAtSize(pdfText(value), size)
  const contentWidth = PAGE_WIDTH - MARGIN * 2
  const pages: PDFPage[] = []

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  pages.push(page)
  let y = PAGE_HEIGHT - MARGIN

  const ensure = (needed: number) => {
    if (y - needed >= 48) return
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    pages.push(page)
    y = PAGE_HEIGHT - MARGIN
    drawHeader(false)
  }

  const drawHeader = (full: boolean) => {
    page.drawText('ProTrack', { x: MARGIN, y, size: 10, font: bold, color: blue })
    page.drawText(pdfText(report.generatedOn), { x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(pdfText(report.generatedOn), 9), y, size: 9, font, color: muted })
    y -= 18
    page.drawText(fit(report.title, contentWidth, full ? 16 : 13, bold), { x: MARGIN, y, size: full ? 16 : 13, font: bold, color: ink })
    y -= 15
    page.drawText(fit(report.company, contentWidth, 10, font), { x: MARGIN, y, size: 10, font, color: ink })
    y -= 12
    if (report.project) {
      page.drawText(fit(report.project, contentWidth, 9, font), { x: MARGIN, y, size: 9, font, color: muted })
      y -= 12
    }
    if (full && report.filters.length > 0) {
      page.drawText(fit(`Filters: ${report.filters.join('  |  ')}`, contentWidth, 8, font), { x: MARGIN, y, size: 8, font, color: muted })
      y -= 12
    }
    page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 2 }, thickness: 0.6, color: line })
    y -= 16
  }

  const heading = (text: string) => {
    ensure(20)
    page.drawText(pdfText(text), { x: MARGIN, y, size: 11, font: bold, color: ink })
    y -= 14
  }

  drawHeader(true)
  drawVisual(report.visual)

  const columns = Math.max(report.columns.length, 1)
  const colWidth = contentWidth / columns
  const drawRow = (cells: string[], header: boolean) => {
    const face = header ? bold : font
    const wrapped = cells.map((cell) => wrap(cell || '', colWidth - 8, header ? 8 : 8, (value, size) => face.widthOfTextAtSize(pdfText(value), size)))
    const lineCount = Math.max(1, ...wrapped.map((item) => item.length))
    const height = lineCount * 10 + 8
    ensure(height)
    page.drawRectangle({ x: MARGIN, y: y - height + 4, width: contentWidth, height, color: header ? rgb(0.94, 0.95, 0.96) : rgb(1, 1, 1), borderColor: line, borderWidth: 0.3 })
    wrapped.forEach((item, index) => {
      item.forEach((text, lineIndex) => {
        page.drawText(text, {
          x: MARGIN + index * colWidth + 4,
          y: y - 11 - lineIndex * 10,
          size: 8,
          font: face,
          color: ink,
        })
      })
    })
    y -= height
  }

  if (report.columns.length > 0) {
    heading('Details')
    drawRow(report.columns, true)
    for (const row of report.rows) drawRow(row, false)
  }

  y -= 14
  for (const total of report.totals) {
    ensure(14)
    page.drawText(fit(`${total.label}: ${total.value}`, contentWidth, 10, bold), { x: MARGIN, y, size: 10, font: bold, color: ink })
    y -= 13
  }

  pages.forEach((item, index) => {
    item.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: PAGE_WIDTH - MARGIN, y: 40 }, thickness: 0.4, color: line })
    item.drawText(`Page ${index + 1} of ${pages.length}`, { x: MARGIN, y: 26, size: 8, font, color: muted })
  })

  return doc.save()

  function drawVisual(visual: PdfVisual | undefined) {
    if (!visual) return
    if (visual.kpis && visual.kpis.length > 0) drawKpis(visual.kpis)
    if (visual.alerts && visual.alerts.length > 0) drawAlerts(visual.alerts)
    if (visual.bars && visual.bars.items.length > 0) drawBars(visual.bars.title, visual.bars.items)
    if (visual.series && visual.series.points.length > 0) drawSeries(visual.series.title, visual.series.points)
    if (visual.activity && visual.activity.length > 0) drawActivity(visual.activity)
  }

  function drawKpis(kpis: PdfKpi[]) {
    const gap = 8
    const cols = 3
    const cardW = (contentWidth - gap * (cols - 1)) / cols
    const cardH = 50
    for (let index = 0; index < kpis.length; index += cols) {
      ensure(cardH + gap)
      kpis.slice(index, index + cols).forEach((kpi, column) => {
        const x = MARGIN + column * (cardW + gap)
        page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, color: card, borderColor: line, borderWidth: 0.6 })
        page.drawText(fit(kpi.label, cardW - 14, 8, font), { x: x + 7, y: y - 14, size: 8, font, color: muted })
        page.drawText(fit(kpi.value, cardW - 14, 12, bold), { x: x + 7, y: y - 30, size: 12, font: bold, color: ink })
        if (kpi.detail) page.drawText(fit(kpi.detail, cardW - 14, 7, font), { x: x + 7, y: y - 42, size: 7, font, color: muted })
      })
      y -= cardH + gap
    }
    y -= 4
  }

  function drawAlerts(alerts: string[]) {
    heading('Alerts')
    for (const alert of alerts) {
      const lines = wrap(alert, contentWidth - 16, 8, measure)
      const height = lines.length * 11 + 10
      ensure(height)
      page.drawRectangle({ x: MARGIN, y: y - height + 4, width: contentWidth, height, color: alertFill, borderColor: alertEdge, borderWidth: 0.6 })
      lines.forEach((text, lineIndex) => {
        page.drawText(text, { x: MARGIN + 8, y: y - 10 - lineIndex * 11, size: 8, font, color: ink })
      })
      y -= height + 4
    }
    y -= 4
  }

  function drawBars(title: string, items: PdfBar[]) {
    heading(title)
    const labelW = 108
    const captionW = 118
    const barW = contentWidth - labelW - captionW
    const max = Math.max(1, ...items.flatMap((item) => [item.actual, item.budget]))
    for (const item of items) {
      ensure(16)
      page.drawText(fit(item.label, labelW - 6, 8, font), { x: MARGIN, y: y - 8, size: 8, font, color: ink })
      const barX = MARGIN + labelW
      page.drawRectangle({ x: barX, y: y - 9, width: barW, height: 6, color: track })
      const actualW = Math.max(0, Math.min(barW, (item.actual / max) * barW))
      if (actualW > 0) {
        page.drawRectangle({
          x: barX,
          y: y - 9,
          width: actualW,
          height: 6,
          color: item.budget > 0 && item.actual > item.budget ? over : blue,
        })
      }
      page.drawText(fit(item.caption, captionW - 6, 7, font), { x: barX + barW + 6, y: y - 8, size: 7, font, color: muted })
      y -= 14
    }
    y -= 6
  }

  function drawSeries(title: string, points: PdfPoint[]) {
    heading(title)
    const height = 88
    ensure(height + 40)
    const width = contentWidth
    const max = Math.max(1, ...points.map((point) => point.value))
    const bottom = y - height + 16
    page.drawLine({ start: { x: MARGIN, y: bottom }, end: { x: MARGIN + width, y: bottom }, thickness: 0.4, color: line })
    page.drawText(fit(String(Math.round(max)), 48, 7, font), { x: MARGIN, y: y - 8, size: 7, font, color: muted })
    const step = points.length === 1 ? 0 : width / (points.length - 1)
    let previous: { x: number; y: number } | null = null
    points.forEach((point, index) => {
      const x = MARGIN + index * step
      const py = bottom + (point.value / max) * (height - 22)
      if (previous) page.drawLine({ start: previous, end: { x, y: py }, thickness: 1.4, color: blue })
      page.drawRectangle({ x: x - 1.5, y: py - 1.5, width: 3, height: 3, color: blue })
      const label = fit(point.label, 28, 7, font)
      const labelWidth = font.widthOfTextAtSize(label, 7)
      const labelX = Math.min(Math.max(MARGIN, x - labelWidth / 2), MARGIN + width - labelWidth)
      page.drawText(label, { x: labelX, y: bottom - 14, size: 7, font, color: muted })
      previous = { x, y: py }
    })
    y = bottom - 36
  }

  function drawActivity(columns: PdfActivity[]) {
    heading('Recent activity')
    const gap = 8
    const count = Math.max(columns.length, 1)
    const colW = (contentWidth - gap * (count - 1)) / count
    const height = 78
    ensure(height)
    columns.forEach((column, index) => {
      const x = MARGIN + index * (colW + gap)
      page.drawRectangle({ x, y: y - height, width: colW, height, color: card, borderColor: line, borderWidth: 0.5 })
      page.drawText(fit(column.title, colW - 12, 8, bold), { x: x + 6, y: y - 12, size: 8, font: bold, color: ink })
      const lines = column.lines.length > 0 ? column.lines.slice(0, 4) : ['None']
      lines.forEach((entry, lineIndex) => {
        page.drawText(fit(entry, colW - 12, 7, font), { x: x + 6, y: y - 26 - lineIndex * 11, size: 7, font, color: muted })
      })
    })
    y -= height + 10
  }
}
