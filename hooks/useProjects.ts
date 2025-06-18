'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import type { Project } from '@/types/app.types'

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const { user } = useAuth()
  const { tenant } = useTenant()
  const supabase = createClient()

  // Load projects on component mount
  useEffect(() => {
    if (user && tenant) {
      loadProjects()
    }
  }, [user, tenant])

  // Load active project from localStorage
  useEffect(() => {
    if (projects.length > 0 && !activeProject) {
      const savedActiveProjectId = localStorage.getItem(`protrack_active_project_${tenant?.id}`)
      if (savedActiveProjectId) {
        const savedProject = projects.find(p => p.id === savedActiveProjectId)
        if (savedProject) {
          setActiveProject(savedProject)
        } else {
          setActiveProject(projects[0])
        }
      } else {
        setActiveProject(projects[0])
      }
    }
  }, [projects, activeProject, tenant])

  // Save active project to localStorage
  useEffect(() => {
    if (activeProject && tenant) {
      localStorage.setItem(`protrack_active_project_${tenant.id}`, activeProject.id)
    }
  }, [activeProject, tenant])

  const loadProjects = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('*')
        .eq('tenant_id', tenant?.id)
        .eq('status', 'Active')
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
      setActiveProject(data)
      
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
        setActiveProject(data)
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
        setActiveProject(remainingProjects[0] || null)
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

  const changeActiveProject = (project: Project) => {
    setActiveProject(project)
  }

  return {
    projects,
    activeProject,
    loading,
    error,
    loadProjects,
    createProject,
    updateProject,
    deleteProject,
    setActiveProject: changeActiveProject
  }
}