'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Edit, Trash2, FileText, DollarSign, Calendar, Filter, Download, Search, Paperclip } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useInvoices } from '@/hooks/useInvoices'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import InvoiceForm from '@/components/InvoiceForm'
import ProjectChangeOrderSelector from '@/components/ProjectChangeOrderSelector'
import type { CustomerInvoice } from '@/types/app.types'
import { formatLocalDateForDisplay } from '@/lib/dateUtils'
import { fileUploadService } from '@/lib/fileUploadService'

interface InvoiceFilters {
  startDate: string
  endDate: string
  invoiceNumber: string
  minAmount: string
  maxAmount: string
}

export default function InvoicesPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { activeProject } = useProjects()
  
  // Invoice management state
  const [selectedChangeOrder, setSelectedChangeOrder] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<CustomerInvoice | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<InvoiceFilters>({
    startDate: '',
    endDate: '',
    invoiceNumber: '',
    minAmount: '',
    maxAmount: ''
  })
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({})

  // Data hooks - Convert change order selection for the hook
  const changeOrderForHook = selectedChangeOrder === 'all' ? undefined : 
                            selectedChangeOrder === 'base' ? null : selectedChangeOrder

  // Convert state for ProjectChangeOrderSelector component
  const changeOrderForSelector = selectedChangeOrder === 'all' ? null : selectedChangeOrder
  
  // Stable callback to prevent useEffect loops in ProjectChangeOrderSelector
  const handleChangeOrderChange = useCallback((changeOrderId: string | null) => {
    setSelectedChangeOrder(changeOrderId || 'all')
  }, [])

  // Data hooks
  const { 
    invoices, 
    loading, 
    error, 
    createInvoice, 
    updateInvoice, 
    deleteInvoice, 
    getTotalBilled,
    loadInvoices 
  } = useInvoices(activeProject?.id, changeOrderForHook)
  
  const { changeOrders } = useChangeOrders(activeProject?.id)

  // Permission checking
  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  const canRead = hasPermission('invoices', 'read')
  const canWrite = hasPermission('invoices', 'write')

  // Handle form submission
  const handleSave = async (invoiceData: Omit<CustomerInvoice, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    try {
      if (editingInvoice) {
        await updateInvoice(editingInvoice.id, invoiceData)
      } else {
        await createInvoice(invoiceData)
      }
      
      setShowForm(false)
      setEditingInvoice(null)
    } catch (error) {
      console.error('Error saving invoice:', error)
      alert('Error saving invoice. Please try again.')
    }
  }

  // Handle delete
  const handleDelete = async (invoiceId: string) => {
    if (!window.confirm('Are you sure you want to delete this invoice?')) return
    
    try {
      await deleteInvoice(invoiceId)
    } catch (error) {
      console.error('Error deleting invoice:', error)
      alert('Error deleting invoice. Please try again.')
    }
  }

  // Handle edit
  const handleEdit = (invoice: CustomerInvoice) => {
    setEditingInvoice(invoice)
    setShowForm(true)
  }

  const getCurrentChangeOrderName = () => {
    if (!changeOrderForSelector) return 'All Change Orders'
    if (changeOrderForSelector === 'base') return 'Base Contract'
    
    const changeOrder = changeOrders.find(co => co.id === changeOrderForSelector)
    return changeOrder ? changeOrder.name : 'Unknown Change Order'
  }

  // Export data
  const exportData = () => {
    if (filteredInvoices.length === 0) {
      alert('No data to export')
      return
    }

    const headers = ['Date Billed', 'Invoice Number', 'Amount', 'In System', 'Change Order']

    const csvContent = [
      headers.join(','),
      ...filteredInvoices.map(invoice => {
        const changeOrderName = invoice.change_order_id 
          ? changeOrders.find(co => co.id === invoice.change_order_id)?.name || 'Unknown'
          : 'Base Contract'

        return [
          invoice.date_billed,
          invoice.invoice_number || '',
          invoice.amount || 0,
          invoice.in_system ? 'Yes' : 'No',
          changeOrderName
        ].join(',')
      })
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeProject?.jobNumber}_invoices_${getCurrentChangeOrderName()}_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Apply filters to invoices with memoization to prevent infinite loops
  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      if (filters.startDate && invoice.date_billed < filters.startDate) return false
      if (filters.endDate && invoice.date_billed > filters.endDate) return false
      if (filters.invoiceNumber && !invoice.invoice_number.toLowerCase().includes(filters.invoiceNumber.toLowerCase())) return false
      if (filters.minAmount && invoice.amount < parseFloat(filters.minAmount)) return false
      if (filters.maxAmount && invoice.amount > parseFloat(filters.maxAmount)) return false
      return true
    })
  }, [invoices, filters.startDate, filters.endDate, filters.invoiceNumber, filters.minAmount, filters.maxAmount])

  // Memoize the invoice IDs string to avoid unnecessary re-renders
  const invoiceIdsString = useMemo(() => {
    return filteredInvoices.map(invoice => invoice.id).sort().join(',')
  }, [filteredInvoices])

  // Memoize the actual invoice IDs array based on the string
  const invoiceIds = useMemo(() => {
    return invoiceIdsString ? invoiceIdsString.split(',') : []
  }, [invoiceIdsString])

  // Load attachment counts for invoices
  const loadAttachmentCounts = useCallback(async () => {
    if (!tenant?.id || !user?.id || !invoiceIds.length) return

    try {
      fileUploadService.setContext(tenant.id, user.id)
      const counts: Record<string, number> = {}
      
      // Load attachment counts for each invoice
      await Promise.all(
        invoiceIds.map(async (invoiceId) => {
          try {
            const attachments = await fileUploadService.getAttachments('customer_invoice', invoiceId)
            counts[invoiceId] = attachments.length
          } catch (error) {
            console.error(`Error loading attachments for invoice ${invoiceId}:`, error)
            counts[invoiceId] = 0
          }
        })
      )
      
      setAttachmentCounts(counts)
    } catch (error) {
      console.error('Error loading attachment counts:', error)
    }
  }, [tenant?.id, user?.id, invoiceIdsString])

  // Calculate filtered total
  const filteredTotal = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0)

  // Clear filters
  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      invoiceNumber: '',
      minAmount: '',
      maxAmount: ''
    })
  }

  // Handle filter change
  const handleFilterChange = (field: keyof InvoiceFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  // Reload invoices when change order selection changes
  useEffect(() => {
    if (activeProject?.id) {
      loadInvoices(activeProject.id, changeOrderForHook)
    }
  }, [selectedChangeOrder, activeProject?.id, changeOrderForHook])

  // Load attachment counts when invoice IDs change
  useEffect(() => {
    if (invoiceIds.length > 0) {
      loadAttachmentCounts()
    }
    // Clear attachment counts when no invoices
    else {
      setAttachmentCounts({})
    }
  }, [loadAttachmentCounts, invoiceIds.length])

  if (!canRead) {
    return (
             <div className="space-y-6">
         {/* Project/Change Order Selector */}
         <ProjectChangeOrderSelector 
           selectedChangeOrderId={changeOrderForSelector}
           onChangeOrderChange={handleChangeOrderChange}
           showChangeOrderSelector={true}
         />

         <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <p className="text-gray-500">You don't have permission to view invoices.</p>
        </div>
      </div>
    )
  }

  if (!activeProject) {
    return (
             <div className="space-y-6">
         {/* Project/Change Order Selector - still show even with no project */}
         <ProjectChangeOrderSelector 
           selectedChangeOrderId={changeOrderForSelector}
           onChangeOrderChange={handleChangeOrderChange}
           showChangeOrderSelector={true}
         />

         <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Project Selected</h3>
          <p className="text-gray-500">Please select a project to manage invoices.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
             {/* Project/Change Order Selector */}
       <ProjectChangeOrderSelector 
         selectedChangeOrderId={changeOrderForSelector}
         onChangeOrderChange={handleChangeOrderChange}
         showChangeOrderSelector={true}
       />

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
          </div>
        </div>
      </div>

      {/* Form */}
      {showForm && canWrite && (
        <InvoiceForm
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false)
            setEditingInvoice(null)
          }}
          editItem={editingInvoice}
          loading={loading}
        />
      )}

      {/* Action Bar + Filters + Invoice List combined */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Action Bar */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              {filteredInvoices.length > 0 && (
                <button
                  onClick={exportData}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </button>
              )}
              
              {canWrite && (
                <button
                  onClick={() => {
                    setEditingInvoice(null)
                    setShowForm(true)
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Invoice
                </button>
              )}
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </button>
            </div>

            {/* Summary */}
            <div className="text-right">
              <div className="flex items-center text-sm text-gray-500">
                <DollarSign className="h-4 w-4 mr-1" />
                Total Billed: 
                <span className="ml-1 font-semibold text-green-600">
                  ${filteredTotal.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-gray-50 p-4 border-b border-gray-200">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Filter Invoices</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Number</label>
                <input
                  type="text"
                  value={filters.invoiceNumber}
                  onChange={(e) => handleFilterChange('invoiceNumber', e.target.value)}
                  placeholder="Search..."
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Min Amount</label>
                <input
                  type="number"
                  value={filters.minAmount}
                  onChange={(e) => handleFilterChange('minAmount', e.target.value)}
                  placeholder="0"
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Amount</label>
                <input
                  type="number"
                  value={filters.maxAmount}
                  onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
                  placeholder="1000000"
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-3">
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all filters
              </button>
            </div>
          </div>
        )}

        {/* Invoice List */}
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading invoices...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            <p>Error loading invoices: {error}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date Billed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Change Order
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Paperclip className="w-4 h-4 mx-auto" />
                  </th>
                  {canWrite && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInvoices.map((invoice) => {
                  const relatedChangeOrder = invoice.change_order_id 
                    ? changeOrders.find(co => co.id === invoice.change_order_id)
                    : null

                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="font-semibold text-green-600">
                          ${invoice.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatLocalDateForDisplay(invoice.date_billed)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {invoice.change_order_id ? (
                          relatedChangeOrder ? (
                            relatedChangeOrder.name
                          ) : (
                            <span className="text-red-500">Deleted Change Order</span>
                          )
                        ) : (
                          'Base Contract'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {attachmentCounts[invoice.id] > 0 && (
                          <div className="flex items-center justify-center">
                            <Paperclip className="w-4 h-4 text-blue-600" />
                            <span className="ml-1 text-xs text-gray-600">{attachmentCounts[invoice.id]}</span>
                          </div>
                        )}
                      </td>
                      {canWrite && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEdit(invoice)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Edit invoice"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(invoice.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete invoice"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredInvoices.length === 0 && (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {invoices.length === 0 ? 'No invoices found' : 'No invoices match the current filters'}
            </h3>
            <p className="text-gray-500 mb-4">
              {invoices.length === 0 
                ? 'Get started by creating your first invoice.'
                : 'Try adjusting your filters to see more results.'
              }
            </p>
            {canWrite && invoices.length === 0 && (
              <button
                onClick={() => {
                  setEditingInvoice(null)
                  setShowForm(true)
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create First Invoice
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}