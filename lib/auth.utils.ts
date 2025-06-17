import { createServerSupabaseClient } from './supabase-server'
import { redirect } from 'next/navigation'
import type { User, UserPermissions } from '@/types/app.types'

export async function getSession() {
  const supabase = await createServerSupabaseClient()
  
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session
  } catch (error) {
    console.error('Error getting session:', error)
    return null
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession()
  
  if (!session?.user) {
    return null
  }

  const supabase = await createServerSupabaseClient()
  
  const { data: userData, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single()

  if (error || !userData) {
    console.error('Error fetching user data:', error)
    return null
  }

  return userData as User
}

export async function requireAuth() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }
  
  return user
}

export async function requireTenant() {
  const user = await requireAuth()
  
  if (!user.tenant_id) {
    redirect('/tenant-setup')
  }
  
  return user
}

export function hasPermission(
  userPermissions: UserPermissions,
  area: keyof UserPermissions,
  level: 'read' | 'write' = 'read'
): boolean {
  const permission = userPermissions[area]
  
  if (!permission || permission === 'none') return false
  
  if (level === 'read') {
    return permission === 'read' || permission === 'write'
  }
  
  return permission === 'write'
}