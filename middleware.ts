import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Auth routes (login, register)
  const authPaths = ['/login', '/register']
  const isAuthPath = authPaths.some(path => 
    req.nextUrl.pathname.startsWith(path)
  )

  // If user is logged in and trying to access auth pages, redirect to tenant-setup
  if (isAuthPath && user) {
    return NextResponse.redirect(new URL('/tenant-setup', req.url))
  }

  // Protected routes (everything except auth and tenant-setup)
  const isProtectedPath = !isAuthPath && !req.nextUrl.pathname.startsWith('/tenant-setup') && req.nextUrl.pathname !== '/'

  // If not logged in and trying to access protected route, redirect to login
  if (isProtectedPath && !user) {
    const redirectUrl = new URL('/login', req.url)
    redirectUrl.searchParams.set('redirectTo', req.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If logged in and has tenant, redirect from tenant-setup to dashboard
  if (user && req.nextUrl.pathname === '/tenant-setup') {
    const { data: userData } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (userData?.tenant_id) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  // If logged in but no tenant and trying to access protected routes, redirect to tenant-setup
  if (user && isProtectedPath) {
    const { data: userData } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!userData?.tenant_id) {
      return NextResponse.redirect(new URL('/tenant-setup', req.url))
    }
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}