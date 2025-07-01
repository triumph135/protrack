'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Eye, EyeOff, Mail, User, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import Logo from '@/components/ui/Logo'

interface InvitationDetails {
  id: string
  email: string
  role: string
  tenant_id: string
  tenant_name: string
  invited_by_name: string
  permissions: any
}

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center items-center mb-6">
            <Logo size="lg" className="mr-3" />
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading invitation...</p>
        </div>
      </div>
    </div>
  )
}

// Component that actually uses useSearchParams
function AcceptInvitationContent() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    confirmPassword: ''
  })
  const [showPassword, setShowPassword] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const supabase = createClient()

  useEffect(() => {
    if (token) {
      loadInvitation(token)
    } else {
      setError('Invalid invitation link')
      setLoading(false)
    }
  }, [token])

  const loadInvitation = async (invitationToken: string) => {
    try {
      setLoading(true)
      setError('')

      // Get invitation details via API route
      const response = await fetch(`/api/get-invitation?token=${invitationToken}`)
      const result = await response.json()

      if (!response.ok) {
      throw new Error(result.error || 'Failed to load invitation')
      }

      const data = result.invitation

      // Check if invitation is expired
      if (new Date(data.expires_at) < new Date()) {
        setError('This invitation has expired. Please request a new invitation.')
        return
      }

      // Check if user already exists in this specific tenant
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', data.email)
        .eq('tenant_id', data.tenant_id)
        .single()

      if (existingUser) {
        setError('You are already a member of this organization. Please log in instead.')
        return
      }

      setInvitation({
        id: data.id,
        email: data.email,
        role: data.role,
        tenant_id: data.tenant_id,
        tenant_name: data.tenants?.name || 'Unknown Organization',
        invited_by_name: data.invited_by?.name || 'Unknown',
        permissions: data.permissions
      })

      // Pre-fill name from email
      setFormData(prev => ({
        ...prev,
        name: data.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
      }))

    } catch (err: any) {
      console.error('Error loading invitation:', err)
      setError('Failed to load invitation details. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('Name is required')
      return false
    }
    if (!formData.password) {
      setError('Password is required')
      return false
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long')
      return false
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm() || !invitation) return
  
    try {
      setSubmitting(true)
      setError('')
  
      // Use the new API endpoint to create user with admin API
      const response = await fetch('/api/create-invited-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitationToken: token,
          password: formData.password,
          name: formData.name
        })
      })
  
      const result = await response.json()
  
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create account')
      }
  
      setSuccess(true)
      
      // Redirect to login after a brief delay
      setTimeout(() => {
        router.push('/login?message=Account created successfully! Please log in.')
      }, 2000)
  
    } catch (err: any) {
      console.error('Error accepting invitation:', err)
      setError(err.message || 'Failed to create account. Please try again.')
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
            <p className="text-gray-600">Loading invitation...</p>
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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Created!</h2>
              <p className="text-gray-600 mb-4">
                Your account has been successfully created. You will be redirected to the login page.
              </p>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center items-center mb-6">
              <Logo size="lg" className="mr-3" />
            </div>
            <div className="bg-white p-8 rounded-lg shadow-md">
              <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h2>
              <p className="text-gray-600 mb-4">{error}</p>
              <button
                onClick={() => router.push('/login')}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                Go to Login
              </button>
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
          <h2 className="text-3xl font-extrabold text-gray-900">Join ProTrack</h2>
          <p className="mt-2 text-gray-600">
            You've been invited to join <strong>{invitation?.tenant_name}</strong>
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow-xl rounded-lg">
          {/* Invitation Details */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center mb-2">
              <Mail className="h-5 w-5 text-blue-500 mr-2" />
              <span className="text-sm font-medium text-blue-900">Invitation Details</span>
            </div>
            <div className="text-sm text-blue-700">
              <p><strong>Organization:</strong> {invitation?.tenant_name}</p>
              <p><strong>Email:</strong> {invitation?.email}</p>
              <p><strong>Role:</strong> {invitation?.role === 'entry' ? 'Project Manager' : invitation?.role}</p>
              <p><strong>Invited by:</strong> {invitation?.invited_by_name}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            {/* Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Your full name"
                  disabled={submitting}
                  required
                />
                <User className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Choose a password"
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
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Confirm your password"
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
              {submitting ? 'Creating Account...' : 'Create Account & Join Team'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// Main page component with Suspense boundary
export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AcceptInvitationContent />
    </Suspense>
  )
}