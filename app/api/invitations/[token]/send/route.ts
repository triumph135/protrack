import { NextRequest, NextResponse } from 'next/server'
import { requireUserManager } from '@/lib/api-auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { deliverInviteEmail } from '@/lib/email/send-invite'
import { isValidInvitationToken } from '@/lib/security'

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const auth = await requireUserManager()
  if (auth.response) return auth.response
  const { token } = await context.params
  if (!isValidInvitationToken(token)) {
    return NextResponse.json({ error: 'That invite link is not valid' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('user_invitations')
    .select('id, email, invitation_token, expires_at, status, invite_type, role')
    .eq('invitation_token', token)
    .eq('tenant_id', auth.user.tenant_id!)
    .maybeSingle()

  if (error || !data || data.status !== 'pending') {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }

  const registered = await supabase.rpc('register_invitation_send', { p_invitation_id: data.id })
  if (registered.error) return NextResponse.json({ error: registered.error.message }, { status: 429 })

  if (data.invite_type === 'link' || !data.email) {
    const delivered = await deliverInviteEmail({
      request,
      email: '',
      token: data.invitation_token,
      company: '',
      inviter: auth.user.name,
      role: data.role,
      expires: data.expires_at,
    })
    return NextResponse.json({ emailConfigured: false, link: delivered.link })
  }

  const { data: tenant } = await supabase.from('tenants').select('name').eq('id', auth.user.tenant_id!).maybeSingle()
  const delivered = await deliverInviteEmail({
    request,
    email: data.email,
    token: data.invitation_token,
    company: tenant?.name || 'your company',
    inviter: auth.user.name,
    role: data.role,
    expires: new Date(data.expires_at).toLocaleDateString('en-US'),
  })
  return NextResponse.json({
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
    sent: delivered.sent,
    link: delivered.link,
    message: delivered.sent ? 'Invitation sent' : "Email isn't set up yet. Copy this invite link and send it yourself.",
  })
}
