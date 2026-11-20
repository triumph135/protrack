'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { getTodayLocalDateString } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/format'
import { reversalPreview, reversalProposal } from '@/lib/reversals'

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

type HourFields = NonNullable<ReverseDraft['hours']>

function magnitudeText(value: number): string {
  return String(Math.abs(Math.round((Number(value) || 0) * 100) / 100))
}

function signedComponent(remaining: number, entered: string): number {
  const left = Math.round((Number(remaining) || 0) * 100) / 100
  if (left === 0) return 0
  const trimmed = entered.trim()
  return reversalProposal(left, trimmed === '' ? null : Number(trimmed))
}

export function ReverseSheet({
  open,
  title,
  noun,
  dateLabel = 'Date',
  remaining,
  hours,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  noun: string
  dateLabel?: string
  remaining: number
  hours?: HourFields
  onClose: () => void
  onConfirm: (draft: ReverseDraft) => Promise<void>
}) {
  const hourSignature = hours
    ? [hours.st_hours, hours.ot_hours, hours.dt_hours, hours.per_diem, hours.mob, hours.mob_qty].join('|')
    : ''
  const key = open ? `${remaining}|${hourSignature}` : ''
  const defaultAmount = Math.abs(remaining) === 0 ? '' : magnitudeText(remaining)
  const [form, setForm] = useState({
    key,
    reason: '',
    date: getTodayLocalDateString(),
    amount: defaultAmount,
    hours: hours
      ? {
          st_hours: magnitudeText(hours.st_hours),
          ot_hours: magnitudeText(hours.ot_hours),
          dt_hours: magnitudeText(hours.dt_hours),
          per_diem: magnitudeText(hours.per_diem),
          mob: magnitudeText(hours.mob),
          mob_qty: magnitudeText(hours.mob_qty),
        }
      : null as Record<keyof HourFields, string> | null,
    baseline: hours || null as HourFields | null,
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (form.key !== key) {
    setForm({
      key,
      reason: '',
      date: getTodayLocalDateString(),
      amount: defaultAmount,
      hours: hours
        ? {
            st_hours: magnitudeText(hours.st_hours),
            ot_hours: magnitudeText(hours.ot_hours),
            dt_hours: magnitudeText(hours.dt_hours),
            per_diem: magnitudeText(hours.per_diem),
            mob: magnitudeText(hours.mob),
            mob_qty: magnitudeText(hours.mob_qty),
          }
        : null,
      baseline: hours || null,
    })
    setError(null)
  }

  const preview = reversalPreview(remaining, form.amount)
  const setHour = (name: keyof HourFields, value: string) => {
    setForm((current) => ({ ...current, hours: { ...(current.hours || {} as Record<keyof HourFields, string>), [name]: value } }))
  }

  const save = async () => {
    setError(null)
    if (form.reason.trim().length < 3) {
      setError('Add a short reason.')
      return
    }
    if (preview.error || preview.signed == null) return
    let nextHours: ReverseDraft['hours']
    if (form.hours && form.baseline) {
      try {
        nextHours = {
          st_hours: signedComponent(form.baseline.st_hours, form.hours.st_hours),
          ot_hours: signedComponent(form.baseline.ot_hours, form.hours.ot_hours),
          dt_hours: signedComponent(form.baseline.dt_hours, form.hours.dt_hours),
          per_diem: signedComponent(form.baseline.per_diem, form.hours.per_diem),
          mob: signedComponent(form.baseline.mob, form.hours.mob),
          mob_qty: signedComponent(form.baseline.mob_qty, form.hours.mob_qty),
        }
      } catch (hourError) {
        setError(hourError instanceof Error ? hourError.message : 'Check the hours')
        return
      }
    }
    setSaving(true)
    try {
      await onConfirm({ reason: form.reason.trim(), date: form.date, amount: preview.signed, hours: nextHours })
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not post this reversal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }} title={title} description={`This posts a new row that nets against the original ${noun}. The original stays in the list.`}>
      <div className="space-y-3">
        <Field label="Reason" htmlFor="reversal-reason">
          <Textarea id="reversal-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        </Field>
        <Field label={dateLabel} htmlFor="reversal-date">
          <Input id="reversal-date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
        </Field>
        <Field label="Amount" htmlFor="reversal-amount" error={preview.error || undefined} hint="Enter a positive amount, up to the remaining balance.">
          <Input id="reversal-amount" className="tabular" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
        </Field>
        {form.hours ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ST hours"><Input className="tabular" inputMode="decimal" min="0" step="0.01" value={form.hours.st_hours} onChange={(event) => setHour('st_hours', event.target.value)} /></Field>
            <Field label="OT hours"><Input className="tabular" inputMode="decimal" min="0" step="0.01" value={form.hours.ot_hours} onChange={(event) => setHour('ot_hours', event.target.value)} /></Field>
            <Field label="DT hours"><Input className="tabular" inputMode="decimal" min="0" step="0.01" value={form.hours.dt_hours} onChange={(event) => setHour('dt_hours', event.target.value)} /></Field>
            <Field label="Per diem"><Input className="tabular" inputMode="decimal" min="0" step="0.01" value={form.hours.per_diem} onChange={(event) => setHour('per_diem', event.target.value)} /></Field>
            <Field label="Mob"><Input className="tabular" inputMode="decimal" min="0" step="0.01" value={form.hours.mob} onChange={(event) => setHour('mob', event.target.value)} /></Field>
            <Field label="Mob quantity"><Input className="tabular" inputMode="decimal" min="0" step="0.01" value={form.hours.mob_qty} onChange={(event) => setHour('mob_qty', event.target.value)} /></Field>
          </div>
        ) : null}
        {preview.error ? null : (
          <p className="text-sm text-muted-foreground">
            This will net {formatCurrency(preview.netted)} against the original. Remaining will be {formatCurrency(preview.left)}.
          </p>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !!preview.error}>{saving ? 'Posting…' : noun === 'invoice' ? 'Post credit memo' : 'Post reversal'}</Button>
        </div>
      </div>
    </Sheet>
  )
}
