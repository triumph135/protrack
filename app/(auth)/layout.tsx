'use client'

import { usePathname } from 'next/navigation'
import AuthGuard from '@/components/auth/AuthGuard'
import Logo from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isTenantSetup = pathname === '/tenant-setup'
  const isJoin = pathname === '/join'
  const isAcceptInvitation = pathname === '/accept-invitation' || pathname.startsWith('/accept-invitation?')
  const isJoinTenant = pathname === '/join-tenant' || pathname.startsWith('/join-tenant?')
  const isResetPassword = pathname === '/reset-password'
  const isForgotPassword = pathname === '/forgot-password'

  const content = (
    <div className="relative min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center items-center mb-6">
            <Logo size="lg" className="mr-3" />
          </div>
        </div>
        {children}
      </div>
    </div>
  )

  // Old invite URLs redirect immediately and do not need the frame.
  if (isAcceptInvitation || isJoinTenant) {
    return children
  }

  // These pages manage their own session. Reset keeps a recovery session, so
  // it must not bounce a signed-in user back to the dashboard.
  if (isTenantSetup || isJoin || isResetPassword || isForgotPassword) {
    return content
  }

  // Other auth pages (login, register) should redirect authenticated users
  return (
    <AuthGuard requireAuth={false} requireTenant={false} redirectTo="/dashboard">
      {content}
    </AuthGuard>
  )
}