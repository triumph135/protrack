import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// This middleware's only job is to keep the Supabase session cookie fresh on
// every request so Server Components see a valid session. It deliberately
// does NOT do any path-based redirect logic — that's handled by
// requireAuth()/requireTenant() in lib/auth.utils.ts on the server and by
// <AuthGuard> on the client. Redirecting from both middleware and the page
// layer at the same time was almost certainly what caused the redirect loops
// that led to this file being disabled entirely; keeping middleware limited
// to session refresh avoids reintroducing that.
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: { headers: req.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options })
          res = NextResponse.next({ request: { headers: req.headers } })
          res.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: '', ...options })
          res = NextResponse.next({ request: { headers: req.headers } })
          res.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refreshes the auth token if it's expired and writes the updated cookie
  // onto the response. Required so server components/route handlers get a
  // valid session on the next request.
  await supabase.auth.getSession()

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
