import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { ApiError, isUuid, requireMaster } from '@/lib/server/auth-admin'
import { sendInviteEmail, siteUrl } from '@/lib/server/invite-email'

// Administrator resends a pending invitation and extends it by 7 days.
export async function POST(request: NextRequest) {
  try {
    const caller = await requireMaster()
    const body = await request.json().catch(() => ({}))

    if (!isUuid(body.invitationId)) {
      throw new ApiError(400, 'Invitation not found')
    }

    const admin = getSupabaseAdmin()
    const { data: invitation } = await admin
      .from('user_invitations')
      .select('id, email, invitation_token, status')
      .eq('id', body.invitationId)
      .eq('tenant_id', caller.tenantId)
      .maybeSingle()

    if (!invitation || invitation.status !== 'pending') {
      throw new ApiError(404, 'Invitation not found')
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error: updateError } = await admin
      .from('user_invitations')
      .update({ expires_at: expiresAt })
      .eq('id', invitation.id)
    if (updateError) throw new ApiError(500, 'Could not extend the invitation')

    const result = await sendInviteEmail({
      email: invitation.email,
      token: invitation.invitation_token,
      baseUrl: siteUrl(request),
    })
    if (!result.sent) {
      throw new ApiError(502, 'The email could not be sent. Please try again in a few minutes.')
    }

    return NextResponse.json({ success: true, expires_at: expiresAt })
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Resend error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
