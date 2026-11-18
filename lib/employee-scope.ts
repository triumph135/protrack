export interface ScopeProject {
  id: string
  jobNumber?: string | null
  jobName?: string | null
}

/**
 * Null clears the assignment. An empty string must not become undefined:
 * PostgREST drops undefined fields, so an update would leave the old project id.
 */
export function employeeProjectIdForSave(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function employeeScopeLabel(
  projectId: string | null | undefined,
  projects: ScopeProject[],
): string {
  const id = projectId?.trim()
  if (!id) return 'Global'
  const project = projects.find((item) => item.id === id)
  if (!project) return 'Assigned project'
  const number = project.jobNumber?.trim()
  const name = project.jobName?.trim()
  if (number && name) return `${number} — ${name}`
  return number || name || 'Assigned project'
}
