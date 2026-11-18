export interface CompanySettings {
  labor_split_enabled: boolean
  project_visibility: 'all' | 'assigned'
  gp_goal_percent: number | null
}

export function readCompanySettings(settings: unknown): CompanySettings {
  const value = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {}
  const goal = Number(value.gp_goal_percent)
  return {
    labor_split_enabled: value.labor_split_enabled === true,
    project_visibility: value.project_visibility === 'assigned' ? 'assigned' : 'all',
    gp_goal_percent: Number.isFinite(goal) && goal >= 0 && goal <= 100 ? goal : null,
  }
}
