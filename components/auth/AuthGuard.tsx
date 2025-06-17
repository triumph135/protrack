'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
  requireTenant?: boolean
  redirectTo?: string
}

export default function AuthGuard({ 
  children, 
  requireAuth = true, 
  requireTenant = true,
  redirectTo = '/login' 
}: AuthGuardProps) {
  const { user, loading: authLoading } = useAuth()
  const { tenant, loading: tenantLoading } = useTenant()
  const router = useRouter()
  const [hasCheckedTenant, setHasCheckedTenant] = useState(false)

  // Consider both auth and tenant loading states
  const loading = authLoading || (user && requireTenant && tenantLoading)

  useEffect(() => {
    console.log('AuthGuard state:', { 
      user: !!user, 
      tenant: !!tenant, 
      authLoading, 
      tenantLoading, 
      loading,
      requireAuth, 
      requireTenant,
      userEmail: user?.email,
      tenantName: tenant?.name,
      hasCheckedTenant
    })

    // Don't redirect while still loading
    if (loading) {
      console.log('AuthGuard: Still loading, not redirecting yet')
      return
    }

    // If we have a user but are still waiting for tenant check, wait a bit
    if (user && requireTenant && !hasCheckedTenant && !tenantLoading) {
      console.log('AuthGuard: User loaded, waiting for tenant check...')
      // Give TenantContext a moment to process the user change
      const timer = setTimeout(() => {
        setHasCheckedTenant(true)
      }, 100)
      return () => clearTimeout(timer)
    }

    // If auth is NOT required (auth pages) but user IS authenticated, redirect them away
    if (!requireAuth && user) {
      console.log('AuthGuard: User is authenticated but on auth page, checking tenant...')
      // If they have a tenant, go to dashboard, otherwise go to tenant setup
      if (tenant) {
        console.log('AuthGuard: User has tenant, redirecting to dashboard')
        router.push('/dashboard')
      } else {
        console.log('AuthGuard: User has no tenant, redirecting to tenant setup')
        router.push('/tenant-setup')
      }
      return
    }

    // If auth is required but user is not authenticated
    if (requireAuth && !user) {
      console.log('AuthGuard: No user found, redirecting to:', redirectTo)
      router.push(redirectTo)
      return
    }

    // If tenant is required but no tenant is set (and we've checked)
    if (requireTenant && user && !tenant && hasCheckedTenant) {
      console.log('AuthGuard: User found but no tenant after check, redirecting to tenant setup')
      router.push('/tenant-setup')
      return
    }

    console.log('AuthGuard: All checks passed, rendering children')
  }, [user, tenant, authLoading, tenantLoading, loading, requireAuth, requireTenant, redirectTo, router, hasCheckedTenant])

  // Reset hasCheckedTenant when user changes
  useEffect(() => {
    if (user) {
      setHasCheckedTenant(false)
    }
  }, [user?.id])

  // Show loading while checking authentication
  if (loading || (user && requireTenant && !hasCheckedTenant)) {
    console.log('AuthGuard: Showing loading screen')
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ProTrack...</p>
        </div>
      </div>
    )
  }

  // If auth is NOT required (auth pages) but user IS authenticated, don't render children
  if (!requireAuth && user) {
    return null
  }

  // If auth is required but user is not authenticated, don't render children
  if (requireAuth && !user) {
    return null
  }

  // If tenant is required but no tenant is set, don't render children
  if (requireTenant && user && !tenant && hasCheckedTenant) {
    return null
  }

  // All checks passed, render children
  return <>{children}</>
} 