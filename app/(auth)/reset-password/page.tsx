'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import Logo from '@/components/ui/Logo'
import { User } from '@supabase/supabase-js'

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [user, setUser] = useState<User | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  
  // Check for token-based parameters
  const token = searchParams.get('token')
  const tokenHash = searchParams.get('token_hash')

  useEffect(() => {
    const handleAuth = async () => {
      console.log('🔍 Reset password page - handling authentication...')
      console.log('🔍 Current URL:', window.location.href)
      console.log('🔍 Has query token:', !!token, 'Has tokenHash:', !!tokenHash)
      
      try {
        // First, check for URL fragment-based auth (access_token, refresh_token in #)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const authType = hashParams.get('type')
        
        console.log('🔍 URL fragment check:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          type: authType
        })
        
        // If we have fragment-based auth tokens for recovery
        if (accessToken && refreshToken && authType === 'recovery') {
          console.log('🔐 Fragment-based password reset detected')
          
          // Set the session using the tokens from URL fragment
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          
          if (sessionError) {
            console.error('❌ Fragment session setup failed:', sessionError)
            setError('Invalid or expired reset link. Please request a new password reset.')
            setLoading(false)
            return
          }
          
          if (sessionData.user) {
            console.log('✅ Fragment-based session established for user:', sessionData.user.email)
            setUser(sessionData.user)
            
            // Clean up the URL by removing the fragment
            const cleanUrl = window.location.pathname
            window.history.replaceState({}, document.title, cleanUrl)
            
            setLoading(false)
            return
          }
        }
        
        // Fallback: check for existing session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        console.log('🔍 Session check result:', {
          hasSession: !!session,
          hasUser: !!session?.user,
          userEmail: session?.user?.email,
          error: error?.message
        })
        
        // If we have a valid session, use it
        if (session && session.user) {
          console.log('✅ Valid session found for user:', session.user.email)
          setUser(session.user)
          setLoading(false)
          return
        }
        
        // If no session but we have tokens from query params, this might be a token-based flow
        if (!session && (token || tokenHash)) {
          console.log('🔍 No session but query tokens found - this may be a direct token link')
          console.log('💡 Setting up minimal user state for token-based reset')
          // For token-based flow, we'll handle verification during password update
          setUser({ email: 'Token-based reset' } as User)
          setLoading(false)
          return
        }
        
        // No session and no tokens
        console.log('❌ No valid session or tokens found')
        setError('Invalid or expired reset link. Please request a new password reset.')
        setLoading(false)
        
      } catch (err) {
        console.error('❌ Error handling authentication:', err)
        setError('Failed to verify reset link. Please try again.')
        setLoading(false)
      }
    }

    handleAuth()
  }, [token, tokenHash])

  const validateForm = () => {
    if (!password) {
      setError('Password is required')
      return false
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return false
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm() || !user) return
  
    try {
      setSubmitting(true)
      setError('')
  
      console.log('🔄 Updating password for user:', user.email)
  
      // Check if this is a token-based reset
      if (token || tokenHash) {
        console.log('🔐 Using token-based password reset')
        
        if (tokenHash) {
          // Use verifyOtp for token_hash
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery'
          })
          
          if (verifyError) {
            console.error('❌ Token verification failed:', verifyError)
            throw new Error('Invalid or expired reset link')
          }
        }
        
        // Update password with token-based flow
        const { error: passwordError } = await supabase.auth.updateUser({
          password: password
        })
        
        if (passwordError) {
          console.error('❌ Token-based password update failed:', passwordError)
          throw passwordError
        }
      } else {
        // Session-based password update
        console.log('🔐 Using session-based password reset')
        const { error: passwordError } = await supabase.auth.updateUser({
          password: password
        })
  
        if (passwordError) {
          console.error('❌ Session-based password update failed:', passwordError)
          throw passwordError
        }
      }
  
      console.log('✅ Password updated successfully')
      setSuccess(true)
      
      // Sign out after password update and redirect to login
      await supabase.auth.signOut()
      
      setTimeout(() => {
        router.push('/login?message=Password updated successfully! Please log in with your new password.')
      }, 2000)
  
    } catch (err: any) {
      console.error('Error updating password:', err)
      setError(err.message || 'Failed to update password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center items-center mb-6">
              <Logo size="lg" className="mr-3" />
            </div>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Verifying reset link...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center items-center mb-6">
              <Logo size="lg" className="mr-3" />
            </div>
            <div className="bg-white p-8 rounded-lg shadow-md">
              <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h2>
              <p className="text-gray-600 mb-4">{error}</p>
              <button
                onClick={() => router.push('/login')}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center items-center mb-6">
              <Logo size="lg" className="mr-3" />
            </div>
            <div className="bg-white p-8 rounded-lg shadow-md">
              <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Password Updated!</h2>
              <p className="text-gray-600 mb-4">
                Your password has been successfully updated. You will be redirected to the login page.
              </p>
              <Loader2 className="mx-auto h-4 w-4 animate-spin text-blue-600" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center items-center mb-6">
            <Logo size="lg" className="mr-3" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-700">
            Reset Your Password
          </h2>
          <p className="mt-2 text-gray-600">
            Enter your new password below
          </p>
          {user && (
            <p className="text-sm text-blue-600 mt-1">
              Resetting password for: {user.email}
            </p>
          )}
        </div>

        <div className="bg-white py-8 px-6 shadow-xl rounded-lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm flex items-center">
                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Password Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter new password"
                  disabled={submitting}
                  required
                />
                <Lock className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  disabled={submitting}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-500">Minimum 6 characters</p>
            </div>

            {/* Confirm Password Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Confirm new password"
                  disabled={submitting}
                  required
                />
                <Lock className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitting ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}