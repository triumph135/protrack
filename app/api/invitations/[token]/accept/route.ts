import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isValidInvitationToken, MIN_PASSWORD_LENGTH, normalizeEmail } from '@/lib/security'

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!isValidInvitationToken(token)) {
    return NextResponse.json({ error: 'That invite link is not valid' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const password = String(body.password || '')
  if (name.length < 2) return NextResponse.json({ error: 'Enter your name' }, { status: 400 })
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Account setup is not configured' }, { status: 500 })
  }

  const { data: invite, error } = await admin
    .from('user_invitations')
    .select('email, status, expires_at, invite_type')
    .eq('invitation_token', token)
    .maybeSingle()

  if (error || !invite || invite.invite_type === 'link' || !invite.email) {
    return NextResponse.json({ error: 'This invite needs an existing sign-in' }, { status: 400 })
  }
  if (invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite is no longer active' }, { status: 400 })
  }

  const email = normalizeEmail(invite.email)
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (created.error) {
    const message = created.error.message.toLowerCase()
    if (message.includes('already') || message.includes('registered')) {
      return NextResponse.json({ existing: true, email })
    }
    return NextResponse.json({ error: 'Could not create the account' }, { status: 400 })
  }

  return NextResponse.json({ created: true, email })
}
