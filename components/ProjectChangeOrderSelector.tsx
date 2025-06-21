'use client'

import { useState, useEffect } from 'react'
import { Building, FileText, ChevronDown } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useChangeOrders } from '@/hooks/useChangeOrders'

interface ProjectChangeOrderSelectorProps {
  selectedChangeOrderId?: string | null
  onChangeOrderChange?: (changeOrderId: string | null) => void
  showChangeOrderSelector?: boolean
  disableChangeOrderSelector?: boolean // New prop to disable change order selection
}

export default function ProjectChangeOrderSelector({ 
  selectedChangeOrderId = null, 
  onChangeOrderChange,
  showChangeOrderSelector = true,
  disableChangeOrderSelector = false
}: ProjectChangeOrderSelectorProps) {
  const { user } = useAuth()
  const { projects, activeProject, setActiveProject, loading: projectsLoading } = useProjects()
  // Only load change orders for the active project
  const { changeOrders, loading: changeOrdersLoading } = useChangeOrders(activeProject?.id)
  
  // Local state for change order selection when no external control
  const [localSelectedChangeOrder, setLocalSelectedChangeOrder] = useState<string | null>(null)
  
  // Use external control if provided, otherwise use local state
  const currentChangeOrderId = onChangeOrderChange ? selectedChangeOrderId : localSelectedChangeOrder
  
  useEffect(() => {
    // Reset change order selection when project changes
    if (onChangeOrderChange) {
      onChangeOrderChange(null)
    } else {
      setLocalSelectedChangeOrder(null)
    }
  }, [activeProject?.id, onChangeOrderChange])

  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  const handleProjectChange = (projectId: string) => {
    const selectedProject = projects.find(p => p.id === projectId)
    if (selectedProject) {
      setActiveProject(selectedProject)
    }
  }

  const handleChangeOrderChange = (changeOrderId: string) => {
    if (disableChangeOrderSelector) return
    
    const newValue = changeOrderId === 'all' ? null : 
                     changeOrderId === 'base' ? 'base' : changeOrderId
    
    if (onChangeOrderChange) {
      onChangeOrderChange(newValue)
    } else {
      setLocalSelectedChangeOrder(newValue)
    }
  }

  const getChangeOrderDisplayName = (changeOrderId: string | null) => {
    if (disableChangeOrderSelector) return 'All Project Data'
    if (!changeOrderId) return 'All Change Orders'
    if (changeOrderId === 'base') return 'Base Contract'
    
    const changeOrder = changeOrders.find(co => co.id === changeOrderId)
    return changeOrder ? changeOrder.name : 'Unknown Change Order'
  }

  if (projectsLoading) {
    return (
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center space-x-4">
          <div className="animate-pulse flex space-x-4 w-full">
            <div className="h-10 bg-gray-200 rounded w-64"></div>
            {showChangeOrderSelector && <div className="h-10 bg-gray-200 rounded w-48"></div>}
          </div>
        </div>
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center text-gray-500">
            <Building className="w-5 h-5 mr-2" />
            <span>No active project selected</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center space-x-6">
        {/* Project Selector */}
        <div className="flex items-center space-x-3">
          <Building className="w-5 h-5 text-gray-400" />
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">Project:</span>
            {projects.length > 1 ? (
              <div className="relative">
                <select
                  value={activeProject.id}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  disabled={!hasPermission('projects', 'read')}
                >
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.jobNumber} - {project.jobName}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            ) : (
              <span className="text-sm text-gray-900 font-medium">
                {activeProject.jobNumber} - {activeProject.jobName}
              </span>
            )}
          </div>
        </div>

        {/* Change Order Selector - Only show if we have change orders or want to show the base contract option */}
        {showChangeOrderSelector && hasPermission('projects', 'read') && (
          <div className="flex items-center space-x-3">
            <FileText className="w-5 h-5 text-gray-400" />
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">
                {disableChangeOrderSelector ? 'View:' : 'Change Order:'}
              </span>
              <div className="relative">
                {disableChangeOrderSelector ? (
                  <span className="text-sm text-gray-900 font-medium bg-gray-100 px-3 py-2 rounded-md">
                    All Project Data
                  </span>
                ) : (
                  <>
                    <select
                      value={currentChangeOrderId === null ? 'all' : 
                             currentChangeOrderId === 'base' ? 'base' : currentChangeOrderId}
                      onChange={(e) => handleChangeOrderChange(e.target.value)}
                      className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      disabled={changeOrdersLoading || disableChangeOrderSelector}
                    >
                      <option value="all">All Change Orders</option>
                      <option value="base">Base Contract</option>
                      {changeOrders.map(changeOrder => (
                        <option key={changeOrder.id} value={changeOrder.id}>
                          {changeOrder.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Current Selection Summary */}
        <div className="flex-1 text-right">
          <div className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{activeProject.customer}</span>
            {showChangeOrderSelector && !disableChangeOrderSelector && currentChangeOrderId && (
              <span className="ml-2 text-gray-500">
                • {getChangeOrderDisplayName(currentChangeOrderId)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}