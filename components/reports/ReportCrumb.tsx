'use client'

import type { MouseEvent } from 'react'
import Link from 'next/link'

export function ReportCrumb({
  current,
  onNavigate,
}: {
  current: string
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/reports" onClick={onNavigate} className="font-medium text-primary">Reports</Link>
          </li>
          <li aria-hidden className="text-muted-foreground">/</li>
          <li className="truncate font-medium text-foreground">{current}</li>
        </ol>
      </nav>
      <Link
        href="/reports"
        onClick={onNavigate}
        className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/15"
      >
        ← All reports
      </Link>
    </div>
  )
}
