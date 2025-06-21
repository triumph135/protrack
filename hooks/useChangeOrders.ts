'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import type { ChangeOrder } from '@/types/app.types'

export function useChangeOrders(projectId?: string) {
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { user } = useAuth()
  const { tenant } = useTenant()
  const supabase = createClient()

  // Load change orders when project changes
  useEffect(() => {
    if (projectId && tenant?.id) {
      loadChangeOrders()
    } else {
      setChangeOrders([])
    }
  }, [projectId, tenant?.id])

  const loadChangeOrders = async () => {
    if (!projectId || !tenant?.id) return

    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('change_orders')
        .select('*')
        .eq('project_id', projectId)
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      setChangeOrders(data || [])
    } catch (err: any) {
      console.error('Error loading change orders:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const createChangeOrder = async (changeOrderData: Omit<ChangeOrder, 'id' | 'tenant_id' | 'project_id' | 'created_at' | 'updated_at'>) => {
    if (!projectId || !tenant?.id || !user?.id) {
      throw new Error('Missing required data')
    }

    try {
      setLoading(true)

      const newChangeOrder = {
        ...changeOrderData,
        project_id: projectId,
        tenant_id: tenant.id
      }

      const { data, error } = await supabase
        .from('change_orders')
        .insert([newChangeOrder])
        .select()
        .single()

      if (error) throw error

      setChangeOrders(prev => [data, ...prev])
      return data
    } catch (err: any) {
      console.error('Error creating change order:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateChangeOrder = async (changeOrderId: string, updates: Partial<ChangeOrder>) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('change_orders')
        .update(updates)
        .eq('id', changeOrderId)
        .eq('tenant_id', tenant.id)
        .select()
        .single()

      if (error) throw error

      setChangeOrders(prev => 
        prev.map(co => co.id === changeOrderId ? data : co)
      )

      return data
    } catch (err: any) {
      console.error('Error updating change order:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteChangeOrder = async (changeOrderId: string) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      const { error } = await supabase
        .from('change_orders')
        .delete()
        .eq('id', changeOrderId)
        .eq('tenant_id', tenant.id)

      if (error) throw error

      setChangeOrders(prev => prev.filter(co => co.id !== changeOrderId))
    } catch (err: any) {
      console.error('Error deleting change order:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Calculate total additional contract value
  const getTotalAdditionalValue = () => {
    return changeOrders.reduce((total, co) => total + (co.additional_contract_value || 0), 0)
  }

  return {
    changeOrders,
    loading,
    error,
    createChangeOrder,
    updateChangeOrder,
    deleteChangeOrder,
    getTotalAdditionalValue,
    refreshChangeOrders: loadChangeOrders
  }
}