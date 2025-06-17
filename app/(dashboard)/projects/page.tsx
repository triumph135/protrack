'use client'

import { useState } from 'react'
import { Building, Plus, Edit, Trash2, Play, Pause, Check } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/hooks/useProjects'

interface ProjectFormData {
  jobNumber: string
  jobName: string
  customer: string
  fieldShopBoth: string
  totalContractValue: string
  status: string
}

export default function ProjectsPage() {
  const { user } = useAuth()
  const { 
    allProjects, 
    activeProject, 
    setActiveProject, 
    loading, 
    createProject, 
    updateProject, 
    updateProjectStatus, 
    deleteProject 
  } = useProjects()

  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Inactive'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [formData, setFormData] = useState<ProjectFormData>({
    jobNumber: '',
    jobName: '',
    customer: '',
    fieldShopBoth: 'Both',
    totalContractValue: '',
    status: 'Active'
  })

  // Permission checking
  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  const canRead = hasPermission('projects', 'read')
  const canWrite = hasPermission('projects', 'write')

  // Filter projects based on status filter
  const filteredProjects = allProjects.filter(project => {
    if (statusFilter === 'all') return true
    return project.status === statusFilter
  })

  const handleOpenModal = (project?: any) => {
    if (project) {
      setEditingProject(project)
      setFormData({
        jobNumber: project.jobNumber,
        jobName: project.jobName,
        customer: project.customer,
        fieldShopBoth: project.fieldShopBoth,
        totalContractValue: project.totalContractValue.toString(),
        status: project.status
      })
    } else {
      setEditingProject(null)
      setFormData({
        jobNumber: '',
        jobName: '',
        customer: '',
        fieldShopBoth: 'Both',
        totalContractValue: '',
        status: 'Active'
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingProject(null)
    setFormData({
      jobNumber: '',
      jobName: '',
      customer: '',
      fieldShopBoth: 'Both',
      totalContractValue: '',
      status: 'Active'
    })
  }

  const handleSave = async () => {
    try {
      const projectData = {
        jobNumber: formData.jobNumber,
        jobName: formData.jobName,
        customer: formData.customer,
        fieldShopBoth: formData.fieldShopBoth,
        totalContractValue: parseFloat(formData.totalContractValue) || 0,
        status: formData.status
      }

      if (editingProject) {
        await updateProject(editingProject.id, projectData)
      } else {
        await createProject(projectData)
      }

      handleCloseModal()
    } catch (error) {
      console.error('Error saving project:', error)
      alert('Error saving project: ' + (error as Error).message)
    }
  }

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    try {
      await updateProjectStatus(projectId, newStatus)
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Error updating status: ' + (error as Error).message)
    }
  }

  const handleDelete = async (projectId: string, projectName: string) => {
    if (window.confirm(`Are you sure you want to delete "${projectName}"? This will delete all associated data.`)) {
      try {
        await deleteProject(projectId)
      } catch (error) {
        console.error('Error deleting project:', error)
        alert('Error deleting project: ' + (error as Error).message)
      }
    }
  }

  const handleSetActive = (project: any) => {
    setActiveProject(project)
  }

  if (!canRead) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md text-center">
        <p className="text-gray-500">You don't have permission to view projects.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Building className="h-8 w-8 text-gray-400 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
                <p className="text-gray-600">Manage your construction projects</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Active Project Display */}
              {activeProject && (
                <div className="text-sm">
                  <span className="text-gray-500">Active: </span>
                  <span className="font-medium text-blue-600">
                    {activeProject.jobNumber} - {activeProject.jobName}
                  </span>
                </div>
              )}
              {canWrite && (
                <button 
                  onClick={() => handleOpenModal()}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 gap-2"
                >
                  <Plus className="w-5 h-5" />
                  New Project
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-md">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Status Filter:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Projects</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <span className="text-sm text-gray-500">
            ({filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''})
          </span>
        </div>
      </div>

      {/* Projects Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading projects...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="p-8 text-center">
            <Building className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No projects found</h3>
            <p className="text-gray-500 mb-4">
              {statusFilter === 'all' 
                ? "You haven't created any projects yet." 
                : `No ${statusFilter.toLowerCase()} projects found.`}
            </p>
            {canWrite && (
              <button 
                onClick={() => handleOpenModal()}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 gap-2"
              >
                <Plus className="w-5 h-5" />
                Create Your First Project
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Active
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contract Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProjects.map((project) => (
                  <tr key={project.id} className={activeProject?.id === project.id ? 'bg-blue-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleSetActive(project)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          activeProject?.id === project.id 
                            ? 'bg-blue-600 border-blue-600' 
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {activeProject?.id === project.id && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {project.jobNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {project.jobName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {project.customer}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {project.fieldShopBoth}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${project.totalContractValue.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        project.status === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        {canWrite && (
                          <>
                            <button
                              onClick={() => handleOpenModal(project)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Edit Project"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleStatusChange(
                                project.id, 
                                project.status === 'Active' ? 'Inactive' : 'Active'
                              )}
                              className={project.status === 'Active' ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                              title={project.status === 'Active' ? 'Deactivate' : 'Activate'}
                            >
                              {project.status === 'Active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleDelete(project.id, project.jobName)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete Project"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Project Modal */}
      {showModal && canWrite && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingProject ? 'Edit Project' : 'New Project'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Number</label>
                <input
                  type="text"
                  value={formData.jobNumber}
                  onChange={(e) => setFormData({...formData, jobNumber: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 2024-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                <input
                  type="text"
                  value={formData.jobName}
                  onChange={(e) => setFormData({...formData, jobName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Office Building Construction"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                <input
                  type="text"
                  value={formData.customer}
                  onChange={(e) => setFormData({...formData, customer: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., ABC Corporation"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={formData.fieldShopBoth}
                  onChange={(e) => setFormData({...formData, fieldShopBoth: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Field">Field</option>
                  <option value="Shop">Shop</option>
                  <option value="Both">Both</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Contract Value</label>
                <input
                  type="number"
                  value={formData.totalContractValue}
                  onChange={(e) => setFormData({...formData, totalContractValue: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.jobNumber || !formData.jobName || !formData.customer}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingProject ? 'Update' : 'Create'} Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}