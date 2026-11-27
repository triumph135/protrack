export interface CompanySettings {
  labor_split_enabled: boolean
  project_visibility: 'all' | 'assigned'
  gp_goal_percent: number | null
  /** ISO date. Costs and invoices on or before this date are corrected by reversal only. */
  books_lock_date: string | null
  /** IANA zone. America/New_York when missing or not a real zone. */
  timezone: string
}

export function readCompanySettings(settings: unknown): CompanySettings {
  const value = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {}
  const goal = Number(value.gp_goal_percent)
  const lock = value.books_lock_date
  const zone = value.timezone
  let timezone = 'America/New_York'
  if (typeof zone === 'string') {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date())
      timezone = zone
    } catch {
      timezone = 'America/New_York'
    }
  }
  return {
    labor_split_enabled: value.labor_split_enabled === true,
    project_visibility: value.project_visibility === 'assigned' ? 'assigned' : 'all',
    gp_goal_percent: Number.isFinite(goal) && goal >= 0 && goal <= 100 ? goal : null,
    books_lock_date: typeof lock === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lock) ? lock : null,
    timezone,
  }
}
