export type PermissionLevel = 'none' | 'read' | 'write'

export interface UserPermissions {
  material: PermissionLevel
  labor: PermissionLevel
  equipment: PermissionLevel
  subcontractor: PermissionLevel
  others: PermissionLevel
  capLeases: PermissionLevel
  consumable: PermissionLevel
  invoices: PermissionLevel
  projects: PermissionLevel
  users: PermissionLevel
  employees?: PermissionLevel
  categories?: Record<string, PermissionLevel>
  export?: Record<string, boolean>
  version?: number
}

export type PermissionArea =
  | 'material'
  | 'labor'
  | 'equipment'
  | 'subcontractor'
  | 'others'
  | 'capLeases'
  | 'consumable'
  | 'invoices'
  | 'projects'
  | 'users'
  | 'employees'

export interface CategoryGrant {
  id: string
  builtinKey?: string | null
  parentBuiltinKey?: string | null
}

export const ENTRY_PERMISSIONS: UserPermissions = {
  material: 'read',
  labor: 'read',
  equipment: 'read',
  subcontractor: 'read',
  others: 'read',
  capLeases: 'read',
  consumable: 'read',
  invoices: 'read',
  projects: 'read',
  users: 'none',
}

export const MASTER_PERMISSIONS: UserPermissions = {
  material: 'write',
  labor: 'write',
  equipment: 'write',
  subcontractor: 'write',
  others: 'write',
  capLeases: 'write',
  consumable: 'write',
  invoices: 'write',
  projects: 'write',
  users: 'write',
}

/** Columns safe to return to the browser. Excludes password_hash. */
export const PUBLIC_USER_COLUMNS =
  'id, tenant_id, name, email, role, permissions, is_active, last_login, created_at, updated_at'

export function hasPermission(
  userPermissions: Partial<UserPermissions> | null | undefined,
  area: PermissionArea,
  level: 'read' | 'write' = 'read'
): boolean {
  const permission = userPermissions?.[area]

  if (!permission || permission === 'none') return false
  if (level === 'read') return permission === 'read' || permission === 'write'
  return permission === 'write'
}

export function userCan(
  user: { role?: string | null; permissions?: Partial<UserPermissions> | null } | null | undefined,
  area: PermissionArea,
  level: 'read' | 'write' = 'read'
): boolean {
  if (!user) return false
  if (user.role === 'master') return true
  if (area === 'employees' && user.permissions?.employees === undefined) {
    return hasPermission(user.permissions, 'labor', level)
  }
  return hasPermission(user.permissions, area, level)
}

function levelAllows(actual: PermissionLevel | undefined, level: 'read' | 'write'): boolean {
  if (!actual || actual === 'none') return false
  if (level === 'read') return actual === 'read' || actual === 'write'
  return actual === 'write'
}

/**
 * Masters bypass. An explicit categories[id] wins. Otherwise a built-in
 * (or its parent built-in) falls back to the legacy flat key. A legacy key
 * that was never set stays allowed, because the database before Phase 2 did
 * not check category permissions. A custom category with no grant is none.
 */
export function canAccessCategory(
  user: { role?: string | null; permissions?: Partial<UserPermissions> | null } | null | undefined,
  category: CategoryGrant,
  level: 'read' | 'write' = 'read'
): boolean {
  if (!user) return false
  if (user.role === 'master') return true

  const permissions = user.permissions || {}
  const mapped = permissions.categories?.[category.id]
  if (mapped) return levelAllows(mapped, level)

  const builtin = category.builtinKey || category.parentBuiltinKey || null
  const legacy = builtin === 'cap_leases' ? 'capLeases' : builtin
  if (legacy && Object.prototype.hasOwnProperty.call(permissions, legacy)) {
    return levelAllows(permissions[legacy as PermissionArea], level)
  }
  if (builtin) return true
  return false
}

export function canExport(
  user: { role?: string | null; permissions?: Partial<UserPermissions> | null } | null | undefined,
  areaOrCategoryId: string,
  category?: CategoryGrant
): boolean {
  if (!user) return false
  if (user.role === 'master') return true
  const explicit = user.permissions?.export?.[areaOrCategoryId]
  if (typeof explicit === 'boolean') return explicit
  if (category) return canAccessCategory(user, category, 'read')
  return userCan(user, areaOrCategoryId as PermissionArea, 'read')
}

export function permissionsForRole(
  role: 'master' | 'entry' | 'view',
  categories: Array<{ id: string }>
): UserPermissions {
  const level: PermissionLevel = role === 'view' ? 'read' : 'write'
  const exportOn = role !== 'view'
  const categoriesMap: Record<string, PermissionLevel> = {}
  const exportMap: Record<string, boolean> = {
    invoices: exportOn,
    projects: exportOn,
    employees: exportOn,
    users: false,
  }
  for (const category of categories) {
    categoriesMap[category.id] = level
    exportMap[category.id] = exportOn
  }
  return {
    material: level,
    labor: level,
    equipment: level,
    subcontractor: level,
    others: level,
    capLeases: level,
    consumable: level,
    invoices: level,
    projects: level,
    users: role === 'master' ? 'write' : 'none',
    employees: level,
    categories: categoriesMap,
    export: exportMap,
    version: 2,
  }
}
