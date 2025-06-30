'use client'

import { useState, useEffect } from 'react'
import { X, Building, User, DollarSign, MapPin } from 'lucide-react'
import type { Project } from '@/types/app.types'

interface ProjectModalProps {
  project?: Project | null
  onSave: (projectData: Omit<Project, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
}

export default function ProjectModal({
  project,
  onSave,
  onCancel
}: ProjectModalProps) {
  const [formData, setFormData] = useState({
    jobNumber: '',
    jobName: '',
    customer: '',
    fieldShopBoth: 'Field',
    totalContractValue: 0,
    status: 'Active'
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  // Initialize form data when project prop changes
  useEffect(() => {
    if (project) {
      setFormData({
        jobNumber: project.jobNumber || '',
        jobName: project.jobName || '',
        customer: project.customer || '',
        fieldShopBoth: project.fieldShopBoth || 'Field',
        totalContractValue: project.totalContractValue || 0,
        status: project.status || 'Active'
      })
    } else {
      setFormData({
        jobNumber: '',
        jobName: '',
        customer: '',
        fieldShopBoth: 'Field',
        totalContractValue: 0,
        status: 'Active'
      })
    }
    setErrors({})
  }, [project])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.jobNumber.trim()) {
      newErrors.jobNumber = 'Job number is required'
    }

    if (!formData.jobName.trim()) {
      newErrors.jobName = 'Project name is required'
    }

    if (!formData.customer.trim()) {
      newErrors.customer = 'Customer is required'
    }

    if (formData.totalContractValue < 0) {
      newErrors.totalContractValue = 'Contract value cannot be negative'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    try {
      setLoading(true)
      await onSave(formData)
    } catch (error) {
      console.error('Error saving project:', error)
      // Error handling is done by parent component
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }))
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Building className="w-5 h-5" />
            {project ? 'Edit Project' : 'New Project'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {/* Job Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job Number *
            </label>
            <input
              type="text"
              value={formData.jobNumber}
              onChange={(e) => handleInputChange('jobNumber', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.jobNumber ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., JOB-2024-001"
            />
            {errors.jobNumber && (
              <p className="text-red-600 text-sm mt-1">{errors.jobNumber}</p>
            )}
          </div>

          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name *
            </label>
            <input
              type="text"
              value={formData.jobName}
              onChange={(e) => handleInputChange('jobName', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.jobName ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., Office Building Construction"
            />
            {errors.jobName && (
              <p className="text-red-600 text-sm mt-1">{errors.jobName}</p>
            )}
          </div>

          {/* Customer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={formData.customer}
                onChange={(e) => handleInputChange('customer', e.target.value)}
                className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.customer ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Customer name"
              />
            </div>
            {errors.customer && (
              <p className="text-red-600 text-sm mt-1">{errors.customer}</p>
            )}
          </div>

          {/* Field/Shop/Both */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Type
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                value={formData.fieldShopBoth}
                onChange={(e) => handleInputChange('fieldShopBoth', e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="Field">Field</option>
                <option value="Shop">Shop</option>
                <option value="Both">Both</option>
              </select>
            </div>
          </div>

          {/* Total Contract Value */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Total Contract Value
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="number"
                value={formData.totalContractValue}
                onChange={(e) => handleInputChange('totalContractValue', parseFloat(e.target.value) || 0)}
                className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.totalContractValue ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
            {errors.totalContractValue && (
              <p className="text-red-600 text-sm mt-1">{errors.totalContractValue}</p>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleInputChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
            </select>
          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Building className="w-4 h-4" />
              {loading ? 'Saving...' : project ? 'Update Project' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}