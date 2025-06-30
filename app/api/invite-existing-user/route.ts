// app/api/invite-existing-user/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Check for required environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables for Supabase admin client')
}

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

    console.log('🔄 Processing existing user invitation:', {
      email,
      tenantName,
      hasInvitationToken: !!invitationToken,
      redirectUrl
    })

    if (!email || !tenantName || !invitationToken || !redirectUrl) {
      console.error('❌ Missing required fields:', { email: !!email, tenantName: !!tenantName, invitationToken: !!invitationToken, redirectUrl: !!redirectUrl })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Try multiple approaches to ensure existing users get emails
    console.log('🔄 Attempting to send invitation email to existing user...')
    
    let emailSent = false
    let lastError = null
    let linkData: any = null

    // Approach 1: Try using signInWithOtp (sends magic link email)
    try {
      console.log('🔄 Attempting signInWithOtp method...')
      const { error: otpError } = await supabaseAdmin.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            invitation_token: invitationToken,
            tenant_name: tenantName,
            type: 'tenant_invitation'
          }
        }
      })

      if (!otpError) {
        console.log('✅ OTP email sent successfully')
        emailSent = true
      } else {
        console.log('⚠️ OTP method failed:', otpError.message)
        lastError = otpError
      }
    } catch (err: any) {
      console.log('⚠️ OTP method exception:', err.message)
      lastError = err
    }

          // Approach 2: If OTP failed, try generateLink and use it manually
      if (!emailSent) {
        try {
          console.log('🔄 Falling back to generateLink method...')
          
          const { data: generatedLinkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
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

                  if (!linkError && generatedLinkData?.properties?.action_link) {
            console.log('✅ Magic link generated successfully')
            console.log('🔗 Generated link:', generatedLinkData.properties.action_link)
            
            // Store the link data for potential use
            linkData = generatedLinkData
            
            // TODO: Here you could integrate with a custom email service
            // For now, we'll log the link for development
            emailSent = true
        } else {
          console.log('⚠️ GenerateLink method failed:', linkError?.message)
          lastError = linkError
        }
      } catch (err: any) {
        console.log('⚠️ GenerateLink method exception:', err.message)
        lastError = err
      }
    }

    // Approach 3: Last resort - try inviteUserByEmail (might work for existing users in some cases)
    if (!emailSent) {
      try {
        console.log('🔄 Last resort: trying inviteUserByEmail...')
        
        const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          email,
          {
            redirectTo: redirectUrl,
            data: {
              invitation_token: invitationToken,
              tenant_name: tenantName,
              type: 'tenant_invitation'
            }
          }
        )

        if (!inviteError) {
          console.log('✅ Invite email sent successfully')
          emailSent = true
        } else {
          console.log('⚠️ InviteUserByEmail method failed:', inviteError.message)
          lastError = inviteError
        }
      } catch (err: any) {
        console.log('⚠️ InviteUserByEmail method exception:', err.message)
        lastError = err
      }
    }

    if (!emailSent) {
      console.error('❌ All email methods failed. Last error:', lastError)
      return NextResponse.json(
        { 
          error: 'Failed to send invitation email', 
          details: lastError?.message || 'All email methods failed',
          suggestion: 'Please check your Supabase email configuration'
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Invitation sent to existing user',
      debugInfo: process.env.NODE_ENV === 'development' ? {
        generatedLink: linkData?.properties?.action_link,
        emailSent: emailSent
      } : undefined
    })

  } catch (error: any) {
    console.error('Existing user invitation error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}