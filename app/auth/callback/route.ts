import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const redirectTo = requestUrl.searchParams.get('redirect_to')
  const token = requestUrl.searchParams.get('token')
  const tokenHash = requestUrl.searchParams.get('token_hash')

  // Log all query parameters for debugging
  const allParams = Object.fromEntries(requestUrl.searchParams.entries())
  
  console.log('🔍 Auth callback hit:', {
    fullUrl: request.url,
    pathname: requestUrl.pathname,
    code: code ? 'present' : 'missing',
    type,
    redirectTo,
    token: token ? 'present' : 'missing',
    tokenHash: tokenHash ? 'present' : 'missing',
    allParams
  })

  // Handle token-based password reset (alternative flow)
  if (!code && (token || tokenHash) && type === 'recovery') {
    console.log('🔐 Token-based password reset detected - redirecting with token')
    const resetUrl = new URL('/reset-password', request.url)
    if (token) resetUrl.searchParams.set('token', token)
    if (tokenHash) resetUrl.searchParams.set('token_hash', tokenHash)
    return NextResponse.redirect(resetUrl)
  }

  if (code) {
    const supabase = createClient()
    
    console.log('🔄 Exchanging code for session...')
    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('❌ Auth callback error:', error)
      return NextResponse.redirect(new URL('/login?error=Authentication failed', request.url))
    }

    console.log('✅ Session exchange successful')
    console.log('🎯 Routing based on type:', type)

    // Route based on the type of authentication flow
    switch (type) {
      case 'recovery':
        console.log('🔐 Password reset flow - redirecting to /reset-password')
        return NextResponse.redirect(new URL('/reset-password', request.url))
      
      case 'signup':
        console.log('📧 Signup confirmation - redirecting to login')
        return NextResponse.redirect(new URL('/login?message=Email confirmed! Please log in.', request.url))
      
      case 'email_change':
        console.log('✉️ Email change - redirecting to dashboard')
        return NextResponse.redirect(new URL('/dashboard?message=Email updated successfully', request.url))
      
      case 'invite':
        console.log('👥 Invitation - redirecting to dashboard')
        return NextResponse.redirect(new URL('/dashboard', request.url))
      
      default:
        console.log('🤷 Default case - checking user tenant status')
        // Default case - check if user has tenant, route accordingly
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Check if user has tenant setup
          const { data: userData } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single()
          
          if (userData?.tenant_id) {
            console.log('👤 User has tenant - redirecting to dashboard')
            return NextResponse.redirect(new URL('/dashboard', request.url))
          } else {
            console.log('🏢 User needs tenant setup')
            return NextResponse.redirect(new URL('/tenant-setup', request.url))
          }
        }
        
        console.log('❌ No user found - redirecting to login')
        return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  console.log('❌ No code parameter - redirecting to login')
  console.log('💡 This usually means the email link is not formatted correctly')
  console.log('💡 Check your Supabase email template and redirect URL configuration')
  
  // If no code, redirect to login
  return NextResponse.redirect(new URL('/login?error=Invalid authentication link', request.url))
}