import { NextRequest, NextResponse } from 'next/server'
import { requireUserManager } from '@/lib/api-auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { deliverInviteEmail } from '@/lib/email/send-invite'
import { isMissingRelation, isValidEmail, normalizeEmail } from '@/lib/security'
import { permissionsForRole, type UserPermissions } from '@/lib/permissions'

export async function POST(request: NextRequest) {
  const auth = await requireUserManager()
  if (auth.response) return auth.response

  const body = await request.json().catch(() => null)
  if (!body || (body.type !== 'email' && body.type !== 'link')) {
    return NextResponse.json({ error: 'Choose an email invite or a link invite' }, { status: 400 })
  }

  const role = body.role === 'master' || body.role === 'view' ? body.role : 'entry'
  const permissions = (body.permissions || permissionsForRole(role, [])) as UserPermissions
  if (Array.isArray(body.projectIds)) {
    ;(permissions as UserPermissions & { projectIds?: string[] }).projectIds = body.projectIds.filter((id: unknown) => typeof id === 'string')
  }

  const supabase = await createServerSupabaseClient()
  const expiresAt = typeof body.expiresAt === 'string'
    ? body.expiresAt
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  if (body.type === 'link') {
    const { data, error } = await supabase
      .from('user_invitations')
      .insert({
        tenant_id: auth.user.tenant_id!,
        email: null,
        role,
        permissions,
        invited_by: auth.user.id,
        invite_type: 'link',
        max_uses: body.maxUses ? Number(body.maxUses) : null,
        expires_at: expiresAt,
      })
      .select('id, invitation_token, expires_at')
      .single()

    if (error) return relationOrError(error)
    const registered = await supabase.rpc('register_invitation_send', { p_invitation_id: data.id })
    if (registered.error) return NextResponse.json({ error: registered.error.message }, { status: 429 })
    const delivered = await deliverInviteEmail({
      request,
      email: '',
      token: data.invitation_token,
      company: '',
      inviter: auth.user.name,
      role,
      expires: data.expires_at,
    })
    return NextResponse.json({ invitation: data, link: delivered.link, emailConfigured: false })
  }

  const emails = String(body.emails || '')
    .split(/[\s,;]+/)
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
  if (emails.length === 0 || emails.some((email) => !isValidEmail(email))) {
    return NextResponse.json({ error: 'Enter at least one valid email address' }, { status: 400 })
  }

  const created = []
  for (const email of emails) {
    const { data, error } = await supabase
      .from('user_invitations')
      .insert({
        tenant_id: auth.user.tenant_id!,
        email,
        role,
        permissions,
        invited_by: auth.user.id,
        invite_type: 'email',
        expires_at: expiresAt,
      })
      .select('id, email, invitation_token, expires_at')
      .single()
    if (error) return relationOrError(error)
    const registered = await supabase.rpc('register_invitation_send', { p_invitation_id: data.id })
    if (registered.error) return NextResponse.json({ error: registered.error.message, invitation: data }, { status: 429 })
    const delivered = await deliverInviteEmail({
      request,
      email,
      token: data.invitation_token,
      company: body.company || 'your company',
      inviter: auth.user.name,
      role,
      expires: new Date(data.expires_at).toLocaleDateString('en-US'),
    })
    created.push({ ...data, ...delivered })
  }

  const emailConfigured = Boolean(process.env.RESEND_API_KEY)
  return NextResponse.json({
    invitations: created,
    emailConfigured,
    message: emailConfigured ? 'Invitation sent' : "Email isn't set up yet. Copy this invite link and send it yourself.",
  })
}

function relationOrError(error: { code?: string; message: string }) {
  if (isMissingRelation(error) || error.message.toLowerCase().includes('invite_type') || error.code === '42703') {
    return NextResponse.json({ error: 'Database update pending' }, { status: 503 })
  }
  return NextResponse.json({ error: error.message }, { status: 400 })
}
