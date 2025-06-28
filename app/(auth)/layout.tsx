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
  const isAcceptInvitation = pathname === '/accept-invitation' || pathname.startsWith('/accept-invitation?')
  const isJoinTenant = pathname === '/join-tenant' || pathname.startsWith('/join-tenant?')

  const content = (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
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

  // These pages handle their own auth logic
  if (isTenantSetup || isAcceptInvitation || isJoinTenant) {
    return content
  }

  // Other auth pages (login, register) should redirect authenticated users
  return (
    <AuthGuard requireAuth={false} requireTenant={false} redirectTo="/dashboard">
      {content}
    </AuthGuard>
  )
}