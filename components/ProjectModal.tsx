'use client'

import { useState, useEffect } from 'react'
import { X, Building, User, DollarSign, MapPin, Users, Plus, Edit, Trash2 } from 'lucide-react'
import { useEmployees } from '@/hooks/useEmployees'
import EmployeeModal from '@/components/EmployeeModal'
import type { Project, Employee } from '@/types/app.types'

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
  const [isInitialized, setIsInitialized] = useState(false)
  const [hasUserInput, setHasUserInput] = useState(false)
  
  // Tab state for project details vs employee management
  const [activeTab, setActiveTab] = useState<'project' | 'employees'>('project')
  
  // Employee management state
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [employeeLoading, setEmployeeLoading] = useState(false)
  
  // Get employees for this project (if editing) or all employees (if creating)
  const { employees, loading: employeesLoading, createEmployee, updateEmployee, deleteEmployee } = useEmployees(project?.id)

  // Initialize form data when project prop changes, but only if user hasn't started typing
  useEffect(() => {
    // Don't reset if user has already started entering data
    if (hasUserInput) {
      return
    }

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
    setIsInitialized(true)
  }, [project, hasUserInput])

  // Track when user starts typing to prevent form resets
  useEffect(() => {
    if (isInitialized) {
      const hasAnyData = formData.jobNumber || formData.jobName || formData.customer || 
                        (formData.totalContractValue > 0)
      if (hasAnyData && !hasUserInput) {
        setHasUserInput(true)
      }
    }
  }, [formData, isInitialized, hasUserInput])

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
      // Reset tracking state on successful save
      setHasUserInput(false)
      setIsInitialized(false)
    } catch (error) {
      console.error('Error saving project:', error)
      // Error handling is done by parent component
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof typeof formData, value: string | number) => {
    // Mark that user has started inputting data
    if (!hasUserInput) {
      setHasUserInput(true)
    }

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

  // Employee management functions
  const handleAddEmployee = () => {
    setEditingEmployee(null)
    setShowEmployeeModal(true)
  }

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee)
    setShowEmployeeModal(true)
  }

  const handleDeleteEmployee = async (employee: Employee) => {
    if (!window.confirm(`Are you sure you want to delete "${employee.name}"?`)) {
      return
    }

    try {
      await deleteEmployee(employee.id)
    } catch (error) {
      console.error('Error deleting employee:', error)
      alert('Error deleting employee. Please try again.')
    }
  }

  const handleCreateEmployee = async (employeeData: any) => {
    try {
      setEmployeeLoading(true)
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, employeeData)
      } else {
        // If we're creating a new project, add to global or current project
        const data = {
          ...employeeData,
          project_id: project?.id || undefined // Make it global if no project ID yet
        }
        await createEmployee(data)
      }
      setShowEmployeeModal(false)
      setEditingEmployee(null)
    } catch (error) {
      console.error('Error saving employee:', error)
      throw error
    } finally {
      setEmployeeLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Building className="w-5 h-5" />
            {project ? 'Edit Project' : 'New Project'}
          </h2>
          <button
            onClick={() => {
              setHasUserInput(false)
              setIsInitialized(false)
              onCancel()
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-4 sm:px-6">
            <button
              onClick={() => setActiveTab('project')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'project'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Building className="w-4 h-4 inline-block mr-2" />
              Project Details
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'employees'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="w-4 h-4 inline-block mr-2" />
              Employees ({employees.length})
            </button>
          </nav>
        </div>

        {/* Content */}
        {activeTab === 'project' ? (
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
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
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
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
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
                className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
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
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
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
                className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 ${
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
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
              onClick={() => {
                setHasUserInput(false)
                setIsInitialized(false)
                onCancel()
              }}
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
        ) : (
          <div className="p-4 sm:p-6">
            {/* Employee Management */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Employee Management</h3>
              <button
                onClick={handleAddEmployee}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Employee
              </button>
            </div>

            {employeesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading employees...</p>
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-8">
                <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Employees</h3>
                <p className="text-gray-600 mb-4">
                  Add employees to this project to track labor costs.
                </p>
                <button
                  onClick={handleAddEmployee}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 mx-auto transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add First Employee
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {employees.map((employee) => (
                  <div key={employee.id} className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{employee.name}</h4>
                      <div className="text-sm text-gray-600 grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                        <span>ST: ${employee.standard_rate}/hr</span>
                        <span>OT: ${employee.ot_rate}/hr</span>
                        <span>DT: ${employee.dt_rate}/hr</span>
                        {employee.mob_rate && <span>MOB: ${employee.mob_rate}</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {employee.project_id ? 'Project Employee' : 'Global Employee'}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditEmployee(employee)}
                        className="text-blue-600 hover:text-blue-900 p-2 rounded-md border border-blue-200 hover:border-blue-300 transition-colors"
                        title="Edit employee"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEmployee(employee)}
                        className="text-red-600 hover:text-red-900 p-2 rounded-md border border-red-200 hover:border-red-300 transition-colors"
                        title="Delete employee"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Employee Tab Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6">
              <button
                type="button"
                onClick={() => {
                  setHasUserInput(false)
                  setIsInitialized(false)
                  onCancel()
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setActiveTab('project')}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Back to Project Details
              </button>
            </div>
          </div>
        )}

        {/* Employee Modal */}
        <EmployeeModal
          isOpen={showEmployeeModal}
          onClose={() => {
            setShowEmployeeModal(false)
            setEditingEmployee(null)
          }}
          onSubmit={handleCreateEmployee}
          employee={editingEmployee}
          loading={employeeLoading}
          projectId={project?.id}
        />
      </div>
    </div>
  )
}