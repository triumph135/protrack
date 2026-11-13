import { createServerSupabaseClient } from './supabase-server'
import { redirect } from 'next/navigation'
import type { User } from '@/types/app.types'
import { PUBLIC_USER_COLUMNS } from '@/lib/permissions'

export { hasPermission } from '@/lib/permissions'

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
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return null
  }
  
  const { data: userData, error } = await supabase
    .from('users')
    .select(PUBLIC_USER_COLUMNS)
    .eq('id', user.id)
    .maybeSingle()

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
