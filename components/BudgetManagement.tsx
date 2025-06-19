'use client'

import { useState, useEffect } from 'react'
import { DollarSign, Save, Edit3, Calculator, TrendingUp, TrendingDown } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { createClient } from '@/lib/supabase'

interface BudgetFormData {
  material_budget: number
  labor_budget: number
  equipment_budget: number
  subcontractor_budget: number
  others_budget: number
  cap_leases_budget: number
  consumable_budget: number
}

interface BudgetManagementProps {
  projectId: string
  onBudgetUpdate?: (budget: any) => void
}

export default function BudgetManagement({ projectId, onBudgetUpdate }: BudgetManagementProps) {
  const [budget, setBudget] = useState<BudgetFormData>({
    material_budget: 0,
    labor_budget: 0,
    equipment_budget: 0,
    subcontractor_budget: 0,
    others_budget: 0,
    cap_leases_budget: 0,
    consumable_budget: 0
  })
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const { user } = useAuth()
  const { tenant } = useTenant()
  const supabase = createClient()

  // Load existing budget
  useEffect(() => {
    if (projectId && tenant?.id) {
      loadBudget()
    }
  }, [projectId, tenant?.id])

  const loadBudget = async () => {
    if (!tenant?.id || !projectId) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('project_budgets')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('project_id', projectId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      if (data) {
        setBudget({
          material_budget: data.material_budget || 0,
          labor_budget: data.labor_budget || 0,
          equipment_budget: data.equipment_budget || 0,
          subcontractor_budget: data.subcontractor_budget || 0,
          others_budget: data.others_budget || 0,
          cap_leases_budget: data.cap_leases_budget || 0,
          consumable_budget: data.consumable_budget || 0
        })
      }
    } catch (error) {
      console.error('Error loading budget:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveBudget = async () => {
    if (!tenant?.id || !user?.id || !projectId) return

    try {
      setSaving(true)
      
      const budgetData = {
        tenant_id: tenant.id,
        project_id: projectId,
        ...budget,
        updated_by: user.id
      }

      // Check if budget exists
      const { data: existing } = await supabase
        .from('project_budgets')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('project_id', projectId)
        .single()

      let result
      if (existing) {
        // Update existing budget
        result = await supabase
          .from('project_budgets')
          .update(budgetData)
          .eq('tenant_id', tenant.id)
          .eq('project_id', projectId)
          .select()
          .single()
      } else {
        // Create new budget
        result = await supabase
          .from('project_budgets')
          .insert([budgetData])
          .select()
          .single()
      }

      if (result.error) throw result.error
      
      setEditing(false)
      onBudgetUpdate?.(result.data)
      
    } catch (error) {
      console.error('Error saving budget:', error)
      alert('Failed to save budget. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (category: keyof BudgetFormData, value: string) => {
    const numValue = parseFloat(value) || 0
    setBudget(prev => ({
      ...prev,
      [category]: numValue
    }))
  }

  const getTotalBudget = () => {
    return Object.values(budget).reduce((sum, value) => sum + value, 0)
  }

  const categoryNames = {
    material_budget: 'Material',
    labor_budget: 'Labor',
    equipment_budget: 'Equipment',
    subcontractor_budget: 'Subcontractor',
    others_budget: 'Others',
    cap_leases_budget: 'Capital Leases',
    consumable_budget: 'Consumable'
  }

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Calculator className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Project Budget</h2>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              Edit Budget
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditing(false)
                  loadBudget() // Reset to original values
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={saveBudget}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Budget'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(categoryNames).map(([key, label]) => (
          <div key={key} className="border border-gray-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {label}
            </label>
            {editing ? (
              <input
                type="number"
                value={budget[key as keyof BudgetFormData]}
                onChange={(e) => handleInputChange(key as keyof BudgetFormData, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            ) : (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-500" />
                <span className="text-lg font-semibold text-gray-900">
                  {budget[key as keyof BudgetFormData].toLocaleString()}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-700">Total Budget:</span>
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            <span className="text-2xl font-bold text-green-600">
              {getTotalBudget().toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}