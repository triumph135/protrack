const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const hours = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatCurrency(amount: number | null | undefined): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return currency.format(0)
  return currency.format(value)
}

export function formatHours(amount: number | null | undefined): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '0'
  return hours.format(value)
}

export function formatPercent(amount: number | null | undefined): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '0.0%'
  return `${value.toFixed(1)}%`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}
