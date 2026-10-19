import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export function siteUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  return new URL(request.url).origin
}

// All invitation emails go through this one function, so switching the
// email provider later (for example to Resend) only means changing this file.
//
// The link in the email only needs to land on /accept-invitation?token=...
// because the token itself is the credential.
export async function sendInviteEmail(opts: {
  email: string
  token: string
  baseUrl: string
}): Promise<{ sent: boolean; error?: string }> {
  const admin = getSupabaseAdmin()
  const redirectTo = `${opts.baseUrl}/accept-invitation?token=${opts.token}`

  // First choice: Supabase's invite email (works for brand new addresses).
  const invite = await admin.auth.admin.inviteUserByEmail(opts.email, {
    redirectTo,
    data: { invitation_token: opts.token },
  })
  if (!invite.error) return { sent: true }

  // The address already has an auth account (for example a resend, or a
  // signup that never finished setting up an organization). Send a sign in
  // link that lands on the same page.
  const otp = await admin.auth.signInWithOtp({
    email: opts.email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  })
  if (!otp.error) return { sent: true }

  return { sent: false, error: otp.error.message || invite.error.message }
}
