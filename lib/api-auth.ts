import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { PUBLIC_USER_COLUMNS, userCan } from '@/lib/permissions'
import type { User } from '@/types/app.types'

export async function getApiUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  const { data } = await supabase
    .from('users')
    .select(PUBLIC_USER_COLUMNS)
    .eq('id', user.id)
    .maybeSingle()

  return (data as User | null) ?? null
}

export async function requireUserManager(): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  const user = await getApiUser()

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    }
  }

  if (!user.tenant_id) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Organization setup is required' }, { status: 403 }),
    }
  }

  if (!userCan(user, 'users', 'write')) {
    return {
      user: null,
      response: NextResponse.json({ error: 'You do not have permission to manage users' }, { status: 403 }),
    }
  }

  return { user, response: null }
}
