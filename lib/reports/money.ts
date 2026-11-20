/** Sums stay in integer cents. Divide by 100 only when a cell is displayed or exported. */

export function toCents(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

export function addCents(values: Array<number | string | null | undefined>): number {
  return values.reduce<number>((sum, value) => sum + toCents(value), 0)
}
