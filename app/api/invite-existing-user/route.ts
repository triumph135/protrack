import { NextRequest, NextResponse } from 'next/server'
import { requireUserManager } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { sendInvitationEmail } from '@/lib/send-invitation'
import { isValidInvitationToken } from '@/lib/security'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const invitationToken = body?.invitationToken

    if (!isValidInvitationToken(typeof invitationToken === 'string' ? invitationToken : null)) {
      return NextResponse.json({ error: 'A valid invitation token is required' }, { status: 400 })
    }

    const auth = await requireUserManager()
    if (auth.response) return auth.response

    const admin = createAdminClient()
    const { data: invitation, error } = await admin
      .from('user_invitations')
      .select('id, email, invitation_token, tenant_id, status, expires_at')
      .eq('invitation_token', invitationToken)
      .eq('tenant_id', auth.user.tenant_id!)
      .eq('status', 'pending')
      .maybeSingle()

    if (error || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    const sent = await sendInvitationEmail(admin, invitation, request)
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Existing user invitation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
