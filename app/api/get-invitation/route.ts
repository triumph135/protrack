import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { isUuid } from '@/lib/server/auth-admin'

// Public: shows the invited person who invited them. The token is required
// and only the fields the page needs are returned.
export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get('token')

    if (!isUuid(token)) {
      return NextResponse.json({ error: 'Invitation not found or already used' }, { status: 404 })
    }

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('user_invitations')
      .select(
        'id, email, role, tenant_id, permissions, expires_at, tenants(name), invited_by:users!user_invitations_invited_by_fkey(name)'
      )
      .eq('invitation_token', token)
      .eq('status', 'pending')
      .maybeSingle()

    if (error) throw error

    if (!data) {
      return NextResponse.json({ error: 'Invitation not found or already used' }, { status: 404 })
    }
    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
    }

    return NextResponse.json({ invitation: data })
  } catch (error) {
    console.error('Get invitation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
