'use client'

import { useState } from 'react'
import { X, Mail, User, Shield, CheckCircle, Loader2 } from 'lucide-react'
import type { UserPermissions } from '@/types/app.types'

interface UserInviteModalProps {
  isOpen: boolean
  onClose: () => void
  onInvite: (userData: {
    email: string
    role: 'master' | 'entry' | 'view'
    permissions: UserPermissions
  }) => Promise<void>
  loading?: boolean
}

const DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  master: {
    material: 'write',
    labor: 'write',
    equipment: 'write',
    subcontractor: 'write',
    others: 'write',
    capLeases: 'write',
    consumable: 'write',
    invoices: 'write',
    projects: 'write',
    users: 'write'
  },
  entry: {
    material: 'write',
    labor: 'write',
    equipment: 'write',
    subcontractor: 'write',
    others: 'write',
    capLeases: 'write',
    consumable: 'write',
    invoices: 'read',
    projects: 'read',
    users: 'none'
  },
  view: {
    material: 'read',
    labor: 'read',
    equipment: 'read',
    subcontractor: 'read',
    others: 'read',
    capLeases: 'read',
    consumable: 'read',
    invoices: 'read',
    projects: 'read',
    users: 'none'
  }
}

const PERMISSION_AREAS = [
  { key: 'material', label: 'Material Costs' },
  { key: 'labor', label: 'Labor Costs' },
  { key: 'equipment', label: 'Equipment Costs' },
  { key: 'subcontractor', label: 'Subcontractor Costs' },
  { key: 'others', label: 'Other Costs' },
  { key: 'capLeases', label: 'Capital Leases' },
  { key: 'consumable', label: 'Consumable Costs' },
  { key: 'invoices', label: 'Customer Invoices' },
  { key: 'projects', label: 'Projects' },
  { key: 'users', label: 'User Management' }
]

export default function UserInviteModal({ isOpen, onClose, onInvite, loading = false }: UserInviteModalProps) {
  const [formData, setFormData] = useState({
    email: '',
    role: 'entry' as 'master' | 'entry' | 'view'
  })
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS.entry)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Update permissions when role changes
  const handleRoleChange = (role: 'master' | 'entry' | 'view') => {
    setFormData({ ...formData, role })
    setPermissions(DEFAULT_PERMISSIONS[role])
  }

  const handlePermissionChange = (area: string, level: 'none' | 'read' | 'write') => {
    setPermissions(prev => ({
      ...prev,
      [area]: level
    }))
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    try {
      setIsSubmitting(true)
      await onInvite({
        email: formData.email,
        role: formData.role,
        permissions
      })
      
      // Reset form
      setFormData({ email: '', role: 'entry' })
      setPermissions(DEFAULT_PERMISSIONS.entry)
      setErrors({})
      onClose()
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (isSubmitting) return
    setFormData({ email: '', role: 'entry' })
    setPermissions(DEFAULT_PERMISSIONS.entry)
    setErrors({})
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Invite New User</h3>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={`block w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-1 ${
                  errors.email
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                placeholder="user@example.com"
                disabled={isSubmitting}
              />
              <Mail className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              User Role
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['master', 'entry', 'view'] as const).map((role) => (
                <div
                  key={role}
                  className={`relative rounded-lg border p-4 cursor-pointer focus:outline-none ${
                    formData.role === role
                      ? 'border-blue-500 ring-2 ring-blue-500'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => !isSubmitting && handleRoleChange(role)}
                >
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      {role === 'master' && <Shield className="h-5 w-5 text-red-500" />}
                      {role === 'entry' && <User className="h-5 w-5 text-blue-500" />}
                      {role === 'view' && <CheckCircle className="h-5 w-5 text-green-500" />}
                    </div>
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900 capitalize">
                        {role === 'master' ? 'Master' : role === 'entry' ? 'Project Manager' : 'Viewer'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {role === 'master' && 'Full access to all features'}
                        {role === 'entry' && 'Can manage costs and data entry'}
                        {role === 'view' && 'Read-only access to reports'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Permissions Detail */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Detailed Permissions
            </label>
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="grid grid-cols-1 gap-3">
                {PERMISSION_AREAS.map((area) => (
                  <div key={area.key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{area.label}</span>
                    <div className="flex space-x-2">
                      {(['none', 'read', 'write'] as const).map((level) => (
                        <label key={level} className="inline-flex items-center">
                          <input
                            type="radio"
                            name={`permission-${area.key}`}
                            value={level}
                            checked={permissions[area.key as keyof UserPermissions] === level}
                            onChange={() => handlePermissionChange(area.key, level)}
                            disabled={isSubmitting}
                            className="form-radio h-3 w-3 text-blue-600"
                          />
                          <span className="ml-1 text-xs text-gray-600 capitalize">{level}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send Invitation
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}