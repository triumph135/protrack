'use client'

import { useEffect } from 'react'
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

  // All hooks must be called before any conditional returns
  useEffect(() => {
    // Don't make any decisions while still loading
    if (authLoading || tenantLoading) {
      console.log('AuthGuard: Still loading, waiting...', { authLoading, tenantLoading })
      return
    }

    console.log('AuthGuard state:', { 
      user: !!user, 
      tenant: !!tenant, 
      authLoading, 
      tenantLoading,
      requireAuth, 
      requireTenant,
      userEmail: user?.email,
      tenantName: tenant?.name
    })

    // If auth is NOT required (auth pages) but user IS authenticated, redirect them away
    if (!requireAuth && user) {
      if (tenant) {
        console.log('AuthGuard: User is authenticated and has tenant, redirecting to dashboard')
        // Add small delay to ensure auth state is fully propagated
        setTimeout(() => router.push('/dashboard'), 100)
      } else {
        console.log('AuthGuard: User is authenticated but has no tenant, redirecting to tenant setup')
        setTimeout(() => router.push('/tenant-setup'), 100)
      }
      return
    }

    // If auth is required but user is not authenticated
    if (requireAuth && !user) {
      console.log('AuthGuard: No user found, redirecting to:', redirectTo)
      router.push(redirectTo as any)
      return
    }

    // If tenant is required but no tenant is set (after loading is complete)
    if (requireTenant && user && !tenant) {
      console.log('AuthGuard: User found but no tenant, redirecting to tenant setup')
      router.push('/tenant-setup')
      return
    }

    console.log('AuthGuard: All checks passed, rendering children')
  }, [user, tenant, authLoading, tenantLoading, requireAuth, requireTenant, redirectTo, router])

  // Show loading screen while auth or tenant data is loading
  if (authLoading || tenantLoading) {
    console.log('AuthGuard: Still loading (auth or tenant), showing loading screen')
    return (
      <div 
        className="min-h-screen bg-gray-100 flex items-center justify-center"
        role="status" 
        aria-label="Loading application"
      >
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
  if (requireTenant && user && !tenant) {
    return null
  }

  // All checks passed, render children
  return <>{children}</>
} 