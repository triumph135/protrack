// app/api/check-user-exists/route.ts
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
    const { email, tenantId } = await request.json()

    if (!email || !tenantId) {
      return NextResponse.json(
        { error: 'Email and tenant ID are required' },
        { status: 400 }
      )
    }

    // Check if user exists in this specific tenant
    const { data: existingUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, name')
      .eq('email', email)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (userError) {
      console.error('Error checking user:', userError)
      return NextResponse.json(
        { error: 'Failed to check user existence' },
        { status: 500 }
      )
    }

    // Check if there's a pending invitation for this email in this tenant
    const { data: existingInvitation, error: invitationError } = await supabaseAdmin
      .from('user_invitations')
      .select('id, status, expires_at')
      .eq('email', email)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .maybeSingle()

    if (invitationError) {
      console.error('Error checking invitation:', invitationError)
      return NextResponse.json(
        { error: 'Failed to check invitation status' },
        { status: 500 }
      )
    }

    // Check if user exists in Supabase Auth (any tenant)
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers()
    
    const authUserExists = authUsers?.users?.some(user => user.email === email)

    return NextResponse.json({
      userExistsInTenant: !!existingUser,
      pendingInvitation: existingInvitation,
      authUserExists: !!authUserExists,
      canInvite: !existingUser && !existingInvitation
    })

  } catch (error: any) {
    console.error('Check user exists error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}