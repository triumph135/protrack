'use client'

import { usePathname } from 'next/navigation'
import AuthGuard from '@/components/auth/AuthGuard'
import Logo from '@/components/ui/Logo'

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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
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

  // These pages render their own full-page layout.
  if (isAcceptInvitation || isJoinTenant || isResetPassword || isForgotPassword) {
    return children
  }

  // Tenant setup uses the shared auth frame but manages its own session rules.
  if (isTenantSetup || isJoin) {
    return content
  }

  // Other auth pages (login, register) should redirect authenticated users
  return (
    <AuthGuard requireAuth={false} requireTenant={false} redirectTo="/dashboard">
      {content}
    </AuthGuard>
  )
}