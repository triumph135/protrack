'use client'

import { useState, Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Edit, Trash2, DollarSign, Users, Search, Lock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/hooks/useProjects'
import { useCosts, type CostCategory } from '@/hooks/useCosts'
import { useBudgets } from '@/hooks/useBudgets'
import CostEntryForm from '@/components/CostEntryForm'
import BudgetTrackingSection from '@/components/BudgetTrackingSection'
import type { ProjectCost } from '@/types/app.types'
import { createClient } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

function CostsContent() {
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category') || 'material'
  const category = (categoryParam === 'cap-leases' ? 'cap_leases' : categoryParam) as CostCategory
  
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { activeProject } = useProjects()
  const { costs, loading, createCost, updateCost, deleteCost } = useCosts(activeProject?.id)
  const [budget, setBudget] = useState<any>(null)
  const [budgetLoading, setBudgetLoading] = useState(false)
  const supabase = createClient()
  
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ProjectCost | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })

  useEffect(() => {
    if (activeProject?.id && tenant?.id) {
      loadBudget()
    }
  }, [activeProject?.id, tenant?.id])

  const loadBudget = async () => {
    if (!tenant?.id || !activeProject?.id) return

    try {
      setBudgetLoading(true)
      const { data, error } = await supabase
        .from('project_budgets')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('project_id', activeProject.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      setBudget(data || {
        material_budget: 0,
        labor_budget: 0,
        equipment_budget: 0,
        subcontractor_budget: 0,
        others_budget: 0,
        cap_leases_budget: 0,
        consumable_budget: 0
      })
    } catch (error) {
      console.error('Error loading budget:', error)
    } finally {
      setBudgetLoading(false)
    }
  }

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
      alert('Error saving cost. Please try again.')
    }
  }

  const calculateActualAmount = () => {
    return filteredCosts.reduce((sum, cost) => {
      if (category === 'labor') {
        const stCost = (cost.st_hours || 0) * (cost.st_rate || 0)
        const otCost = (cost.ot_hours || 0) * (cost.ot_rate || 0)
        const dtCost = (cost.dt_hours || 0) * (cost.dt_rate || 0)
        const perDiem = cost.per_diem || 0
        const mobCost = (cost.mob_qty || 0) * (cost.mob_rate || 0)
        return sum + stCost + otCost + dtCost + perDiem + mobCost
      }
      return sum + (cost.cost || 0)
    }, 0)
  }

  const updateBudget = async (categoryName: string, amount: number) => {
    if (!tenant?.id || !activeProject?.id || !user?.id) {
      console.error('Missing required data for budget update')
      throw new Error('Missing tenant, project, or user information')
    }

    const budgetField = category === 'cap_leases' ? 'cap_leases_budget' : `${category}_budget`
    
    try {
      const { data: existing } = await supabase
        .from('project_budgets')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('project_id', activeProject.id)
        .single()

      let result
      if (existing) {
        result = await supabase
          .from('project_budgets')
          .update({
            [budgetField]: amount,
            updated_by: user.id
          })
          .eq('tenant_id', tenant.id)
          .eq('project_id', activeProject.id)
          .select()
          .single()
      } else {
        const newBudget = {
          tenant_id: tenant.id,
          project_id: activeProject.id,
          material_budget: 0,
          labor_budget: 0,
          equipment_budget: 0,
          subcontractor_budget: 0,
          others_budget: 0,
          cap_leases_budget: 0,
          consumable_budget: 0,
          [budgetField]: amount,
          updated_by: user.id
        }
        
        result = await supabase
          .from('project_budgets')
          .insert([newBudget])
          .select()
          .single()
      }

      if (result.error) {
        throw result.error
      }

      setBudget(result.data)
      
    } catch (error) {
      console.error('Error updating budget:', error)
      throw error
    }
  }

  const actualAmount = calculateActualAmount()
  const budgetField = category === 'cap_leases' ? 'cap_leases_budget' : `${category}_budget`
  const budgetAmount = Number(budget?.[budgetField as keyof typeof budget] || 0)
  const variance = budgetAmount - actualAmount

  if (!canRead) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <Lock className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Restricted</h3>
            <p className="text-gray-500">You don't have permission to view {categoryNames[category].toLowerCase()} costs.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <DollarSign className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Project Selected</h3>
            <p className="text-gray-500">Please select a project to view and manage costs.</p>
            <Link 
              href="/projects" 
              className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              View Projects
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <DollarSign className="h-8 w-8 text-blue-500 mr-3" />
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">{categoryNames[category]} Costs</h1>
                    <p className="text-gray-600">Track {categoryNames[category].toLowerCase()} expenses for {activeProject.jobName}</p>
                  </div>
                </div>
                {canWrite && (
                  <button
                    onClick={handleAddCost}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add {categoryNames[category]} Cost
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Budget Tracking Section */}
          <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
            <BudgetTrackingSection 
              category={category}
              actualAmount={actualAmount}
              budgetAmount={budgetAmount}
              variance={variance}
              onUpdateBudget={updateBudget}
              canEdit={canWrite}
              loading={loading || budgetLoading}
            />
          </div>


          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow-md">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSearchTerm('')
                    setDateFilter({ start: '', end: '' })
                  }}
                  className="w-full px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Costs Table */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  {categoryNames[category]} Costs ({filteredCosts.length} items)
                </h3>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Total: ${actualAmount.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-6">
                <div className="animate-pulse space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-200 rounded"></div>
                  ))}
                </div>
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
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ST Hours</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OT Hours</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DT Hours</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Per Diem</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MOB</th>
                        </>
                      ) : (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {category === 'subcontractor' ? 'Subcontractor' : 'Vendor'}
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
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
                          {new Date(cost.date).toLocaleDateString()}
                        </td>
                        {category === 'labor' ? (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cost.employee_name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cost.st_hours || 0}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cost.ot_hours || 0}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cost.dt_hours || 0}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${(cost.per_diem || 0).toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${((cost.mob_qty || 0) * (cost.mob_rate || 0)).toLocaleString()}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {cost.subcontractor_name || cost.vendor || '-'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">{cost.description || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cost.invoice_number || '-'}</td>
                          </>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          ${(cost.cost || 0).toLocaleString()}
                        </td>
                        {canWrite && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditCost(cost)}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCost(cost)}
                                className="text-red-600 hover:text-red-900"
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

            {filteredCosts.length === 0 && !loading && (
              <div className="text-center py-12">
                <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No {categoryNames[category].toLowerCase()} costs</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by adding your first {categoryNames[category].toLowerCase()} cost.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cost Entry Form Modal */}
      {showForm && activeProject && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Backdrop - transparent for click-to-close functionality */}
            <div 
              className="fixed inset-0 bg-transparent"
              onClick={() => setShowForm(false)}
              aria-hidden="true"
            ></div>

            {/* Center the modal */}
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            {/* Modal panel */}
            <div className="relative inline-block align-bottom text-left overflow-visible transform transition-all sm:my-8 sm:align-middle sm:w-full md:max-w-2xl lg:max-w-3xl">
                <div className="max-h-[80vh] overflow-y-auto rounded-lg">
                    <CostEntryForm
                        category={category}
                        projectId={activeProject.id}
                        onSave={handleSaveCost}
                        onCancel={() => setShowForm(false)}
                        editItem={editingItem}
                        loading={loading}
                    />
              </div>
            </div>
          </div>
        </div>
      )}  
    </div>
  )
}

export default function CostsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    }>
      <CostsContent />
    </Suspense>
  )
}