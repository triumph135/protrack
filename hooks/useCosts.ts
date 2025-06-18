'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import type { ProjectCost } from '@/types/app.types'

export type CostCategory = 'material' | 'labor' | 'equipment' | 'subcontractor' | 'others' | 'cap_leases' | 'consumable'

export function useCosts(projectId?: string) {
  const [costs, setCosts] = useState<Record<CostCategory, ProjectCost[]>>({
    material: [],
    labor: [],
    equipment: [],
    subcontractor: [],
    others: [],
    cap_leases: [],
    consumable: []
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { user } = useAuth()
  const { tenant } = useTenant()
  const supabase = createClient()

  // Load costs for a specific project and category
  const loadCosts = async (category: CostCategory, filterProjectId?: string) => {
    if (!tenant?.id || (!projectId && !filterProjectId)) return

    try {
      setLoading(true)
      setError(null)

      const targetProjectId = filterProjectId || projectId

      const { data, error: fetchError } = await supabase
        .from('project_costs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('project_id', targetProjectId)
        .eq('category', category)
        .order('date', { ascending: false })

      if (fetchError) throw fetchError

      setCosts(prev => ({
        ...prev,
        [category]: data || []
      }))
    } catch (err: any) {
      console.error(`Error loading ${category} costs:`, err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Load all costs for a project
  const loadAllCosts = async (filterProjectId?: string) => {
    if (!tenant?.id || (!projectId && !filterProjectId)) return

    try {
      setLoading(true)
      setError(null)

      const targetProjectId = filterProjectId || projectId

      const { data, error: fetchError } = await supabase
        .from('project_costs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('project_id', targetProjectId)
        .order('date', { ascending: false })

      if (fetchError) throw fetchError

      // Group by category
      const groupedCosts: Record<CostCategory, ProjectCost[]> = {
        material: [],
        labor: [],
        equipment: [],
        subcontractor: [],
        others: [],
        cap_leases: [],
        consumable: []
      }

      data?.forEach(cost => {
        const category = cost.category as CostCategory
        if (groupedCosts[category]) {
          groupedCosts[category].push(cost)
        }
      })

      setCosts(groupedCosts)
    } catch (err: any) {
      console.error('Error loading all costs:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Create a new cost entry
  const createCost = async (category: CostCategory, costData: Omit<ProjectCost, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    if (!tenant?.id || !user?.id) throw new Error('Missing tenant or user')

    try {
      setLoading(true)

      const newCost = {
        ...costData,
        tenant_id: tenant.id,
        category,
        cost: calculateTotalCost(category, costData)
      }

      const { data, error } = await supabase
        .from('project_costs')
        .insert([newCost])
        .select()
        .single()

      if (error) throw error

      setCosts(prev => ({
        ...prev,
        [category]: [data, ...prev[category]]
      }))

      return data
    } catch (err: any) {
      console.error('Error creating cost:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Update a cost entry
  const updateCost = async (category: CostCategory, costId: string, updates: Partial<ProjectCost>) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      const updatedData = {
        ...updates,
        cost: updates.cost || calculateTotalCost(category, updates as ProjectCost)
      }

      const { data, error } = await supabase
        .from('project_costs')
        .update(updatedData)
        .eq('id', costId)
        .eq('tenant_id', tenant.id)
        .select()
        .single()

      if (error) throw error

      setCosts(prev => ({
        ...prev,
        [category]: prev[category].map(cost => cost.id === costId ? data : cost)
      }))

      return data
    } catch (err: any) {
      console.error('Error updating cost:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Delete a cost entry
  const deleteCost = async (category: CostCategory, costId: string) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      const { error } = await supabase
        .from('project_costs')
        .delete()
        .eq('id', costId)
        .eq('tenant_id', tenant.id)

      if (error) throw error

      setCosts(prev => ({
        ...prev,
        [category]: prev[category].filter(cost => cost.id !== costId)
      }))

      return true
    } catch (err: any) {
      console.error('Error deleting cost:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Calculate total cost based on category
  const calculateTotalCost = (category: CostCategory, costData: Partial<ProjectCost>): number => {
    if (category === 'labor') {
      const stTotal = (costData.st_hours || 0) * (costData.st_rate || 0)
      const otTotal = (costData.ot_hours || 0) * (costData.ot_rate || 0)
      const dtTotal = (costData.dt_hours || 0) * (costData.dt_rate || 0)
      const perDiem = costData.per_diem || 0
      const mobTotal = (costData.mob_qty || 0) * (costData.mob_rate || 0)
      return stTotal + otTotal + dtTotal + perDiem + mobTotal
    }
    
    return costData.cost || 0
  }

  // Get totals for each category
  const getTotals = () => {
    const totals: Record<CostCategory, number> = {
      material: 0,
      labor: 0,
      equipment: 0,
      subcontractor: 0,
      others: 0,
      cap_leases: 0,
      consumable: 0
    }

    Object.keys(costs).forEach(category => {
      const categoryKey = category as CostCategory
      totals[categoryKey] = costs[categoryKey].reduce((sum, cost) => sum + (cost.cost || 0), 0)
    })

    return {
      ...totals,
      total: Object.values(totals).reduce((sum, value) => sum + value, 0)
    }
  }

  // Load costs when project changes
  useEffect(() => {
    if (projectId && tenant?.id) {
      loadAllCosts(projectId)
    }
  }, [projectId, tenant?.id])

  return {
    costs,
    loading,
    error,
    loadCosts,
    loadAllCosts,
    createCost,
    updateCost,
    deleteCost,
    getTotals
  }
}