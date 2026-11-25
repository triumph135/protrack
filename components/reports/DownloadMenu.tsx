'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DownloadMenu({ onDownload, disabled }: { onDownload: (format: 'pdf' | 'csv' | 'xlsx') => void; disabled?: boolean }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          Download
          <ChevronDown className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="z-50 min-w-40 rounded-lg border border-border bg-card p-1 text-sm shadow-lg" align="end" sideOffset={6}>
          <DropdownMenu.Item className="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-muted" onSelect={() => onDownload('pdf')}>PDF</DropdownMenu.Item>
          <DropdownMenu.Item className="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-muted" onSelect={() => onDownload('csv')}>CSV</DropdownMenu.Item>
          <DropdownMenu.Item className="cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-muted" onSelect={() => onDownload('xlsx')}>Excel</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
