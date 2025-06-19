'use client'

import { useState, useEffect } from 'react'
import { X, Building, User, DollarSign, MapPin, Users, Plus, Edit, Trash2 } from 'lucide-react'
import { useEmployees } from '@/hooks/useEmployees'
import type { Project, Employee } from '@/types/app.types'

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
  const [activeTab, setActiveTab] = useState<'details' | 'employees'>('details')
  const [formData, setFormData] = useState({
    jobNumber: '',
    jobName: '',
    customer: '',
    fieldShopBoth: 'Field',
    totalContractValue: '',
    status: 'Active'
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showEmployeeForm, setShowEmployeeForm] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [employeeFormData, setEmployeeFormData] = useState({
    name: '',
    standard_rate: '',
    ot_rate: '',
    dt_rate: '',
    mob: '',
    mob_rate: ''
  })

  const { employees, createEmployee, updateEmployee, deleteEmployee } = useEmployees()

  // Get employees for this project
  const projectEmployees = project ? employees.filter(emp => emp.project_id === project.id) : []
  const globalEmployees = employees.filter(emp => !emp.project_id)

  // Reset form when modal opens/closes or project changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab('details')
      setShowEmployeeForm(false)
      setEditingEmployee(null)
      
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

  const handleEmployeeFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setEmployeeFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleAddEmployee = () => {
    setEditingEmployee(null)
    setEmployeeFormData({
      name: '',
      standard_rate: '',
      ot_rate: '',
      dt_rate: '',
      mob: '',
      mob_rate: ''
    })
    setShowEmployeeForm(true)
  }

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee)
    setEmployeeFormData({
      name: employee.name,
      standard_rate: employee.standard_rate.toString(),
      ot_rate: employee.ot_rate.toString(),
      dt_rate: employee.dt_rate.toString(),
      mob: employee.mob?.toString() || '',
      mob_rate: employee.mob_rate?.toString() || ''
    })
    setShowEmployeeForm(true)
  }

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!project) {
      alert('Please save the project first before adding employees.')
      return
    }

    try {
      const employeeData = {
        name: employeeFormData.name.trim(),
        standard_rate: Number(employeeFormData.standard_rate),
        ot_rate: Number(employeeFormData.ot_rate),
        dt_rate: Number(employeeFormData.dt_rate),
        mob: employeeFormData.mob ? Number(employeeFormData.mob) : undefined,
        mob_rate: employeeFormData.mob_rate ? Number(employeeFormData.mob_rate) : undefined,
        project_id: project.id
      }

      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, employeeData)
      } else {
        await createEmployee(employeeData)
      }

      setShowEmployeeForm(false)
      setEditingEmployee(null)
    } catch (error) {
      console.error('Error saving employee:', error)
      alert('Error saving employee. Please try again.')
    }
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-transparent flex items-end justify-center z-50 p-4">
      <div 
        className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 id="project-modal-title" className="text-xl font-semibold text-gray-900">
            {project ? 'Edit Project' : 'Create New Project'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'details'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Building className="w-4 h-4 inline mr-2" />
              Project Details
            </button>
            {project && (
              <button
                onClick={() => setActiveTab('employees')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'employees'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                Employee Management ({projectEmployees.length})
              </button>
            )}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'details' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
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
                    Contract Value
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
                      placeholder="Enter contract value"
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
          ) : (
            // Employee Management Tab
            <div className="space-y-6">
              {!showEmployeeForm ? (
                <>
                  {/* Employee Management Header */}
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">Project Employees</h3>
                      <p className="text-sm text-gray-600">
                        Manage employees assigned to this project
                      </p>
                    </div>
                    <button
                      onClick={handleAddEmployee}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Employee
                    </button>
                  </div>

                  {/* Global Employees Notice */}
                  {globalEmployees.length > 0 && (
                    <div className="bg-blue-50 p-4 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>{globalEmployees.length} global employees</strong> are available for all projects. 
                        Project-specific employees shown below are only available for this project.
                      </p>
                    </div>
                  )}

                  {/* Project Employees List */}
                  {projectEmployees.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No project employees yet</h3>
                      <p className="text-gray-600 mb-6">
                        Add employees specific to this project or use global employees.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white border rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Employee
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Standard Rate
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              OT Rate
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              DT Rate
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {projectEmployees.map((employee) => (
                            <tr key={employee.id}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">
                                  {employee.name}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ${employee.standard_rate.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ${employee.ot_rate.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ${employee.dt_rate.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                  onClick={() => handleEditEmployee(employee)}
                                  className="text-blue-600 hover:text-blue-900 mr-3"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteEmployee(employee)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                // Employee Form
                <form onSubmit={handleEmployeeSubmit} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900">
                      {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowEmployeeForm(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Employee Name *
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={employeeFormData.name}
                        onChange={handleEmployeeFormChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter employee name"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Standard Rate *
                      </label>
                      <input
                        type="number"
                        name="standard_rate"
                        value={employeeFormData.standard_rate}
                        onChange={handleEmployeeFormChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                        step="0.01"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Overtime Rate *
                      </label>
                      <input
                        type="number"
                        name="ot_rate"
                        value={employeeFormData.ot_rate}
                        onChange={handleEmployeeFormChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                        step="0.01"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Double Time Rate *
                      </label>
                      <input
                        type="number"
                        name="dt_rate"
                        value={employeeFormData.dt_rate}
                        onChange={handleEmployeeFormChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                        step="0.01"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        MOB Hours
                      </label>
                      <input
                        type="number"
                        name="mob"
                        value={employeeFormData.mob}
                        onChange={handleEmployeeFormChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                        step="0.1"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        MOB Rate
                      </label>
                      <input
                        type="number"
                        name="mob_rate"
                        value={employeeFormData.mob_rate}
                        onChange={handleEmployeeFormChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-6 border-t">
                    <button
                      type="button"
                      onClick={() => setShowEmployeeForm(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                    >
                      {editingEmployee ? 'Update Employee' : 'Add Employee'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}