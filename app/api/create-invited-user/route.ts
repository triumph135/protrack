import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { findAuthUserByEmail, isUuid, sanitizePermissions } from '@/lib/server/auth-admin'

// A teammate sets their name and password using the token from their
// invitation email. The token is the only credential, so it is claimed
// atomically first: it can be used exactly once.
export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin()
  let claimedId: string | null = null

  try {
    const { invitationToken, password, name } = await request.json().catch(() => ({}))

    if (!isUuid(invitationToken) || typeof password !== 'string' || typeof name !== 'string') {
      return NextResponse.json({ error: 'Invitation token, password, and name are required' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 })
    }
    const cleanName = name.trim().slice(0, 100)
    if (!cleanName) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Claim the invitation: only one request can flip pending to accepted.
    const { data: claimed } = await admin
      .from('user_invitations')
      .update({ status: 'accepted' })
      .eq('invitation_token', invitationToken)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .select('id, tenant_id, email, role, permissions')
      .maybeSingle()

    if (!claimed) {
      return NextResponse.json({ error: 'This invitation is invalid, expired, or already used' }, { status: 404 })
    }
    claimedId = claimed.id

    const existingAuthUser = await findAuthUserByEmail(claimed.email)
    let userId: string
    let createdNew = false

    if (existingAuthUser) {
      const { data: profile } = await admin
        .from('users')
        .select('tenant_id')
        .eq('id', existingAuthUser.id)
        .maybeSingle()

      if (profile?.tenant_id) {
        await revert(admin, claimed.id)
        const sameTeam = profile.tenant_id === claimed.tenant_id
        return NextResponse.json(
          {
            error: sameTeam
              ? 'You are already a member of this organization. Please log in.'
              : 'This email already belongs to another organization.',
          },
          { status: 409 }
        )
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
        password,
        email_confirm: true,
        user_metadata: { name: cleanName },
      })
      if (updateError) throw updateError
      userId = existingAuthUser.id
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: claimed.email,
        password,
        email_confirm: true,
        user_metadata: { name: cleanName },
      })
      if (createError || !created.user) throw createError || new Error('createUser returned no user')
      userId = created.user.id
      createdNew = true
    }

    const { error: profileError } = await admin.from('users').upsert(
      {
        id: userId,
        tenant_id: claimed.tenant_id,
        name: cleanName,
        email: claimed.email,
        role: claimed.role,
        permissions: sanitizePermissions(
          claimed.role as 'master' | 'entry' | 'view',
          claimed.permissions
        ),
        is_active: true,
      },
      { onConflict: 'id' }
    )

    if (profileError) {
      if (createdNew) await admin.auth.admin.deleteUser(userId)
      throw profileError
    }

    return NextResponse.json({ success: true, message: 'Account created successfully' })
  } catch (error) {
    console.error('Create invited user error:', error)
    if (claimedId) await revert(admin, claimedId)
    return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 })
  }
}

// If anything fails after the invitation was claimed, release it so the
// person can try again with the same link.
async function revert(admin: ReturnType<typeof getSupabaseAdmin>, id: string) {
  await admin.from('user_invitations').update({ status: 'pending' }).eq('id', id)
}
