'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import type { ProjectCost } from '@/types/app.types'

export type CostCategory = 'material' | 'labor' | 'equipment' | 'subcontractor' | 'others' | 'cap_leases' | 'consumable'

interface CostFilters {
  projectId?: string
  changeOrderId?: string | null // null = all, 'base' = base contract, actual ID = specific change order
  category?: CostCategory
}

export function useCosts(projectId?: string, changeOrderId?: string | null) {
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

  // Helper function to calculate total cost for different categories
const calculateTotalCost = (category: CostCategory, costData: Partial<ProjectCost>): number => {
  if (category === 'labor') {
    // Ensure all values are numbers, not strings
    const stTotal = Number(costData.st_hours || 0) * Number(costData.st_rate || 0)
    const otTotal = Number(costData.ot_hours || 0) * Number(costData.ot_rate || 0)
    const dtTotal = Number(costData.dt_hours || 0) * Number(costData.dt_rate || 0)
    const mobTotal = Number(costData.mob_qty || 0) * Number(costData.mob_rate || 0)
    const perDiem = Number(costData.per_diem || 0)
    
    const total = stTotal + otTotal + dtTotal + perDiem + mobTotal
    
        
    return total
  }
  return Number(costData.cost || 0)
}

  // Load costs by category with optional change order filtering
  const loadCostsByCategory = useCallback(async (category: CostCategory, filters: CostFilters = {}) => {
    if (!tenant?.id) return []

    try {
      setLoading(true)
      setError(null)

      const targetProjectId = filters.projectId || projectId
      if (!targetProjectId) return []



      let query = supabase
        .from('project_costs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('project_id', targetProjectId)
        .eq('category', category)
        .order('date', { ascending: false })

      // Apply change order filtering
      const targetChangeOrderId = filters.changeOrderId !== undefined ? filters.changeOrderId : changeOrderId
      if (targetChangeOrderId !== undefined && targetChangeOrderId !== null) {
        if (targetChangeOrderId === 'base') {
          // Base contract only (no change order)
          query = query.is('change_order_id', null)
        } else {
          // Specific change order
          query = query.eq('change_order_id', targetChangeOrderId)
        }
      }
      // If targetChangeOrderId is null, don't add any filter (show all)

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError



      // Update the costs state for this category
      setCosts(prev => ({
        ...prev,
        [category]: data || []
      }))

      return data || []
    } catch (err: any) {
      console.error(`Error loading ${category} costs:`, err)
      setError(err.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [tenant?.id, projectId, changeOrderId, supabase])

  // Load all costs for a project with optional change order filtering
  const loadAllCosts = useCallback(async (filterProjectId?: string, filterChangeOrderId?: string | null) => {
    if (!tenant?.id || (!projectId && !filterProjectId)) return

    try {
      setLoading(true)
      setError(null)

      const targetProjectId = filterProjectId || projectId
      const targetChangeOrderId = filterChangeOrderId !== undefined ? filterChangeOrderId : changeOrderId



      let query = supabase
        .from('project_costs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('project_id', targetProjectId)
        .order('date', { ascending: false })

      // Apply change order filtering
      if (targetChangeOrderId !== undefined && targetChangeOrderId !== null) {
        if (targetChangeOrderId === 'base') {
          query = query.is('change_order_id', null)
        } else {
          query = query.eq('change_order_id', targetChangeOrderId)
        }
      }
      // If targetChangeOrderId is null, don't add any filter (show all)

      const { data, error: fetchError } = await query

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
  }, [tenant?.id, projectId, changeOrderId, supabase])

  // Load costs when project or change order changes - ONLY load once per change
  useEffect(() => {
    if (projectId && tenant?.id) {
      loadAllCosts(projectId, changeOrderId)
    } else {
      // Clear costs if no project
      setCosts({
        material: [],
        labor: [],
        equipment: [],
        subcontractor: [],
        others: [],
        cap_leases: [],
        consumable: []
      })
    }
  }, [projectId, changeOrderId, tenant?.id, loadAllCosts]) // Include loadAllCosts since it's now useCallback

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

      console.log('Creating cost:', newCost)

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
        cost: calculateTotalCost(category, updates),
        change_order_id: updates.change_order_id === undefined ? null : updates.change_order_id
      }

      console.log('Updating cost:', costId, updatedData)

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

      console.log('Deleting cost:', costId)

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
    } catch (err: any) {
      console.error('Error deleting cost:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
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

    Object.entries(costs).forEach(([category, costsArray]) => {
      totals[category as CostCategory] = costsArray.reduce((sum, cost) => sum + (cost.cost || 0), 0)
    })

    return totals
  }

  // Get grand total across all categories
  const getGrandTotal = () => {
    const totals = getTotals()
    return Object.values(totals).reduce((sum, total) => sum + total, 0)
  }

  // Get cost count for each category
  const getCounts = () => {
    const counts: Record<CostCategory, number> = {
      material: 0,
      labor: 0,
      equipment: 0,
      subcontractor: 0,
      others: 0,
      cap_leases: 0,
      consumable: 0
    }

    Object.entries(costs).forEach(([category, costsArray]) => {
      counts[category as CostCategory] = costsArray.length
    })

    return counts
  }

  // Refresh costs (simple reload without causing infinite loops)
  const refreshCosts = useCallback(() => {
    if (projectId && tenant?.id) {
      loadAllCosts(projectId, changeOrderId)
    }
  }, [projectId, changeOrderId, tenant?.id, loadAllCosts])

  return {
    costs,
    loading,
    error,
    createCost,
    updateCost,
    deleteCost,
    loadCostsByCategory,
    loadAllCosts,
    getTotals,
    getGrandTotal,
    getCounts,
    refreshCosts
  }
}