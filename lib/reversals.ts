/** Signed remaining on one row: its amount plus the amounts of reversals that point at it. */
export function directRemaining(amount: number, childAmounts: number[]): number {
  return money(amount + childAmounts.reduce((sum, value) => sum + Number(value || 0), 0))
}

/**
 * The amount stored on a reversal. The person types a positive amount, up to
 * the remaining balance. Null means the full remaining amount. A value that
 * already has the opposite sign of the balance is kept as the stored offset.
 * The stored amount cannot cross zero. Landing on exactly zero is allowed.
 */
export function reversalProposal(remaining: number, proposed?: number | null): number {
  const left = money(remaining)
  if (left === 0) throw new Error('Nothing left to reverse')
  if (proposed == null || Number.isNaN(Number(proposed))) return money(-left)
  const typed = money(Number(proposed))
  if (typed === 0) throw new Error('Enter an amount greater than zero')
  const signed = left > 0 && typed > 0 ? money(-typed) : left < 0 && typed < 0 ? money(-typed) : typed
  if (left > 0) {
    if (signed >= 0 || money(left + signed) < 0) {
      throw new Error('That amount would push the remaining balance past zero')
    }
  } else if (signed <= 0 || money(left + signed) > 0) {
    throw new Error('That amount would push the remaining balance past zero')
  }
  return signed
}

export function reversalPreview(remaining: number, entered: string): { signed: number | null; netted: number; left: number; error: string | null } {
  const trimmed = entered.trim()
  const typed = Number(trimmed)
  if (!trimmed || !Number.isFinite(typed)) {
    return { signed: null, netted: 0, left: money(remaining), error: 'Enter an amount greater than zero' }
  }
  try {
    const signed = reversalProposal(remaining, typed)
    const statement = reversalStatement(remaining, signed)
    return { signed, netted: statement.netted, left: statement.left, error: null }
  } catch (error) {
    const magnitude = Math.abs(money(typed))
    const signed = remaining >= 0 ? -magnitude : magnitude
    return {
      signed: null,
      netted: magnitude,
      left: money(remaining + signed),
      error: error instanceof Error ? error.message : 'Check the amount',
    }
  }
}

export function reversalStatement(remaining: number, proposed: number): { netted: number; left: number } {
  return { netted: money(Math.abs(proposed)), left: money(remaining + proposed) }
}

export interface ReversalLink {
  id: string
  reversal_of_id?: string | null
  reversed_at?: string | null
}

export type ReversalMark = 'reversed' | 'partial' | 'reversal'

export function reversalMark(row: ReversalLink, rows: ReversalLink[]): ReversalMark | null {
  if (row.reversal_of_id) return 'reversal'
  if (row.reversed_at) return 'reversed'
  if (rows.some((item) => item.reversal_of_id === row.id)) return 'partial'
  return null
}

export function canReverseRow(amount: number, childAmounts: number[], reversedAt?: string | null): boolean {
  if (reversedAt) return false
  return directRemaining(amount, childAmounts) !== 0
}

/** True when this row and the reversals hanging off its root add up to zero. */
export function chainNetsToZero(
  rowId: string,
  rows: Array<ReversalLink & { amount: number }>
): boolean {
  const byId = new Map(rows.map((row) => [row.id, row]))
  let root = rowId
  const seen = new Set<string>()
  while (byId.get(root)?.reversal_of_id && !seen.has(root)) {
    seen.add(root)
    root = byId.get(root)!.reversal_of_id as string
  }
  const ids = new Set<string>()
  const walk = (id: string) => {
    if (ids.has(id) || !byId.has(id)) return
    ids.add(id)
    for (const row of rows) {
      if (row.reversal_of_id === id) walk(row.id)
    }
  }
  walk(root)
  if (ids.size < 2) return false
  const total = [...ids].reduce((sum, id) => sum + Number(byId.get(id)?.amount || 0), 0)
  return Math.abs(money(total)) < 0.005
}

export function isBooksLocked(lockDate: string | null | undefined, entryDate: string | null | undefined): boolean {
  if (!lockDate || !entryDate) return false
  return entryDate.slice(0, 10) <= lockDate
}

export function errorText(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return ''
}

function lockDateLabel(lockDate: string): string {
  const date = new Date(`${lockDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return lockDate
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export function booksClosedMessage(lockDate: string | null | undefined, kind: 'cost' | 'invoice' = 'cost'): string {
  const through = lockDate ? ` through ${lockDateLabel(lockDate)}` : ''
  if (kind === 'invoice') return `Books are closed${through}. Post a credit memo instead of editing it.`
  return `Books are closed${through}. Reverse this entry instead of editing it.`
}

/** Map a closed-period database error onto the message the form should show. */
export function describeSaveError(error: unknown, lockDate: string | null | undefined, kind: 'cost' | 'invoice' = 'cost'): string {
  const message = errorText(error)
  if (/closed period/i.test(message)) {
    if (/choose a later date/i.test(message)) {
      const through = lockDate ? ` through ${lockDateLabel(lockDate)}` : ''
      return `Books are closed${through}. Choose a later date.`
    }
    return booksClosedMessage(lockDate, kind)
  }
  if (message) return message
  return kind === 'invoice' ? 'Could not save this invoice.' : 'Could not save this cost.'
}

function money(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}
