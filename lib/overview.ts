export const NEAR_BUDGET_RATIO = 0.8

export type BudgetState = 'over' | 'near' | 'within' | 'unset'

export function categoryBudgetState(actual: number, budget: number): BudgetState {
  if (!(budget > 0)) return 'unset'
  if (actual > budget) return 'over'
  if (actual >= budget * NEAR_BUDGET_RATIO) return 'near'
  return 'within'
}

/**
 * Gross profit is billings minus cost, not contract and not cash collected.
 * Cost to date is the sum of project_costs.cost, reversals included.
 * Invoiced is the sum of customer_invoices.amount, credit memos included.
 * Collected is amount_collected and is display only.
 * Contract is projects.totalContractValue plus change-order additional value.
 * GP = invoiced − cost. GP% = 100 × (invoiced − cost) / invoiced when invoiced > 0, else null.
 */
export function grossProfit(invoiced: number, cost: number): number {
  return invoiced - cost
}

/** Null when nothing has been invoiced, so a percent is not invented. */
export function grossProfitPercent(invoiced: number, cost: number): number | null {
  if (!(invoiced > 0)) return null
  return ((invoiced - cost) / invoiced) * 100
}

export interface BurnPoint {
  month: string
  added: number
  cumulative: number
}

export function monthlyBurn(rows: Array<{ date?: string | null; cost?: number | null }>): BurnPoint[] {
  const byMonth = new Map<string, number>()
  for (const row of rows) {
    const month = (row.date || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) continue
    byMonth.set(month, (byMonth.get(month) || 0) + Number(row.cost || 0))
  }
  let cumulative = 0
  return [...byMonth.keys()].sort().map((month) => {
    const added = byMonth.get(month) || 0
    cumulative += added
    return { month, added, cumulative }
  })
}
