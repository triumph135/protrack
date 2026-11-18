import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireUserManager } from '@/lib/api-auth'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isValidInvitationToken, isExpired } from '@/lib/security'
import { roleLabel } from '@/lib/invites'

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!isValidInvitationToken(token)) {
    return NextResponse.json({ error: 'That invite link is not valid' }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Invitation lookup is not configured' }, { status: 500 })
  }

  const { data, error } = await admin
    .from('user_invitations')
    .select('email, role, status, expires_at, invite_type, tenant_id, max_uses, use_count')
    .eq('invitation_token', token)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }

  const { data: tenant } = await admin.from('tenants').select('name').eq('id', data.tenant_id).maybeSingle()
  return NextResponse.json({
    company: tenant?.name || 'a company',
    role: data.role,
    roleLabel: roleLabel(data.role),
    email: data.email,
    type: data.invite_type || 'email',
    status: data.status,
    expired: isExpired(data.expires_at) || data.status === 'expired' || data.status === 'revoked',
    maxUses: data.max_uses,
    useCount: data.use_count,
  })
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const auth = await requireUserManager()
  if (auth.response) return auth.response
  const { token } = await context.params
  if (!isValidInvitationToken(token)) {
    return NextResponse.json({ error: 'That invite link is not valid' }, { status: 400 })
  }
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('user_invitations')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('invitation_token', token)
    .eq('tenant_id', auth.user.tenant_id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
