export type CostSortKey = 'date' | 'amount' | 'details'
export type CostSortDirection = 'asc' | 'desc'

export interface GroupableCost {
  id: string
  category_id?: string | null
  category?: string | null
  cost?: number | null
  date?: string | null
  description?: string | null
  vendor?: string | null
  employee_name?: string | null
  subcontractor_name?: string | null
  change_order_id?: string | null
}

export interface GroupCategory {
  id: string
  builtin_key: string | null
  parent_id: string | null
}

export interface CostGroup<T extends GroupableCost> {
  categoryId: string | null
  rows: T[]
  total: number
}

export function costDetailText(row: GroupableCost): string {
  return row.description || row.vendor || row.subcontractor_name || row.employee_name || ''
}

function isFallbackCategoryId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('builtin:')
}

/** A readable category id, null when the row has no category, or 'hidden' when it belongs to a category the caller did not pass. */
export function resolveEntryCategoryId(
  row: GroupableCost,
  categories: GroupCategory[],
): string | null | 'hidden' {
  if (row.category_id && !isFallbackCategoryId(row.category_id)) {
    return categories.some((category) => category.id === row.category_id) ? row.category_id : 'hidden'
  }
  const key = row.category?.trim() || ''
  if (!key) return null
  const builtin = categories.find((category) => category.builtin_key === key && !category.parent_id)
  return builtin?.id ?? 'hidden'
}

function matchesChangeOrder(row: GroupableCost, changeOrderId: string | null | undefined): boolean {
  if (changeOrderId === 'base') return !row.change_order_id
  if (changeOrderId) return row.change_order_id === changeOrderId
  return true
}

function matchesQuery(row: GroupableCost, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = `${row.description || ''} ${row.vendor || ''} ${row.employee_name || ''} ${row.subcontractor_name || ''}`.toLowerCase()
  return haystack.includes(needle)
}

function compareRows(a: GroupableCost, b: GroupableCost, key: CostSortKey, direction: CostSortDirection): number {
  const sign = direction === 'asc' ? 1 : -1
  if (key === 'amount') return sign * (Number(a.cost || 0) - Number(b.cost || 0))
  if (key === 'details') return sign * costDetailText(a).localeCompare(costDetailText(b))
  return sign * String(a.date || '').localeCompare(String(b.date || ''))
}

export function groupCostEntries<T extends GroupableCost>({
  entries,
  categories,
  query = '',
  changeOrderId = null,
  sortKey = 'date',
  sortDirection = 'desc',
  focusCategoryId = null,
}: {
  entries: T[]
  categories: GroupCategory[]
  query?: string
  changeOrderId?: string | null
  sortKey?: CostSortKey
  sortDirection?: CostSortDirection
  focusCategoryId?: string | null
}): Array<CostGroup<T>> {
  const buckets = new Map<string, T[]>()
  const uncategorized: T[] = []

  for (const row of entries) {
    if (!matchesChangeOrder(row, changeOrderId) || !matchesQuery(row, query)) continue
    const categoryId = resolveEntryCategoryId(row, categories)
    if (categoryId === 'hidden') continue
    if (!categoryId) {
      uncategorized.push(row)
      continue
    }
    const list = buckets.get(categoryId) || []
    list.push(row)
    buckets.set(categoryId, list)
  }

  const ordered = focusCategoryId
    ? categories.filter((category) => category.id === focusCategoryId)
    : categories

  const groups: Array<CostGroup<T>> = []
  for (const category of ordered) {
    const rows = (buckets.get(category.id) || []).slice().sort((a, b) => compareRows(a, b, sortKey, sortDirection))
    if (!focusCategoryId && rows.length === 0) continue
    groups.push({
      categoryId: category.id,
      rows,
      total: rows.reduce((sum, row) => sum + Number(row.cost || 0), 0),
    })
  }

  if (!focusCategoryId && uncategorized.length > 0) {
    const rows = uncategorized.slice().sort((a, b) => compareRows(a, b, sortKey, sortDirection))
    groups.push({
      categoryId: null,
      rows,
      total: rows.reduce((sum, row) => sum + Number(row.cost || 0), 0),
    })
  }

  return groups
}
