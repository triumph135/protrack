export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly'

export interface ScheduleDraft {
  name: string
  reportKey: string
  frequency: ScheduleFrequency
  weekday: number | null
  monthDay: number | null
  sendHour: number
  formats: string[]
  recipientIds: string[]
  definitionId: string | null
  params: unknown
  config: unknown
}

export interface ScheduleWriteInput {
  name: string
  reportKey: string
  frequency: ScheduleFrequency
  weekday: number
  monthDay: number
  sendHour: number
  formats: string[]
  recipientIds: string[]
  params: unknown
  config?: unknown
  definitionId?: string | null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

/**
 * Shared by create and edit. A weekday is kept only for weekly schedules, and a
 * day of the month only for monthly ones. Extra fields are cleared instead of rejected.
 */
export function parseScheduleDraft(body: Record<string, unknown>): ScheduleDraft {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 1 || name.length > 120) throw new Error('Name the schedule in 120 characters or fewer.')
  if (typeof body.reportKey !== 'string' || body.reportKey.length === 0) throw new Error('Unknown report.')
  const frequency = body.frequency
  if (frequency !== 'daily' && frequency !== 'weekly' && frequency !== 'monthly') {
    throw new Error('Frequency must be daily, weekly, or monthly.')
  }

  let weekday: number | null = null
  if (frequency === 'weekly') {
    if (!present(body.weekday)) throw new Error('Pick a day of the week.')
    weekday = Number(body.weekday)
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('Pick a day of the week.')
  }

  let monthDay: number | null = null
  if (frequency === 'monthly') {
    if (!present(body.monthDay)) throw new Error('Pick a day of the month from 1 to 31.')
    monthDay = Number(body.monthDay)
    if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) throw new Error('Pick a day of the month from 1 to 31.')
  }

  const sendHour = Number(body.sendHour)
  if (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23) throw new Error('Pick an hour from 12:00 AM through 11:00 PM.')
  if (!Array.isArray(body.formats) || body.formats.length === 0) throw new Error('Choose at least one file format.')
  const formats = body.formats.map(String)
  if (formats.some((format) => !['pdf', 'csv', 'xlsx'].includes(format))) throw new Error('Formats are pdf, csv, and xlsx.')
  if (!Array.isArray(body.recipientIds) || body.recipientIds.length === 0) throw new Error('Choose at least one recipient.')
  if (body.recipientIds.length > 25) throw new Error('A schedule can have at most 25 recipients.')
  if (body.recipientIds.some((id) => typeof id !== 'string' || id.length === 0)) throw new Error('Choose at least one recipient.')

  return {
    name,
    reportKey: body.reportKey,
    frequency,
    weekday,
    monthDay,
    sendHour,
    formats,
    recipientIds: body.recipientIds.map(String),
    definitionId: typeof body.definitionId === 'string' ? body.definitionId : null,
    params: body.params,
    config: body.config,
  }
}

/** Body for create and edit. Omits the day fields the frequency does not use. */
export function scheduleWriteBody(input: ScheduleWriteInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name,
    reportKey: input.reportKey,
    frequency: input.frequency,
    sendHour: input.sendHour,
    formats: input.formats,
    recipientIds: input.recipientIds,
    params: input.params,
  }
  if (input.definitionId) body.definitionId = input.definitionId
  if (input.config !== undefined) body.config = input.config
  if (input.frequency === 'weekly') body.weekday = input.weekday
  if (input.frequency === 'monthly') body.monthDay = input.monthDay
  return body
}

export function formatSendHour(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const clock = hour % 12 || 12
  return `${clock}:00 ${suffix}`
}

export function cadenceSummary(input: {
  frequency: string
  weekday?: number | null
  monthDay?: number | null
  sendHour: number
  timezone?: string | null
}): string {
  const when = formatSendHour(input.sendHour)
  const zone = input.timezone || 'America/New_York'
  if (input.frequency === 'daily') return `Every day at ${when} (${zone})`
  if (input.frequency === 'monthly') return `Every month on day ${input.monthDay || 1} at ${when} (${zone})`
  const day = WEEKDAYS[input.weekday ?? 1] || 'Monday'
  return `Every ${day} at ${when} (${zone})`
}
