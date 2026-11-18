/** Signed remaining on one row: its amount plus the amounts of reversals that point at it. */
export function directRemaining(amount: number, childAmounts: number[]): number {
  return money(amount + childAmounts.reduce((sum, value) => sum + Number(value || 0), 0))
}

/**
 * The amount stored on a reversal. Null means a full offset of what is left.
 * The result stays on the opposite side of the remaining balance and cannot cross zero.
 */
export function reversalProposal(remaining: number, proposed?: number | null): number {
  const value = proposed == null || Number.isNaN(Number(proposed)) ? money(-remaining) : money(Number(proposed))
  if (money(remaining) === 0) {
    if (proposed == null) throw new Error('Nothing left to reverse')
    if (value === 0) return 0
    throw new Error('Nothing left to reverse')
  }
  if (remaining > 0) {
    if (value >= 0 || money(remaining + value) < 0) {
      throw new Error('That amount would push the remaining balance past zero')
    }
  } else if (value <= 0 || money(remaining + value) > 0) {
    throw new Error('That amount would push the remaining balance past zero')
  }
  return value
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

function money(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}
