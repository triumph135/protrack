export type CostCategory =
  | 'material'
  | 'labor'
  | 'equipment'
  | 'subcontractor'
  | 'others'
  | 'cap_leases'
  | 'consumable'

export interface CostAmountInput {
  cost?: number | null
  st_hours?: number | null
  st_rate?: number | null
  ot_hours?: number | null
  ot_rate?: number | null
  dt_hours?: number | null
  dt_rate?: number | null
  mob_qty?: number | null
  mob_rate?: number | null
  per_diem?: number | null
}

function money(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

/**
 * Labor totals are hours × rates plus per diem and mobilization.
 * Every other category uses the entered cost amount.
 */
export function calculateTotalCost(category: CostCategory, costData: CostAmountInput): number {
  if (category === 'labor') {
    const straight = Number(costData.st_hours || 0) * Number(costData.st_rate || 0)
    const overtime = Number(costData.ot_hours || 0) * Number(costData.ot_rate || 0)
    const doubleTime = Number(costData.dt_hours || 0) * Number(costData.dt_rate || 0)
    const mobilization = Number(costData.mob_qty || 0) * Number(costData.mob_rate || 0)
    const perDiem = Number(costData.per_diem || 0)
    return money(straight + overtime + doubleTime + perDiem + mobilization)
  }

  return money(Number(costData.cost || 0))
}
