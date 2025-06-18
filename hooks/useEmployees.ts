'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import type { Employee } from '@/types/app.types'

export function useEmployees(projectId?: string) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { user } = useAuth()
  const { tenant } = useTenant()
  const supabase = createClient()

  // Load employees for current tenant and optionally filter by project
  const loadEmployees = async (filterProjectId?: string) => {
    if (!tenant?.id) return

    try {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('employees')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name', { ascending: true })

      // If project specified, get employees for that project OR global employees (project_id is null)
      if (filterProjectId) {
        query = query.or(`project_id.eq.${filterProjectId},project_id.is.null`)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError

      setEmployees(data || [])
    } catch (err: any) {
      console.error('Error loading employees:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Create a new employee
  const createEmployee = async (employeeData: Omit<Employee, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      const newEmployee = {
        ...employeeData,
        tenant_id: tenant.id
      }

      const { data, error } = await supabase
        .from('employees')
        .insert([newEmployee])
        .select()
        .single()

      if (error) throw error

      setEmployees(prev => [data, ...prev])
      return data
    } catch (err: any) {
      console.error('Error creating employee:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Update an employee
  const updateEmployee = async (employeeId: string, updates: Partial<Employee>) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('employees')
        .update(updates)
        .eq('id', employeeId)
        .eq('tenant_id', tenant.id)
        .select()
        .single()

      if (error) throw error

      setEmployees(prev => prev.map(emp => emp.id === employeeId ? data : emp))
      return data
    } catch (err: any) {
      console.error('Error updating employee:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Delete an employee
  const deleteEmployee = async (employeeId: string) => {
    if (!tenant?.id) throw new Error('Missing tenant')

    try {
      setLoading(true)

      // Check if employee has associated labor costs
      const { data: laborCosts, error: checkError } = await supabase
        .from('project_costs')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('category', 'labor')
        .eq('employee_id', employeeId)
        .limit(1)

      if (checkError) throw checkError

      if (laborCosts && laborCosts.length > 0) {
        throw new Error('Cannot delete employee with existing labor records. Please remove labor entries first.')
      }

      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', employeeId)
        .eq('tenant_id', tenant.id)

      if (error) throw error

      setEmployees(prev => prev.filter(emp => emp.id !== employeeId))
      return true
    } catch (err: any) {
      console.error('Error deleting employee:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Get employee by ID
  const getEmployee = (employeeId: string): Employee | undefined => {
    return employees.find(emp => emp.id === employeeId)
  }

  // Load employees when component mounts or project changes
  useEffect(() => {
    if (tenant?.id) {
      loadEmployees(projectId)
    }
  }, [tenant?.id, projectId])

  return {
    employees,
    loading,
    error,
    loadEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getEmployee
  }
}