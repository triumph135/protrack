import { mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { renderReportPdf } from '../lib/pdf-report.ts'
import { overviewPdfFixture } from './overview-pdf-fixture.ts'

const out = process.env.OVERVIEW_PDF_OUT || '/tmp/overview-pdf'
await mkdir(out, { recursive: true })

for (const count of [7, 20]) {
  const bytes = await renderReportPdf(overviewPdfFixture(count))
  const pages = (await PDFDocument.load(bytes)).getPageCount()
  const file = `${out}/overview-${count}.pdf`
  await writeFile(file, bytes)
  console.log(`${count} categories: ${pages} page${pages === 1 ? '' : 's'}  ${file}`)
}
