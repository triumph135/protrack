'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import type { CustomerInvoice } from '@/types/app.types'

export function useInvoices(projectId?: string, changeOrderId?: string | null) {
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { user } = useAuth()
  const { tenant } = useTenant()
  const supabase = createClient()

  // Load invoices
  const loadInvoices = async (filterProjectId?: string, filterChangeOrderId?: string | null) => {
    if (!tenant?.id) return

    try {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('customer_invoices')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('date_billed', { ascending: false })

      // Add project filter
      if (filterProjectId || projectId) {
        query = query.eq('project_id', filterProjectId || projectId)
      }

      // Add change order filter if specified
      if (filterChangeOrderId !== undefined) {
        if (filterChangeOrderId === null || filterChangeOrderId === 'base') {
          query = query.is('change_order_id', null)
        } else if (filterChangeOrderId !== 'all') {
          query = query.eq('change_order_id', filterChangeOrderId)
        }
      } else if (changeOrderId !== undefined) {
        if (changeOrderId === null || changeOrderId === 'base') {
          query = query.is('change_order_id', null)
        } else if (changeOrderId !== 'all') {
          query = query.eq('change_order_id', changeOrderId)
        }
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError
      setInvoices(data || [])
    } catch (err: any) {
      console.error('Error loading invoices:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Create invoice
  const createInvoice = async (invoiceData: Omit<CustomerInvoice, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    if (!tenant?.id || !user?.id) throw new Error('Missing tenant or user')

    try {
      setLoading(true)

      const invoicePayload = {
        ...invoiceData,
        tenant_id: tenant.id,
        amount: Number(invoiceData.amount)
      }

      const { data, error } = await supabase
        .from('customer_invoices')
        .insert([invoicePayload])
        .select()
        .single()

      if (error) throw error

      setInvoices(prev => [data, ...prev])
      return data
    } catch (err: any) {
      console.error('Error creating invoice:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Update invoice
  const updateInvoice = async (invoiceId: string, updates: Partial<CustomerInvoice>) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      const updatePayload = {
        ...updates,
        amount: updates.amount ? Number(updates.amount) : undefined,
        updated_at: new Date().toISOString(),
        change_order_id: updates.change_order_id === undefined ? null : updates.change_order_id
      }

      const { data, error } = await supabase
        .from('customer_invoices')
        .update(updatePayload)
        .eq('id', invoiceId)
        .eq('tenant_id', tenant.id)
        .select()
        .single()

      if (error) throw error

      setInvoices(prev => prev.map(invoice => invoice.id === invoiceId ? data : invoice))
      return data
    } catch (err: any) {
      console.error('Error updating invoice:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Delete invoice
  const deleteInvoice = async (invoiceId: string) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      const { error } = await supabase
        .from('customer_invoices')
        .delete()
        .eq('id', invoiceId)
        .eq('tenant_id', tenant.id)

      if (error) throw error

      setInvoices(prev => prev.filter(invoice => invoice.id !== invoiceId))
      return true
    } catch (err: any) {
      console.error('Error deleting invoice:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Get totals
  const getTotalBilled = (): number => {
    return invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0)
  }

  // Load invoices when project or change order changes
  useEffect(() => {
    if (projectId && tenant?.id) {
      loadInvoices()
    }
  }, [projectId, changeOrderId, tenant?.id])

  return {
    invoices,
    loading,
    error,
    loadInvoices,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    getTotalBilled
  }
}