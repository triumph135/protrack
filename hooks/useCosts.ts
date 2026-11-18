'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import type { ProjectCost } from '@/types/app.types'
import { calculateTotalCost, type CostCategory, type CostKind } from '@/lib/costs'
import { isFallbackCategoryId } from '@/lib/categories'

export type { CostCategory }

interface CostFilters {
  projectId?: string
  changeOrderId?: string | null // null = all, 'base' = base contract, actual ID = specific change order
  category?: CostCategory
}

export function useCosts(projectId?: string, changeOrderId?: string | null) {
  const [entries, setEntries] = useState<ProjectCost[]>([])
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

      setEntries((data || []) as ProjectCost[])
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
      setEntries([])
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
  const createCost = async (
    category: CostCategory,
    costData: Omit<ProjectCost, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>,
    options?: { categoryId?: string | null; kind?: CostKind }
  ) => {
    if (!tenant?.id || !user?.id) throw new Error('Missing tenant or user')

    try {
      setLoading(true)
      const kind = options?.kind || category
      const categoryId = options?.categoryId
      const useCategoryId = categoryId && !isFallbackCategoryId(categoryId)
      const { category: legacyCategory, ...rest } = costData
      const newCost = {
        ...rest,
        tenant_id: tenant.id,
        cost: calculateTotalCost(kind, costData),
        custom_fields: costData.custom_fields || {},
        ...(useCategoryId ? { category_id: categoryId } : { category: legacyCategory || category }),
      }

      console.log('Creating cost:', newCost)

      const { data, error } = await supabase
        .from('project_costs')
        .insert([newCost])
        .select()
        .single()

      if (error) throw error

      setEntries(prev => [data as ProjectCost, ...prev])
      setCosts(prev => ({
        ...prev,
        [((data as ProjectCost).category || category) as CostCategory]: [data, ...(prev[((data as ProjectCost).category || category) as CostCategory] || [])]
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
  const updateCost = async (
    category: CostCategory,
    costId: string,
    updates: Partial<ProjectCost>,
    options?: { kind?: CostKind }
  ) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      const updatedData = {
        ...updates,
        cost: calculateTotalCost(options?.kind || category, updates),
        change_order_id: updates.change_order_id === undefined ? null : updates.change_order_id
      }
      delete updatedData.category

      console.log('Updating cost:', costId, updatedData)

      const { data, error } = await supabase
        .from('project_costs')
        .update(updatedData)
        .eq('id', costId)
        .eq('tenant_id', tenant.id)
        .select()
        .single()

      if (error) throw error

      setEntries(prev => prev.map(cost => (cost.id === costId ? (data as ProjectCost) : cost)))
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

      setEntries(prev => prev.filter(cost => cost.id !== costId))
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
    entries,
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