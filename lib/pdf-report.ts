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
  depth?: number
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
  rowDepth?: number[]
  totals: Array<{ label: string; value: string }>
  visual?: PdfVisual
  /** Project and company overview. One US Letter page when the table is a typical size. */
  overview?: boolean
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
    .replace(/\u00B7/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
}

function childRow(cells: string[], explicit?: number): { depth: number; cells: string[] } {
  if (explicit && explicit > 0) return { depth: explicit, cells }
  const label = cells[0] || ''
  if (!label.startsWith('  ')) return { depth: 0, cells }
  return { depth: 1, cells: [label.replace(/^ +/, ''), ...cells.slice(1)] }
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

/** Keep a trailing currency amount when a recent-activity line is wider than its column. */
function fitKeepingAmount(text: string, width: number, size: number, font: PDFFont): string {
  const value = pdfText(text)
  if (font.widthOfTextAtSize(value, size) <= width) return value
  const amount = value.match(/(\$-?[\d,]+\.\d{2})\s*$/)
  if (!amount || amount.index == null) return fit(value, width, size, font)
  const suffix = amount[1]
  const prefixBudget = width - font.widthOfTextAtSize(` ${suffix}`, size)
  if (prefixBudget <= font.widthOfTextAtSize('...', size)) return fit(value, width, size, font)
  let head = value.slice(0, amount.index).trimEnd()
  while (head.length > 1 && font.widthOfTextAtSize(`${head}...`, size) > prefixBudget) head = head.slice(0, -1)
  return `${head}... ${suffix}`
}

export async function renderReportPdf(report: PdfReport): Promise<Uint8Array> {
  if (report.overview) return renderOverviewPdf(report)
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
  const drawRow = (cells: string[], header: boolean, depth = 0) => {
    const nested = !header && depth > 0
    const face = header ? bold : font
    const size = nested ? 7 : 8
    const indent = nested ? 16 : 0
    const wrapped = cells.map((cell, index) => wrap(cell || '', colWidth - 8 - (index === 0 ? indent : 0), size, (value, fontSize) => face.widthOfTextAtSize(pdfText(value), fontSize)))
    const lineCount = Math.max(1, ...wrapped.map((item) => item.length))
    const height = lineCount * 10 + 8
    ensure(height)
    page.drawRectangle({ x: MARGIN, y: y - height + 4, width: contentWidth, height, color: header ? rgb(0.94, 0.95, 0.96) : rgb(1, 1, 1), borderColor: line, borderWidth: 0.3 })
    if (nested) {
      const railX = MARGIN + 6
      const mid = y - height / 2 + 2
      page.drawLine({ start: { x: railX, y: y + 2 }, end: { x: railX, y: y - height + 2 }, thickness: 0.7, color: line })
      page.drawLine({ start: { x: railX, y: mid }, end: { x: railX + 8, y: mid }, thickness: 0.7, color: line })
    }
    wrapped.forEach((item, index) => {
      item.forEach((text, lineIndex) => {
        page.drawText(text, {
          x: MARGIN + index * colWidth + 4 + (index === 0 ? indent : 0),
          y: y - 11 - lineIndex * 10,
          size,
          font: face,
          color: nested ? muted : ink,
        })
      })
    })
    y -= height
  }

  if (report.columns.length > 0) {
    heading('Details')
    drawRow(report.columns, true)
    report.rows.forEach((row, index) => {
      const marked = childRow(row, report.rowDepth?.[index])
      drawRow(marked.cells, false, marked.depth)
    })
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
      const nested = (item.depth || 0) > 0 || item.label.startsWith('  ')
      const label = nested ? item.label.replace(/^ +/, '') : item.label
      const indent = nested ? 14 : 0
      ensure(16)
      if (nested) {
        const railX = MARGIN + 2
        page.drawLine({ start: { x: railX, y: y + 2 }, end: { x: railX, y: y - 12 }, thickness: 0.7, color: line })
        page.drawLine({ start: { x: railX, y: y - 5 }, end: { x: railX + 8, y: y - 5 }, thickness: 0.7, color: line })
      }
      page.drawText(fit(label, labelW - indent - 6, nested ? 7 : 8, font), { x: MARGIN + indent, y: y - 8, size: nested ? 7 : 8, font, color: nested ? muted : ink })
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

const OVERVIEW_MARGIN = 28
const OVERVIEW_FOOTER = 34

/** Row size for the category table. Shrinks as the list grows, and stops at 7pt. */
function overviewRowStyle(count: number): { size: number; pitch: number } {
  if (count <= 8) return { size: 8, pitch: 12 }
  if (count <= 12) return { size: 7.5, pitch: 11 }
  if (count <= 16) return { size: 7, pitch: 10 }
  return { size: 7, pitch: 9.5 }
}

async function renderOverviewPdf(report: PdfReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const contentWidth = PAGE_WIDTH - OVERVIEW_MARGIN * 2
  const pages: PDFPage[] = []
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  pages.push(page)
  let y = PAGE_HEIGHT - OVERVIEW_MARGIN
  let repeatingTable = false

  const drawPageHeader = (continued: boolean) => {
    page.drawText('ProTrack', { x: OVERVIEW_MARGIN, y, size: 8, font: bold, color: blue })
    const stamp = pdfText(continued ? `${report.generatedOn}  ·  continued` : report.generatedOn)
    page.drawText(stamp, {
      x: PAGE_WIDTH - OVERVIEW_MARGIN - font.widthOfTextAtSize(stamp, 7),
      y,
      size: 7,
      font,
      color: muted,
    })
    y -= 12
    page.drawText(fit(report.title, contentWidth, 12, bold), { x: OVERVIEW_MARGIN, y, size: 12, font: bold, color: ink })
    y -= 12
    page.drawText(fit(report.company, contentWidth, 8, font), { x: OVERVIEW_MARGIN, y, size: 8, font, color: ink })
    y -= 10
    if (report.project) {
      page.drawText(fit(report.project, contentWidth, 7.5, font), { x: OVERVIEW_MARGIN, y, size: 7.5, font, color: muted })
      y -= 9
    }
    if (!continued && report.filters.length > 0) {
      page.drawText(fit(report.filters.join('   |   '), contentWidth, 7, font), { x: OVERVIEW_MARGIN, y, size: 7, font, color: muted })
      y -= 9
    }
    page.drawLine({
      start: { x: OVERVIEW_MARGIN, y: y - 1 },
      end: { x: PAGE_WIDTH - OVERVIEW_MARGIN, y: y - 1 },
      thickness: 0.6,
      color: line,
    })
    y -= 10
  }

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    pages.push(page)
    y = PAGE_HEIGHT - OVERVIEW_MARGIN
    drawPageHeader(true)
    if (repeatingTable) drawColumnHeader()
  }

  const ensure = (needed: number) => {
    if (y - needed >= OVERVIEW_FOOTER) return
    newPage()
  }

  const columns = report.columns.length > 0 ? report.columns : []
  const weights = columns.map((_, index) => (index === 0 ? 1.7 : 1))
  const weightSum = weights.reduce((sum, value) => sum + value, 0) || 1
  const columnWidth = (index: number) => (contentWidth * weights[index]) / weightSum

  const drawColumnHeader = () => {
    const pitch = 11
    page.drawRectangle({
      x: OVERVIEW_MARGIN,
      y: y - pitch + 2,
      width: contentWidth,
      height: pitch,
      color: rgb(0.94, 0.95, 0.96),
    })
    let x = OVERVIEW_MARGIN
    columns.forEach((label, index) => {
      const width = columnWidth(index)
      page.drawText(fit(label, width - 6, 7, bold), { x: x + 3, y: y - 7, size: 7, font: bold, color: ink })
      x += width
    })
    y -= pitch
  }

  drawPageHeader(false)
  drawOverviewVisual(report.visual)

  const marked = report.rows.map((row, index) => childRow(row, report.rowDepth?.[index]))
  let style = overviewRowStyle(marked.length)
  const tableChrome = 22 + report.totals.length * 10 + 8
  if (marked.length * style.pitch > y - OVERVIEW_FOOTER - tableChrome) {
    style = { size: 7, pitch: 9.5 }
  }
  if (columns.length > 0) {
    ensure(14 + 11)
    page.drawText('Details', { x: OVERVIEW_MARGIN, y, size: 8, font: bold, color: ink })
    y -= 11
    repeatingTable = true
    drawColumnHeader()
    for (const row of marked) {
      ensure(style.pitch)
      const nested = row.depth > 0
      const size = style.size
      let x = OVERVIEW_MARGIN
      if (nested) {
        page.drawLine({
          start: { x: OVERVIEW_MARGIN + 4, y: y + 1 },
          end: { x: OVERVIEW_MARGIN + 4, y: y - style.pitch + 2 },
          thickness: 0.6,
          color: line,
        })
      }
      row.cells.forEach((cell, index) => {
        const width = columnWidth(index)
        const indent = index === 0 && nested ? 10 : 0
        page.drawText(fit(cell || '', width - 6 - indent, size, font), {
          x: x + 3 + indent,
          y: y - size - 1.5,
          size,
          font,
          color: nested ? muted : ink,
        })
        x += width
      })
      page.drawLine({
        start: { x: OVERVIEW_MARGIN, y: y - style.pitch + 1 },
        end: { x: PAGE_WIDTH - OVERVIEW_MARGIN, y: y - style.pitch + 1 },
        thickness: 0.25,
        color: line,
      })
      y -= style.pitch
    }
    repeatingTable = false
  }

  if (report.totals.length > 0) y -= 6
  for (const total of report.totals) {
    ensure(11)
    page.drawText(fit(`${total.label}: ${total.value}`, contentWidth, 8, bold), {
      x: OVERVIEW_MARGIN,
      y,
      size: 8,
      font: bold,
      color: ink,
    })
    y -= 10
  }

  pages.forEach((item, index) => {
    item.drawLine({
      start: { x: OVERVIEW_MARGIN, y: 24 },
      end: { x: PAGE_WIDTH - OVERVIEW_MARGIN, y: 24 },
      thickness: 0.4,
      color: line,
    })
    item.drawText(`Page ${index + 1} of ${pages.length}`, { x: OVERVIEW_MARGIN, y: 14, size: 7, font, color: muted })
  })

  return doc.save()

  function drawOverviewVisual(visual: PdfVisual | undefined) {
    if (!visual) return
    if (visual.kpis && visual.kpis.length > 0) drawKpiRow(visual.kpis)
    if (visual.alerts && visual.alerts.length > 0) drawAlertColumns(visual.alerts)
    const series = visual.series && visual.series.points.length > 0 ? visual.series : null
    const activity = visual.activity && visual.activity.length > 0 ? visual.activity : null
    if (series || activity) drawTrendAndActivity(series, activity)
  }

  function drawKpiRow(kpis: PdfKpi[]) {
    const gap = 4
    const perRow = Math.min(6, kpis.length)
    for (let start = 0; start < kpis.length; start += perRow) {
      const slice = kpis.slice(start, start + perRow)
      const cardW = (contentWidth - gap * (slice.length - 1)) / slice.length
      const detailWidth = cardW - 8
      const details = slice.map((kpi) => (kpi.detail ? wrap(kpi.detail, detailWidth, 7, (value, size) => font.widthOfTextAtSize(pdfText(value), size)).slice(0, 2) : []))
      const detailRows = Math.max(0, ...details.map((lines) => lines.length))
      const cardH = 24 + (detailRows > 0 ? detailRows * 8 + 2 : 0)
      ensure(cardH + 4)
      slice.forEach((kpi, column) => {
        const x = OVERVIEW_MARGIN + column * (cardW + gap)
        page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, color: card, borderColor: line, borderWidth: 0.4 })
        page.drawText(fit(kpi.label, cardW - 8, 7, font), { x: x + 4, y: y - 9, size: 7, font, color: muted })
        const valueSize = bold.widthOfTextAtSize(pdfText(kpi.value), 8) <= cardW - 8 ? 8 : 7
        page.drawText(fit(kpi.value, cardW - 8, valueSize, bold), { x: x + 4, y: y - 20, size: valueSize, font: bold, color: ink })
        details[column].forEach((lineText, lineIndex) => {
          page.drawText(lineText, { x: x + 4, y: y - 30 - lineIndex * 8, size: 7, font, color: muted })
        })
      })
      y -= cardH + 4
    }
  }

  function drawAlertColumns(alerts: string[]) {
    const rowH = 10
    const rows = Math.ceil(alerts.length / 2)
    const blockH = 14 + rows * rowH
    ensure(blockH + 2)
    page.drawRectangle({
      x: OVERVIEW_MARGIN,
      y: y - blockH + 2,
      width: contentWidth,
      height: blockH,
      color: alertFill,
      borderColor: alertEdge,
      borderWidth: 0.4,
    })
    page.drawText('Alerts', { x: OVERVIEW_MARGIN + 4, y: y - 9, size: 7, font: bold, color: ink })
    const colW = (contentWidth - 16) / 2
    alerts.forEach((alert, index) => {
      const column = index % 2
      const row = Math.floor(index / 2)
      page.drawText(fit(alert, colW - 6, 7, font), {
        x: OVERVIEW_MARGIN + 4 + column * (colW + 8),
        y: y - 20 - row * rowH,
        size: 7,
        font,
        color: ink,
      })
    })
    y -= blockH + 4
  }

  function drawTrendAndActivity(
    series: { title: string; points: PdfPoint[] } | null,
    activity: PdfActivity[] | null,
  ) {
    const gap = 8
    const split = series && activity
    const chartW = split ? contentWidth * 0.4 : contentWidth
    const activityW = split ? contentWidth - chartW - gap : contentWidth
    const lineCount = Math.max(1, ...(activity || []).map((column) => Math.min(5, Math.max(column.lines.length, 1))))
    const bandH = Math.max(series ? 64 : 0, activity ? 36 + lineCount * 9 : 0)
    ensure(bandH + 2)
    const top = y
    if (series) drawSeriesBox(OVERVIEW_MARGIN, top, chartW, bandH, series.title, series.points)
    if (activity) drawActivityBox(OVERVIEW_MARGIN + (series ? chartW + gap : 0), top, activityW, bandH, activity)
    y -= bandH + 6
  }

  function drawSeriesBox(x: number, top: number, width: number, height: number, title: string, points: PdfPoint[]) {
    page.drawText(fit(title, width, 8, bold), { x, y: top - 8, size: 8, font: bold, color: ink })
    const plotBottom = top - height + 12
    const plotTop = top - 14
    const plotH = Math.max(16, plotTop - plotBottom)
    page.drawLine({ start: { x, y: plotBottom }, end: { x: x + width, y: plotBottom }, thickness: 0.4, color: line })
    const max = Math.max(1, ...points.map((point) => point.value))
    const maxLabel = fit(String(Math.round(max)), 40, 7, font)
    page.drawText(maxLabel, { x, y: plotTop - 8, size: 7, font, color: muted })
    const step = points.length <= 1 ? 0 : width / (points.length - 1)
    let previous: { x: number; y: number } | null = null
    let lastLabelRight = x - 4
    points.forEach((point, index) => {
      const px = x + index * step
      const py = plotBottom + (point.value / max) * (plotH - 10)
      if (previous) page.drawLine({ start: previous, end: { x: px, y: py }, thickness: 1.1, color: blue })
      page.drawRectangle({ x: px - 1.1, y: py - 1.1, width: 2.2, height: 2.2, color: blue })
      const label = fit(point.label, 24, 7, font)
      const labelWidth = font.widthOfTextAtSize(label, 7)
      let labelX = Math.min(Math.max(x, px - labelWidth / 2), x + width - labelWidth)
      const lastPoint = index === points.length - 1
      if (labelX >= lastLabelRight + 1 || lastPoint) {
        if (lastPoint && labelX < lastLabelRight + 1) labelX = Math.min(x + width - labelWidth, lastLabelRight + 1)
        if (labelX >= x && labelX + labelWidth <= x + width + 0.5) {
          page.drawText(label, { x: labelX, y: plotBottom - 9, size: 7, font, color: muted })
          lastLabelRight = labelX + labelWidth
        }
      }
      previous = { x: px, y: py }
    })
  }

  function drawActivityBox(x: number, top: number, width: number, height: number, columns: PdfActivity[]) {
    page.drawRectangle({ x, y: top - height, width, height, color: card, borderColor: line, borderWidth: 0.4 })
    page.drawText('Recent activity', { x: x + 4, y: top - 10, size: 8, font: bold, color: ink })
    const gap = 6
    const colW = (width - 8 - gap * (columns.length - 1)) / Math.max(columns.length, 1)
    columns.forEach((column, index) => {
      const cx = x + 4 + index * (colW + gap)
      page.drawText(fit(column.title, colW, 7, bold), { x: cx, y: top - 21, size: 7, font: bold, color: ink })
      const lines = (column.lines.length > 0 ? column.lines : ['None']).slice(0, 5)
      lines.forEach((entry, lineIndex) => {
        page.drawText(fitKeepingAmount(entry, colW, 7, font), { x: cx, y: top - 32 - lineIndex * 9, size: 7, font, color: muted })
      })
    })
  }
}
