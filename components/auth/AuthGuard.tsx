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
  const ready = !authLoading && !tenantLoading
  // After the first settled paint, keep the page mounted. Sign-in used to flip
  // the shared loading flag, which unmounted the form and threw away the error.
  const [hasSettled, setHasSettled] = useState(false)

  useEffect(() => {
    if (ready) setHasSettled(true)
  }, [ready])

  useEffect(() => {
    // Don't make any routing decisions if still loading
    if (!ready) {
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
    if (requireTenant && user && !tenant) {
      // Only redirect if user actually has no tenant_id (needs setup)
      // Don't redirect if they have tenant_id but it failed to load (temporary error)
      if (!user.tenant_id) {
        router.push('/tenant-setup')
        return
      }
      // If user has tenant_id but tenant failed to load, just stay on current page
      // The tenant context will retry loading
    }
  }, [user, tenant, ready, requireAuth, requireTenant, redirectTo, router])
  // Show loading screen only until the first session check finishes.
  if (!hasSettled && !ready) {
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

  // Once loading has finished, keep signed-in visitors off the auth screens
  // and signed-out visitors off the app. While a later load is in flight,
  // leave the current page mounted so form state survives.
  if (ready && !requireAuth && user) {
    return null
  }

  if (ready && requireAuth && !user) {
    return null
  }

  if (ready && requireTenant && user && !tenant && !user.tenant_id) {
    return null
  }

  // All checks passed, render children
  return <>{children}</>
} 