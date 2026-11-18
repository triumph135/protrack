export interface CompanySettings {
  labor_split_enabled: boolean
  project_visibility: 'all' | 'assigned'
}

export function readCompanySettings(settings: unknown): CompanySettings {
  const value = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {}
  return {
    labor_split_enabled: value.labor_split_enabled === true,
    project_visibility: value.project_visibility === 'assigned' ? 'assigned' : 'all',
  }
}
