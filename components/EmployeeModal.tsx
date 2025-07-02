'use client'

import { useState, useEffect } from 'react'
import { X, User, DollarSign } from 'lucide-react'
import type { Employee } from '@/types/app.types'

interface EmployeeModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (employeeData: Omit<Employee, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<void>
  employee?: Employee | null
  loading?: boolean
  projectId?: string
}

export default function EmployeeModal({
  isOpen,
  onClose,
  onSubmit,
  employee,
  loading = false,
  projectId
}: EmployeeModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    standard_rate: '',
    ot_rate: '',
    dt_rate: '',
    mob: '',
    mob_rate: '',
    project_id: projectId || ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset form when modal opens/closes or employee changes
  useEffect(() => {
    if (isOpen) {
      if (employee) {
        setFormData({
          name: employee.name || '',
          standard_rate: employee.standard_rate?.toString() || '',
          ot_rate: employee.ot_rate?.toString() || '',
          dt_rate: employee.dt_rate?.toString() || '',
          mob: employee.mob?.toString() || '',
          mob_rate: employee.mob_rate?.toString() || '',
          project_id: employee.project_id || ''
        })
      } else {
        setFormData({
          name: '',
          standard_rate: '',
          ot_rate: '',
          dt_rate: '',
          mob: '',
          mob_rate: '',
          project_id: projectId || ''
        })
      }
      setErrors({})
    }
  }, [isOpen, employee, projectId])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Employee name is required'
    }

    if (!formData.standard_rate || isNaN(Number(formData.standard_rate)) || Number(formData.standard_rate) < 0) {
      newErrors.standard_rate = 'Valid standard rate is required'
    }

    if (!formData.ot_rate || isNaN(Number(formData.ot_rate)) || Number(formData.ot_rate) < 0) {
      newErrors.ot_rate = 'Valid overtime rate is required'
    }

    if (!formData.dt_rate || isNaN(Number(formData.dt_rate)) || Number(formData.dt_rate) < 0) {
      newErrors.dt_rate = 'Valid double time rate is required'
    }

    if (formData.mob && (isNaN(Number(formData.mob)) || Number(formData.mob) < 0)) {
      newErrors.mob = 'MOB value must be a valid number'
    }

    if (formData.mob_rate && (isNaN(Number(formData.mob_rate)) || Number(formData.mob_rate) < 0)) {
      newErrors.mob_rate = 'MOB rate must be a valid number'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      await onSubmit({
        name: formData.name.trim(),
        standard_rate: Number(formData.standard_rate),
        ot_rate: Number(formData.ot_rate),
        dt_rate: Number(formData.dt_rate),
        mob: formData.mob ? Number(formData.mob) : undefined,
        mob_rate: formData.mob_rate ? Number(formData.mob_rate) : undefined,
        project_id: formData.project_id || undefined
      })
      onClose()
    } catch (error) {
      console.error('Error submitting employee:', error)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {employee ? 'Edit Employee' : 'Add New Employee'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Employee Name *
            </label>
            <div className="relative">
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                  errors.name ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter employee name"
              />
              <User className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Standard Rate ($/hr) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="standard_rate"
                  value={formData.standard_rate}
                  onChange={handleChange}
                  className={`w-full pl-8 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                    errors.standard_rate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              </div>
              {errors.standard_rate && (
                <p className="mt-1 text-sm text-red-600">{errors.standard_rate}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Overtime Rate ($/hr) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="ot_rate"
                  value={formData.ot_rate}
                  onChange={handleChange}
                  className={`w-full pl-8 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                    errors.ot_rate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              </div>
              {errors.ot_rate && (
                <p className="mt-1 text-sm text-red-600">{errors.ot_rate}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Double Time Rate ($/hr) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="dt_rate"
                  value={formData.dt_rate}
                  onChange={handleChange}
                  className={`w-full pl-8 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                    errors.dt_rate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              </div>
              {errors.dt_rate && (
                <p className="mt-1 text-sm text-red-600">{errors.dt_rate}</p>
              )}
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">MOB Information (Optional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  MOB Value
                </label>
                <input
                  type="number"
                  name="mob"
                  value={formData.mob}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                    errors.mob ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0"
                  step="1"
                  min="0"
                />
                {errors.mob && (
                  <p className="mt-1 text-sm text-red-600">{errors.mob}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  MOB Rate ($/unit)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    name="mob_rate"
                    value={formData.mob_rate}
                    onChange={handleChange}
                    className={`w-full pl-8 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
                      errors.mob_rate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                    }`}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                  <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                </div>
                {errors.mob_rate && (
                  <p className="mt-1 text-sm text-red-600">{errors.mob_rate}</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assignment
            </label>
            <select
              name="project_id"
              value={formData.project_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            >
              <option value="">Global Employee (All Projects)</option>
              {projectId && <option value={projectId}>Current Project Only</option>}
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Global employees can be used on any project. Project-specific employees are only available for the current project.
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : employee ? 'Update Employee' : 'Add Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
} 