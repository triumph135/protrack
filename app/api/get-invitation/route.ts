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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Get invitation details using admin client (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('user_invitations')
      .select(`
        *,
        tenants(name),
        invited_by:users!user_invitations_invited_by_fkey(name)
      `)
      .eq('invitation_token', token)
      .eq('status', 'pending')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Invitation not found or already used' },
          { status: 404 }
        )
      }
      throw error
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 400 }
      )
    }

    return NextResponse.json({ invitation: data })

  } catch (error: any) {
    console.error('Get invitation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}