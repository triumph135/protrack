export const COST_NAV_STORAGE_KEY = 'protrack-cost-nav'

export interface CostNavState {
  costsOpen: boolean
  openIds: string[]
}

export function defaultCostNavState(): CostNavState {
  return { costsOpen: true, openIds: [] }
}

export function readCostNavState(raw: string | null): CostNavState {
  if (!raw) return defaultCostNavState()
  try {
    const parsed = JSON.parse(raw) as Partial<CostNavState>
    const openIds = Array.isArray(parsed.openIds)
      ? parsed.openIds.filter((id): id is string => typeof id === 'string')
      : []
    return {
      costsOpen: parsed.costsOpen !== false,
      openIds,
    }
  } catch {
    return defaultCostNavState()
  }
}

export function toggleCostNav(state: CostNavState, id: string): CostNavState {
  if (id === 'costs') return { ...state, costsOpen: !state.costsOpen }
  const open = new Set(state.openIds)
  if (open.has(id)) open.delete(id)
  else open.add(id)
  return { ...state, openIds: [...open] }
}

/** Open Costs and the ancestors of the category the user just opened. */
export function revealCostNav(state: CostNavState, ancestorIds: string[]): CostNavState {
  const open = new Set(state.openIds)
  for (const id of ancestorIds) open.add(id)
  return { costsOpen: true, openIds: [...open] }
}
