'use client'

import { useState, useEffect } from 'react'
import { Save, X, AlertCircle, Users, DollarSign, FileText } from 'lucide-react'
import { useEmployees } from '@/hooks/useEmployees'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { useProjects } from '@/contexts/ProjectContext'
import type { ProjectCost, ChangeOrder } from '@/types/app.types'
import type { CostCategory } from '@/hooks/useCosts'
import FileAttachments from '@/components/FileAttachments'
import EmployeeModal from '@/components/EmployeeModal'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { getTodayLocalDateString } from '@/lib/dateUtils'

interface CostEntryFormProps {
  category: CostCategory
  onSave: (costData: Omit<ProjectCost, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  editItem?: ProjectCost | null
  loading?: boolean
}

interface FormField {
  name: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea'
  required?: boolean
  step?: string
  min?: string
  options?: any[]
}

export default function CostEntryForm({
  category,
  onSave,
  onCancel,
  editItem = null,
  loading = false
}: CostEntryFormProps) {
  const [formData, setFormData] = useState<Partial<ProjectCost>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  // Employee modal state
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)
  const [employeeLoading, setEmployeeLoading] = useState(false)
  
  // Get the active project
  const { activeProject } = useProjects()
  const { user } = useAuth()
  const { tenant } = useTenant()
  
  // Use the active project ID for loading employees and change orders
  const { employees, loading: employeesLoading, createEmployee } = useEmployees(activeProject?.id)
  const { changeOrders } = useChangeOrders(activeProject?.id)

  // Initialize form data
  useEffect(() => {
    if (editItem) {
      setFormData(editItem)
    } else {
      // Set default values using the proper date utility
      const defaultData: Partial<ProjectCost> = {
        project_id: activeProject?.id,
        date: getTodayLocalDateString(),
        change_order_id: undefined
      }

      if (category === 'labor') {
        defaultData.st_hours = 0
        defaultData.st_rate = 0
        defaultData.ot_hours = 0
        defaultData.ot_rate = 0
        defaultData.dt_hours = 0
        defaultData.dt_rate = 0
        defaultData.per_diem = 0
        defaultData.mob_qty = 0
        defaultData.mob_rate = 0
      } else {
        defaultData.cost = 0
        defaultData.in_system = false
      }

      setFormData(defaultData)
    }
    setErrors({})
  }, [editItem, category, activeProject?.id])

  // Handle employee selection for labor
  const handleEmployeeChange = (employeeId: string) => {
    if (!employeeId) {
      setFormData(prev => ({
        ...prev,
        employee_id: undefined,
        employee_name: '',
        st_rate: 0,
        ot_rate: 0,
        dt_rate: 0,
        mob_rate: 0
      }))
      return
    }

    const employee = employees.find(emp => emp.id === employeeId)
    if (employee) {
      setFormData(prev => ({
        ...prev,
        employee_id: employeeId,
        employee_name: employee.name,
        st_rate: employee.standard_rate,
        ot_rate: employee.ot_rate,
        dt_rate: employee.dt_rate,
        mob_rate: employee.mob_rate || 0
      }))
    }
  }

  // Get form fields based on category
  const getFormFields = (): FormField[] => {
    switch (category) {
      case 'material':
      case 'cap_leases':
      case 'consumable':
        return [
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'vendor', label: 'Vendor', type: 'text', required: true },
          { name: 'invoice_number', label: 'Invoice Number', type: 'text', required: true },
          { name: 'description', label: 'Description', type: 'text' },
          { name: 'cost', label: 'Cost', type: 'number', required: true, step: '0.01', min: '0' },
          { name: 'in_system', label: 'In System', type: 'checkbox' }
        ]

      case 'others':
        return [
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'vendor', label: 'Vendor', type: 'text', required: true },
          { name: 'invoice_number', label: 'Invoice Number', type: 'text', required: true },
          { name: 'description', label: 'Description', type: 'text' },
          { name: 'cost', label: 'Cost', type: 'number', required: true, step: '0.01', min: '0' },
          { name: 'in_system', label: 'In System', type: 'checkbox' }
        ]

      case 'equipment':
      case 'subcontractor':
        return [
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'vendor', label: 'Vendor', type: 'text', required: true },
          { name: 'invoice_number', label: 'Invoice Number', type: 'text', required: true },
          { name: 'subcontractor_name', label: category === 'subcontractor' ? 'Subcontractor Name' : 'Equipment Name', type: 'text' },
          { name: 'description', label: 'Description', type: 'text' },
          { name: 'cost', label: 'Cost', type: 'number', required: true, step: '0.01', min: '0' },
          { name: 'in_system', label: 'In System', type: 'checkbox' }
        ]

      case 'labor':
        return [
          { name: 'employee_id', label: 'Employee', type: 'select', required: true, options: employees },
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'st_hours', label: 'ST Hours', type: 'number', step: '0.1', min: '0' },
          { name: 'st_rate', label: 'ST Rate ($/hr)', type: 'number', step: '0.01', min: '0' },
          { name: 'ot_hours', label: 'OT Hours', type: 'number', step: '0.1', min: '0' },
          { name: 'ot_rate', label: 'OT Rate ($/hr)', type: 'number', step: '0.01', min: '0' },
          { name: 'dt_hours', label: 'DT Hours', type: 'number', step: '0.1', min: '0' },
          { name: 'dt_rate', label: 'DT Rate ($/hr)', type: 'number', step: '0.01', min: '0' },
          { name: 'per_diem', label: 'Per Diem ($)', type: 'number', step: '0.01', min: '0' },
          { name: 'mob_qty', label: 'MOB Quantity', type: 'number', step: '1', min: '0' },
          { name: 'mob_rate', label: 'MOB Rate ($/unit)', type: 'number', step: '0.01', min: '0' }
        ]

      default:
        return []
    }
  }

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    const fields = getFormFields()

    // Check if we have an active project
    if (!activeProject) {
      newErrors.project = 'No active project selected'
      setErrors(newErrors)
      return false
    }

    // Check required fields
    fields.forEach(field => {
      if (field.required && !formData[field.name as keyof ProjectCost]) {
        newErrors[field.name] = `${field.label} is required`
      }
    })

    // Labor-specific validation
    if (category === 'labor' && formData.employee_id) {
      const totalHours = (formData.st_hours || 0) + (formData.ot_hours || 0) + (formData.dt_hours || 0)
      if (totalHours === 0 && (formData.per_diem || 0) === 0 && (formData.mob_qty || 0) === 0) {
        newErrors.hours = 'Must enter hours, per diem, or MOB quantity'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle input change
  const handleInputChange = (field: FormField, value: any) => {
  // Convert numeric inputs to numbers immediately
  let processedValue = value
  if (field.type === 'number') {
    if (value === '' || value === null || value === undefined) {
      processedValue = 0
    } else {
      processedValue = Number(value)
      // Ensure it's a valid number
      if (isNaN(processedValue)) {
        processedValue = 0
      }
    }
  }
  
  setFormData(prev => ({ ...prev, [field.name]: processedValue }))
  
  // Clear error when user starts typing
  if (errors[field.name]) {
    setErrors(prev => ({ ...prev, [field.name]: '' }))
  }

  // Special handling for employee selection
  if (field.name === 'employee_id') {
    handleEmployeeChange(value)
  }
}

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      // Calculate total cost for labor
      let finalFormData = { ...formData }
      if (category === 'labor') {
        finalFormData.cost = calculateLaborTotal()
      }

      // Ensure project_id is set
      finalFormData.project_id = activeProject?.id

      await onSave(finalFormData as Omit<ProjectCost, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>)
    } catch (error) {
      console.error('Error saving cost:', error)
    }
  }

  // Format currency helper
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  // Handle employee creation
  const handleCreateEmployee = async (employeeData: any) => {
    try {
      setEmployeeLoading(true)
      await createEmployee(employeeData)
      setShowEmployeeModal(false)
    } catch (error) {
      console.error('Error creating employee:', error)
      throw error
    } finally {
      setEmployeeLoading(false)
    }
  }

  // Calculate total cost for labor
  const calculateLaborTotal = (): number => {
    if (category !== 'labor') return 0
    
    // Ensure all values are converted to numbers
    const stTotal = Number(formData.st_hours || 0) * Number(formData.st_rate || 0)
    const otTotal = Number(formData.ot_hours || 0) * Number(formData.ot_rate || 0)
    const dtTotal = Number(formData.dt_hours || 0) * Number(formData.dt_rate || 0)
    const perDiem = Number(formData.per_diem || 0)
    const mobTotal = Number(formData.mob_qty || 0) * Number(formData.mob_rate || 0)
    
    const total = stTotal + otTotal + dtTotal + perDiem + mobTotal
        
    return total
  }

  const getCategoryDisplayName = () => {
    const names = {
      material: 'Material',
      labor: 'Labor',
      equipment: 'Equipment',
      subcontractor: 'Subcontractor',
      others: 'Others',
      cap_leases: 'Cap Leases',
      consumable: 'Consumable'
    }
    return names[category] || category
  }

  // Don't render if no active project
  if (!activeProject) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
        <p className="text-sm font-medium">No Active Project</p>
        <p className="text-sm">Please select an active project before adding costs.</p>
      </div>
    )
  }

  return (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          {editItem ? `Edit ${getCategoryDisplayName()}` : `Add ${getCategoryDisplayName()}`} Cost
        </h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 transition-colors self-end sm:self-auto"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Project Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
        <p className="text-xs sm:text-sm text-blue-800 break-words">
          <span className="font-medium">Project:</span> {activeProject.jobNumber} - {activeProject.jobName}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Form Fields Grid */}
        <div className="grid grid-cols-1 gap-4">
          {getFormFields().map((field) => (
            <div key={field.name} className={field.name === 'description' ? '' : ''}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              
              {field.type === 'select' && field.name === 'employee_id' ? (
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <select
                    value={formData[field.name as keyof ProjectCost] as string || ''}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                      errors[field.name] ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={employeesLoading}
                  >
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                  {employeesLoading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
              ) : field.type === 'checkbox' ? (
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData[field.name as keyof ProjectCost] as boolean || false}
                    onChange={(e) => handleInputChange(field, e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                  <span className="ml-2 text-sm text-gray-600">Mark as processed in system</span>
                </label>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={formData[field.name as keyof ProjectCost] as string || ''}
                  onChange={(e) => handleInputChange(field, e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                    errors[field.name] ? 'border-red-300' : 'border-gray-300'
                  }`}
                  rows={3}
                  placeholder={`Enter ${field.label.toLowerCase()}...`}
                />
              ) : field.name === 'cost' ? (
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type={field.type}
                    value={formData[field.name as keyof ProjectCost] as string || ''}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                      errors[field.name] ? 'border-red-300' : 'border-gray-300'
                    }`}
                    step={field.step}
                    min={field.min}
                    placeholder="0.00"
                  />
                </div>
              ) : (
                <input
                  type={field.type}
                  value={formData[field.name as keyof ProjectCost] as string || ''}
                  onChange={(e) => handleInputChange(field, e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                    errors[field.name] ? 'border-red-300' : 'border-gray-300'
                  }`}
                  step={field.step}
                  min={field.min}
                  disabled={category === 'labor' && ['st_rate', 'ot_rate', 'dt_rate', 'mob_rate'].includes(field.name) && !formData.employee_id}
                />
              )}
              
              {errors[field.name] && (
                <p className="text-red-600 text-sm mt-1">{errors[field.name]}</p>
              )}
            </div>
          ))}
        </div>

        {/* Labor Cost Summary */}
        {category === 'labor' && formData.employee_id && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Cost Breakdown</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <div>ST: {formData.st_hours || 0} hrs × ${formData.st_rate || 0} = ${((formData.st_hours || 0) * (formData.st_rate || 0)).toFixed(2)}</div>
              <div>OT: {formData.ot_hours || 0} hrs × ${formData.ot_rate || 0} = ${((formData.ot_hours || 0) * (formData.ot_rate || 0)).toFixed(2)}</div>
              <div>DT: {formData.dt_hours || 0} hrs × ${formData.dt_rate || 0} = ${((formData.dt_hours || 0) * (formData.dt_rate || 0)).toFixed(2)}</div>
              <div>Per Diem: ${formData.per_diem || 0}</div>
              <div>MOB: {formData.mob_qty || 0} × ${formData.mob_rate || 0} = ${((formData.mob_qty || 0) * (formData.mob_rate || 0)).toFixed(2)}</div>
              <div className="font-semibold border-t pt-1">
                Total: {formatCurrency(calculateLaborTotal())}
              </div>
            </div>
          </div>
        )}

        {/* Change Order Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Change Order
          </label>
          <select
            value={formData.change_order_id || ''}
            onChange={(e) => setFormData(prev => ({ 
              ...prev, 
              change_order_id: e.target.value || undefined 
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          >
            <option value="">Base Contract</option>
            {changeOrders.map(co => (
              <option key={co.id} value={co.id}>{co.name}</option>
            ))}
          </select>
        </div>

        {/* Attachments Section - Only show when editing existing item */}
        {editItem && (
          <div className="border-t pt-6">
            <h4 className="text-sm font-medium text-gray-700 mb-4">File Attachments</h4>
            <FileAttachments
              entityType="cost"
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
                  <p className="text-sm">Save this entry first, then edit it to add file attachments</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Messages */}
        {Object.keys(errors).length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            <p className="text-sm font-medium">Please fix the following errors:</p>
            <ul className="text-sm mt-1 list-disc list-inside">
              {Object.values(errors).map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
          {category === 'labor' && employees.length === 0 ? (
            <button
              type="button"
              onClick={() => setShowEmployeeModal(true)}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              Create Employees First
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save Cost'}
            </button>
          )}
        </div>
      </form>

      {/* Employee Modal */}
      <EmployeeModal
        isOpen={showEmployeeModal}
        onClose={() => setShowEmployeeModal(false)}
        onSubmit={handleCreateEmployee}
        loading={employeeLoading}
        projectId={activeProject?.id}
      />
    </div>
  )
}