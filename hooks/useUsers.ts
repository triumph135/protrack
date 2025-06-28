'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import type { User, UserPermissions } from '@/types/app.types'

interface UserInvitation {
  id: string
  tenant_id: string
  email: string
  role: 'master' | 'entry' | 'view'
  permissions: UserPermissions
  invited_by: string
  invitation_token: string
  status: 'pending' | 'accepted' | 'expired'
  expires_at: string
  created_at: string
  updated_at: string
}

interface InviteUserData {
  email: string
  role: 'master' | 'entry' | 'view'
  permissions: UserPermissions
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [invitations, setInvitations] = useState<UserInvitation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { user } = useAuth()
  const { tenant } = useTenant()
  const supabase = createClient()

  // Load users for current tenant
  const loadUsers = async () => {
    if (!tenant?.id) return

    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: true })

      if (fetchError) throw fetchError
      setUsers(data || [])
    } catch (err: any) {
      console.error('Error loading users:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Load pending invitations
  const loadInvitations = async () => {
    if (!tenant?.id) return

    try {
      const { data, error: fetchError } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setInvitations(data || [])
    } catch (err: any) {
      console.error('Error loading invitations:', err)
    }
  }

  // Invite a new user
  const inviteUser = async (userData: InviteUserData) => {
    if (!tenant?.id || !user?.id) throw new Error('Missing tenant or user')

    try {
      setLoading(true)

      // First, check if user can be invited to this tenant
      const checkResponse = await fetch('/api/check-user-exists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userData.email,
          tenantId: tenant.id
        })
      })

      if (!checkResponse.ok) {
        throw new Error('Failed to verify user eligibility')
      }

      const { userExistsInTenant, pendingInvitation, authUserExists, canInvite } = await checkResponse.json()

      if (userExistsInTenant) {
        throw new Error('A user with this email already exists in your organization')
      }

      if (pendingInvitation) {
        throw new Error('An invitation has already been sent to this email')
      }

      if (!canInvite) {
        throw new Error('Cannot invite this user at this time')
      }

      // Create invitation record
      const { data: invitation, error: inviteError } = await supabase
        .from('user_invitations')
        .insert([{
          ...userData,
          tenant_id: tenant.id,
          invited_by: user.id
        }])
        .select()
        .single()

      if (inviteError) throw inviteError

      // Handle email sending based on whether user exists in auth
      try {
        if (authUserExists) {
          // User exists in auth but not in this tenant - send a custom email
          const response = await fetch('/api/invite-existing-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: userData.email,
              tenantName: tenant.name,
              invitationToken: invitation.invitation_token,
              redirectUrl: `${window.location.origin}/auth/join-tenant?token=${invitation.invitation_token}`
            })
          })

          if (!response.ok) {
            const errorData = await response.json()
            console.warn('Failed to send custom invitation email:', errorData)
          }
        } else {
          // New user - send standard invitation
          const response = await fetch('/api/invite-user', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: userData.email,
              redirectUrl: `${window.location.origin}/accept-invitation?token=${invitation.invitation_token}`
            })
          })

          if (!response.ok) {
            const errorData = await response.json()
            console.warn('Email invitation failed:', errorData)
            // Don't throw here, as the invitation record exists and could be resent
          }
        }
      } catch (emailError) {
        console.warn('Email invitation failed:', emailError)
        // Don't throw here, as the invitation record exists and could be resent
      }

      setInvitations(prev => [invitation, ...prev])
      return invitation
    } catch (err: any) {
      console.error('Error inviting user:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Update user permissions and role
  const updateUser = async (userId: string, updates: Partial<Pick<User, 'role' | 'permissions' | 'is_active'>>) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .eq('tenant_id', tenant.id)
        .select()
        .single()

      if (error) throw error

      setUsers(prev => prev.map(u => u.id === userId ? data : u))
      return data
    } catch (err: any) {
      console.error('Error updating user:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Deactivate user (don't delete to preserve audit trail)
  const deactivateUser = async (userId: string) => {
    if (!tenant?.id) throw new Error('Missing tenant')
    if (userId === user?.id) throw new Error('Cannot deactivate yourself')

    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', userId)
        .eq('tenant_id', tenant.id)
        .select()
        .single()

      if (error) throw error

      setUsers(prev => prev.map(u => u.id === userId ? data : u))
      return data
    } catch (err: any) {
      console.error('Error deactivating user:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Resend invitation
const resendInvitation = async (invitationId: string) => {
    try {
      setLoading(true)
  
      const invitation = invitations.find(inv => inv.id === invitationId)
      if (!invitation) throw new Error('Invitation not found')
  
      // Check if user exists in auth to determine email type
      const checkResponse = await fetch('/api/check-user-exists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: invitation.email,
          tenantId: invitation.tenant_id
        })
      })
  
      if (!checkResponse.ok) {
        throw new Error('Failed to verify user status')
      }
  
      const { authUserExists } = await checkResponse.json()
  
      // Send appropriate email type based on user existence
      if (authUserExists) {
        // Existing user - send join tenant email
        const response = await fetch('/api/invite-existing-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: invitation.email,
            tenantName: tenant?.name || 'Unknown Organization',
            invitationToken: invitation.invitation_token,
            redirectUrl: `${window.location.origin}/auth/join-tenant?token=${invitation.invitation_token}`
          })
        })
  
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to resend invitation')
        }
      } else {
        // New user - send standard invitation
        const response = await fetch('/api/invite-user', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: invitation.email,
            redirectUrl: `${window.location.origin}/accept-invitation?token=${invitation.invitation_token}`
          })
        })
  
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to resend invitation')
        }
      }
  
      // Update the invitation timestamp
      const { error: updateError } = await supabase
        .from('user_invitations')
        .update({ 
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', invitationId)
  
      if (updateError) throw updateError
  
      await loadInvitations() // Refresh invitations
    } catch (err: any) {
      console.error('Error resending invitation:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Cancel invitation
  const cancelInvitation = async (invitationId: string) => {
    try {
      setLoading(true)

      const { error } = await supabase
        .from('user_invitations')
        .update({ status: 'expired' })
        .eq('id', invitationId)

      if (error) throw error

      setInvitations(prev => prev.filter(inv => inv.id !== invitationId))
    } catch (err: any) {
      console.error('Error canceling invitation:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Load data when tenant changes
  useEffect(() => {
    if (tenant?.id) {
      loadUsers()
      loadInvitations()
    }
  }, [tenant?.id])

  return {
    users,
    invitations,
    loading,
    error,
    inviteUser,
    updateUser,
    deactivateUser,
    resendInvitation,
    cancelInvitation,
    refreshUsers: loadUsers,
    refreshInvitations: loadInvitations
  }
}