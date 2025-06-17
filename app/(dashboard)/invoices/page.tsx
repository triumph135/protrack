'use client'

import { FileText } from 'lucide-react'
import { useProjects } from '@/hooks/useProjects'
import { useAuth } from '@/contexts/AuthContext'

export default function InvoicesPage() {
  const { activeProject } = useProjects()
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

  if (!hasPermission('invoices', 'read')) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md text-center">
        <p className="text-gray-500">You don't have permission to view invoices.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-purple-500 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Customer Invoices</h1>
                <p className="text-gray-600">Manage billing and invoicing</p>
              </div>
            </div>
            {activeProject && (
              <div className="text-right">
                <p className="text-sm text-gray-500">Active Project</p>
                <p className="text-lg font-semibold text-blue-600">
                  {activeProject.jobNumber} - {activeProject.jobName}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="bg-white p-6 rounded-lg shadow-md text-center">
        <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Invoice Management</h3>
        <p className="text-gray-500">Customer invoice functionality will be implemented in a future step.</p>
        <p className="text-sm text-gray-400 mt-2">
          This will include invoice creation, billing tracking, and payment management.
        </p>
      </div>
    </div>
  )
}