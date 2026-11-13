import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  isAlreadyRegisteredMessage,
  isExpired,
  isValidInvitationToken,
  mayClaimInvitedAuthUser,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
} from '@/lib/security'

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  const response = await fetch(
    `${url}/auth/v1/admin/users?page=1&per_page=20&filter=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
    }
  )

  if (!response.ok) return null

  const body = (await response.json()) as { users?: User[] }
  const match = body.users?.find((user) => user.email?.toLowerCase() === email)
  return match ?? null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const invitationToken = typeof body?.invitationToken === 'string' ? body.invitationToken : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const name = typeof body?.name === 'string' ? body.name.trim() : ''

    if (!isValidInvitationToken(invitationToken) || !password || !name) {
      return NextResponse.json(
        { error: 'Invitation token, password, and name are required' },
        { status: 400 }
      )
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const { data: invitation, error: invitationError } = await admin
      .from('user_invitations')
      .select('id, email, role, tenant_id, permissions, status, expires_at, created_at')
      .eq('invitation_token', invitationToken)
      .eq('status', 'pending')
      .maybeSingle()

    if (invitationError || !invitation) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 })
    }

    if (isExpired(invitation.expires_at)) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
    }

    const email = normalizeEmail(invitation.email)
    let existingAuthUser = await findAuthUserByEmail(email)
    let createdNewAuthUser = false
    let userId = ''

    if (!existingAuthUser) {
      const { data: userData, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      })

      if (createError || !userData.user) {
        if (createError && isAlreadyRegisteredMessage(createError.message)) {
          existingAuthUser = await findAuthUserByEmail(email)
          if (!existingAuthUser) {
            return NextResponse.json(
              {
                error:
                  'An account with this email already exists. Sign in, then open the invitation link to join the organization.',
                code: 'account_exists',
              },
              { status: 409 }
            )
          }
        } else {
          console.error('Error creating user:', createError)
          return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 })
        }
      } else {
        userId = userData.user.id
        createdNewAuthUser = true
      }
    }

    if (existingAuthUser) {
      if (!mayClaimInvitedAuthUser(existingAuthUser, invitation.created_at)) {
        return NextResponse.json(
          {
            error:
              'An account with this email already exists. Sign in, then open the invitation link to join the organization.',
            code: 'account_exists',
          },
          { status: 409 }
        )
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
        password,
        email_confirm: true,
        user_metadata: { name },
      })

      if (updateError) {
        console.error('Error setting invited user password:', updateError)
        return NextResponse.json({ error: 'Failed to finish account setup' }, { status: 500 })
      }

      userId = existingAuthUser.id
    }

    if (!userId) {
      return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 })
    }

    const { data: existingProfile } = await admin
      .from('users')
      .select('id, tenant_id')
      .eq('id', userId)
      .maybeSingle()

    if (existingProfile?.tenant_id && existingProfile.tenant_id !== invitation.tenant_id) {
      return NextResponse.json(
        { error: 'This account already belongs to another organization.' },
        { status: 409 }
      )
    }

    if (existingProfile?.tenant_id === invitation.tenant_id) {
      return NextResponse.json(
        { error: 'You are already a member of this organization. Please log in.' },
        { status: 409 }
      )
    }

    const { error: upsertError } = await admin.from('users').upsert(
      {
        id: userId,
        tenant_id: invitation.tenant_id,
        name,
        email,
        role: invitation.role,
        permissions: invitation.permissions,
        is_active: true,
      },
      { onConflict: 'id' }
    )

    if (upsertError) {
      console.error('Error creating user record:', upsertError)
      if (createdNewAuthUser) {
        await admin.auth.admin.deleteUser(userId)
      }
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 })
    }

    const { error: updateError } = await admin
      .from('user_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id)

    if (updateError) {
      console.warn('Failed to update invitation status:', updateError)
    }

    return NextResponse.json({ success: true, message: 'Account created successfully' })
  } catch (error) {
    console.error('Create invited user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
