'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'

export default function HomePage() {
  const { user, loading } = useAuth()
  const { tenant } = useTenant()
  const router = useRouter()

  useEffect(() => {
    // Don't redirect while still loading
    if (loading) return

    // If user is authenticated
    if (user) {
      // If they have a tenant, go to dashboard
      if (tenant) {
        router.push('/dashboard')
      } else {
        // If they don't have a tenant, go to tenant setup
        router.push('/tenant-setup')
      }
    }
  }, [user, tenant, loading, router])

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ProTrack...</p>
        </div>
      </div>
    )
  }

  // If user is authenticated, don't show the landing page (they'll be redirected)
  if (user) {
    return null
  }

  // Show landing page for unauthenticated users
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to ProTrack
        </h1>
        <p className="text-gray-600 mb-8">
          Professional project cost tracking and management
        </p>
        <div className="space-x-4">
          <Link
            href="/login"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  )
}