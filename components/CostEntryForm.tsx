'use client'

import { useState, useEffect } from 'react'
import { Save, X, AlertCircle, Users } from 'lucide-react'
import { useEmployees } from '@/hooks/useEmployees'
import type { ProjectCost, ChangeOrder } from '@/types/app.types'
import type { CostCategory } from '@/hooks/useCosts'

interface CostEntryFormProps {
  category: CostCategory
  projectId: string
  onSave: (costData: Omit<ProjectCost, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  editItem?: ProjectCost | null
  changeOrders?: ChangeOrder[]
  loading?: boolean
}

interface FormField {
  name: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox'
  required?: boolean
  step?: string
  min?: string
  options?: any[]
}

export default function CostEntryForm({
  category,
  projectId,
  onSave,
  onCancel,
  editItem = null,
  changeOrders = [],
  loading = false
}: CostEntryFormProps) {
  const [formData, setFormData] = useState<Partial<ProjectCost>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { employees, loading: employeesLoading } = useEmployees(projectId)

  // Initialize form data
  useEffect(() => {
    if (editItem) {
      setFormData(editItem)
    } else {
      // Set default values
      const defaultData: Partial<ProjectCost> = {
        project_id: projectId,
        date: new Date().toISOString().split('T')[0],
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
  }, [editItem, category, projectId])

  // Handle employee selection for labor
  const handleEmployeeChange = (employeeId: string) => {
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
          { name: 'mob_qty', label: 'MOB Quantity', type: 'number', step: '0.1', min: '0' },
          { name: 'mob_rate', label: 'MOB Rate ($)', type: 'number', step: '0.01', min: '0' }
        ]

      case 'equipment':
        return [
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'vendor', label: 'Vendor', type: 'text', required: true },
          { name: 'invoice_number', label: 'Invoice Number', type: 'text', required: true },
          { name: 'cost', label: 'Cost', type: 'number', required: true, step: '0.01', min: '0' },
          { name: 'in_system', label: 'In System', type: 'checkbox' }
        ]

      case 'subcontractor':
        return [
          { name: 'subcontractor_name', label: 'Subcontractor Name', type: 'text', required: true },
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'vendor', label: 'Vendor', type: 'text', required: true },
          { name: 'invoice_number', label: 'Invoice Number', type: 'text', required: true },
          { name: 'cost', label: 'Cost', type: 'number', required: true, step: '0.01', min: '0' },
          { name: 'in_system', label: 'In System', type: 'checkbox' }
        ]

      default:
        return []
    }
  }

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    const fields = getFormFields()

    fields.forEach(field => {
      if (field.required && !formData[field.name as keyof ProjectCost]) {
        newErrors[field.name] = `${field.label} is required`
      }
    })

    // Special validation for labor
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
    setFormData(prev => ({ ...prev, [field.name]: value }))
    
    // Clear error when user starts typing
    if (errors[field.name]) {
      setErrors(prev => ({ ...prev, [field.name]: '' }))
    }

    // Special handling for employee selection
    if (field.name === 'employee_id' && value) {
      handleEmployeeChange(value)
    }
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      await onSave(formData as Omit<ProjectCost, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>)
    } catch (error) {
      console.error('Error saving cost:', error)
    }
  }

  // Calculate total cost for labor
  const calculateLaborTotal = (): number => {
    if (category !== 'labor') return 0
    
    const stTotal = (formData.st_hours || 0) * (formData.st_rate || 0)
    const otTotal = (formData.ot_hours || 0) * (formData.ot_rate || 0)
    const dtTotal = (formData.dt_hours || 0) * (formData.dt_rate || 0)
    const perDiem = formData.per_diem || 0
    const mobTotal = (formData.mob_qty || 0) * (formData.mob_rate || 0)
    
    return stTotal + otTotal + dtTotal + perDiem + mobTotal
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 capitalize">
          {editItem ? 'Edit' : 'Add'} {category.replace('_', ' ')} Cost
        </h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {employeesLoading && category === 'labor' && (
        <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md">
          Loading employees...
        </div>
      )}

      {/* No employees warning for labor */}
      {category === 'labor' && !employeesLoading && employees.length === 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <div>
              <p className="font-medium">No employees found</p>
              <p className="text-sm">You need to create employees before adding labor costs.</p>
              <a 
                href="/employees" 
                className="inline-flex items-center gap-1 mt-2 text-sm bg-yellow-200 hover:bg-yellow-300 px-3 py-1 rounded-md transition-colors"
              >
                <Users className="w-4 h-4" />
                Manage Employees
              </a>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {getFormFields().map((field) => (
            <div key={field.name} className={field.type === 'checkbox' ? 'md:col-span-2' : ''}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              
              {field.type === 'select' ? (
                <select
                  value={formData[field.name as keyof ProjectCost] as string || ''}
                  onChange={(e) => handleInputChange(field, e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors[field.name] ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  required={field.required}
                  disabled={category === 'labor' && field.name === 'employee_id' && employees.length === 0}
                >
                  <option value="">
                    {category === 'labor' && field.name === 'employee_id' && employees.length === 0 
                      ? 'No employees available - Create employees first' 
                      : `Select ${field.label}`}
                  </option>
                  {field.options?.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData[field.name as keyof ProjectCost] as boolean || false}
                    onChange={(e) => handleInputChange(field, e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">Mark as in system</span>
                </div>
              ) : (
                <input
                  type={field.type}
                  value={formData[field.name as keyof ProjectCost] as string || ''}
                  onChange={(e) => handleInputChange(field, field.type === 'number' ? 
                    (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors[field.name] ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  required={field.required}
                  step={field.step}
                  min={field.min}
                  disabled={
                    category === 'labor' && 
                    ['st_rate', 'ot_rate', 'dt_rate', 'mob_rate'].includes(field.name) && 
                    !formData.employee_id
                  }
                />
              )}

              {errors[field.name] && (
                <p className="mt-1 text-sm text-red-600">{errors[field.name]}</p>
              )}
            </div>
          ))}
        </div>

        {/* Labor Total Cost Display */}
        {category === 'labor' && formData.employee_id && (
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Cost Calculation</h4>
            <div className="text-sm space-y-1">
              <div>ST: {formData.st_hours || 0} hrs × ${formData.st_rate || 0} = ${((formData.st_hours || 0) * (formData.st_rate || 0)).toFixed(2)}</div>
              <div>OT: {formData.ot_hours || 0} hrs × ${formData.ot_rate || 0} = ${((formData.ot_hours || 0) * (formData.ot_rate || 0)).toFixed(2)}</div>
              <div>DT: {formData.dt_hours || 0} hrs × ${formData.dt_rate || 0} = ${((formData.dt_hours || 0) * (formData.dt_rate || 0)).toFixed(2)}</div>
              <div>Per Diem: ${formData.per_diem || 0}</div>
              <div>MOB: {formData.mob_qty || 0} × ${formData.mob_rate || 0} = ${((formData.mob_qty || 0) * (formData.mob_rate || 0)).toFixed(2)}</div>
              <div className="font-semibold border-t pt-1">
                Total: ${calculateLaborTotal().toFixed(2)}
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Base Contract</option>
            {changeOrders.map(co => (
              <option key={co.id} value={co.id}>{co.name}</option>
            ))}
          </select>
        </div>

        {/* File Attachments Info */}
        {!editItem && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md flex items-start gap-2">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">File Attachments</p>
              <p className="text-sm">Save this entry first, then edit it to add file attachments</p>
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
        <div className="flex justify-end space-x-3 pt-6 border-t">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || (category === 'labor' && employees.length === 0)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {loading ? 'Saving...' : 
             category === 'labor' && employees.length === 0 ? 'Create Employees First' :
             'Save Cost'}
          </button>
        </div>
      </form>
    </div>
  )
}