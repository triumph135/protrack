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
}

export type PermissionArea = keyof UserPermissions

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
  return hasPermission(user.permissions, area, level)
}
