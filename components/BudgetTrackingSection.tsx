'use client'

import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Edit3, Save, X } from 'lucide-react'

interface BudgetTrackingSectionProps {
  category: string
  actualAmount: number
  budgetAmount: number
  variance: number
  onUpdateBudget: (category: string, amount: number) => Promise<void>
  canEdit: boolean
  loading?: boolean
}

export default function BudgetTrackingSection({
  category,
  actualAmount,
  budgetAmount,
  variance,
  onUpdateBudget,
  canEdit,
  loading = false
}: BudgetTrackingSectionProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  // Update editValue when budgetAmount changes
  useEffect(() => {
    setEditValue(budgetAmount.toString())
  }, [budgetAmount])

  const percentUsed = budgetAmount > 0 ? (actualAmount / budgetAmount) * 100 : 0
  const isOverBudget = variance < 0

  const handleSave = async () => {
    const newAmount = parseFloat(editValue) || 0
    
    // Don't save if the value hasn't changed
    if (newAmount === budgetAmount) {
      setEditing(false)
      return
    }

    // Validate the input
    if (isNaN(newAmount) || newAmount < 0) {
      alert('Please enter a valid budget amount (0 or greater)')
      return
    }

    try {
      setSaving(true)
      await onUpdateBudget(category, newAmount)
      setEditing(false)
    } catch (error) {
      console.error('Error updating budget:', error)
      alert('Failed to update budget. Please try again.')
      // Reset to original value on error
      setEditValue(budgetAmount.toString())
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditValue(budgetAmount.toString())
    setEditing(false)
  }

  const handleEdit = () => {
    setEditValue(budgetAmount.toString())
    setEditing(true)
  }

  const getStatusColor = () => {
    if (percentUsed >= 100) return 'red'
    if (percentUsed >= 80) return 'yellow'
    return 'green'
  }

  const getStatusIcon = () => {
    if (isOverBudget) return <TrendingDown className="w-5 h-5 text-red-500" />
    if (percentUsed >= 80) return <AlertTriangle className="w-5 h-5 text-yellow-500" />
    return <TrendingUp className="w-5 h-5 text-green-500" />
  }

  const formatCategoryName = (category: string) => {
    const categoryMap: Record<string, string> = {
      'material': 'Material',
      'labor': 'Labor', 
      'equipment': 'Equipment',
      'subcontractor': 'Subcontractor',
      'others': 'Others',
      'cap_leases': 'Capital Leases',
      'consumable': 'Consumable'
    }
    return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1)
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
        <div className="h-8 bg-gray-200 rounded mb-4"></div>
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">
          {formatCategoryName(category)} Budget vs Actual
        </h3>
        {getStatusIcon()}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all duration-300 ${
            getStatusColor() === 'red' ? 'bg-red-500' :
            getStatusColor() === 'yellow' ? 'bg-yellow-500' :
            'bg-green-500'
          }`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        ></div>
      </div>

      {/* Budget Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Budget Amount - ONLY for current category */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <div className="text-blue-600 text-sm font-medium">
              {formatCategoryName(category)} Budget
            </div>
            {canEdit && !editing && (
              <button
                onClick={handleEdit}
                className="text-blue-600 hover:text-blue-800 transition-colors"
                title="Edit budget"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
          </div>
          {editing ? (
            <div className="space-y-2">
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full px-2 py-1 text-lg font-bold border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter budget amount"
                step="0.01"
                min="0"
                disabled={saving}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave()
                  } else if (e.key === 'Escape') {
                    handleCancel()
                  }
                }}
              />
              <div className="flex gap-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Save budget"
                >
                  {saving ? (
                    <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full mx-auto"></div>
                  ) : (
                    <Save className="w-3 h-3 mx-auto" />
                  )}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex-1 px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Cancel"
                >
                  <X className="w-3 h-3 mx-auto" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-blue-900 text-lg font-bold">
              ${budgetAmount.toLocaleString()}
            </div>
          )}
        </div>

        {/* Actual Amount */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-gray-600 text-sm font-medium mb-2">Actual Spent</div>
          <div className="text-gray-900 text-lg font-bold">
            ${actualAmount.toLocaleString()}
          </div>
          <div className="text-gray-500 text-xs mt-1">
            {budgetAmount > 0 ? `${percentUsed.toFixed(1)}% of budget` : 'No budget set'}
          </div>
        </div>

        {/* Variance */}
        <div className={`p-4 rounded-lg ${
          isOverBudget ? 'bg-red-50' : 'bg-green-50'
        }`}>
          <div className={`text-sm font-medium mb-2 ${
            isOverBudget ? 'text-red-600' : 'text-green-600'
          }`}>
            Variance
          </div>
          <div className={`text-lg font-bold ${
            isOverBudget ? 'text-red-900' : 'text-green-900'
          }`}>
            {isOverBudget ? '-' : ''}${Math.abs(variance).toLocaleString()}
          </div>
          <div className={`text-xs mt-1 ${
            isOverBudget ? 'text-red-500' : 'text-green-500'
          }`}>
            {isOverBudget ? 'Over Budget' : budgetAmount > 0 ? 'Under Budget' : 'No Budget Set'}
          </div>
        </div>
      </div>

      {/* Warning for over budget */}
      {isOverBudget && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="text-red-800">
              <strong>Budget Alert:</strong> This category is ${Math.abs(variance).toLocaleString()} over budget ({Math.abs(percentUsed - 100).toFixed(1)}% over)
            </div>
          </div>
        </div>
      )}

      {/* No budget set warning */}
      {budgetAmount === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <div className="text-yellow-800">
              <strong>No Budget Set:</strong> Set a budget for this category to track spending progress.
              {canEdit && (
                <button 
                  onClick={handleEdit}
                  className="ml-2 text-yellow-700 underline hover:text-yellow-900"
                >
                  Set Budget
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}