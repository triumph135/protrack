'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, Building, Users, DollarSign, Calendar, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/hooks/useProjects'
import ProjectModal from '@/components/ProjectModal'
import type { Project } from '@/types/app.types'

export default function ProjectsPage() {
  const { user } = useAuth()
  const { projects, loading, createProject, updateProject, deleteProject, setActiveProject, activeProject } = useProjects()
  const [showModal, setShowModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  const filteredProjects = projects.filter(project => {
    const matchesSearch = 
      project.jobNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.jobName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.customer.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  const handleCreateProject = () => {
    setEditingProject(null)
    setShowModal(true)
  }

  const handleEditProject = (project: Project) => {
    setEditingProject(project)
    setShowModal(true)
  }

  const handleDeleteProject = async (project: Project) => {
    if (!window.confirm(`Are you sure you want to delete "${project.jobName}"? This will also delete all associated data.`)) {
      return
    }

    try {
      await deleteProject(project.id)
    } catch (error) {
      console.error('Error deleting project:', error)
      alert('Error deleting project. Please try again.')
    }
  }

  const handleSubmitProject = async (projectData: Omit<Project, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    if (editingProject) {
      await updateProject(editingProject.id, projectData)
    } else {
      await createProject(projectData)
    }
  }

  const handleSetActiveProject = (project: Project) => {
    setActiveProject(project)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading projects...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600">Manage your construction projects</p>
        </div>
        {hasPermission('projects', 'write') && (
          <button
            onClick={handleCreateProject}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <div className="bg-white p-12 rounded-lg shadow-md text-center">
          <Building className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {projects.length === 0 ? 'No projects yet' : 'No projects match your filters'}
          </h3>
          <p className="text-gray-600 mb-6">
            {projects.length === 0 
              ? 'Get started by creating your first project.' 
              : 'Try adjusting your search or filter criteria.'}
          </p>
          {hasPermission('projects', 'write') && projects.length === 0 && (
            <button
              onClick={handleCreateProject}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 mx-auto transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Your First Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className={`bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer ${
                activeProject?.id === project.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => handleSetActiveProject(project)}
            >
              {/* Project Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {project.jobName}
                  </h3>
                  <p className="text-sm text-gray-600">#{project.jobNumber}</p>
                </div>
                <div className="flex space-x-2">
                  {hasPermission('projects', 'write') && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditProject(project)
                        }}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteProject(project)
                        }}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Project Details */}
              <div className="space-y-3">
                <div className="flex items-center text-sm text-gray-600">
                  <Users className="w-4 h-4 mr-2" />
                  {project.customer}
                </div>
                
                {project.totalContractValue && (
                  <div className="flex items-center text-sm text-gray-600">
                    <DollarSign className="w-4 h-4 mr-2" />
                    ${project.totalContractValue.toLocaleString()}
                  </div>
                )}

                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-2" />
                  Created {new Date(project.created_at || '').toLocaleDateString()}
                </div>
              </div>

              {/* Status Badge */}
              <div className="mt-4 flex justify-between items-center">
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    project.status === 'Active'
                      ? 'bg-green-100 text-green-800'
                      : project.status === 'On Hold'
                      ? 'bg-yellow-100 text-yellow-800'
                      : project.status === 'Completed'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {project.status}
                </span>
                
                {activeProject?.id === project.id && (
                  <span className="text-xs text-blue-600 font-medium">Active Project</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project Modal */}
      <ProjectModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmitProject}
        project={editingProject}
        loading={loading}
      />
    </div>
  )
}