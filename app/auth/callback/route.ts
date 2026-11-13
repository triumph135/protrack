import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { safeInternalPath } from '@/lib/security'

function redirectWithCookies(
  request: NextRequest,
  path: string,
  cookiesToSet: { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }[]
) {
  const destination = safeInternalPath(path, '/login')
  const response = NextResponse.redirect(new URL(destination, request.url))
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })
  return response
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const token = requestUrl.searchParams.get('token')
  const tokenHash = requestUrl.searchParams.get('token_hash')

  if (!code && (token || tokenHash) && type === 'recovery') {
    const resetUrl = new URL('/reset-password', request.url)
    if (token) resetUrl.searchParams.set('token', token)
    if (tokenHash) resetUrl.searchParams.set('token_hash', tokenHash)
    return NextResponse.redirect(resetUrl)
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=Invalid authentication link', request.url))
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.redirect(new URL('/login?error=Authentication is not configured', request.url))
  }

  const pendingCookies: { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }[] = []

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        pendingCookies.splice(0, pendingCookies.length, ...cookiesToSet)
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('Auth callback error:', error.message)
    return NextResponse.redirect(new URL('/login?error=Authentication failed', request.url))
  }

  if (type === 'recovery') {
    return redirectWithCookies(request, '/reset-password', pendingCookies)
  }
  if (type === 'signup') {
    return redirectWithCookies(request, '/login?message=Email confirmed. Please log in.', pendingCookies)
  }
  if (type === 'email_change') {
    return redirectWithCookies(request, '/dashboard?message=Email updated successfully', pendingCookies)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const invitationType = user?.user_metadata?.type
  const invitationToken = user?.user_metadata?.invitation_token
  if (invitationType === 'tenant_invitation' && typeof invitationToken === 'string') {
    return redirectWithCookies(
      request,
      `/join-tenant?token=${encodeURIComponent(invitationToken)}`,
      pendingCookies
    )
  }

  if (type === 'invite') {
    return redirectWithCookies(request, '/dashboard', pendingCookies)
  }

  if (!user) {
    return redirectWithCookies(request, '/login', pendingCookies)
  }

  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle()

  return redirectWithCookies(
    request,
    userData?.tenant_id ? '/dashboard' : '/tenant-setup',
    pendingCookies
  )
}
