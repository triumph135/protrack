'use client'

import { useEffect, useState } from 'react'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { useProjects } from '@/contexts/ProjectContext'
import type { CustomerInvoice, Project } from '@/types/app.types'
import { getTodayLocalDateString } from '@/lib/dateUtils'
import FileAttachments from '@/components/FileAttachments'
import { QueuedFilesField } from '@/components/QueuedFilesField'
import { RecordHistory } from '@/components/RecordHistory'
import { fileUploadService } from '@/lib/fileUploadService'
import { uploadQueue } from '@/lib/uploads'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { readCompanySettings } from '@/lib/company-settings'
import { booksClosedMessage, isBooksLocked } from '@/lib/reversals'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'

interface InvoiceFormProps {
  open: boolean
  onSave: (invoiceData: Omit<CustomerInvoice, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<CustomerInvoice | void>
  onCancel: () => void
  editItem?: CustomerInvoice | null
  loading?: boolean
  duplicateMode?: boolean
}

export default function InvoiceForm({
  open,
  onSave,
  onCancel,
  editItem = null,
  loading = false,
  duplicateMode = false,
}: InvoiceFormProps) {
  const [formData, setFormData] = useState<Partial<CustomerInvoice>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [queuedFiles, setQueuedFiles] = useState<File[]>([])
  const [created, setCreated] = useState<CustomerInvoice | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [availableProjects, setAvailableProjects] = useState<Project[]>([])
  const { activeProject } = useProjects()
  const { changeOrders } = useChangeOrders(selectedProjectId || activeProject?.id)
  const { user } = useAuth()
  const { tenant } = useTenant()

  useEffect(() => {
    if (!open) return
    if (editItem) {
      const itemData = { ...editItem }
      if (duplicateMode) {
        itemData.date_billed = getTodayLocalDateString()
        itemData.invoice_number = ''
        delete (itemData as { id?: string }).id
        delete (itemData as { created_at?: string }).created_at
        delete (itemData as { updated_at?: string }).updated_at
      }
      setFormData(itemData)
      setSelectedProjectId(itemData.project_id)
    } else {
      setFormData({
        project_id: activeProject?.id || '',
        invoice_number: '',
        amount: 0,
        amount_collected: 0,
        date_billed: getTodayLocalDateString(),
        change_order_id: undefined,
        in_system: false,
      })
      setSelectedProjectId(activeProject?.id || '')
    }
    setErrors({})
    setQueuedFiles([])
    setCreated(null)
  }, [editItem, activeProject?.id, duplicateMode, open])

  useEffect(() => {
    const supabase = createClient()
    const loadAvailableProjects = async () => {
      if (!tenant?.id) return
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('status', 'Active')
          .order('jobNumber')
        if (error) throw error
        setAvailableProjects(data || [])
      } catch (error) {
        console.error('Error loading projects:', error)
      }
    }
    loadAvailableProjects()
  }, [tenant?.id])

  const handleInputChange = (field: string, value: string | number | boolean | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId)
    setFormData((prev) => ({ ...prev, project_id: projectId, change_order_id: undefined }))
    if (errors.project_id) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next.project_id
        return next
      })
    }
  }

  const validateForm = () => {
    const next: Record<string, string> = {}
    if (!selectedProjectId) next.project_id = 'Project is required'
    if (!formData.invoice_number?.trim()) next.invoice_number = 'Invoice number is required'
    if (!formData.amount || Number(formData.amount) <= 0) next.amount = 'Amount must be greater than 0'
    if (formData.amount_collected != null && Number(formData.amount_collected) < 0) next.amount_collected = 'Collected amount cannot be negative'
    if (!formData.date_billed) next.date_billed = 'Date billed is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validateForm()) return
    const saved = await onSave({
      project_id: selectedProjectId,
      invoice_number: formData.invoice_number!,
      amount: Number(formData.amount),
      amount_collected: Number(formData.amount_collected || 0),
      date_billed: formData.date_billed!,
      change_order_id: formData.change_order_id || undefined,
      in_system: formData.in_system || false,
    })
    const target = saved && 'id' in saved ? saved : editItem
    const creating = !editItem || duplicateMode
    if (creating && target?.id && queuedFiles.length && tenant && user) {
      fileUploadService.setContext(tenant.id, user.id)
      const uploaded = await uploadQueue(queuedFiles, (file) => fileUploadService.uploadFile(file, 'customer_invoice', target.id))
      if (uploaded.error) {
        setCreated(target)
        setQueuedFiles(uploaded.failed)
        toast.error(`Invoice saved. ${uploaded.error}`)
        return
      }
    }
    onCancel()
  }

  const title = duplicateMode ? 'Duplicate invoice' : editItem ? 'Edit invoice' : 'Add invoice'

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onCancel() }} title={title} description="Invoices stay on the project you pick, including its change order.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Project" htmlFor="invoice-project" error={errors.project_id}>
          <select
            id="invoice-project"
            className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
            value={selectedProjectId}
            onChange={(event) => handleProjectChange(event.target.value)}
            disabled={loading}
          >
            <option value="">Select a project</option>
            {availableProjects.map((project) => (
              <option key={project.id} value={project.id}>{project.jobNumber} — {project.jobName}</option>
            ))}
          </select>
        </Field>
        <Field label="Invoice number" htmlFor="invoice-number" error={errors.invoice_number}>
          <Input id="invoice-number" value={formData.invoice_number || ''} onChange={(event) => handleInputChange('invoice_number', event.target.value)} disabled={loading} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount" htmlFor="invoice-amount" error={errors.amount}>
            <Input id="invoice-amount" className="tabular" inputMode="decimal" value={formData.amount || ''} onChange={(event) => handleInputChange('amount', event.target.value)} disabled={loading} />
          </Field>
          <Field label="Collected" htmlFor="invoice-collected" error={errors.amount_collected} hint="Cash received. Leave at 0 until the customer pays.">
            <Input id="invoice-collected" className="tabular" inputMode="decimal" value={formData.amount_collected || ''} onChange={(event) => handleInputChange('amount_collected', event.target.value)} disabled={loading} />
          </Field>
          <Field label="Date billed" htmlFor="invoice-date" error={errors.date_billed}>
            <Input id="invoice-date" type="date" value={formData.date_billed || ''} onChange={(event) => handleInputChange('date_billed', event.target.value)} disabled={loading} />
          </Field>
        </div>
        <Field label="Change order" htmlFor="invoice-co" hint={changeOrders.length === 0 ? 'This project has no change orders. The invoice stays on the base contract.' : 'Leave this on the base contract unless the invoice is for extra work.'}>
          <select
            id="invoice-co"
            className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
            value={formData.change_order_id || ''}
            onChange={(event) => handleInputChange('change_order_id', event.target.value || undefined)}
            disabled={loading}
          >
            <option value="">Base contract</option>
            {changeOrders.map((order) => (
              <option key={order.id} value={order.id}>{order.name}</option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={formData.in_system || false}
            onChange={(event) => handleInputChange('in_system', event.target.checked)}
            disabled={loading}
          />
          Mark as processed in the system
        </label>
        {(editItem && !duplicateMode) || created ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium">Files</p>
            <FileAttachments
              entityType="customer_invoice"
              entityId={(created || editItem)!.id}
              tenantId={tenant?.id || ''}
              userId={user?.id || ''}
              canEdit
            />
            <RecordHistory entityType="customer_invoice" entityId={(created || editItem)!.id} />
            {queuedFiles.length > 0 ? <QueuedFilesField files={queuedFiles} onChange={setQueuedFiles} /> : null}
          </div>
        ) : (
          <QueuedFilesField files={queuedFiles} onChange={setQueuedFiles} />
        )}
        {editItem && !duplicateMode && isBooksLocked(readCompanySettings(tenant?.settings).books_lock_date, formData.date_billed) ? (
          <p className="text-sm text-destructive">{booksClosedMessage(readCompanySettings(tenant?.settings).books_lock_date, 'invoice')}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button type="submit" disabled={loading || (!!editItem && !duplicateMode && isBooksLocked(readCompanySettings(tenant?.settings).books_lock_date, formData.date_billed))}>{loading ? 'Saving…' : editItem && !duplicateMode ? 'Save invoice' : 'Create invoice'}</Button>
        </div>
      </form>
    </Sheet>
  )
}
