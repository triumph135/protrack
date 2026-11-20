export const RANGE_PRESETS = [
  'this_year',
  'last_year',
  'ytd',
  'this_quarter',
  'last_quarter',
  'this_month',
  'last_month',
  'last_30_days',
  'all_time',
  'custom',
] as const

export type RangePreset = (typeof RANGE_PRESETS)[number]

export interface DateParts {
  year: number
  month: number
  day: number
}

export interface ResolvedRange {
  preset: string
  from: string | null
  to: string | null
  label: string
}

export interface RangeInput {
  range: string
  from?: string | null
  to?: string | null
}

export const PRESET_LABELS: Record<string, string> = {
  this_year: 'This year',
  last_year: 'Last year',
  ytd: 'Year to date',
  this_quarter: 'This quarter',
  last_quarter: 'Last quarter',
  this_month: 'This month',
  last_month: 'Last month',
  last_30_days: 'Last 30 days',
  all_time: 'All time',
  custom: 'Custom',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const US_TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function normalizeTimeZone(value: string | null | undefined): string {
  return isValidTimeZone(value) ? value : 'America/New_York'
}

export function companyToday(now: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: read('year'), month: read('month'), day: read('day') }
}

export function isoDate(parts: DateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function parseIsoDate(value: string | null | undefined): DateParts | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null
  return { year, month, day }
}

export function addDays(parts: DateParts, days: number): DateParts {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() }
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function formatLongDate(value: string): string {
  const parts = parseIsoDate(value)
  if (!parts) return value
  return `${MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}`
}

export function presetLabel(preset: string): string {
  if (preset.startsWith('year:')) return preset.slice(5)
  return PRESET_LABELS[preset] || preset
}

export function describeRange(preset: string, from: string | null, to: string | null): string {
  if (preset === 'all_time' || (!from && !to)) return 'All time'
  const span = `${formatLongDate(from || '')} – ${formatLongDate(to || '')}`
  return `${span} (${presetLabel(preset)})`
}

function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1
}

function quarterBounds(year: number, quarter: number): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  return {
    from: isoDate({ year, month: startMonth, day: 1 }),
    to: isoDate({ year, month: endMonth, day: lastDayOfMonth(year, endMonth) }),
  }
}

/** Inclusive end may be at most 10 years after the start, on the anniversary. */
export function spanWithinTenYears(from: string, to: string): boolean {
  const start = parseIsoDate(from)
  const end = parseIsoDate(to)
  if (!start || !end) return false
  const limit = new Date(Date.UTC(start.year + 10, start.month - 1, start.day))
  const endUtc = new Date(Date.UTC(end.year, end.month - 1, end.day))
  return endUtc.getTime() <= limit.getTime()
}

export function resolveRange(input: RangeInput, timeZone: string, now = new Date()): ResolvedRange {
  const today = companyToday(now, timeZone)
  const preset = input.range
  const yearMatch = /^year:(\d{4})$/.exec(preset)

  if (preset === 'all_time') {
    return { preset, from: null, to: null, label: 'All time' }
  }

  if (preset === 'custom') {
    const from = input.from || ''
    const to = input.to || ''
    if (!parseIsoDate(from) || !parseIsoDate(to)) {
      throw new Error('Custom range needs a from date and a to date.')
    }
    if (from > to) throw new Error('The start date has to be on or before the end date.')
    if (!spanWithinTenYears(from, to)) throw new Error('A custom range can cover at most 10 years.')
    return { preset, from, to, label: describeRange(preset, from, to) }
  }

  if (yearMatch) {
    const year = Number(yearMatch[1])
    if (year < 1900 || year > 2500) throw new Error('Choose a calendar year.')
    const from = isoDate({ year, month: 1, day: 1 })
    const to = isoDate({ year, month: 12, day: 31 })
    return { preset, from, to, label: describeRange(preset, from, to) }
  }

  let from = ''
  let to = ''
  if (preset === 'this_year') {
    from = isoDate({ year: today.year, month: 1, day: 1 })
    to = isoDate({ year: today.year, month: 12, day: 31 })
  } else if (preset === 'last_year') {
    from = isoDate({ year: today.year - 1, month: 1, day: 1 })
    to = isoDate({ year: today.year - 1, month: 12, day: 31 })
  } else if (preset === 'ytd') {
    from = isoDate({ year: today.year, month: 1, day: 1 })
    to = isoDate(today)
  } else if (preset === 'this_month') {
    from = isoDate({ year: today.year, month: today.month, day: 1 })
    to = isoDate({ year: today.year, month: today.month, day: lastDayOfMonth(today.year, today.month) })
  } else if (preset === 'last_month') {
    const month = today.month === 1 ? 12 : today.month - 1
    const year = today.month === 1 ? today.year - 1 : today.year
    from = isoDate({ year, month, day: 1 })
    to = isoDate({ year, month, day: lastDayOfMonth(year, month) })
  } else if (preset === 'this_quarter') {
    const bounds = quarterBounds(today.year, quarterOf(today.month))
    from = bounds.from
    to = bounds.to
  } else if (preset === 'last_quarter') {
    const current = quarterOf(today.month)
    const bounds = quarterBounds(current === 1 ? today.year - 1 : today.year, current === 1 ? 4 : current - 1)
    from = bounds.from
    to = bounds.to
  } else if (preset === 'last_30_days') {
    from = isoDate(addDays(today, -29))
    to = isoDate(today)
  } else {
    throw new Error('Choose a date range.')
  }

  return { preset, from, to, label: describeRange(preset, from, to) }
}

export function dateInRange(value: string | null | undefined, range: ResolvedRange): boolean {
  if (!range.from && !range.to) return true
  if (!value) return false
  const day = value.slice(0, 10)
  if (!parseIsoDate(day)) return false
  if (range.from && day < range.from) return false
  if (range.to && day > range.to) return false
  return true
}

export function zonedDate(isoTimestamp: string | null | undefined, timeZone: string): string | null {
  if (!isoTimestamp) return null
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) return null
  return isoDate(companyToday(date, timeZone))
}

export function formatGenerated(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimeZone(timeZone),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(now)
}

export function timeZoneAbbreviation(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimeZone(timeZone),
    timeZoneName: 'short',
  }).formatToParts(now)
  return parts.find((part) => part.type === 'timeZoneName')?.value || normalizeTimeZone(timeZone)
}

export function timeZoneChoices(): string[] {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [...US_TIME_ZONES]
  const rest = supported.filter((zone) => !US_TIME_ZONES.includes(zone as (typeof US_TIME_ZONES)[number]))
  return [...US_TIME_ZONES, ...rest]
}

export function yearChoices(earliestIso: string | null | undefined, timeZone: string, now = new Date()): number[] {
  const today = companyToday(now, timeZone)
  const parsed = earliestIso ? Number(earliestIso.slice(0, 4)) : today.year
  const start = Number.isFinite(parsed) ? Math.min(parsed, today.year) : today.year
  const years: number[] = []
  for (let year = today.year; year >= start; year -= 1) years.push(year)
  return years
}

export function defaultRangeFor(reportKey: string): string {
  if (reportKey === 'activity') return 'this_year'
  if (reportKey === 'job_cost_summary' || reportKey === 'portfolio') return 'all_time'
  if (reportKey === 'cost_detail') return 'this_month'
  if (reportKey === 'labor_by_employee') return 'last_month'
  return 'ytd'
}
