'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Users, DollarSign, Search, X, User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useEmployees } from '@/hooks/useEmployees'
import type { Employee } from '@/types/app.types'

// Employee Modal Component (inline)
function EmployeeModal({
  isOpen,
  onClose,
  onSubmit,
  employee,
  loading = false,
  projectId
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (employeeData: Omit<Employee, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<void>
  employee?: Employee | null
  loading?: boolean
  projectId?: string
}) {
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
          {/* Employee Name */}
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
                className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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

          {/* Hourly Rates */}
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
                  className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.standard_rate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <DollarSign className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
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
                  className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.ot_rate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <DollarSign className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
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
                  className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.dt_rate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <DollarSign className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
              {errors.dt_rate && (
                <p className="mt-1 text-sm text-red-600">{errors.dt_rate}</p>
              )}
            </div>
          </div>

          {/* MOB Fields */}
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
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.mob ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                }`}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
              {errors.mob && (
                <p className="mt-1 text-sm text-red-600">{errors.mob}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                MOB Rate ($)
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="mob_rate"
                  value={formData.mob_rate}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.mob_rate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <DollarSign className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
              {errors.mob_rate && (
                <p className="mt-1 text-sm text-red-600">{errors.mob_rate}</p>
              )}
            </div>
          </div>

          {/* Project Assignment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Assignment
            </label>
            <select
              name="project_id"
              value={formData.project_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Global Employee (All Projects)</option>
              {projectId && (
                <option value={projectId}>Current Project Only</option>
              )}
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Global employees can be used in any project. Project-specific employees are only available for the selected project.
            </p>
          </div>

          {/* Rate Calculation Helper */}
          <div className="bg-blue-50 p-4 rounded-md">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Rate Guidelines</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <p>• Overtime Rate: Typically 1.5x standard rate</p>
              <p>• Double Time Rate: Typically 2x standard rate</p>
              <p>• MOB (Mobilization): Additional compensation for travel/setup</p>
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
              {loading ? 'Saving...' : employee ? 'Update Employee' : 'Add Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Main Employees Page
export default function EmployeesPage() {
  const { user } = useAuth()
  const { activeProject } = useProjects()
  const { employees, loading, createEmployee, updateEmployee, deleteEmployee } = useEmployees()
  
  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [projectFilter, setProjectFilter] = useState<'all' | 'global' | 'project'>('all')

  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  const canRead = hasPermission('labor', 'read')
  const canWrite = hasPermission('labor', 'write')

  // Filter employees
  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = searchTerm === '' || 
      employee.name.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesProject = projectFilter === 'all' ||
      (projectFilter === 'global' && !employee.project_id) ||
      (projectFilter === 'project' && employee.project_id === activeProject?.id)

    return matchesSearch && matchesProject
  })

  const handleAddEmployee = () => {
    setEditingEmployee(null)
    setShowModal(true)
  }

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee)
    setShowModal(true)
  }

  const handleDeleteEmployee = async (employee: Employee) => {
    if (!window.confirm(`Are you sure you want to delete "${employee.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      await deleteEmployee(employee.id)
    } catch (error: any) {
      alert(error.message || 'Error deleting employee. Please try again.')
    }
  }

  const handleSubmitEmployee = async (employeeData: Omit<Employee, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    if (editingEmployee) {
      await updateEmployee(editingEmployee.id, employeeData)
    } else {
      await createEmployee(employeeData)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  if (!canRead) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <div className="text-red-500 mb-4">
            <Users className="mx-auto h-12 w-12" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-600">You don't have permission to view employees.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white overflow-hidden shadow rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Employee Management</h1>
            <p className="text-gray-600 text-sm sm:text-base">Manage employee information and labor rates</p>
          </div>
          {canWrite && (
            <button
              onClick={handleAddEmployee}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">{employees.length}</div>
            <div className="text-xs sm:text-sm text-gray-600">Total Employees</div>
          </div>
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-green-600">
              {employees.filter(emp => !emp.project_id).length}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">Global Employees</div>
          </div>
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-purple-600">
              {employees.filter(emp => emp.project_id === activeProject?.id).length}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">Project Employees</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value as 'all' | 'global' | 'project')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Employees</option>
              <option value="global">Global Employees</option>
              <option value="project">Current Project Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading employees...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No employees found</h3>
            <p className="text-gray-600 mb-4">
              {employees.length === 0 
                ? 'No employees have been added yet.'
                : 'No employees match your current filters.'}
            </p>
            {canWrite && employees.length === 0 && (
              <button
                onClick={handleAddEmployee}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md inline-flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add First Employee
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Standard Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Overtime Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Double Time Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    MOB Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assignment
                  </th>
                  {canWrite && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <Users className="h-6 w-6 text-gray-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {employee.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(employee.standard_rate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(employee.ot_rate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(employee.dt_rate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.mob_rate ? formatCurrency(employee.mob_rate) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        employee.project_id 
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {employee.project_id ? 'Project Only' : 'Global'}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditEmployee(employee)}
                            className="text-blue-600 hover:text-blue-900 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteEmployee(employee)}
                            className="text-red-600 hover:text-red-900 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee Modal */}
      <EmployeeModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmitEmployee}
        employee={editingEmployee}
        loading={loading}
        projectId={activeProject?.id}
      />
    </div>
  )
}