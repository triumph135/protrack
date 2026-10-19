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

  // Invite a new user. The server checks that the caller is an administrator,
  // creates the invitation and sends the email.
  const inviteUser = async (userData: InviteUserData) => {
    if (!tenant?.id || !user?.id) throw new Error('Missing tenant or user')

    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation')
      }

      const invitation = result.invitation as UserInvitation
      setInvitations(prev => [invitation, ...prev])

      if (result.emailSent === false) {
        setError('The invitation was saved but the email could not be sent. Use Resend to try again.')
      }
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

  // Resend invitation (server sends the email and extends expiry)
  const resendInvitation = async (invitationId: string) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/team/invite/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId })
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Failed to resend invitation')
      }

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