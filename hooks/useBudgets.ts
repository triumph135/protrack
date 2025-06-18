'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import type { ProjectBudget } from '@/types/app.types'

export function useBudgets(projectId?: string) {
  const [budget, setBudget] = useState<ProjectBudget | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { user } = useAuth()
  const { tenant } = useTenant()
  const supabase = createClient()

  // Load budget for a specific project
  const loadBudget = async (filterProjectId?: string) => {
    if (!tenant?.id || (!projectId && !filterProjectId)) return

    try {
      setLoading(true)
      setError(null)

      const targetProjectId = filterProjectId || projectId

      const { data, error: fetchError } = await supabase
        .from('project_budgets')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('project_id', targetProjectId)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError
      }

      setBudget(data || null)
    } catch (err: any) {
      console.error('Error loading budget:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Create or update budget
  const saveBudget = async (budgetData: Omit<ProjectBudget, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    if (!tenant?.id || !user?.id) throw new Error('Missing tenant or user')

    try {
      setLoading(true)

      const budgetPayload = {
        ...budgetData,
        tenant_id: tenant.id,
        updated_by: user.id
      }

      if (budget) {
        // Update existing budget
        const { data, error } = await supabase
          .from('project_budgets')
          .update(budgetPayload)
          .eq('id', budget.id)
          .eq('tenant_id', tenant.id)
          .select()
          .single()

        if (error) throw error
        setBudget(data)
      } else {
        // Create new budget
        const { data, error } = await supabase
          .from('project_budgets')
          .insert([budgetPayload])
          .select()
          .single()

        if (error) throw error
        setBudget(data)
      }

      return budget
    } catch (err: any) {
      console.error('Error saving budget:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Get default budget structure
  const getDefaultBudget = (projectId: string): Omit<ProjectBudget, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> => ({
    project_id: projectId,
    material_budget: 0,
    labor_budget: 0,
    equipment_budget: 0,
    subcontractor_budget: 0,
    others_budget: 0,
    cap_leases_budget: 0,
    consumable_budget: 0,
    updated_by: user?.id
  })

  // Get total budget
  const getTotalBudget = (): number => {
    if (!budget) return 0
    
    return (budget.material_budget || 0) +
           (budget.labor_budget || 0) +
           (budget.equipment_budget || 0) +
           (budget.subcontractor_budget || 0) +
           (budget.others_budget || 0) +
           (budget.cap_leases_budget || 0) +
           (budget.consumable_budget || 0)
  }

  // Load budget when project changes
  useEffect(() => {
    if (projectId && tenant?.id) {
      loadBudget(projectId)
    }
  }, [projectId, tenant?.id])

  return {
    budget,
    loading,
    error,
    loadBudget,
    saveBudget,
    getDefaultBudget,
    getTotalBudget
  }
}