'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Users, DollarSign, Search, X, User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useEmployees } from '@/hooks/useEmployees'
import EmployeeModal from '@/components/EmployeeModal'
import type { Employee } from '@/types/app.types'



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

  const handleDeleteEmployee = async (employeeId: string) => {
    const employee = employees.find(emp => emp.id === employeeId)
    if (!employee) return

    if (!window.confirm(`Are you sure you want to delete "${employee.name}"?`)) {
      return
    }

    try {
      await deleteEmployee(employeeId)
    } catch (error) {
      console.error('Error deleting employee:', error)
      alert('Error deleting employee. Please try again.')
    }
  }

  const handleSubmitEmployee = async (employeeData: any) => {
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, employeeData)
      } else {
        await createEmployee(employeeData)
      }
      setShowModal(false)
      setEditingEmployee(null)
    } catch (error) {
      console.error('Error saving employee:', error)
      throw error
    }
  }

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Access Denied</h3>
          <p className="mt-1 text-sm text-gray-500">
            You don't have permission to view employees.
          </p>
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
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Project Filter */}
          <div className="sm:w-48">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value as 'all' | 'global' | 'project')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Employees</option>
              <option value="global">Global Only</option>
              <option value="project">Current Project Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employee List */}
      <div className="bg-white shadow rounded-lg">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading employees...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || projectFilter !== 'all' ? 'No employees found' : 'No employees yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || projectFilter !== 'all' 
                ? 'Try adjusting your search or filter criteria.'
                : 'Get started by adding your first employee.'
              }
            </p>
            {canWrite && !searchTerm && projectFilter === 'all' && (
              <button
                onClick={handleAddEmployee}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 mx-auto transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add First Employee
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredEmployees.map((employee) => (
              <div key={employee.id} className="p-4 sm:p-6 hover:bg-gray-50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-medium text-gray-900 truncate">
                          {employee.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            ST: ${employee.standard_rate}/hr
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            OT: ${employee.ot_rate}/hr
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            DT: ${employee.dt_rate}/hr
                          </span>
                          {employee.mob_rate && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              MOB: ${employee.mob_rate}
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            employee.project_id 
                              ? 'bg-purple-100 text-purple-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {employee.project_id ? 'Project Employee' : 'Global Employee'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {canWrite && (
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <button
                        onClick={() => handleEditEmployee(employee)}
                        className="text-blue-600 hover:text-blue-900 p-2 rounded-md border border-blue-200 hover:border-blue-300 transition-colors"
                        title="Edit employee"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEmployee(employee.id)}
                        className="text-red-600 hover:text-red-900 p-2 rounded-md border border-red-200 hover:border-red-300 transition-colors"
                        title="Delete employee"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Employee Modal */}
      <EmployeeModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setEditingEmployee(null)
        }}
        onSubmit={handleSubmitEmployee}
        employee={editingEmployee}
        projectId={activeProject?.id}
      />
    </div>
  )
}