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
  ownTotal: number
  total: number
  children: Array<CostGroup<T>>
}

export interface VisibleCostLine<T extends GroupableCost> {
  categoryId: string | null
  path: string
  kind: 'entry' | 'collapsed'
  row?: T
  entryCount: number
  amount: number
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

function sumRows<T extends GroupableCost>(rows: T[]): number {
  return rows.reduce((sum, row) => sum + Number(row.cost || 0), 0)
}

function subtreeCount<T extends GroupableCost>(group: CostGroup<T>): number {
  return group.rows.length + group.children.reduce((sum, child) => sum + subtreeCount(child), 0)
}

function applyRollup<T extends GroupableCost>(group: CostGroup<T>): number {
  const children = group.children.reduce((sum, child) => sum + applyRollup(child), 0)
  group.total = group.ownTotal + children
  return group.total
}

function prune<T extends GroupableCost>(group: CostGroup<T>, keepSelf: boolean, keepChildren: boolean): CostGroup<T> | null {
  const children = group.children
    .map((child) => prune(child, keepChildren, false))
    .filter((child): child is CostGroup<T> => child != null)
  if (!keepSelf && group.rows.length === 0 && children.length === 0) return null
  const next = { ...group, children }
  applyRollup(next)
  return next
}

function findGroup<T extends GroupableCost>(groups: Array<CostGroup<T>>, id: string): CostGroup<T> | null {
  for (const group of groups) {
    if (group.categoryId === id) return group
    const nested = findGroup(group.children, id)
    if (nested) return nested
  }
  return null
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

  const nodes = new Map<string, CostGroup<T>>()
  for (const category of categories) {
    const rows = (buckets.get(category.id) || []).slice().sort((a, b) => compareRows(a, b, sortKey, sortDirection))
    nodes.set(category.id, {
      categoryId: category.id,
      rows,
      ownTotal: sumRows(rows),
      total: 0,
      children: [],
    })
  }

  const roots: Array<CostGroup<T>> = []
  for (const category of categories) {
    const node = nodes.get(category.id)
    if (!node) continue
    const parent = category.parent_id ? nodes.get(category.parent_id) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  if (focusCategoryId) {
    const focused = findGroup(roots, focusCategoryId)
    return focused ? [prune(focused, true, true)].filter((group): group is CostGroup<T> => group != null) : []
  }

  const visible = roots
    .map((group) => prune(group, false, false))
    .filter((group): group is CostGroup<T> => group != null)

  if (uncategorized.length > 0) {
    const rows = uncategorized.slice().sort((a, b) => compareRows(a, b, sortKey, sortDirection))
    visible.push({
      categoryId: null,
      rows,
      ownTotal: sumRows(rows),
      total: sumRows(rows),
      children: [],
    })
  }

  return visible
}

export function costGroupIds<T extends GroupableCost>(groups: Array<CostGroup<T>>): string[] {
  const ids: string[] = []
  const walk = (list: Array<CostGroup<T>>) => {
    for (const group of list) {
      ids.push(group.categoryId || 'uncategorized')
      walk(group.children)
    }
  }
  walk(groups)
  return ids
}

export function countCostEntries<T extends GroupableCost>(groups: Array<CostGroup<T>>): number {
  return groups.reduce((sum, group) => sum + subtreeCount(group), 0)
}

/** Rows that are actually on screen. A collapsed group becomes one summary line and hides its children. */
export function visibleCostLines<T extends GroupableCost>(
  groups: Array<CostGroup<T>>,
  collapsed: ReadonlySet<string>,
  names: ReadonlyMap<string, string>,
  parentPath = '',
): Array<VisibleCostLine<T>> {
  const lines: Array<VisibleCostLine<T>> = []
  for (const group of groups) {
    const name = group.categoryId ? names.get(group.categoryId) || 'Category' : 'Uncategorized'
    const path = parentPath ? `${parentPath} / ${name}` : name
    const key = group.categoryId || 'uncategorized'
    if (collapsed.has(key)) {
      lines.push({
        categoryId: group.categoryId,
        path,
        kind: 'collapsed',
        entryCount: subtreeCount(group),
        amount: group.total,
      })
      continue
    }
    for (const row of group.rows) {
      lines.push({
        categoryId: group.categoryId,
        path,
        kind: 'entry',
        row,
        entryCount: 1,
        amount: Number(row.cost || 0),
      })
    }
    lines.push(...visibleCostLines(group.children, collapsed, names, path))
  }
  return lines
}
