'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { toCsv, type CsvCell } from '@/lib/csv'
import type { PdfVisual } from '@/lib/pdf-report'
import { Button } from '@/components/ui/button'

export interface ExportSpec {
  filename: string
  title: string
  company: string
  project?: string
  filters: string[]
  columns: string[]
  csvRows: CsvCell[][]
  pdfRows: string[][]
  rowDepth?: number[]
  totals: Array<{ label: string; value: string }>
  visual?: PdfVisual
  overview?: boolean
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function ExportMenu({ spec, disabled = false }: { spec: ExportSpec | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const run = async (kind: 'csv' | 'pdf') => {
    if (!spec || (kind === 'csv' && spec.csvRows.length === 0) || (kind === 'pdf' && spec.pdfRows.length === 0 && !spec.visual)) {
      toast.error('Nothing on this page to export')
      return
    }
    setBusy(true)
    try {
      if (kind === 'csv') {
        const csv = toCsv(spec.columns, spec.csvRows)
        download(`${spec.filename}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
      } else {
        const { renderReportPdf } = await import('@/lib/pdf-report')
        const bytes = await renderReportPdf({
          title: spec.title,
          company: spec.company,
          project: spec.project,
          generatedOn: new Date().toISOString().slice(0, 10),
          filters: spec.filters,
          columns: spec.columns,
          rows: spec.pdfRows,
          rowDepth: spec.rowDepth,
          totals: spec.totals,
          visual: spec.visual,
          overview: spec.overview,
        })
        download(`${spec.filename}.pdf`, new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }))
      }
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative" ref={root}>
      <Button type="button" variant="outline" aria-expanded={open} aria-haspopup="menu" disabled={disabled || busy} onClick={() => setOpen((value) => !value)}>
        <Download className="h-4 w-4" /> Export
      </Button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-[var(--shadow)]">
          <button type="button" role="menuitem" className="block min-h-11 w-full rounded-md px-3 text-left text-sm hover:bg-muted" onClick={() => run('csv')}>CSV</button>
          <button type="button" role="menuitem" className="block min-h-11 w-full rounded-md px-3 text-left text-sm hover:bg-muted" onClick={() => run('pdf')}>PDF</button>
        </div>
      ) : null}
    </div>
  )
}
