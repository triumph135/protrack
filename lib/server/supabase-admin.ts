import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Service role client. Server only: this bypasses Row Level Security, so it
// must never be imported from a client component or used without first
// checking who the caller is (see lib/server/auth-admin.ts).
let cached: SupabaseClient<Database> | null = null

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase admin client is not configured')
  }

  cached = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}
