'use client'

import { useMemo, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { formatCurrency } from '@/lib/format'
import { getTodayLocalDateString } from '@/lib/dateUtils'
import { reversalProposal, reversalStatement } from '@/lib/reversals'

export interface ReverseDraft {
  reason: string
  date: string
  amount: number
  hours?: {
    st_hours: number
    ot_hours: number
    dt_hours: number
    per_diem: number
    mob: number
    mob_qty: number
  }
}

export function ReverseSheet({
  open,
  title,
  noun,
  remaining,
  dateLabel = 'Date',
  hours,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  noun: string
  remaining: number
  dateLabel?: string
  hours?: ReverseDraft['hours']
  onClose: () => void
  onConfirm: (draft: ReverseDraft) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(getTodayLocalDateString())
  const [amount, setAmount] = useState(String(-remaining))
  const [hourValues, setHourValues] = useState(hours || null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const proposed = Number(amount)
  const statement = useMemo(() => {
    try {
      const value = reversalProposal(remaining, Number.isFinite(proposed) ? proposed : null)
      return { ...reversalStatement(remaining, value), error: null as string | null }
    } catch (cause) {
      return { netted: 0, left: remaining, error: cause instanceof Error ? cause.message : 'Check the amount' }
    }
  }, [proposed, remaining])

  const save = async () => {
    if (reason.trim().length < 3) {
      setError('Add a reason of at least 3 characters.')
      return
    }
    if (statement.error) {
      setError(statement.error)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onConfirm({
        reason: reason.trim(),
        date,
        amount: reversalProposal(remaining, proposed),
        hours: hourValues || undefined,
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not post this reversal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }} title={title} description="This posts a reversing row. The original stays in the list.">
      <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will net {formatCurrency(statement.netted)} against the original. Remaining will be {formatCurrency(statement.left)}.
          </p>
          <Field label="Reason" htmlFor="reversal-reason">
            <Textarea id="reversal-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={`Why this ${noun} is being reversed`} />
          </Field>
          <Field label={dateLabel} htmlFor="reversal-date">
            <Input id="reversal-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Amount" htmlFor="reversal-amount" error={statement.error || undefined}>
            <Input id="reversal-amount" type="number" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          {hourValues ? (
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['st_hours', 'ST hours'],
                  ['ot_hours', 'OT hours'],
                  ['dt_hours', 'DT hours'],
                  ['per_diem', 'Per diem'],
                  ['mob', 'Mob'],
                  ['mob_qty', 'Mob qty'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    type="number"
                    step="0.01"
                    value={hourValues[key]}
                    onChange={(event) => setHourValues({ ...hourValues, [key]: Number(event.target.value) })}
                  />
                </Field>
              ))}
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Posting…' : 'Post reversal'}</Button>
          </div>
      </div>
    </Sheet>
  )
}
