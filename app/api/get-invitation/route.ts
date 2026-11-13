import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isExpired, isValidInvitationToken } from '@/lib/security'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')

    if (!isValidInvitationToken(token)) {
      return NextResponse.json({ error: 'A valid invitation token is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('user_invitations')
      .select(`
        id,
        email,
        role,
        tenant_id,
        permissions,
        expires_at,
        status,
        tenants(name),
        invited_by:users!user_invitations_invited_by_fkey(name)
      `)
      .eq('invitation_token', token)
      .eq('status', 'pending')
      .maybeSingle()

    if (error) {
      console.error('Get invitation error:', error)
      return NextResponse.json({ error: 'Failed to load invitation' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Invitation not found or already used' }, { status: 404 })
    }

    if (isExpired(data.expires_at)) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
    }

    return NextResponse.json({ invitation: data })
  } catch (error) {
    console.error('Get invitation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
