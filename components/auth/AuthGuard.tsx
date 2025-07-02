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

  useEffect(() => {
    // Don't make any routing decisions if still loading
    if (authLoading || tenantLoading) {
      return
    }
  
    // If auth is NOT required (auth pages) but user IS authenticated, redirect them away
    if (!requireAuth && user) {
      // Additional delay to ensure tenant loading is truly complete
      if (tenant) {
        setTimeout(() => router.push('/dashboard'), 150)
      } else {
        setTimeout(() => router.push('/tenant-setup'), 150)
      }
      return
    }
  
    // If auth is required but user is not authenticated
    if (requireAuth && !user) {
      router.push(redirectTo as any)
      return
    }
  
    // If tenant is required but no tenant is set (after loading is complete)
    // Add additional check to ensure we're not in a loading state
    // Also check if user has tenant_id but tenant failed to load (temporary issue)
    if (requireTenant && user && !tenant && !tenantLoading) {
      // Only redirect if user actually has no tenant_id (needs setup)
      // Don't redirect if they have tenant_id but it failed to load (temporary error)
      if (!user.tenant_id) {
        router.push('/tenant-setup')
        return
      }
      // If user has tenant_id but tenant failed to load, just stay on current page
      // The tenant context will retry loading
    }
  }, [user, tenant, authLoading, tenantLoading, requireAuth, requireTenant, redirectTo, router])
  // Show loading screen while auth or tenant data is loading
  if (authLoading || tenantLoading) {
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
  // But only if user actually has no tenant_id (needs setup)
  if (requireTenant && user && !tenant && !user.tenant_id) {
    return null
  }

  // All checks passed, render children
  return <>{children}</>
} 