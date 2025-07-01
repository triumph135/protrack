'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building, User, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
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
function JoinTenantContent() {
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { user, supabaseUser, refreshUser } = useAuth()
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

      // Get invitation details with tenant info
      const { data, error: fetchError } = await supabase
        .from('user_invitations')
        .select(`
          *,
          tenants(name),
          invited_by:users!user_invitations_invited_by_fkey(name)
        `)
        .eq('invitation_token', invitationToken)
        .eq('status', 'pending')
        .single()

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          setError('This invitation is invalid or has already been used.')
        } else {
          throw fetchError
        }
        return
      }

      // Check if invitation is expired
      if (new Date(data.expires_at) < new Date()) {
        setError('This invitation has expired. Please request a new invitation.')
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

    } catch (err: any) {
      console.error('Error loading invitation:', err)
      setError('Failed to load invitation details. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinTenant = async () => {
    if (!invitation || !user || !supabaseUser) {
      setError('Unable to process invitation. Please make sure you are logged in.')
      return
    }

    // Verify the invitation is for the logged-in user
    if (invitation.email !== user.email && invitation.email !== supabaseUser.email) {
      setError('This invitation is for a different email address. Please log in with the correct account.')
      return
    }

    try {
      setJoining(true)
      setError('')

      // Check if user already exists in this tenant
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', invitation.email)
        .eq('tenant_id', invitation.tenant_id)
        .single()

      if (existingUser) {
        setError('You are already a member of this organization.')
        return
      }

      // Create user record in the new tenant
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: user.id, // Use existing user ID
          tenant_id: invitation.tenant_id,
          name: user.name,
          email: invitation.email,
          role: invitation.role,
          permissions: invitation.permissions,
          is_active: true
        })

      if (insertError) throw insertError

      // Update invitation status
      const { error: updateError } = await supabase
        .from('user_invitations')
        .update({ status: 'accepted' })
        .eq('id', invitation.id)

      if (updateError) {
        console.warn('Failed to update invitation status:', updateError)
        // Don't fail the whole process for this
      }

      // Refresh user data to get new tenant access
      await refreshUser()

      setSuccess(true)
      
      // Redirect to dashboard after a brief delay
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)

    } catch (err: any) {
      console.error('Error joining tenant:', err)
      setError(err.message || 'Failed to join organization. Please try again.')
    } finally {
      setJoining(false)
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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to {invitation?.tenant_name}!</h2>
              <p className="text-gray-600 mb-4">
                You have successfully joined the organization. You will be redirected to the dashboard.
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
                onClick={() => router.push('/dashboard')}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user || !supabaseUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center items-center mb-6">
              <Logo size="lg" className="mr-3" />
            </div>
            <div className="bg-white p-8 rounded-lg shadow-md">
              <User className="mx-auto h-12 w-12 text-blue-500 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Please Log In</h2>
              <p className="text-gray-600 mb-4">
                You need to be logged in to accept this invitation.
              </p>
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
          <h2 className="text-3xl font-extrabold text-gray-900">Join Organization</h2>
          <p className="mt-2 text-gray-600">
            You've been invited to join <strong>{invitation?.tenant_name}</strong>
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow-xl rounded-lg">
          {/* Invitation Details */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center mb-2">
              <Building className="h-5 w-5 text-blue-500 mr-2" />
              <span className="text-sm font-medium text-blue-900">Invitation Details</span>
            </div>
            <div className="text-sm text-blue-700">
              <p><strong>Organization:</strong> {invitation?.tenant_name}</p>
              <p><strong>Your Email:</strong> {invitation?.email}</p>
              <p><strong>Role:</strong> {invitation?.role === 'entry' ? 'Project Manager' : invitation?.role}</p>
              <p><strong>Invited by:</strong> {invitation?.invited_by_name}</p>
            </div>
          </div>

          {/* Current User Info */}
          <div className="mb-6 p-4 bg-green-50 rounded-lg">
            <div className="flex items-center mb-2">
              <User className="h-5 w-5 text-green-500 mr-2" />
              <span className="text-sm font-medium text-green-900">Logged in as</span>
            </div>
            <div className="text-sm text-green-700">
              <p><strong>Name:</strong> {user?.name}</p>
              <p><strong>Email:</strong> {user?.email}</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Email Mismatch Warning */}
          {invitation && user && invitation.email !== user.email && (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md text-sm">
              <strong>Warning:</strong> This invitation is for {invitation.email}, but you're logged in as {user.email}. 
              Please log in with the correct account to accept this invitation.
            </div>
          )}

          {/* Join Button */}
          <button
            onClick={handleJoinTenant}
            disabled={joining || !!(invitation && user && invitation.email !== user.email)}
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {joining && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {joining ? 'Joining Organization...' : `Join ${invitation?.tenant_name}`}
          </button>

          <div className="mt-4 text-center">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel and go to dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function JoinTenantPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <JoinTenantContent />
    </Suspense>
  )
}