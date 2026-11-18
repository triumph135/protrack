import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { deliverInviteEmail } from '@/lib/email/send-invite'

type AdminClient = SupabaseClient<Database>

interface InvitationEmailTarget {
  email: string
  invitation_token: string
  tenant_id: string
  role?: string | null
  expires_at?: string | null
}

/** Compatibility wrapper. New invites go through /api/invitations. */
export async function sendInvitationEmail(
  admin: AdminClient,
  invitation: InvitationEmailTarget,
  request?: Request
): Promise<{ ok: true; link?: string } | { ok: false; error: string }> {
  const { data: tenant } = await admin.from('tenants').select('name').eq('id', invitation.tenant_id).maybeSingle()
  const delivered = await deliverInviteEmail({
    request,
    email: invitation.email,
    token: invitation.invitation_token,
    company: tenant?.name || 'your company',
    inviter: 'A teammate',
    role: invitation.role || 'entry',
    expires: invitation.expires_at ? new Date(invitation.expires_at).toLocaleDateString('en-US') : '7 days',
  })
  if (!delivered.sent && process.env.RESEND_API_KEY) {
    return { ok: false, error: 'Failed to send invitation email' }
  }
  return { ok: true, link: delivered.link }
}
