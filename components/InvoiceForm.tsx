'use client'

import React, { useState, useEffect } from 'react'
import { Save, X, AlertCircle, DollarSign, FileText } from 'lucide-react'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { useProjects } from '@/contexts/ProjectContext'
import type { CustomerInvoice, Project } from '@/types/app.types'
import { getTodayLocalDateString } from '@/lib/dateUtils'
import FileAttachments from '@/components/FileAttachments'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { createClient } from '@/lib/supabase'

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
  
  // Add these new state variables
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [availableProjects, setAvailableProjects] = useState<Project[]>([])
  const supabase = createClient()
  
  // Get the active project and change orders
  const { activeProject } = useProjects()
  const { changeOrders } = useChangeOrders(selectedProjectId || activeProject?.id)
  const { user } = useAuth()
  const { tenant } = useTenant()

  // Initialize form data
  useEffect(() => {
    if (editItem) {
      setFormData(editItem)
      setSelectedProjectId(editItem.project_id)
    } else {
      // Set default values for new invoice using the proper date utility
      setFormData({
        project_id: activeProject?.id || '',
        invoice_number: '',
        amount: 0,
        date_billed: getTodayLocalDateString(),
        change_order_id: undefined,
        in_system: false
      })
      setSelectedProjectId(activeProject?.id || '')
    }
  }, [editItem, activeProject?.id])

  // Load all available projects
  useEffect(() => {
    const loadAvailableProjects = async () => {
      if (!tenant?.id) return
      
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('status', 'Active')
          .order('jobNumber')
        
        if (error) throw error
        setAvailableProjects(data || [])
      } catch (error) {
        console.error('Error loading projects:', error)
      }
    }
    
    loadAvailableProjects()
  }, [tenant?.id])

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // Handle project selection change
  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId)
    setFormData(prev => ({
      ...prev,
      project_id: projectId,
      change_order_id: undefined // Always reset to Base Contract when changing projects
    }))
    
    // Clear any project-related errors
    if (errors.project_id) {
      setErrors(prevErrors => {
        const { project_id, ...rest } = prevErrors
        return rest
      })
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
  
    if (!selectedProjectId) {
      newErrors.project_id = 'Project is required'
    }
  
    if (!formData.invoice_number?.trim()) {
      newErrors.invoice_number = 'Invoice number is required'
    }
  
    if (!formData.amount || Number(formData.amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0'
    }
  
    if (!formData.date_billed) {
      newErrors.date_billed = 'Date billed is required'
    }
  
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return
  
    try {
      await onSave({
        project_id: selectedProjectId,
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Project <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.project_id ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={loading}
          >
            <option value="">Select a project</option>
            {availableProjects.map(project => (
              <option key={project.id} value={project.id}>
                {project.jobNumber} - {project.jobName}
              </option>
            ))}
          </select>
          {errors.project_id && (
            <p className="mt-1 text-sm text-red-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              {errors.project_id}
            </p>
          )}
        </div>

        {/* Invoice Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invoice Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.invoice_number || ''}
            onChange={(e) => handleInputChange('invoice_number', e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.invoice_number ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Enter invoice number"
            disabled={loading}
          />
          {errors.invoice_number && (
            <p className="mt-1 text-sm text-red-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              {errors.invoice_number}
            </p>
          )}
        </div>

        {/* Amount and Date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={formData.amount || ''}
              onChange={(e) => handleInputChange('amount', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.amount ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="0.00"
              step="0.01"
              min="0"
              disabled={loading}
            />
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.amount}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Billed <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.date_billed || ''}
              onChange={(e) => handleInputChange('date_billed', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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
          {changeOrders.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">
              This project has no change orders. Invoice will be assigned to Base Contract.
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-500">
              Select a change order if this invoice is related to additional work
            </p>
          )}
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

        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-6 border-t">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Saving...' : editItem ? 'Update Invoice' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  )
}