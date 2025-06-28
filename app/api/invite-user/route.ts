// app/api/invite-user/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Create admin client with service role key
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
    const body = await request.json()
    const { invitationToken } = body

    if (!invitationToken) {
      return NextResponse.json(
        { error: 'Invitation token is required' },
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

    // Send invitation email using admin API
    const { error: emailError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      invitation.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/accept-invitation?token=${invitationToken}`,
        data: {
          invitation_token: invitationToken,
          tenant_id: invitation.tenant_id
        }
      }
    )

    if (emailError) {
      console.error('Email invitation error:', emailError)
      return NextResponse.json(
        { error: 'Failed to send invitation email', details: emailError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Invitation API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

// Alternative endpoint for creating new invitations
export async function PUT(request: NextRequest) {
    try {
      const body = await request.json()
      const { email, redirectUrl } = body
  
      if (!email || !redirectUrl) {
        return NextResponse.json(
          { error: 'Email and redirect URL are required' },
          { status: 400 }
        )
      }
  
      console.log('Sending invitation email to:', email, 'with redirect:', redirectUrl)
  
      // Send invitation email using admin API
      const { data, error: emailError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: redirectUrl,
          data: {
            type: 'new_user_invitation'
          }
        }
      )
  
      if (emailError) {
        console.error('Email invitation error:', emailError)
        
        // Provide more specific error messages
        if (emailError.message?.includes('already registered')) {
          return NextResponse.json(
            { error: 'A user with this email address has already been registered' },
            { status: 409 }
          )
        }
        
        return NextResponse.json(
          { error: 'Failed to send invitation email', details: emailError.message },
          { status: 500 }
        )
      }
  
      console.log('Invitation email sent successfully to:', email)
      return NextResponse.json({ success: true, data })
  
    } catch (error: any) {
      console.error('Invitation API error:', error)
      return NextResponse.json(
        { error: 'Internal server error', details: error.message },
        { status: 500 }
      )
    }
  }