export type CostKind = 'standard' | 'named' | 'labor'

export interface CostCategoryRecord {
  id: string
  tenant_id: string
  builtin_key: string | null
  name: string
  kind: CostKind
  parent_id: string | null
  sort_order: number
  is_hidden: boolean
  is_builtin: boolean
  gl_code: string | null
}

export interface CategoryNode extends CostCategoryRecord {
  children: CategoryNode[]
  depth: number
}

export const BUILTIN_ORDER = [
  'material',
  'labor',
  'equipment',
  'subcontractor',
  'others',
  'cap_leases',
  'consumable',
] as const

export const LEGACY_SLUGS: Record<string, string> = {
  material: 'material',
  labor: 'labor',
  equipment: 'equipment',
  subcontractor: 'subcontractor',
  others: 'others',
  'cap-leases': 'cap_leases',
  cap_leases: 'cap_leases',
  consumable: 'consumable',
}

const BUILTIN_META: Record<string, { name: string; kind: CostKind; sort: number }> = {
  material: { name: 'Material', kind: 'standard', sort: 10 },
  labor: { name: 'Labor', kind: 'labor', sort: 20 },
  equipment: { name: 'Equipment', kind: 'named', sort: 30 },
  subcontractor: { name: 'Subcontractor', kind: 'named', sort: 40 },
  others: { name: 'Others', kind: 'standard', sort: 50 },
  cap_leases: { name: 'Cap Leases', kind: 'standard', sort: 60 },
  consumable: { name: 'Consumable', kind: 'standard', sort: 70 },
}

/** Used only in the browser when the Phase 2 tables are not on the database yet. */
export function fallbackCategories(tenantId = 'pending'): CostCategoryRecord[] {
  return BUILTIN_ORDER.map((key) => ({
    id: `builtin:${key}`,
    tenant_id: tenantId,
    builtin_key: key,
    name: BUILTIN_META[key].name,
    kind: BUILTIN_META[key].kind,
    parent_id: null,
    sort_order: BUILTIN_META[key].sort,
    is_hidden: false,
    is_builtin: true,
    gl_code: null,
  }))
}

export function isFallbackCategoryId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('builtin:')
}

export function legacyKeyForBuiltin(builtinKey: string | null | undefined): string | null {
  if (!builtinKey) return null
  return builtinKey === 'cap_leases' ? 'capLeases' : builtinKey
}

export function builtinKeyFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null
  return LEGACY_SLUGS[slug] || null
}

export function ancestorBuiltinKey(
  category: CostCategoryRecord,
  byId: Map<string, CostCategoryRecord>
): string | null {
  if (category.builtin_key) return category.builtin_key
  if (!category.parent_id) return null
  return byId.get(category.parent_id)?.builtin_key ?? null
}

export function legacyCategoryText(
  category: CostCategoryRecord,
  byId: Map<string, CostCategoryRecord>
): 'labor' | 'others' | string {
  const builtin = ancestorBuiltinKey(category, byId)
  if (builtin) return builtin
  return category.kind === 'labor' ? 'labor' : 'others'
}

export function buildCategoryTree(
  rows: CostCategoryRecord[],
  options: { includeHidden?: boolean } = {}
): CategoryNode[] {
  const visible = options.includeHidden ? rows : rows.filter((row) => !row.is_hidden)
  const byParent = new Map<string | null, CostCategoryRecord[]>()
  for (const row of visible) {
    const key = row.parent_id
    const list = byParent.get(key) || []
    list.push(row)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  }

  const walk = (parentId: string | null, depth: number): CategoryNode[] =>
    (byParent.get(parentId) || []).map((row) => ({
      ...row,
      depth,
      children: depth >= 1 ? [] : walk(row.id, depth + 1),
    }))

  return walk(null, 0)
}

export function flattenCategoryTree(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = []
  const walk = (list: CategoryNode[]) => {
    for (const node of list) {
      out.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

export interface CategoryRollup {
  id: string
  own: number
  total: number
}

/** Parent totals include their own rows plus every child. */
export function rollupCategoryAmounts(
  categories: CostCategoryRecord[],
  ownAmounts: Record<string, number>
): Record<string, CategoryRollup> {
  const byParent = new Map<string | null, string[]>()
  for (const category of categories) {
    const list = byParent.get(category.parent_id) || []
    list.push(category.id)
    byParent.set(category.parent_id, list)
  }

  const result: Record<string, CategoryRollup> = {}
  const visit = (id: string): number => {
    const own = Number(ownAmounts[id] || 0)
    const children = byParent.get(id) || []
    const total = children.reduce((sum, childId) => sum + visit(childId), own)
    result[id] = { id, own, total }
    return total
  }
  for (const id of byParent.get(null) || []) visit(id)
  return result
}

export const VISIBLE_CATEGORY_LIMIT = 20

export function ownAmountsByCategory(
  entries: Array<{ category_id?: string | null; category?: string | null; cost?: number | null }>,
  categories: CostCategoryRecord[]
): Record<string, number> {
  const byKey = new Map(
    categories.filter((category) => category.builtin_key).map((category) => [category.builtin_key as string, category.id])
  )
  const own: Record<string, number> = {}
  for (const row of entries) {
    const id =
      row.category_id && !isFallbackCategoryId(row.category_id)
        ? row.category_id
        : byKey.get(row.category || '') || (row.category ? `legacy:${row.category}` : null)
    if (!id) continue
    own[id] = (own[id] || 0) + Number(row.cost || 0)
  }
  return own
}
