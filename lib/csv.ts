export type CsvCell = string | number | boolean | null | undefined

/** One header row. Numbers stay numeric. Dates should already be ISO strings. */
export function csvCell(value: CsvCell): string {
  if (value == null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\n')
}
