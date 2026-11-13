import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { appOrigin, isAlreadyRegisteredMessage } from '@/lib/security'

type AdminClient = SupabaseClient<Database>

interface InvitationEmailTarget {
  email: string
  invitation_token: string
  tenant_id: string
}

export async function sendInvitationEmail(
  admin: AdminClient,
  invitation: InvitationEmailTarget,
  request?: Request
): Promise<{ ok: true } | { ok: false; error: string }> {
  const origin = appOrigin(request)
  const token = encodeURIComponent(invitation.invitation_token)
  const acceptUrl = `${origin}/accept-invitation?token=${token}`
  const joinUrl = `${origin}/join-tenant?token=${token}`

  const invited = await admin.auth.admin.inviteUserByEmail(invitation.email, {
    redirectTo: acceptUrl,
    data: {
      invitation_token: invitation.invitation_token,
      tenant_id: invitation.tenant_id,
      type: 'new_user_invitation',
    },
  })

  if (!invited.error) {
    return { ok: true }
  }

  if (!isAlreadyRegisteredMessage(invited.error.message)) {
    return { ok: false, error: 'Failed to send invitation email' }
  }

  const otp = await admin.auth.signInWithOtp({
    email: invitation.email,
    options: {
      emailRedirectTo: joinUrl,
      shouldCreateUser: false,
      data: {
        invitation_token: invitation.invitation_token,
        tenant_id: invitation.tenant_id,
        type: 'tenant_invitation',
      },
    },
  })

  if (otp.error) {
    return { ok: false, error: 'Failed to send invitation email' }
  }

  return { ok: true }
}
