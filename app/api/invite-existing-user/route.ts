// app/api/invite-existing-user/route.ts
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
    const { email, tenantName, invitationToken, redirectUrl } = await request.json()

    if (!email || !tenantName || !invitationToken || !redirectUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // For now, we'll use a simple approach - you can enhance this with a proper email service
    // Since this is for existing users, we'll use Supabase's built-in email but with custom data
    const { error: emailError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: redirectUrl,
        data: {
          invitation_token: invitationToken,
          tenant_name: tenantName,
          type: 'tenant_invitation'
        }
      }
    })

    if (emailError) {
      console.error('Failed to send existing user invitation:', emailError)
      return NextResponse.json(
        { error: 'Failed to send invitation email', details: emailError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Invitation sent to existing user' 
    })

  } catch (error: any) {
    console.error('Existing user invitation error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}