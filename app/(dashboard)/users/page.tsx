'use client'

import { useState } from 'react'
import { 
  Users, Plus, Mail, Shield, User, CheckCircle, 
  MoreVertical, RefreshCw, Trash2, UserX, 
  Calendar, Clock, AlertCircle 
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useUsers } from '@/hooks/useUsers'
import UserInviteModal from '@/components/UserInviteModal'
import type { User as UserType } from '@/types/app.types'

interface UserCardProps {
  user: UserType
  currentUserId: string
  onUpdateUser: (userId: string, updates: any) => Promise<void>
  onDeactivateUser: (userId: string) => Promise<void>
}

function UserCard({ user, currentUserId, onUpdateUser, onDeactivateUser }: UserCardProps) {
  const [showActions, setShowActions] = useState(false)
  const [loading, setLoading] = useState(false)

  const getRoleInfo = (role: string) => {
    switch (role) {
      case 'master':
        return { icon: Shield, color: 'text-red-500', bg: 'bg-red-50', label: 'Master' }
      case 'entry':
        return { icon: User, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Project Manager' }
      case 'view':
        return { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: 'Viewer' }
      default:
        return { icon: User, color: 'text-gray-500', bg: 'bg-gray-50', label: 'Unknown' }
    }
  }

  const handleDeactivate = async () => {
    if (!window.confirm(`Are you sure you want to deactivate ${user.name}? They will no longer be able to access the system.`)) {
      return
    }

    try {
      setLoading(true)
      await onDeactivateUser(user.id)
    } catch (error) {
      console.error('Error deactivating user:', error)
    } finally {
      setLoading(false)
      setShowActions(false)
    }
  }

  const roleInfo = getRoleInfo(user.role)
  const RoleIcon = roleInfo.icon
  const isCurrentUser = user.id === currentUserId

  return (
    <div className={`bg-white p-6 rounded-lg shadow-sm border ${!user.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-4">
          <div className={`w-12 h-12 rounded-full ${roleInfo.bg} flex items-center justify-center`}>
            <RoleIcon className={`w-6 h-6 ${roleInfo.color}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              {user.name}
              {isCurrentUser && (
                <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                  You
                </span>
              )}
              {!user.is_active && (
                <span className="ml-2 px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                  Inactive
                </span>
              )}
            </h3>
            <p className="text-gray-600">{user.email}</p>
            <p className="text-sm text-gray-500">{roleInfo.label}</p>
          </div>
        </div>

        {!isCurrentUser && (
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              disabled={loading}
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showActions && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border z-10">
                <div className="py-1">
                  {user.is_active && (
                    <button
                      onClick={handleDeactivate}
                      disabled={loading}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <UserX className="w-4 h-4 mr-2" />
                      Deactivate User
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Permissions Summary */}
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Access Level</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(user.permissions).map(([area, level]) => {
            if (level === 'none') return null
            return (
              <span
                key={area}
                className={`px-2 py-1 text-xs font-medium rounded-full ${
                  level === 'write' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {area} ({level})
              </span>
            )
          })}
        </div>
      </div>

      {user.last_login && (
        <div className="mt-4 text-sm text-gray-500 flex items-center">
          <Clock className="w-4 h-4 mr-1" />
          Last login: {new Date(user.last_login).toLocaleDateString()}
        </div>
      )}
    </div>
  )
}

function InvitationCard({ invitation, onResend, onCancel }: {
  invitation: any
  onResend: (id: string) => Promise<void>
  onCancel: (id: string) => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  const handleResend = async () => {
    try {
      setLoading(true)
      await onResend(invitation.id)
    } catch (error) {
      console.error('Error resending invitation:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this invitation?')) return

    try {
      setLoading(true)
      await onCancel(invitation.id)
    } catch (error) {
      console.error('Error canceling invitation:', error)
    } finally {
      setLoading(false)
    }
  }

  const isExpired = new Date(invitation.expires_at) < new Date()

  return (
    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
            <Mail className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <h4 className="font-medium text-gray-900">{invitation.email}</h4>
            <p className="text-sm text-gray-600 capitalize">{invitation.role}</p>
            <p className="text-xs text-gray-500">
              {isExpired ? 'Expired' : 'Pending'} • Invited {new Date(invitation.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={handleResend}
            disabled={loading}
            className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 disabled:opacity-50"
          >
            <RefreshCw className="w-3 h-3 mr-1 inline" />
            Resend
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const { user } = useAuth()
  const { 
    users, 
    invitations, 
    loading, 
    error, 
    inviteUser, 
    updateUser, 
    deactivateUser, 
    resendInvitation, 
    cancelInvitation 
  } = useUsers()
  
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  const canManageUsers = hasPermission('users', 'write')

  if (!hasPermission('users', 'read')) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-500">You don't have permission to view user management.</p>
      </div>
    )
  }

  const handleInviteUser = async (userData: any) => {
    try {
      setInviteError(null)
      await inviteUser(userData)
    } catch (error: any) {
      setInviteError(error.message)
      throw error // Re-throw to prevent modal from closing
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-500 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                <p className="text-gray-600">Manage team members and permissions</p>
              </div>
            </div>
            {canManageUsers && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Invite User
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Pending Invitations</h2>
          <div className="grid gap-4">
            {invitations.map((invitation) => (
              <InvitationCard
                key={invitation.id}
                invitation={invitation}
                onResend={resendInvitation}
                onCancel={cancelInvitation}
              />
            ))}
          </div>
        </div>
      )}

      {/* Active Users */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Team Members ({users.filter(u => u.is_active).length})
        </h2>
        
        {loading && users.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow-sm text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading users...</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {users
              .filter(u => u.is_active)
              .map((teamUser) => (
                <UserCard
                  key={teamUser.id}
                  user={teamUser}
                  currentUserId={user?.id || ''}
                  onUpdateUser={updateUser}
                  onDeactivateUser={deactivateUser}
                />
              ))}
          </div>
        )}

        {users.filter(u => u.is_active).length === 0 && !loading && (
          <div className="bg-white p-8 rounded-lg shadow-sm text-center">
            <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Team Members</h3>
            <p className="text-gray-500 mb-4">Get started by inviting your first team member.</p>
            {canManageUsers && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Invite User
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inactive Users */}
      {users.some(u => !u.is_active) && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Inactive Users ({users.filter(u => !u.is_active).length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {users
              .filter(u => !u.is_active)
              .map((teamUser) => (
                <UserCard
                  key={teamUser.id}
                  user={teamUser}
                  currentUserId={user?.id || ''}
                  onUpdateUser={updateUser}
                  onDeactivateUser={deactivateUser}
                />
              ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      <UserInviteModal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false)
          setInviteError(null)
        }}
        onInvite={handleInviteUser}
        loading={loading}
      />

      {/* Invite Error */}
      {inviteError && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-md p-4 shadow-lg max-w-sm">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Invitation Failed</h3>
              <p className="text-sm text-red-700 mt-1">{inviteError}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}