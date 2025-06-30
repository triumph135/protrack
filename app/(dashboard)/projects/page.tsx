'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, Building, Users, DollarSign, Calendar, Search, Eye, FileText, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import ProjectModal from '@/components/ProjectModal'
import type { Project, ChangeOrder } from '@/types/app.types'

export default function ProjectsPage() {
  const { user } = useAuth()
  const { projects, loading, createProject, updateProject, deleteProject, setActiveProject, activeProject } = useProjects()
  const [showModal, setShowModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  
  // Change Order Management State
  const [showChangeOrderForm, setShowChangeOrderForm] = useState<string | null>(null)
  const [editingChangeOrder, setEditingChangeOrder] = useState<ChangeOrder | null>(null)
  const [changeOrderForm, setChangeOrderForm] = useState<{
    name: string
    description: string
    additional_contract_value: number
  }>({
    name: '',
    description: '',
    additional_contract_value: 0
  })

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

  const toggleProjectExpansion = (projectId: string) => {
    const newExpanded = new Set(expandedProjects)
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId)
    } else {
      newExpanded.add(projectId)
    }
    setExpandedProjects(newExpanded)
  }

  const handleAddChangeOrder = (projectId: string) => {
    setEditingChangeOrder(null)
    setChangeOrderForm({
      name: '',
      description: '',
      additional_contract_value: 0
    })
    setShowChangeOrderForm(projectId)
  }

  const handleEditChangeOrder = (changeOrder: ChangeOrder) => {
    setEditingChangeOrder(changeOrder)
    setChangeOrderForm({
      name: changeOrder.name,
      description: changeOrder.description || '',
      additional_contract_value: changeOrder.additional_contract_value || 0
    })
    setShowChangeOrderForm(changeOrder.project_id)
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
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
      {/* Page Header */}
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Projects</h1>
            <p className="text-gray-600 mt-1">Manage your construction projects and change orders</p>
          </div>
          {hasPermission('projects', 'write') && (
            <button
              onClick={handleCreateProject}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 transition-colors w-fit"
            >
              <Plus className="w-4 h-4" />
              Add Project
            </button>
          )}
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
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
            </select>
          </div>
        </div>
      </div>

      {/* Projects List */}
      <div className="space-y-4">
        {filteredProjects.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow-md text-center">
            <Building className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {projects.length === 0 ? 'No Projects' : 'No Projects Found'}
            </h3>
            <p className="text-gray-600 mb-4">
              {projects.length === 0 
                ? 'Get started by creating your first project.'
                : 'Try adjusting your search or filter criteria.'
              }
            </p>
            {hasPermission('projects', 'write') && projects.length === 0 && (
              <button
                onClick={handleCreateProject}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 mx-auto transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create First Project
              </button>
            )}
          </div>
        ) : (
          filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isActive={activeProject?.id === project.id}
              isExpanded={expandedProjects.has(project.id)}
              onToggleExpansion={() => toggleProjectExpansion(project.id)}
              onSetActive={() => setActiveProject(project)}
              onEdit={() => handleEditProject(project)}
              onDelete={() => handleDeleteProject(project)}
              onAddChangeOrder={() => handleAddChangeOrder(project.id)}
              onEditChangeOrder={handleEditChangeOrder}
              showChangeOrderForm={showChangeOrderForm === project.id}
              changeOrderForm={changeOrderForm}
              setChangeOrderForm={setChangeOrderForm}
              editingChangeOrder={editingChangeOrder}
              onCloseChangeOrderForm={() => {
                setShowChangeOrderForm(null)
                setEditingChangeOrder(null)
              }}
              hasPermission={hasPermission}
              formatCurrency={formatCurrency}
            />
          ))
        )}
      </div>

      {/* Project Modal */}
      {showModal && (
        <ProjectModal
          project={editingProject}
          onSave={async (projectData) => {
            try {
              if (editingProject) {
                await updateProject(editingProject.id, projectData)
              } else {
                await createProject(projectData)
              }
              setShowModal(false)
              setEditingProject(null)
            } catch (error) {
              console.error('Error saving project:', error)
              throw error
            }
          }}
          onCancel={() => {
            setShowModal(false)
            setEditingProject(null)
          }}
        />
      )}
    </div>
  )
}

// Separate ProjectCard component for better organization
interface ProjectCardProps {
  project: Project
  isActive: boolean
  isExpanded: boolean
  onToggleExpansion: () => void
  onSetActive: () => void
  onEdit: () => void
  onDelete: () => void
  onAddChangeOrder: () => void
  onEditChangeOrder: (changeOrder: ChangeOrder) => void
  showChangeOrderForm: boolean
  changeOrderForm: {
    name: string
    description: string
    additional_contract_value: number
  }
  setChangeOrderForm: (form: {
    name: string
    description: string
    additional_contract_value: number
  } | ((prev: {
    name: string
    description: string
    additional_contract_value: number
  }) => {
    name: string
    description: string
    additional_contract_value: number
  })) => void
  editingChangeOrder: ChangeOrder | null
  onCloseChangeOrderForm: () => void
  hasPermission: (area: string, level?: 'read' | 'write') => boolean
  formatCurrency: (amount: number | undefined) => string
}

function ProjectCard({
  project,
  isActive,
  isExpanded,
  onToggleExpansion,
  onSetActive,
  onEdit,
  onDelete,
  onAddChangeOrder,
  onEditChangeOrder,
  showChangeOrderForm,
  changeOrderForm,
  setChangeOrderForm,
  editingChangeOrder,
  onCloseChangeOrderForm,
  hasPermission,
  formatCurrency
}: ProjectCardProps) {
  const { changeOrders, createChangeOrder, updateChangeOrder, deleteChangeOrder, loading: changeOrdersLoading } = useChangeOrders(project.id)

  const handleSaveChangeOrder = async () => {
    try {
      if (editingChangeOrder) {
        await updateChangeOrder(editingChangeOrder.id, changeOrderForm)
      } else {
        await createChangeOrder(changeOrderForm)
      }
      onCloseChangeOrderForm()
    } catch (error) {
      console.error('Error saving change order:', error)
      alert('Error saving change order. Please try again.')
    }
  }

  const handleDeleteChangeOrder = async (changeOrderId: string) => {
    if (!window.confirm('Are you sure you want to delete this change order? This will affect related costs and invoices.')) {
      return
    }

    try {
      await deleteChangeOrder(changeOrderId)
    } catch (error) {
      console.error('Error deleting change order:', error)
      alert('Error deleting change order. Please try again.')
    }
  }

  const totalChangeOrderValue = changeOrders.reduce((sum, co) => sum + (co.additional_contract_value || 0), 0)

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Project Header */}
      <div className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start space-x-4 flex-1">
            <button
              onClick={onToggleExpansion}
              className="text-gray-400 hover:text-gray-600 transition-colors mt-1"
            >
              {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>
            
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 gap-2">
                <h3 className="text-lg font-semibold text-gray-900 break-words">
                  {project.jobNumber} - {project.jobName}
                </h3>
                {isActive && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 w-fit">
                    Active Project
                  </span>
                )}
              </div>
              <p className="text-gray-600 mt-1">{project.customer}</p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 gap-1 sm:gap-0 mt-2 text-sm text-gray-500">
                <span>Contract: {formatCurrency(project.totalContractValue)}</span>
                <span>Change Orders: {formatCurrency(totalChangeOrderValue)}</span>
                <span className="font-medium">Total: {formatCurrency((project.totalContractValue || 0) + totalChangeOrderValue)}</span>
              </div>
            </div>
          </div>

          {/* Mobile: Status and Actions - stacked vertically */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 lg:gap-2">
            {/* Status Badge */}
            <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full w-fit ${
              project.status === 'Active' ? 'bg-green-100 text-green-800' :
              project.status === 'Completed' ? 'bg-blue-100 text-blue-800' :
              project.status === 'Inactive' ? 'bg-gray-100 text-gray-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {project.status}
            </span>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              {!isActive && (
                <button
                  onClick={onSetActive}
                  className="text-green-600 hover:text-green-900 p-2 rounded-md border border-green-200 hover:border-green-300 transition-colors"
                  title="Set as active project"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}

              {hasPermission('projects', 'write') && (
                <>
                  <button
                    onClick={onEdit}
                    className="text-blue-600 hover:text-blue-900 p-2 rounded-md border border-blue-200 hover:border-blue-300 transition-colors"
                    title="Edit project"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onDelete}
                    className="text-red-600 hover:text-red-900 p-2 rounded-md border border-red-200 hover:border-red-300 transition-colors"
                    title="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Content - Change Orders */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-gray-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Change Orders ({changeOrders.length})
            </h4>
            {hasPermission('projects', 'write') && (
              <button
                onClick={onAddChangeOrder}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Change Order
              </button>
            )}
          </div>

          {/* Change Order Form */}
          {showChangeOrderForm && (
            <div className="bg-white p-4 rounded-lg border mb-4">
              <h5 className="font-medium text-gray-900 mb-3">
                {editingChangeOrder ? 'Edit Change Order' : 'Add Change Order'}
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={changeOrderForm.name}
                    onChange={(e) => setChangeOrderForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="CO-001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Value</label>
                  <input
                    type="number"
                    value={changeOrderForm.additional_contract_value}
                    onChange={(e) => setChangeOrderForm(prev => ({ 
                      ...prev, 
                      additional_contract_value: parseFloat(e.target.value) || 0 
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={changeOrderForm.description}
                    onChange={(e) => setChangeOrderForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Brief description"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2 mt-3">
                <button
                  onClick={onCloseChangeOrderForm}
                  className="px-3 py-1 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChangeOrder}
                  className="px-3 py-1 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Change Orders List */}
          {changeOrdersLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : changeOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="mx-auto h-8 w-8 text-gray-400 mb-2" />
              <p>No change orders for this project</p>
            </div>
          ) : (
            <div className="space-y-2">
              {changeOrders.map((changeOrder) => (
                <div key={changeOrder.id} className="bg-white p-3 rounded border flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{changeOrder.name}</div>
                    <div className="text-sm text-gray-600">
                      {formatCurrency(changeOrder.additional_contract_value || 0)}
                      {changeOrder.description && ` • ${changeOrder.description}`}
                    </div>
                  </div>
                  {hasPermission('projects', 'write') && (
                    <div className="flex space-x-1">
                      <button
                        onClick={() => onEditChangeOrder(changeOrder)}
                        className="text-blue-600 hover:text-blue-900 p-1 rounded"
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteChangeOrder(changeOrder.id)}
                        className="text-red-600 hover:text-red-900 p-1 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}