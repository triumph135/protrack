'use client'

import { useState, useEffect } from 'react'
import { Save, X, AlertCircle, DollarSign, FileText } from 'lucide-react'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { useProjects } from '@/contexts/ProjectContext'
import type { CustomerInvoice } from '@/types/app.types'
import { getTodayLocalDateString } from '@/lib/dateUtils'
import FileAttachments from '@/components/FileAttachments'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'

interface InvoiceFormProps {
  onSave: (invoiceData: Omit<CustomerInvoice, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  editItem?: CustomerInvoice | null
  loading?: boolean
}

export default function InvoiceForm({
  onSave,
  onCancel,
  editItem = null,
  loading = false
}: InvoiceFormProps) {
  const [formData, setFormData] = useState<Partial<CustomerInvoice>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  // Get the active project and change orders
  const { activeProject } = useProjects()
  const { changeOrders } = useChangeOrders(activeProject?.id)
  const { user } = useAuth()
  const { tenant } = useTenant()

  // Initialize form data
  useEffect(() => {
    if (editItem) {
      setFormData(editItem)
    } else {
      // Set default values for new invoice using the proper date utility
      setFormData({
        project_id: activeProject?.id,
        invoice_number: '',
        amount: 0,
        date_billed: getTodayLocalDateString(),
        change_order_id: undefined,
        in_system: false
      })
    }
  }, [editItem, activeProject?.id])

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.invoice_number?.trim()) {
      newErrors.invoice_number = 'Invoice number is required'
    }

    if (!formData.amount || Number(formData.amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0'
    }

    if (!formData.date_billed) {
      newErrors.date_billed = 'Date billed is required'
    }

    if (!formData.project_id) {
      newErrors.project_id = 'Project is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    try {
      await onSave({
        project_id: formData.project_id!,
        invoice_number: formData.invoice_number!,
        amount: Number(formData.amount),
        date_billed: formData.date_billed!,
        change_order_id: formData.change_order_id || undefined,
        in_system: formData.in_system || false
      })
    } catch (error) {
      console.error('Error saving invoice:', error)
    }
  }

  return (
    <div className="bg-gray-50 p-4 sm:p-6 rounded-lg border">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          {editItem ? 'Edit Invoice' : 'Add New Invoice'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 self-end sm:self-auto"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          {/* Invoice Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice Number *
            </label>
            <input
              type="text"
              value={formData.invoice_number || ''}
              onChange={(e) => handleInputChange('invoice_number', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                errors.invoice_number ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="INV-001"
              disabled={loading}
            />
            {errors.invoice_number && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.invoice_number}
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount *
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount || ''}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                  errors.amount ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
                disabled={loading}
              />
            </div>
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.amount}
              </p>
            )}
          </div>

          {/* Date Billed */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Billed *
            </label>
            <input
              type="date"
              value={formData.date_billed || ''}
              onChange={(e) => handleInputChange('date_billed', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                errors.date_billed ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {errors.date_billed && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.date_billed}
              </p>
            )}
          </div>
        </div>

        {/* Change Order */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Change Order
          </label>
          <select
            value={formData.change_order_id || ''}
            onChange={(e) => handleInputChange('change_order_id', e.target.value || undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            <option value="">Base Contract</option>
            {changeOrders.map(co => (
              <option key={co.id} value={co.id}>
                {co.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-gray-500">
            Select a change order if this invoice is related to additional work
          </p>
        </div>

        {/* Mark as Processed */}
        <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
          <label className="flex items-center space-x-4 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.in_system || false}
              onChange={(e) => handleInputChange('in_system', e.target.checked)}
              className="w-5 h-5 text-blue-600 bg-white border-2 border-gray-400 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer checked:bg-blue-600 checked:border-blue-600 appearance-none relative checked:after:content-['✓'] checked:after:text-white checked:after:text-sm checked:after:font-bold checked:after:absolute checked:after:inset-0 checked:after:flex checked:after:items-center checked:after:justify-center"
              disabled={loading}
            />
            <span className="text-sm font-medium text-gray-800 select-none">
              Mark as processed in system
            </span>
          </label>
        </div>

        {/* Attachments Section - Only show when editing existing invoice */}
        {editItem && (
          <div className="border-t pt-6">
            <h4 className="text-sm font-medium text-gray-700 mb-4">File Attachments</h4>
            <FileAttachments
              entityType="customer_invoice"
              entityId={editItem.id}
              tenantId={tenant?.id || ''}
              userId={user?.id || ''}
              canEdit={true}
              className="bg-gray-50 p-4 rounded-lg"
            />
          </div>
        )}

        {!editItem && (
          <div className="border-t pt-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-700">
                <FileText className="w-5 h-5" />
                <div>
                  <p className="text-sm font-medium">File Attachments</p>
                  <p className="text-sm">Save this invoice first, then edit it to add file attachments</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Invoice'}
          </button>
          
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}