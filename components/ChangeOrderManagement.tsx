'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, Save, DollarSign, FileText, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import FileAttachments from '@/components/FileAttachments'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { confirmAction } from '@/components/ui/confirm-dialog'
import type { ChangeOrder } from '@/types/app.types'

interface ChangeOrderManagementProps {
  projectId: string
  canWrite?: boolean
}

export default function ChangeOrderManagement({ projectId, canWrite = false }: ChangeOrderManagementProps) {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { changeOrders, loading, createChangeOrder, updateChangeOrder, deleteChangeOrder, getTotalAdditionalValue } = useChangeOrders(projectId)
  
  const [showForm, setShowForm] = useState(false)
  const [editingChangeOrder, setEditingChangeOrder] = useState<ChangeOrder | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    additional_contract_value: 0
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      additional_contract_value: 0
    })
    setFormErrors({})
    setEditingChangeOrder(null)
    setShowForm(false)
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!formData.name.trim()) {
      errors.name = 'Change order name is required'
    }

    if (formData.additional_contract_value < 0) {
      errors.additional_contract_value = 'Contract value cannot be negative'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    try {
      setSubmitting(true)

      if (editingChangeOrder) {
        await updateChangeOrder(editingChangeOrder.id, formData)
      } else {
        await createChangeOrder(formData)
      }

      resetForm()
    } catch (error) {
      console.error('Error saving change order:', error)
      // Error handling is done in the hook
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (changeOrder: ChangeOrder) => {
    setEditingChangeOrder(changeOrder)
    setFormData({
      name: changeOrder.name,
      description: changeOrder.description || '',
      additional_contract_value: changeOrder.additional_contract_value || 0
    })
    setShowForm(true)
  }

  const handleDelete = async (changeOrderId: string) => {
    const confirmed = await confirmAction({
      title: 'Delete this change order?',
      description: 'Costs and invoices tied to it stay on the project, without this change order.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return

    try {
      await deleteChangeOrder(changeOrderId)
    } catch (error) {
      console.error('Error deleting change order:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="bg-card rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-5/6"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Change Orders
            </h2>
            <p className="text-muted-foreground mt-1">Manage project change orders and contract modifications</p>
          </div>
          {canWrite && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Change Order
            </button>
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-accent p-4 rounded-lg">
            <div className="text-sm font-medium text-primary">Total Change Orders</div>
            <div className="text-2xl font-bold text-foreground">{changeOrders.length}</div>
          </div>
          <div className="bg-success/10 p-4 rounded-lg">
            <div className="text-sm font-medium text-success">Additional Contract Value</div>
            <div className="text-2xl font-bold text-success">{formatCurrency(getTotalAdditionalValue())}</div>
          </div>
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm font-medium text-muted-foreground">Average Value</div>
            <div className="text-2xl font-bold text-foreground">
              {changeOrders.length > 0 ? formatCurrency(getTotalAdditionalValue() / changeOrders.length) : '$0.00'}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-card rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {editingChangeOrder ? 'Edit Change Order' : 'Add New Change Order'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Change Order Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring ${
                  formErrors.name ? 'border-destructive' : 'border-input'
                }`}
                placeholder="e.g., CO-001 - Additional Electrical Work"
              />
              {formErrors.name && (
                <p className="text-destructive text-sm mt-1">{formErrors.name}</p>
              )}
            </div>

            {/* Additional Contract Value */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Additional Contract Value
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input
                  type="number"
                  value={formData.additional_contract_value}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    additional_contract_value: parseFloat(e.target.value) || 0 
                  }))}
                  className={`w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-foreground ${
                    formErrors.additional_contract_value ? 'border-destructive' : 'border-input'
                  }`}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
              {formErrors.additional_contract_value && (
                <p className="text-destructive text-sm mt-1">{formErrors.additional_contract_value}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                rows={3}
                placeholder="Describe the scope of work for this change order..."
              />
            </div>

            {editingChangeOrder && tenant && user ? (
              <FileAttachments entityType="change_order" entityId={editingChangeOrder.id} tenantId={tenant.id} userId={user.id} canEdit={canWrite} />
            ) : null}
            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {submitting ? 'Saving...' : 'Save Change Order'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Change Orders List */}
      <div className="bg-card rounded-lg shadow-md overflow-hidden">
        {changeOrders.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Change Orders</h3>
            <p className="text-muted-foreground mb-4">
              Get started by adding your first change order to track contract modifications.
            </p>
            {canWrite && (
              <button
                onClick={() => setShowForm(true)}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-2 mx-auto transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add First Change Order
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Additional Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Created
                  </th>
                  {canWrite && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {changeOrders.map((changeOrder) => (
                  <tr key={changeOrder.id} className="hover:bg-muted">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-foreground">{changeOrder.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-foreground">
                        {formatCurrency(changeOrder.additional_contract_value || 0)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-foreground max-w-xs truncate">
                        {changeOrder.description || 'No description'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {changeOrder.created_at ? new Date(changeOrder.created_at).toLocaleDateString() : 'N/A'}
                      </div>
                    </td>
                    {canWrite && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(changeOrder)}
                            className="text-primary hover:text-primary p-1 rounded transition-colors"
                            title="Edit change order"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(changeOrder.id)}
                            className="text-destructive hover:text-destructive p-1 rounded transition-colors"
                            title="Delete change order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Warning about dependencies */}
      {changeOrders.length > 0 && canWrite && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-yellow-800">Important Note</h4>
              <p className="text-sm text-yellow-700 mt-1">
                Deleting change orders will affect related costs and invoices. Make sure to review dependencies before deletion.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}