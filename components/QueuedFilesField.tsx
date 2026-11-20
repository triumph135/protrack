'use client'

import { useRef } from 'react'
import { Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function QueuedFilesField({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Attachments</p>
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          <Paperclip className="h-3.5 w-3.5" />
          Add files
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          const picked = Array.from(event.target.files || [])
          if (picked.length) onChange([...files, ...picked])
          event.target.value = ''
        }}
      />
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Files upload when this entry is saved.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, item) => item !== index))}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
