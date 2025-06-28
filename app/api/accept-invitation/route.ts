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
    const { invitationId } = await request.json()

    if (!invitationId) {
      return NextResponse.json(
        { error: 'Invitation ID is required' },
        { status: 400 }
      )
    }

    // Update invitation status using admin client
    const { error } = await supabaseAdmin
      .from('user_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitationId)

    if (error) {
      console.error('Error updating invitation status:', error)
      return NextResponse.json(
        { error: 'Failed to update invitation status' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Accept invitation API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}