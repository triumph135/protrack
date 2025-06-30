import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: NextRequest) {
  try {
    const { invitationToken, password, name } = await request.json()

    if (!invitationToken || !password || !name) {
      return NextResponse.json(
        { error: 'Invitation token, password, and name are required' },
        { status: 400 }
      )
    }

    // Get invitation details
    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('user_invitations')
      .select('*')
      .eq('invitation_token', invitationToken)
      .eq('status', 'pending')
      .single()

    if (invitationError || !invitation) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation' },
        { status: 404 }
      )
    }

    // Check if invitation is expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 400 }
      )
    }

    // Check if user already exists in auth (handle the broken user case)
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(user => user.email === invitation.email)
    
    let userId: string

    if (existingUser) {
      // User exists (probably from previous invitation) - update their password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        {
          password: password,
          email_confirm: true,
          user_metadata: {
            name: name
          }
        }
      )

      if (updateError) {
        console.error('Error updating existing user:', updateError)
        return NextResponse.json(
          { error: 'Failed to update user account' },
          { status: 500 }
        )
      }

      userId = existingUser.id
    } else {
      // Create new user using admin API (automatically confirmed)
      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: invitation.email,
        password: password,
        email_confirm: true, // This auto-confirms the email
        user_metadata: {
          name: name
        }
      })

      if (createError || !userData.user) {
        console.error('Error creating user:', createError)
        return NextResponse.json(
          { error: 'Failed to create user account' },
          { status: 500 }
        )
      }

      userId = userData.user.id
    }

    // Create/update user record in database
    const { error: upsertError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: userId,
        tenant_id: invitation.tenant_id,
        name: name,
        email: invitation.email,
        role: invitation.role,
        permissions: invitation.permissions,
        is_active: true
      }, {
        onConflict: 'id'
      })

    if (upsertError) {
      console.error('Error creating user record:', upsertError)
      // Try to clean up the auth user if database insert fails (only for new users)
      if (!existingUser) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
      }
      return NextResponse.json(
        { error: 'Failed to create user profile' },
        { status: 500 }
      )
    }

    // Update invitation status
    const { error: updateError } = await supabaseAdmin
      .from('user_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id)

    if (updateError) {
      console.warn('Failed to update invitation status:', updateError)
      // Don't fail the whole process for this
    }

    return NextResponse.json({ 
      success: true,
      message: 'Account created successfully' 
    })

  } catch (error: any) {
    console.error('Create invited user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}