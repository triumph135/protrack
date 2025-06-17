'use client'

import { Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function UsersPage() {
  const { user } = useAuth()

  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  if (!hasPermission('users', 'read')) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md text-center">
        <p className="text-gray-500">You don't have permission to view user management.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-6">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-blue-500 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
              <p className="text-gray-600">Manage team members and permissions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Current User Info */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Account</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Name</p>
            <p className="text-lg text-gray-900">{user?.name}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Email</p>
            <p className="text-lg text-gray-900">{user?.email}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Role</p>
            <p className="text-lg text-gray-900 capitalize">{user?.role}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Status</p>
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="bg-white p-6 rounded-lg shadow-md text-center">
        <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Team Management</h3>
        <p className="text-gray-500">User management functionality will be implemented in a future step.</p>
        <p className="text-sm text-gray-400 mt-2">
          This will include adding team members, setting permissions, and role management.
        </p>
      </div>
    </div>
  )
}