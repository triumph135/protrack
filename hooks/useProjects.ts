'use client'

import { useState, useEffect } from 'react'
import { useTenant } from '@/contexts/TenantContext'
import { tenantDbService } from '@/lib/tenantDbService'

interface Project {
  id: string
  jobNumber: string
  jobName: string
  customer: string
  fieldShopBoth: string
  totalContractValue: number
  status: string
  tenant_id: string
  created_at: string
  updated_at: string
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(false)
  const { tenant } = useTenant()

  // Set tenant context when available
  useEffect(() => {
    if (tenant?.id) {
      tenantDbService.setTenant(tenant.id)
      loadProjects()
    }
  }, [tenant])

  const loadProjects = async () => {
    try {
      setLoading(true)
      
      // Load active projects
      const activeProjects = await tenantDbService.projects.getAll(false)
      setProjects(activeProjects)
      
      // Load all projects (including inactive)
      const allProjectsData = await tenantDbService.projects.getAllWithStatus()
      setAllProjects(allProjectsData)
      
      // Set active project if none selected and projects exist
      if (!activeProject && activeProjects.length > 0) {
        setActiveProject(activeProjects[0])
      }
    } catch (error) {
      console.error('Error loading projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const createProject = async (projectData: {
    jobNumber: string
    jobName: string
    customer: string
    fieldShopBoth: string
    totalContractValue: number
    status?: string
  }) => {
    try {
      setLoading(true)
      const newProject = await tenantDbService.projects.create(projectData)
      
      // Update project lists
      setAllProjects(prev => [newProject, ...prev])
      if (newProject.status === 'Active') {
        setProjects(prev => [newProject, ...prev])
        // Set as active project if no active project exists
        if (!activeProject) {
          setActiveProject(newProject)
        }
      }
      
      return newProject
    } catch (error) {
      console.error('Error creating project:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const updateProject = async (projectId: string, updates: Partial<{
    jobNumber: string
    jobName: string
    customer: string
    fieldShopBoth: string
    totalContractValue: number
    status: string
  }>) => {
    try {
      setLoading(true)
      const updatedProject = await tenantDbService.projects.update(projectId, updates)
      
      // Update project lists
      setAllProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p))
      
      // Update active projects list based on status
      if (updatedProject.status === 'Active') {
        setProjects(prev => {
          const existing = prev.find(p => p.id === projectId)
          if (existing) {
            return prev.map(p => p.id === projectId ? updatedProject : p)
          } else {
            return [updatedProject, ...prev]
          }
        })
      } else {
        setProjects(prev => prev.filter(p => p.id !== projectId))
        // If the updated project was active, select a new one
        if (activeProject?.id === projectId) {
          const remainingActiveProjects = await tenantDbService.projects.getAll(false)
          setActiveProject(remainingActiveProjects[0] || null)
        }
      }
      
      // Update active project if it was the one being edited
      if (activeProject?.id === projectId) {
        setActiveProject(updatedProject)
      }
      
      return updatedProject
    } catch (error) {
      console.error('Error updating project:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const updateProjectStatus = async (projectId: string, status: string) => {
    try {
      setLoading(true)
      const updatedProject = await tenantDbService.projects.updateStatus(projectId, status)
      
      // Update project lists
      setAllProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p))
      
      if (status === 'Active') {
        setProjects(prev => {
          const existing = prev.find(p => p.id === projectId)
          if (!existing) {
            return [updatedProject, ...prev]
          }
          return prev.map(p => p.id === projectId ? updatedProject : p)
        })
      } else {
        setProjects(prev => prev.filter(p => p.id !== projectId))
        // If the deactivated project was active, select a new one
        if (activeProject?.id === projectId) {
          const remainingActiveProjects = await tenantDbService.projects.getAll(false)
          setActiveProject(remainingActiveProjects[0] || null)
        }
      }
      
      return updatedProject
    } catch (error) {
      console.error('Error updating project status:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const deleteProject = async (projectId: string) => {
    try {
      setLoading(true)
      await tenantDbService.projects.delete(projectId)
      
      // Remove from all lists
      setAllProjects(prev => prev.filter(p => p.id !== projectId))
      setProjects(prev => prev.filter(p => p.id !== projectId))
      
      // If deleted project was active, select a new one
      if (activeProject?.id === projectId) {
        const remainingActiveProjects = await tenantDbService.projects.getAll(false)
        setActiveProject(remainingActiveProjects[0] || null)
      }
    } catch (error) {
      console.error('Error deleting project:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  return {
    projects,
    allProjects,
    activeProject,
    setActiveProject,
    loading,
    createProject,
    updateProject,
    updateProjectStatus,
    deleteProject,
    refreshProjects: loadProjects
  }
}