import { NextRequest, NextResponse } from 'next/server'
import { requireUserManager } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { isValidEmail, normalizeEmail } from '@/lib/security'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
    const tenantId = typeof body?.tenantId === 'string' ? body.tenantId : ''

    if (!isValidEmail(email) || !tenantId) {
      return NextResponse.json({ error: 'Email and tenant ID are required' }, { status: 400 })
    }

    const auth = await requireUserManager()
    if (auth.response) return auth.response

    if (auth.user.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'You can only check users in your organization' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { data: existingUser, error: userError } = await admin
      .from('users')
      .select('id')
      .eq('email', email)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (userError) {
      console.error('Error checking user:', userError)
      return NextResponse.json({ error: 'Failed to check user eligibility' }, { status: 500 })
    }

    const { data: existingInvitation, error: invitationError } = await admin
      .from('user_invitations')
      .select('id, status, expires_at')
      .eq('email', email)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .maybeSingle()

    if (invitationError) {
      console.error('Error checking invitation:', invitationError)
      return NextResponse.json({ error: 'Failed to check invitation status' }, { status: 500 })
    }

    return NextResponse.json({
      userExistsInTenant: !!existingUser,
      pendingInvitation: existingInvitation
        ? { id: existingInvitation.id, status: existingInvitation.status, expires_at: existingInvitation.expires_at }
        : null,
      canInvite: !existingUser && !existingInvitation,
    })
  } catch (error) {
    console.error('Check user exists error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
