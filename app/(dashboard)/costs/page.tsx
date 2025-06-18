'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Edit, Trash2, DollarSign, Users, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/hooks/useProjects'
import { useCosts, type CostCategory } from '@/hooks/useCosts'
import CostEntryForm from '@/components/CostEntryForm'
import type { ProjectCost } from '@/types/app.types'

function CostsContent() {
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category') || 'material'
  const category = (categoryParam === 'cap-leases' ? 'cap_leases' : categoryParam) as CostCategory
  
  const { user } = useAuth()
  const { activeProject } = useProjects()
  const { costs, loading, createCost, updateCost, deleteCost, getTotals } = useCosts(activeProject?.id)
  
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ProjectCost | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })

  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  const categoryPermission = category === 'cap_leases' ? 'capLeases' : category
  const canRead = hasPermission(categoryPermission, 'read')
  const canWrite = hasPermission(categoryPermission, 'write')



  const categoryNames: Record<CostCategory, string> = {
    material: 'Material',
    labor: 'Labor',
    equipment: 'Equipment',
    subcontractor: 'Subcontractor',
    others: 'Others',
    cap_leases: 'Cap Leases',
    consumable: 'Consumable'
  }

  const currentCosts = costs[category] || []

  // Filter costs based on search and date
  const filteredCosts = currentCosts.filter(cost => {
    const matchesSearch = searchTerm === '' || 
      (cost.vendor?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (cost.employee_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (cost.subcontractor_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (cost.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesDate = (!dateFilter.start || cost.date >= dateFilter.start) &&
                       (!dateFilter.end || cost.date <= dateFilter.end)

    return matchesSearch && matchesDate
  })

  const handleAddCost = () => {
    setEditingItem(null)
    setShowForm(true)
  }

  const handleEditCost = (cost: ProjectCost) => {
    setEditingItem(cost)
    setShowForm(true)
  }

  const handleDeleteCost = async (cost: ProjectCost) => {
    if (!window.confirm('Are you sure you want to delete this cost entry?')) return

    try {
      await deleteCost(category, cost.id)
    } catch (error) {
      console.error('Error deleting cost:', error)
      alert('Error deleting cost. Please try again.')
    }
  }

  const handleSaveCost = async (costData: Omit<ProjectCost, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    try {
      if (editingItem) {
        await updateCost(category, editingItem.id, costData)
      } else {
        await createCost(category, costData)
      }
      setShowForm(false)
      setEditingItem(null)
    } catch (error) {
      console.error('Error saving cost:', error)
      throw error
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const calculateLaborTotal = (cost: ProjectCost) => {
    if (category !== 'labor') return cost.cost || 0
    
    const stTotal = (cost.st_hours || 0) * (cost.st_rate || 0)
    const otTotal = (cost.ot_hours || 0) * (cost.ot_rate || 0)
    const dtTotal = (cost.dt_hours || 0) * (cost.dt_rate || 0)
    const perDiem = cost.per_diem || 0
    const mobTotal = (cost.mob_qty || 0) * (cost.mob_rate || 0)
    
    return stTotal + otTotal + dtTotal + perDiem + mobTotal
  }

  if (!canRead) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <div className="text-red-500 mb-4">
            <DollarSign className="mx-auto h-12 w-12" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
                      <p className="text-gray-600">You don't have permission to view {categoryNames[category]?.toLowerCase() || category} costs.</p>
        </div>
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <DollarSign className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Project</h3>
          <p className="text-gray-600">Please select a project to manage costs.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
                     <h1 className="text-2xl font-bold text-gray-900">{categoryNames[category] || category} Costs</h1>
           <p className="text-gray-600">Manage {categoryNames[category]?.toLowerCase() || category} costs for {activeProject.jobName}</p>
        </div>
        <div className="flex gap-3">
          {/* Manage Employees Button (only for labor category) */}
          {category === 'labor' && hasPermission('labor', 'write') && (
            <Link
              href="/employees"
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
            >
              <Users className="w-4 h-4" />
              Manage Employees
            </Link>
          )}
          
          {/* Add Cost Button */}
          {canWrite && (
            <button
              onClick={handleAddCost}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
                             Add {categoryNames[category] || category} Cost
            </button>
          )}
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredCosts.length}</div>
            <div className="text-sm text-gray-600">Total Entries</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(filteredCosts.reduce((sum, cost) => sum + calculateLaborTotal(cost), 0))}
            </div>
            <div className="text-sm text-gray-600">Total Cost</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(filteredCosts.reduce((sum, cost) => sum + calculateLaborTotal(cost), 0) / (filteredCosts.length || 1))}
            </div>
            <div className="text-sm text-gray-600">Average Cost</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={dateFilter.start}
              onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={dateFilter.end}
              onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Cost Entry Form */}
      {showForm && (
        <CostEntryForm
          category={category}
          projectId={activeProject.id}
          onSave={handleSaveCost}
          onCancel={() => setShowForm(false)}
          editItem={editingItem}
          loading={loading}
        />
      )}

      {/* Costs Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading costs...</p>
          </div>
        ) : filteredCosts.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No costs found</h3>
            <p className="text-gray-600 mb-4">
              {currentCosts.length === 0 
                                 ? `No ${categoryNames[category]?.toLowerCase() || category} costs have been added yet.`
                : 'No costs match your current filters.'}
            </p>
            {canWrite && currentCosts.length === 0 && (
              <button
                onClick={handleAddCost}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md inline-flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                                 Add First {categoryNames[category] || category} Cost
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  {category === 'labor' ? (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours (ST/OT/DT)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Per Diem</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MOB</th>
                    </>
                  ) : (
                    <>
                      {category === 'subcontractor' && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subcontractor</th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
                      {category === 'others' && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">In System</th>
                    </>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Cost</th>
                  {canWrite && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCosts.map((cost) => (
                  <tr key={cost.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(cost.date)}
                    </td>
                    {category === 'labor' ? (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {cost.employee_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {cost.st_hours || 0} / {cost.ot_hours || 0} / {cost.dt_hours || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(cost.per_diem || 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {cost.mob_qty || 0} × {formatCurrency(cost.mob_rate || 0)}
                        </td>
                      </>
                    ) : (
                      <>
                        {category === 'subcontractor' && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {cost.subcontractor_name}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {cost.vendor}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {cost.invoice_number}
                        </td>
                        {category === 'others' && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {cost.description}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            cost.in_system ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {cost.in_system ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(calculateLaborTotal(cost))}
                    </td>
                    {canWrite && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditCost(cost)}
                            className="text-blue-600 hover:text-blue-900 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCost(cost)}
                            className="text-red-600 hover:text-red-900 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CostsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CostsContent />
    </Suspense>
  )
}