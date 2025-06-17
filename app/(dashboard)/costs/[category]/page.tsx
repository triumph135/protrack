'use client'

import { useSearchParams } from 'next/navigation'
import { DollarSign, Users, Wrench, Building, FileText, CreditCard, Package } from 'lucide-react'
import { useProjects } from '@/hooks/useProjects'
import { useAuth } from '@/contexts/AuthContext'

const categoryConfig = {
  material: {
    title: 'Material Costs',
    icon: Package,
    description: 'Track material purchases and supplies',
    color: 'blue'
  },
  labor: {
    title: 'Labor Costs',
    icon: Users,
    description: 'Record employee hours and labor costs',
    color: 'green'
  },
  equipment: {
    title: 'Equipment Costs',
    icon: Wrench,
    description: 'Track equipment rentals and purchases',
    color: 'orange'
  },
  subcontractor: {
    title: 'Subcontractor Costs',
    icon: Building,
    description: 'Manage subcontractor expenses',
    color: 'purple'
  },
  others: {
    title: 'Other Costs',
    icon: FileText,
    description: 'Miscellaneous project expenses',
    color: 'gray'
  },
  'cap-leases': {
    title: 'Capital Leases',
    icon: CreditCard,
    description: 'Capital lease payments',
    color: 'indigo'
  },
  consumable: {
    title: 'Consumable Costs',
    icon: DollarSign,
    description: 'Consumable supplies and materials',
    color: 'red'
  }
}

export default function CostsPage() {
  const searchParams = useSearchParams()
  const category = searchParams.get('category') || 'material'
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

  const config = categoryConfig[category as keyof typeof categoryConfig]
  const Icon = config?.icon || DollarSign

  if (!config) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md text-center">
        <p className="text-red-500">Invalid cost category</p>
      </div>
    )
  }

  if (!hasPermission(category, 'read')) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md text-center">
        <p className="text-gray-500">You don't have permission to view {config.title.toLowerCase()}.</p>
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-6">
            <div className="flex items-center">
              <Icon className={`h-8 w-8 text-${config.color}-500 mr-3`} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{config.title}</h1>
                <p className="text-gray-600">{config.description}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">
          Please select an active project to view and manage costs.
        </div>
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
              <Icon className={`h-8 w-8 text-${config.color}-500 mr-3`} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{config.title}</h1>
                <p className="text-gray-600">{config.description}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Active Project</p>
              <p className="text-lg font-semibold text-blue-600">
                {activeProject.jobNumber} - {activeProject.jobName}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cost Summary */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">$0</p>
            <p className="text-sm text-gray-500">Total Costs</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">$0</p>
            <p className="text-sm text-gray-500">Budget</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">$0</p>
            <p className="text-sm text-gray-500">Variance</p>
          </div>
        </div>
      </div>

      {/* Cost Entry Form Placeholder */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add {config.title}</h3>
        <div className="text-center py-8">
          <Icon className={`mx-auto h-12 w-12 text-${config.color}-400 mb-4`} />
          <p className="text-gray-500">Cost entry forms will be implemented in the next step.</p>
          <p className="text-sm text-gray-400 mt-2">
            This will include forms for {category === 'labor' ? 'employee hours, rates, and per diem' : 'vendor, invoice number, and cost amount'}.
          </p>
        </div>
      </div>

      {/* Cost List Placeholder */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost History</h3>
        <div className="text-center py-8">
          <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-500">No {config.title.toLowerCase()} recorded yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Cost entries will appear here once you start adding them.
          </p>
        </div>
      </div>
    </div>
  )
}