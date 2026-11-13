import { NextRequest, NextResponse } from 'next/server'
import { requireUserManager } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { sendInvitationEmail } from '@/lib/send-invitation'
import { isValidInvitationToken } from '@/lib/security'

async function sendForToken(request: NextRequest, invitationToken: unknown) {
  if (!isValidInvitationToken(typeof invitationToken === 'string' ? invitationToken : null)) {
    return NextResponse.json({ error: 'A valid invitation token is required' }, { status: 400 })
  }

  const auth = await requireUserManager()
  if (auth.response) return auth.response

  let admin
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error('Invitation email is not configured:', error)
    return NextResponse.json({ error: 'Invitation email is not configured' }, { status: 500 })
  }

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

  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
  }

  const sent = await sendInvitationEmail(admin, invitation, request)
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    return await sendForToken(request, body?.invitationToken)
  } catch (error) {
    console.error('Invitation API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    return await sendForToken(request, body?.invitationToken)
  } catch (error) {
    console.error('Invitation API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
