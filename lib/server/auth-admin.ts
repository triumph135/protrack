import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import type { UserPermissions } from '@/types/app.types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface CallerContext {
  userId: string
  email: string
  tenantId: string
  role: 'master' | 'entry' | 'view'
  tenantName: string
}

// Identifies the signed in caller from the session cookie. getUser() asks
// Supabase to verify the token, unlike getSession() which only reads it.
export async function requireMaster(): Promise<CallerContext> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new ApiError(401, 'Please sign in')

  const admin = getSupabaseAdmin()
  const { data: profile } = await admin
    .from('users')
    .select('id, email, role, tenant_id, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.tenant_id || profile.is_active === false) {
    throw new ApiError(403, 'Your account is not active')
  }
  if (profile.role !== 'master') {
    throw new ApiError(403, 'Only an administrator can do this')
  }

  const { data: tenant } = await admin
    .from('tenants')
    .select('name')
    .eq('id', profile.tenant_id)
    .maybeSingle()

  return {
    userId: user.id,
    email: profile.email,
    tenantId: profile.tenant_id,
    role: 'master',
    tenantName: tenant?.name || 'your organization',
  }
}

// Finds an auth account by email without loading every user at once.
// Tries the profile table first (cheap), then pages through auth users.
export async function findAuthUserByEmail(email: string) {
  const admin = getSupabaseAdmin()
  const target = email.trim().toLowerCase()

  const { data: profiles } = await admin
    .from('users')
    .select('id')
    .ilike('email', escapeLike(target))
    .limit(1)

  if (profiles && profiles.length > 0) {
    const { data } = await admin.auth.admin.getUserById(profiles[0].id)
    if (data?.user) return data.user
  }

  const perPage = 200
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error || !data) break
    const match = data.users.find((u) => u.email?.toLowerCase() === target)
    if (match) return match
    if (data.users.length < perPage) break
  }
  return null
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const LEVELS = ['none', 'read', 'write'] as const
const AREAS: (keyof UserPermissions)[] = [
  'material',
  'labor',
  'equipment',
  'subcontractor',
  'others',
  'capLeases',
  'consumable',
  'invoices',
  'projects',
  'users',
]

// Never trust permissions sent from the browser. Unknown keys are dropped,
// bad values become 'none', view only users are capped at read, and
// administrators always get full access.
export function sanitizePermissions(
  role: 'master' | 'entry' | 'view',
  input: unknown
): UserPermissions {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const result = {} as UserPermissions

  for (const area of AREAS) {
    const raw = source[area]
    let level: (typeof LEVELS)[number] = LEVELS.includes(raw as never) ? (raw as never) : 'none'
    if (role === 'master') level = 'write'
    if (role === 'view' && level === 'write') level = 'read'
    if (role === 'view' && area === 'users') level = 'none'
    result[area] = level
  }
  return result
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}
