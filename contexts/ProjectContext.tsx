'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import type { Project } from '@/types/app.types'

interface ProjectContextType {
  projects: Project[]
  activeProject: Project | null
  loading: boolean
  error: string | null
  setActiveProject: (project: Project) => void
  loadProjects: () => Promise<void>
  createProject: (projectData: Omit<Project, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<Project>
  updateProject: (projectId: string, updates: Partial<Project>) => Promise<Project>
  deleteProject: (projectId: string) => Promise<boolean>
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export function useProjects() {
  const context = useContext(ProjectContext)
  if (context === undefined) {
    throw new Error('useProjects must be used within a ProjectProvider')
  }
  return context
}

interface ProjectProviderProps {
  children: React.ReactNode
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProjectState] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { user } = useAuth()
  const { tenant } = useTenant()
  const supabase = createClient()

  // Load projects when user and tenant are available
  useEffect(() => {
    if (user && tenant) {
      loadProjects()
    }
  }, [user, tenant])

  // Set active project when projects load
  useEffect(() => {
    if (projects.length > 0 && !activeProject) {
      // Try to load from localStorage first
      const savedActiveProjectId = localStorage.getItem(`protrack_active_project_${tenant?.id}`)
      let projectToSet: Project | null = null
      
      if (savedActiveProjectId) {
        projectToSet = projects.find(p => p.id === savedActiveProjectId) || null
      }
      
      // Fallback to first project if no saved project found
      if (!projectToSet) {
        projectToSet = projects[0]
      }
      
      if (projectToSet) {
        setActiveProjectState(projectToSet)
      }
    }
  }, [projects, activeProject, tenant?.id])

  // Save active project to localStorage when it changes
  useEffect(() => {
    if (activeProject && tenant?.id) {
      localStorage.setItem(`protrack_active_project_${tenant.id}`, activeProject.id)
    }
  }, [activeProject, tenant?.id])

  const loadProjects = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('*')
        .eq('tenant_id', tenant?.id)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      setProjects(data || [])
    } catch (err: any) {
      console.error('Error loading projects:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const createProject = async (projectData: Omit<Project, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    try {
      setLoading(true)
      
      const newProject = {
        ...projectData,
        tenant_id: tenant?.id,
        status: 'Active'
      }

      const { data, error } = await supabase
        .from('projects')
        .insert([newProject])
        .select()
        .single()

      if (error) throw error

      setProjects(prev => [data, ...prev])
      setActiveProjectState(data)
      
      return data
    } catch (err: any) {
      console.error('Error creating project:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateProject = async (projectId: string, updates: Partial<Project>) => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId)
        .eq('tenant_id', tenant?.id)
        .select()
        .single()

      if (error) throw error

      setProjects(prev => prev.map(p => p.id === projectId ? data : p))
      
      if (activeProject?.id === projectId) {
        setActiveProjectState(data)
      }

      return data
    } catch (err: any) {
      console.error('Error updating project:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteProject = async (projectId: string) => {
    try {
      setLoading(true)

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('tenant_id', tenant?.id)

      if (error) throw error

      setProjects(prev => prev.filter(p => p.id !== projectId))
      
      if (activeProject?.id === projectId) {
        const remainingProjects = projects.filter(p => p.id !== projectId)
        setActiveProjectState(remainingProjects[0] || null)
      }

      return true
    } catch (err: any) {
      console.error('Error deleting project:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const setActiveProject = (project: Project) => {
    setActiveProjectState(project)
  }

  const value: ProjectContextType = {
    projects,
    activeProject,
    loading,
    error,
    setActiveProject,
    loadProjects,
    createProject,
    updateProject,
    deleteProject
  }

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  )
} 