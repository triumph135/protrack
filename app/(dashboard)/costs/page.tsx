'use client'

import { useState, Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Edit, Trash2, DollarSign, Users, Search, Lock, Download, Filter } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/hooks/useProjects'
import { useCosts, type CostCategory } from '@/hooks/useCosts'
import { useBudgets } from '@/hooks/useBudgets'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import CostEntryForm from '@/components/CostEntryForm'
import BudgetTrackingSection from '@/components/BudgetTrackingSection'
import ProjectChangeOrderSelector from '@/components/ProjectChangeOrderSelector'
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
  const [selectedChangeOrderId, setSelectedChangeOrderId] = useState<string | null>(null)
  
  // Use the costs hook with the current project and change order selection
  const { costs, loading, createCost, updateCost, deleteCost, loadCostsByCategory, refreshCosts } = useCosts(activeProject?.id, selectedChangeOrderId)
  const { changeOrders } = useChangeOrders(activeProject?.id)
  const [budget, setBudget] = useState<any>(null)
  const [budgetLoading, setBudgetLoading] = useState(false)
  const supabase = createClient()
  
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ProjectCost | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })
  const [showFilters, setShowFilters] = useState(false)

  // Load budget when project changes
  useEffect(() => {
    if (activeProject?.id && tenant?.id) {
      loadBudget()
    }
  }, [activeProject?.id, tenant?.id])

  // Reload costs when project or change order selection changes
  useEffect(() => {
    if (activeProject?.id) {
      console.log('Reloading costs for project:', activeProject.id, 'change order:', selectedChangeOrderId, 'category:', category)
      loadCostsByCategory(category, {
        projectId: activeProject.id,
        changeOrderId: selectedChangeOrderId
      })
    }
  }, [activeProject?.id, selectedChangeOrderId, category])

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

  const getCategoryDisplayName = (cat: CostCategory) => {
    const names = {
      material: 'Material',
      labor: 'Labor', 
      equipment: 'Equipment',
      subcontractor: 'Subcontractor',
      others: 'Others',
      cap_leases: 'Cap Leases',
      consumable: 'Consumable'
    }
    return names[cat] || cat
  }

  const getCurrentChangeOrderName = () => {
    if (!selectedChangeOrderId) return 'All Change Orders'
    if (selectedChangeOrderId === 'base') return 'Base Contract'
    
    const changeOrder = changeOrders.find(co => co.id === selectedChangeOrderId)
    return changeOrder ? changeOrder.name : 'Unknown Change Order'
  }

  // Filter costs based on search and date filters
  const filteredCosts = costs[category]?.filter(cost => {
    const matchesSearch = !searchTerm || 
      (cost.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       cost.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       cost.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       cost.subcontractor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       cost.description?.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesDateStart = !dateFilter.start || cost.date >= dateFilter.start
    const matchesDateEnd = !dateFilter.end || cost.date <= dateFilter.end
    
    return matchesSearch && matchesDateStart && matchesDateEnd
  }) || []

  const totalFilteredCost = filteredCosts.reduce((sum, cost) => sum + (cost.cost || 0), 0)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const handleAddCost = () => {
    setEditingItem(null)
    setShowForm(true)
  }

  const handleEditCost = (cost: ProjectCost) => {
    setEditingItem(cost)
    setShowForm(true)
  }

  const handleDeleteCost = async (cost: ProjectCost) => {
    if (!window.confirm('Are you sure you want to delete this cost entry?')) {
      return
    }

    try {
      await deleteCost(category, cost.id)
      // Refresh costs after deletion
      refreshCosts()
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
      // Refresh costs after save
      refreshCosts()
    } catch (error) {
      console.error('Error saving cost:', error)
      throw error
    }
  }

  const exportData = () => {
    if (filteredCosts.length === 0) {
      alert('No data to export')
      return
    }

    const headers = category === 'labor' 
      ? ['Date', 'Employee', 'ST Hours', 'ST Rate', 'OT Hours', 'OT Rate', 'DT Hours', 'DT Rate', 'Per Diem', 'MOB Qty', 'MOB Rate', 'Total Cost', 'Change Order']
      : ['Date', 'Vendor', 'Invoice Number', 'Cost', 'In System', 'Change Order', 'Description']

    const csvContent = [
      headers.join(','),
      ...filteredCosts.map(cost => {
        const changeOrderName = cost.change_order_id 
          ? changeOrders.find(co => co.id === cost.change_order_id)?.name || 'Unknown'
          : 'Base Contract'

        if (category === 'labor') {
          return [
            cost.date,
            cost.employee_name || '',
            cost.st_hours || 0,
            cost.st_rate || 0,
            cost.ot_hours || 0,
            cost.ot_rate || 0,
            cost.dt_hours || 0,
            cost.dt_rate || 0,
            cost.per_diem || 0,
            cost.mob_qty || 0,
            cost.mob_rate || 0,
            cost.cost || 0,
            changeOrderName
          ].join(',')
        } else {
          return [
            cost.date,
            cost.vendor || '',
            cost.invoice_number || '',
            cost.cost || 0,
            cost.in_system ? 'Yes' : 'No',
            changeOrderName,
            cost.description || ''
          ].join(',')
        }
      })
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeProject?.jobNumber}_${category}_${getCurrentChangeOrderName()}_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (!canRead) {
    return (
      <div className="space-y-6">
        <ProjectChangeOrderSelector 
          selectedChangeOrderId={selectedChangeOrderId}
          onChangeOrderChange={setSelectedChangeOrderId}
          showChangeOrderSelector={true}
        />
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <Lock className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            You don't have permission to view {getCategoryDisplayName(category).toLowerCase()} costs.
          </p>
        </div>
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <ProjectChangeOrderSelector 
          selectedChangeOrderId={selectedChangeOrderId}
          onChangeOrderChange={setSelectedChangeOrderId}
          showChangeOrderSelector={true}
        />
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <DollarSign className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No Active Project</h2>
          <p className="text-gray-600 mb-6">
            Please select a project to view {getCategoryDisplayName(category).toLowerCase()} costs.
          </p>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            View Projects
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Project/Change Order Selector */}
      <ProjectChangeOrderSelector 
        selectedChangeOrderId={selectedChangeOrderId}
        onChangeOrderChange={setSelectedChangeOrderId}
        showChangeOrderSelector={true}
      />

      {/* Page Header */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{getCategoryDisplayName(category)} Costs</h1>
            <p className="text-gray-600 mt-1">
              {getCurrentChangeOrderName()} • {filteredCosts.length} entries • {formatCurrency(totalFilteredCost)}
            </p>
          </div>
          <div className="flex space-x-3">
            {filteredCosts.length > 0 && (
              <button
                onClick={exportData}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            )}
            {canWrite && (
              <button
                onClick={handleAddCost}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add {getCategoryDisplayName(category)}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Filters</h3>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <Filter className="w-4 h-4" />
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
        </div>
        
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search vendor, invoice, employee..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Date Start */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Date End */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Budget Tracking */}
      {!budgetLoading && budget && (
        <BudgetTrackingSection
          category={category}
          actualAmount={costs[category]?.reduce((sum, cost) => sum + (cost.cost || 0), 0) || 0}
          budgetAmount={budget[`${category}_budget`] || 0}
          variance={(budget[`${category}_budget`] || 0) - (costs[category]?.reduce((sum, cost) => sum + (cost.cost || 0), 0) || 0)}
          onUpdateBudget={async (cat, amount) => {
            const field = `${cat}_budget`
            await supabase
              .from('project_budgets')
              .upsert({
                tenant_id: tenant?.id,
                project_id: activeProject?.id,
                [field]: amount
              }, { onConflict: 'tenant_id,project_id' })
            await loadBudget()
          }}
          canEdit={canWrite}
        />
      )}

      {/* Cost Entry Form */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <CostEntryForm
            category={category}
            editItem={editingItem}
            onSave={handleSaveCost}
            onCancel={() => {
              setShowForm(false)
              setEditingItem(null)
            }}
            loading={loading}
          />
        </div>
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">No {getCategoryDisplayName(category)} Costs</h3>
            <p className="text-gray-600 mb-4">
              {costs[category]?.length === 0 
                ? `Get started by adding your first ${getCategoryDisplayName(category).toLowerCase()} cost entry.`
                : 'No costs match your current filters.'
              }
            </p>
            {canWrite && costs[category]?.length === 0 && (
              <button
                onClick={handleAddCost}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 mx-auto transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add First {getCategoryDisplayName(category)}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  {category === 'labor' ? (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Employee
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Hours
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Cost
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vendor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Invoice #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cost
                      </th>
                    </>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Change Order
                  </th>
                  {canWrite && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
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
                          ST: {cost.st_hours || 0} OT: {cost.ot_hours || 0} DT: {cost.dt_hours || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(cost.cost || 0)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {cost.vendor}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {cost.invoice_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(cost.cost || 0)}
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {cost.change_order_id 
                        ? changeOrders.find(co => co.id === cost.change_order_id)?.name || 'Unknown'
                        : 'Base Contract'
                      }
                    </td>
                    {canWrite && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEditCost(cost)}
                            className="text-blue-600 hover:text-blue-900 p-1 rounded transition-colors"
                            title="Edit cost"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCost(cost)}
                            className="text-red-600 hover:text-red-900 p-1 rounded transition-colors"
                            title="Delete cost"
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
    <Suspense fallback={
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CostsContent />
    </Suspense>
  )
}