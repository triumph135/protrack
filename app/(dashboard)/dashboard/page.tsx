'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, BarChart3, Building, DollarSign, FileText, Users, TrendingUp, Calendar, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/hooks/useProjects'
import { useCosts } from '@/hooks/useCosts'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { createClient } from '@/lib/supabase'
import ProjectChangeOrderSelector from '@/components/ProjectChangeOrderSelector'

export default function DashboardPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { projects, activeProject, setActiveProject, loading } = useProjects()
  
  // Dashboard shows ALL data for the project (no change order filtering)
  const { costs, getTotals, getCounts } = useCosts(activeProject?.id, null) // null = show all change orders
  const { changeOrders, getTotalAdditionalValue } = useChangeOrders(activeProject?.id)
  
  // Customer Invoice Data
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const supabase = createClient()

  // Load customer invoices for the active project (all change orders)
  useEffect(() => {
    if (activeProject?.id && tenant?.id) {
      loadCustomerInvoices()
    }
  }, [activeProject?.id, tenant?.id])

  const loadCustomerInvoices = async () => {
    if (!activeProject?.id || !tenant?.id) return

    try {
      setInvoicesLoading(true)
      
      // Get ALL invoices for the project (no change order filtering on dashboard)
      const { data, error } = await supabase
        .from('customer_invoices')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('project_id', activeProject.id)

      if (error) throw error
      setCustomerInvoices(data || [])
    } catch (error) {
      console.error('Error loading customer invoices:', error)
      setCustomerInvoices([])
    } finally {
      setInvoicesLoading(false)
    }
  }

  // Calculate financial metrics
  const calculateMetrics = () => {
    if (!activeProject) {
      return {
        baseContractValue: 0,
        changeOrderValue: 0,
        totalContractValue: 0,
        totalProjectCosts: 0,
        totalInvoicedAmount: 0,
        amountYetToBilled: 0,
        grossProfit: 0,
        grossProfitPercentage: 0
      }
    }

    const baseContractValue = activeProject.totalContractValue || 0
    const changeOrderValue = getTotalAdditionalValue()
    const totalContractValue = baseContractValue + changeOrderValue
    
    // Calculate total project costs (all categories, all change orders)
    const costTotals = getTotals()
    const totalProjectCosts = Object.values(costTotals).reduce((sum, total) => sum + total, 0)
    
    // Calculate total invoiced amount (all invoices for the project)
    const totalInvoicedAmount = customerInvoices.reduce((sum, invoice) => sum + (invoice.amount || 0), 0)
    
    // Calculate remaining metrics
    const amountYetToBilled = totalContractValue - totalInvoicedAmount
    const grossProfit = totalContractValue - totalProjectCosts
    const grossProfitPercentage = totalContractValue > 0 ? (grossProfit / totalContractValue) * 100 : 0

    return {
      baseContractValue,
      changeOrderValue,
      totalContractValue,
      totalProjectCosts,
      totalInvoicedAmount,
      amountYetToBilled,
      grossProfit,
      grossProfitPercentage
    }
  }

  const metrics = calculateMetrics()
  const costTotals = getTotals()
  const costCounts = getCounts()
  const totalCostEntries = Object.values(costCounts).reduce((sum, count) => sum + count, 0)

  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(1)}%`
  }

  const getStatusColor = (value: number, isPercentage = false) => {
    if (isPercentage) {
      if (value >= 15) return 'text-green-600'
      if (value >= 5) return 'text-yellow-600'
      return 'text-red-600'
    } else {
      if (value >= 0) return 'text-green-600'
      return 'text-red-600'
    }
  }

  const getStatusIcon = (value: number) => {
    if (value >= 0) return <TrendingUp className="w-4 h-4" />
    return <AlertTriangle className="w-4 h-4" />
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <ProjectChangeOrderSelector 
          showChangeOrderSelector={true}
          disableChangeOrderSelector={true}
        />
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <ProjectChangeOrderSelector 
          showChangeOrderSelector={false}
        />
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to ProTrack!</h2>
          <p className="text-gray-600 mb-6">Get started by creating your first project.</p>
          {hasPermission('projects', 'write') ? (
            <Link
              href="/projects"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Your First Project
            </Link>
          ) : (
            <p className="text-gray-500">Ask an administrator to create a project for you.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Project Selector (Change Order Selector Disabled for Dashboard) */}
      <ProjectChangeOrderSelector 
        showChangeOrderSelector={true}
        disableChangeOrderSelector={true}
      />

      {/* Header with Project Info */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600">Welcome back, {user?.name}!</p>
              <p className="text-sm text-gray-500 mt-1">
                Viewing: Complete Project Overview
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Active Project</p>
              <p className="text-lg font-semibold text-blue-600">
                {activeProject.jobNumber} - {activeProject.jobName}
              </p>
              <p className="text-sm text-gray-600">{activeProject.customer}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Metrics - Primary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Contract Value */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <Building className="h-8 w-8 text-blue-500" />
            <div className="ml-4">
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(metrics.totalContractValue)}</p>
              <p className="text-gray-600">Total Contract Value</p>
              <div className="text-xs text-gray-500 mt-1">
                Base: {formatCurrency(metrics.baseContractValue)} + COs: {formatCurrency(metrics.changeOrderValue)}
              </div>
            </div>
          </div>
        </div>

        {/* Total Project Costs */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <DollarSign className="h-8 w-8 text-red-500" />
            <div className="ml-4">
              <p className="text-2xl font-semibold text-gray-900">{formatCurrency(metrics.totalProjectCosts)}</p>
              <p className="text-gray-600">Total Project Costs</p>
              <div className="text-xs text-gray-500 mt-1">
                {totalCostEntries} cost entries
              </div>
            </div>
          </div>
        </div>

        {/* Amount Yet to be Billed */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-orange-500" />
            <div className="ml-4">
              <p className={`text-2xl font-semibold ${getStatusColor(metrics.amountYetToBilled)}`}>
                {formatCurrency(metrics.amountYetToBilled)}
              </p>
              <p className="text-gray-600">Amount Yet to Bill</p>
              <div className="text-xs text-gray-500 mt-1">
                Invoiced: {formatCurrency(metrics.totalInvoicedAmount)}
              </div>
            </div>
          </div>
        </div>

        {/* Gross Profit */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <div className={`h-8 w-8 ${getStatusColor(metrics.grossProfit)}`}>
              {getStatusIcon(metrics.grossProfit)}
            </div>
            <div className="ml-4">
              <p className={`text-2xl font-semibold ${getStatusColor(metrics.grossProfit)}`}>
                {formatCurrency(metrics.grossProfit)}
              </p>
              <p className="text-gray-600">Gross Profit</p>
              <div className={`text-xs mt-1 font-medium ${getStatusColor(metrics.grossProfitPercentage, true)}`}>
                {formatPercentage(metrics.grossProfitPercentage)} margin
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Financial Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Revenue Breakdown */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">Revenue Breakdown</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Base Contract:</span>
                <span className="font-medium">{formatCurrency(metrics.baseContractValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Change Orders ({changeOrders.length}):</span>
                <span className="font-medium">{formatCurrency(metrics.changeOrderValue)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium text-gray-900">Total Contract Value:</span>
                <span className="font-bold text-blue-600">{formatCurrency(metrics.totalContractValue)}</span>
              </div>
            </div>
          </div>

          {/* Profitability Analysis */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">Profitability Analysis</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Revenue:</span>
                <span className="font-medium">{formatCurrency(metrics.totalContractValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Costs:</span>
                <span className="font-medium">{formatCurrency(metrics.totalProjectCosts)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium text-gray-900">Gross Profit:</span>
                <span className={`font-bold ${getStatusColor(metrics.grossProfit)}`}>
                  {formatCurrency(metrics.grossProfit)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-900">Gross Margin:</span>
                <span className={`font-bold ${getStatusColor(metrics.grossProfitPercentage, true)}`}>
                  {formatPercentage(metrics.grossProfitPercentage)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Profit Margin Alert */}
        {metrics.grossProfitPercentage < 5 && metrics.totalContractValue > 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Low Profit Margin Alert</p>
                <p className="text-sm text-red-700">
                  Current gross margin is {formatPercentage(metrics.grossProfitPercentage)}. 
                  Consider reviewing project costs or seeking additional change orders.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cost Breakdown by Category */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Cost Breakdown by Category</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(costTotals).map(([category, total]) => {
            const count = costCounts[category as keyof typeof costCounts]
            const categoryNames = {
              material: 'Material',
              labor: 'Labor',
              equipment: 'Equipment',
              subcontractor: 'Subcontractor',
              others: 'Others',
              cap_leases: 'Cap Leases',
              consumable: 'Consumable'
            }
            
            const categoryName = categoryNames[category as keyof typeof categoryNames]
            const categorySlug = category === 'cap_leases' ? 'cap-leases' : category
            const hasReadPermission = hasPermission(category === 'cap_leases' ? 'capLeases' : category, 'read')
            const percentage = metrics.totalProjectCosts > 0 ? (total / metrics.totalProjectCosts) * 100 : 0
            
            if (!hasReadPermission) return null
            
            return (
              <Link
                key={category}
                href={`/costs?category=${categorySlug}`}
                className="bg-gray-50 p-4 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{categoryName}</p>
                    <p className="text-lg font-semibold text-gray-900">{formatCurrency(total)}</p>
                    <p className="text-xs text-gray-500">{count} entries • {percentage.toFixed(1)}%</p>
                  </div>
                  <DollarSign className="h-5 w-5 text-gray-400" />
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hasPermission('material', 'write') && (
            <Link
              href="/costs?category=material"
              className="flex items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <DollarSign className="h-8 w-8 text-blue-500 mr-3" />
              <div>
                <p className="font-medium text-gray-900">Add Material Cost</p>
                <p className="text-sm text-gray-600">Track material expenses</p>
              </div>
            </Link>
          )}

          {hasPermission('labor', 'write') && (
            <Link
              href="/costs?category=labor"
              className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              <Users className="h-8 w-8 text-green-500 mr-3" />
              <div>
                <p className="font-medium text-gray-900">Add Labor Cost</p>
                <p className="text-sm text-gray-600">Log employee hours</p>
              </div>
            </Link>
          )}

          {hasPermission('projects', 'write') && (
            <Link
              href="/projects"
              className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <FileText className="h-8 w-8 text-purple-500 mr-3" />
              <div>
                <p className="font-medium text-gray-900">Manage Change Orders</p>
                <p className="text-sm text-gray-600">Add or edit change orders</p>
              </div>
            </Link>
          )}

          {hasPermission('invoices', 'write') && (
            <Link
              href="/invoices"
              className="flex items-center p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
            >
              <FileText className="h-8 w-8 text-orange-500 mr-3" />
              <div>
                <p className="font-medium text-gray-900">Customer Invoices</p>
                <p className="text-sm text-gray-600">Manage billing</p>
              </div>
            </Link>
          )}

          {hasPermission('projects', 'read') && (
            <Link
              href="/projects"
              className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Building className="h-8 w-8 text-gray-500 mr-3" />
              <div>
                <p className="font-medium text-gray-900">View All Projects</p>
                <p className="text-sm text-gray-600">Manage projects</p>
              </div>
            </Link>
          )}

          {hasPermission('users', 'read') && (
            <Link
              href="/users"
              className="flex items-center p-4 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <Users className="h-8 w-8 text-yellow-500 mr-3" />
              <div>
                <p className="font-medium text-gray-900">User Management</p>
                <p className="text-sm text-gray-600">Manage team access</p>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}