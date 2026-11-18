import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { roleLabel } from '@/lib/invites'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user?.email) return NextResponse.json({ invites: [] })

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ invites: [] })
  }

  const { data } = await admin
    .from('user_invitations')
    .select('invitation_token, role, expires_at, tenant_id, status, invite_type')
    .ilike('email', auth.user.email)
    .eq('status', 'pending')
    .eq('invite_type', 'email')

  const invites = []
  for (const invite of data || []) {
    if (new Date(invite.expires_at) < new Date()) continue
    const { data: tenant } = await admin.from('tenants').select('name').eq('id', invite.tenant_id).maybeSingle()
    invites.push({
      token: invite.invitation_token,
      company: tenant?.name || 'a company',
      role: roleLabel(invite.role),
    })
  }
  return NextResponse.json({ invites })
}
