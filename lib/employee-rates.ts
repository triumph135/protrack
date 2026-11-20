export interface EmployeeRateCard {
  standard_rate: number
  ot_rate: number
  dt_rate: number
  mob_rate?: number | null
}

export interface EmployeeRateOverride extends EmployeeRateCard {
  project_id: string
  effective_date: string
}

export interface ResolvedEmployeeRates extends EmployeeRateCard {
  effective_date: string | null
  source: 'override' | 'employee'
}

/**
 * Same rule as public.employee_rates_as_of: the latest override for this
 * project with effective_date on or before the entry date, otherwise the
 * rates stored on the employee.
 */
export function resolveEmployeeRates(
  employee: EmployeeRateCard,
  overrides: EmployeeRateOverride[],
  projectId: string | null | undefined,
  onDate: string
): ResolvedEmployeeRates {
  const day = (onDate || '').slice(0, 10)
  const match = overrides
    .filter((row) => row.project_id === projectId && row.effective_date.slice(0, 10) <= day)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0]
  if (match) {
    return {
      standard_rate: Number(match.standard_rate),
      ot_rate: Number(match.ot_rate),
      dt_rate: Number(match.dt_rate),
      mob_rate: match.mob_rate == null ? null : Number(match.mob_rate),
      effective_date: match.effective_date.slice(0, 10),
      source: 'override',
    }
  }
  return {
    standard_rate: Number(employee.standard_rate),
    ot_rate: Number(employee.ot_rate),
    dt_rate: Number(employee.dt_rate),
    mob_rate: employee.mob_rate == null ? null : Number(employee.mob_rate),
    effective_date: null,
    source: 'employee',
  }
}
