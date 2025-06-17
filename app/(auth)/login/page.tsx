'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showRedirectScreen, setShowRedirectScreen] = useState(false)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'
  const { signIn, loading, user, supabaseUser } = useAuth()

  // ALWAYS call all hooks in the same order - no conditional hooks!
  
  // Hook 1: Debug auth state
  useEffect(() => {
    console.log('Login page auth state:', { 
      loading, 
      hasUser: !!user, 
      hasSupabaseUser: !!supabaseUser,
      userEmail: user?.email,
      supabaseEmail: supabaseUser?.email,
      hasTenant: user?.tenant_id ? 'Yes' : 'No'
    })
  }, [loading, user, supabaseUser])

  // Hook 2: Handle showing redirect screen
  useEffect(() => {
    if (!loading && user && supabaseUser) {
      console.log('User is authenticated, showing redirect screen')
      setShowRedirectScreen(true)
    } else {
      setShowRedirectScreen(false)
    }
  }, [loading, user, supabaseUser])

  // Hook 3: Perform actual redirect
  useEffect(() => {
    if (showRedirectScreen && user && !isSubmitting) {
      const targetUrl = user.tenant_id ? redirectTo : '/tenant-setup'
      console.log('Redirecting authenticated user to:', targetUrl)
      
      const timer = setTimeout(() => {
        window.location.href = targetUrl
      }, 2000) // Give it more time to prevent conflicts
      
      return () => clearTimeout(timer)
    }
  }, [showRedirectScreen, user, redirectTo, router, isSubmitting])

  // Manual redirect handler for the button
  const handleManualRedirect = () => {
    const targetUrl = user?.tenant_id ? redirectTo : '/tenant-setup'
    console.log('Manual redirect to:', targetUrl)
    // Use window.location.href for a more forceful redirect
    window.location.href = targetUrl
  }

  const validateForm = () => {
    if (!email) {
      setError('Email is required')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return false
    }
    if (!password) {
      setError('Password is required')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // If already showing redirect screen, don't submit
    if (showRedirectScreen) {
      console.log('Already authenticated, preventing duplicate submission')
      return
    }
    
    if (!validateForm()) return

    setIsSubmitting(true)
    setError('')

    try {
      console.log('Attempting sign in for:', email)
      const result = await signIn(email, password)
      
      if (result.error) {
        console.error('Sign in error:', result.error)
        setError(result.error.message)
        setIsSubmitting(false)
      } else {
        console.log('Sign in successful, waiting for auth state update...')
        // Don't set isSubmitting to false - let the redirect handle it
      }
    } catch (err: any) {
      console.error('Unexpected sign in error:', err)
      setError(err.message || 'An unexpected error occurred')
      setIsSubmitting(false)
    }
  }

  const showLoading = loading || isSubmitting

  // ALWAYS render the same structure - just change the content
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo - Always rendered */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">ProTrack</h1>
          <h2 className="text-2xl font-semibold text-gray-700">
            {showRedirectScreen ? 'Redirecting...' : 'Welcome back'}
          </h2>
          <p className="mt-2 text-gray-600">
            {showRedirectScreen ? 'You are already signed in' : 'Sign in to your ProTrack account'}
          </p>
        </div>

        {/* Debug Info - Always rendered in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-gray-100 p-3 rounded-lg text-xs">
            <p><strong>Debug Info:</strong></p>
            <p>Auth Loading: {loading ? 'Yes' : 'No'}</p>
            <p>Submitting: {isSubmitting ? 'Yes' : 'No'}</p>
            <p>Show Redirect: {showRedirectScreen ? 'Yes' : 'No'}</p>
            <p>Has User: {user ? 'Yes' : 'No'}</p>
            <p>Has Supabase User: {supabaseUser ? 'Yes' : 'No'}</p>
            {user && <p>User Email: {user.email}</p>}
            {user && <p>Has Tenant: {user.tenant_id ? 'Yes' : 'No'}</p>}
          </div>
        )}

        {/* Main Content - Always rendered but content changes */}
        <div className="bg-white py-8 px-6 shadow-xl rounded-lg">
          {showRedirectScreen ? (
            // Redirect Screen Content
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-600 mb-4">Redirecting to your dashboard...</p>
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-3">
                  If redirect doesn't work, click here:
                </p>
                <button
                  onClick={handleManualRedirect}
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          ) : (
            // Login Form Content
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={showLoading}
                    className="appearance-none relative block w-full px-3 py-3 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                    placeholder="Enter your email"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={showLoading}
                    className="appearance-none relative block w-full px-3 py-3 pl-10 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                    placeholder="Enter your password"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={showLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5 text-gray-400" />
                    ) : (
                      <Eye className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={showLoading}
                  className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {showLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {isSubmitting ? 'Signing In...' : 'Loading...'}
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </div>

              <div className="text-center">
                <Link
                  href="/register"
                  className="text-blue-600 hover:text-blue-500 text-sm"
                >
                  Don't have an account? Sign up
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}