import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import {
  ApiError,
  escapeLike,
  isValidEmail,
  requireMaster,
  sanitizePermissions,
} from '@/lib/server/auth-admin'
import { sendInviteEmail, siteUrl } from '@/lib/server/invite-email'

const ROLES = ['master', 'entry', 'view'] as const

// Administrator invites a teammate with a role and permissions.
export async function POST(request: NextRequest) {
  try {
    const caller = await requireMaster()
    const body = await request.json().catch(() => ({}))

    const email = String(body.email || '').trim().toLowerCase()
    const role = body.role as (typeof ROLES)[number]

    if (!isValidEmail(email)) {
      throw new ApiError(400, 'Please enter a valid email address')
    }
    if (!ROLES.includes(role)) {
      throw new ApiError(400, 'Please choose a role')
    }

    const permissions = sanitizePermissions(role, body.permissions)
    const admin = getSupabaseAdmin()

    // An email can belong to one organization only.
    const { data: existing } = await admin
      .from('users')
      .select('id, tenant_id')
      .ilike('email', escapeLike(email))
      .limit(5)

    if (existing?.some((u) => u.tenant_id === caller.tenantId)) {
      throw new ApiError(409, 'This person is already on your team')
    }
    if (existing?.some((u) => u.tenant_id)) {
      throw new ApiError(
        409,
        'This email already has a ProTrack account with another organization. Use a different email address.'
      )
    }

    const { data: pending } = await admin
      .from('user_invitations')
      .select('id')
      .eq('tenant_id', caller.tenantId)
      .eq('status', 'pending')
      .ilike('email', escapeLike(email))
      .limit(1)

    if (pending && pending.length > 0) {
      throw new ApiError(409, 'An invitation is already pending for this email. You can resend it from the list.')
    }

    const { data: invitation, error: insertError } = await admin
      .from('user_invitations')
      .insert({
        tenant_id: caller.tenantId,
        email,
        role,
        permissions,
        invited_by: caller.userId,
      })
      .select('id, tenant_id, email, role, permissions, invited_by, invitation_token, status, expires_at, created_at, updated_at')
      .single()

    if (insertError || !invitation) {
      console.error('Invitation insert failed:', insertError)
      throw new ApiError(500, 'Could not create the invitation')
    }

    const result = await sendInviteEmail({
      email,
      token: invitation.invitation_token,
      baseUrl: siteUrl(request),
    })
    if (!result.sent) {
      console.error('Invitation email failed:', result.error)
    }

    return NextResponse.json({ invitation, emailSent: result.sent })
  } catch (err) {
    return errorResponse(err)
  }
}

function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  console.error('Invite error:', err)
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
}
