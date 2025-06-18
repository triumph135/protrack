'use client'

import { useState, useEffect } from 'react'
import { X, Building, User, DollarSign, MapPin } from 'lucide-react'
import type { Project } from '@/types/app.types'

interface ProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (projectData: Omit<Project, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<void>
  project?: Project | null
  loading?: boolean
}

export default function ProjectModal({
  isOpen,
  onClose,
  onSubmit,
  project,
  loading = false
}: ProjectModalProps) {
  const [formData, setFormData] = useState({
    jobNumber: '',
    jobName: '',
    customer: '',
    fieldShopBoth: 'Field',
    totalContractValue: '',
    status: 'Active'
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset form when modal opens/closes or project changes
  useEffect(() => {
    if (isOpen) {
      if (project) {
        setFormData({
          jobNumber: project.jobNumber || '',
          jobName: project.jobName || '',
          customer: project.customer || '',
          fieldShopBoth: project.fieldShopBoth || 'Field',
          totalContractValue: project.totalContractValue?.toString() || '',
          status: project.status || 'Active'
        })
      } else {
        setFormData({
          jobNumber: '',
          jobName: '',
          customer: '',
          fieldShopBoth: 'Field',
          totalContractValue: '',
          status: 'Active'
        })
      }
      setErrors({})
    }
  }, [isOpen, project])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.jobNumber.trim()) {
      newErrors.jobNumber = 'Job number is required'
    }

    if (!formData.jobName.trim()) {
      newErrors.jobName = 'Job name is required'
    }

    if (!formData.customer.trim()) {
      newErrors.customer = 'Customer is required'
    }

    if (formData.totalContractValue && isNaN(Number(formData.totalContractValue))) {
      newErrors.totalContractValue = 'Contract value must be a valid number'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      await onSubmit({
        jobNumber: formData.jobNumber.trim(),
        jobName: formData.jobName.trim(),
        customer: formData.customer.trim(),
        fieldShopBoth: formData.fieldShopBoth,
        totalContractValue: formData.totalContractValue ? Number(formData.totalContractValue) : undefined,
        status: formData.status
      })
      onClose()
    } catch (error) {
      console.error('Error submitting project:', error)
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
            {project ? 'Edit Project' : 'Create New Project'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Job Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Number *
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="jobNumber"
                  value={formData.jobNumber}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.jobNumber ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter job number"
                />
                <Building className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
              {errors.jobNumber && (
                <p className="mt-1 text-sm text-red-600">{errors.jobNumber}</p>
              )}
            </div>

            {/* Job Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Name *
              </label>
              <input
                type="text"
                name="jobName"
                value={formData.jobName}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.jobName ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter job name"
              />
              {errors.jobName && (
                <p className="mt-1 text-sm text-red-600">{errors.jobName}</p>
              )}
            </div>

            {/* Customer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer *
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="customer"
                  value={formData.customer}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.customer ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter customer name"
                />
                <User className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
              {errors.customer && (
                <p className="mt-1 text-sm text-red-600">{errors.customer}</p>
              )}
            </div>

            {/* Field/Shop/Both */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <div className="relative">
                <select
                  name="fieldShopBoth"
                  value={formData.fieldShopBoth}
                  onChange={handleChange}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Field">Field</option>
                  <option value="Shop">Shop</option>
                  <option value="Both">Both</option>
                </select>
                <MapPin className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>

            {/* Total Contract Value */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Contract Value
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="totalContractValue"
                  value={formData.totalContractValue}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.totalContractValue ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <DollarSign className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
              {errors.totalContractValue && (
                <p className="mt-1 text-sm text-red-600">{errors.totalContractValue}</p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Form Actions */}
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
              {loading ? 'Saving...' : project ? 'Update Project' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}