'use client'

import { useMemo, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/feedback'
import { buildCategoryTree, flattenCategoryTree, type CostCategoryRecord } from '@/lib/categories'

export function MoveCostSheet({
  open,
  categories,
  currentCategoryId,
  currentKind,
  onClose,
  onConfirm,
}: {
  open: boolean
  categories: CostCategoryRecord[]
  currentCategoryId?: string | null
  currentKind?: string | null
  onClose: () => void
  onConfirm: (categoryId: string, reason: string) => Promise<void>
}) {
  const [categoryId, setCategoryId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const options = useMemo(
    () => flattenCategoryTree(buildCategoryTree(categories)).filter((row) => row.id !== currentCategoryId),
    [categories, currentCategoryId]
  )
  const selected = options.find((row) => row.id === categoryId)
  const leavingLabor = currentKind === 'labor' && selected && selected.kind !== 'labor'
  const enteringLabor = currentKind !== 'labor' && selected?.kind === 'labor'

  const save = async () => {
    if (!categoryId) {
      setError('Choose a category.')
      return
    }
    if (reason.trim().length < 3) {
      setError('Add a reason of at least 3 characters.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onConfirm(categoryId, reason.trim())
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move this entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }} title="Move to another category" description="The entry and its reversals move together. Amounts stay the same.">
      <div className="space-y-4">
          <Field label="Category" htmlFor="move-category">
            <select
              id="move-category"
              className="flex h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Choose a category</option>
              {options.map((row) => (
                <option key={row.id} value={row.id} disabled={row.children.length > 0}>
                  {`${row.depth ? '· '.repeat(row.depth) : ''}${row.name}`}
                </option>
              ))}
            </select>
          </Field>
          {leavingLabor ? (
            <Notice>This entry leaves labor. Hours and rates stay stored. The destination form is not a labor form, so those fields stay hidden.</Notice>
          ) : null}
          {enteringLabor ? (
            <Notice>This entry is moving into labor. Hours are not invented. Open the entry afterward and fill them in.</Notice>
          ) : null}
          <Field label="Reason" htmlFor="move-reason">
            <Textarea id="move-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this entry is moving" />
          </Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Moving…' : 'Move entry'}</Button>
          </div>
      </div>
    </Sheet>
  )
}
