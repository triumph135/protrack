'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useInvoices } from '@/hooks/useInvoices'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import InvoiceForm from '@/components/InvoiceForm'
import type { CustomerInvoice } from '@/types/app.types'
import { formatLocalDateForDisplay } from '@/lib/dateUtils'
import { fileUploadService } from '@/lib/fileUploadService'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { userCan } from '@/lib/permissions'
import { formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/feedback'

interface InvoiceFilters {
  startDate: string
  endDate: string
  invoiceNumber: string
  minAmount: string
  maxAmount: string
}

export default function InvoicesPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { activeProject } = useProjects()
  const { changeOrderId } = useWorkspace()
  const selectedChangeOrder = changeOrderId ?? 'all'
  const [showForm, setShowForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<CustomerInvoice | null>(null)
  const [isDuplicateMode, setIsDuplicateMode] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<InvoiceFilters>({
    startDate: '',
    endDate: '',
    invoiceNumber: '',
    minAmount: '',
    maxAmount: '',
  })
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({})

  const changeOrderForHook = selectedChangeOrder === 'all' ? undefined
    : selectedChangeOrder === 'base' ? null : selectedChangeOrder

  const { invoices, loading, error, createInvoice, updateInvoice, deleteInvoice, loadInvoices } = useInvoices(activeProject?.id, changeOrderForHook)
  const { changeOrders } = useChangeOrders(activeProject?.id)
  const canRead = userCan(user, 'invoices', 'read')
  const canWrite = userCan(user, 'invoices', 'write')

  const closeForm = () => {
    setShowForm(false)
    setEditingInvoice(null)
    setIsDuplicateMode(false)
  }

  const handleSave = async (invoiceData: Omit<CustomerInvoice, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    try {
      if (editingInvoice && !isDuplicateMode) {
        await updateInvoice(editingInvoice.id, invoiceData)
      } else {
        await createInvoice(invoiceData)
      }
      closeForm()
      toast.success(editingInvoice && !isDuplicateMode ? 'Invoice updated' : 'Invoice saved')
    } catch (saveError) {
      console.error('Error saving invoice:', saveError)
      toast.error('Error saving invoice. Please try again.')
    }
  }

  const handleDelete = async (invoiceId: string) => {
    const confirmed = await confirmAction({
      title: 'Delete this invoice?',
      description: 'The invoice will be removed from this project.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deleteInvoice(invoiceId)
      toast.success('Invoice deleted')
    } catch (deleteError) {
      console.error('Error deleting invoice:', deleteError)
      toast.error('Error deleting invoice. Please try again.')
    }
  }

  const scopeName = () => {
    if (selectedChangeOrder === 'all') return 'All change orders'
    if (selectedChangeOrder === 'base') return 'Base contract'
    return changeOrders.find((order) => order.id === selectedChangeOrder)?.name || 'Change order'
  }

  const filteredInvoices = useMemo(() => invoices.filter((invoice) => {
    if (filters.startDate && invoice.date_billed < filters.startDate) return false
    if (filters.endDate && invoice.date_billed > filters.endDate) return false
    if (filters.invoiceNumber && !invoice.invoice_number.toLowerCase().includes(filters.invoiceNumber.toLowerCase())) return false
    if (filters.minAmount && invoice.amount < parseFloat(filters.minAmount)) return false
    if (filters.maxAmount && invoice.amount > parseFloat(filters.maxAmount)) return false
    return true
  }), [invoices, filters])

  const invoiceIdsString = useMemo(() => filteredInvoices.map((invoice) => invoice.id).sort().join(','), [filteredInvoices])
  const invoiceIds = useMemo(() => (invoiceIdsString ? invoiceIdsString.split(',') : []), [invoiceIdsString])

  const loadAttachmentCounts = useCallback(async () => {
    if (!tenant?.id || !user?.id || !invoiceIds.length) return
    try {
      fileUploadService.setContext(tenant.id, user.id)
      const counts: Record<string, number> = {}
      await Promise.all(invoiceIds.map(async (invoiceId) => {
        try {
          const attachments = await fileUploadService.getAttachments('customer_invoice', invoiceId)
          counts[invoiceId] = attachments.length
        } catch (countError) {
          console.error(`Error loading attachments for invoice ${invoiceId}:`, countError)
          counts[invoiceId] = 0
        }
      }))
      setAttachmentCounts(counts)
    } catch (countError) {
      console.error('Error loading attachment counts:', countError)
    }
  }, [tenant?.id, user?.id, invoiceIds])

  const filteredTotal = filteredInvoices.reduce((sum, invoice) => sum + invoice.amount, 0)

  const exportData = () => {
    if (filteredInvoices.length === 0) {
      toast.error('No data to export')
      return
    }
    const headers = ['Date Billed', 'Invoice Number', 'Amount', 'In System', 'Change Order']
    const csvContent = [
      headers.join(','),
      ...filteredInvoices.map((invoice) => {
        const changeOrderName = invoice.change_order_id
          ? changeOrders.find((order) => order.id === invoice.change_order_id)?.name || 'Base Contract'
          : 'Base Contract'
        return [invoice.date_billed, invoice.invoice_number || '', invoice.amount || 0, invoice.in_system ? 'Yes' : 'No', changeOrderName].join(',')
      }),
    ].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeProject?.jobNumber}_invoices_${scopeName()}_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (activeProject?.id) loadInvoices(activeProject.id, changeOrderForHook)
  }, [selectedChangeOrder, activeProject?.id, changeOrderForHook])

  useEffect(() => {
    if (invoiceIds.length > 0) loadAttachmentCounts()
    else setAttachmentCounts({})
  }, [loadAttachmentCounts, invoiceIds.length])

  if (!canRead) {
    return <EmptyState title="No access" body="You don't have permission to view invoices." />
  }

  if (!activeProject) {
    return <EmptyState title="Choose a project" body="Pick a project in the top bar to see its invoices." />
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        description={`${activeProject.jobNumber} · ${scopeName()}`}
        action={
          <>
            <Button type="button" variant="outline" onClick={() => setShowFilters((open) => !open)}>Filters</Button>
            {filteredInvoices.length > 0 ? <Button type="button" variant="outline" onClick={exportData}><Download className="h-4 w-4" /> Export CSV</Button> : null}
            {canWrite ? <Button type="button" onClick={() => { setEditingInvoice(null); setIsDuplicateMode(false); setShowForm(true) }}><Plus className="h-4 w-4" /> Add invoice</Button> : null}
          </>
        }
      />

      <p className="text-sm text-muted-foreground">
        {filteredInvoices.length} invoice{filteredInvoices.length === 1 ? '' : 's'} · <span className="tabular font-medium text-foreground">{formatCurrency(filteredTotal)}</span> billed. The change order in the top bar filters this list.
      </p>

      {showFilters ? (
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input type="date" aria-label="Start date" value={filters.startDate} onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))} />
          <Input type="date" aria-label="End date" value={filters.endDate} onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))} />
          <Input placeholder="Invoice number" aria-label="Invoice number" value={filters.invoiceNumber} onChange={(event) => setFilters((prev) => ({ ...prev, invoiceNumber: event.target.value }))} />
          <Input inputMode="decimal" placeholder="Min amount" aria-label="Minimum amount" value={filters.minAmount} onChange={(event) => setFilters((prev) => ({ ...prev, minAmount: event.target.value }))} />
          <Input inputMode="decimal" placeholder="Max amount" aria-label="Maximum amount" value={filters.maxAmount} onChange={(event) => setFilters((prev) => ({ ...prev, maxAmount: event.target.value }))} />
          <Button type="button" variant="ghost" onClick={() => setFilters({ startDate: '', endDate: '', invoiceNumber: '', minAmount: '', maxAmount: '' })}>Clear filters</Button>
        </div>
      ) : null}

      {loading ? <Skeleton className="h-40" /> : error ? (
        <EmptyState title="Could not load invoices" body={error} />
      ) : filteredInvoices.length === 0 ? (
        <EmptyState
          title={invoices.length === 0 ? 'No invoices yet' : 'No invoices match'}
          body={invoices.length === 0 ? 'Add the first invoice for this project.' : 'Clear a filter to see more invoices.'}
          action={canWrite && invoices.length === 0 ? <Button type="button" onClick={() => setShowForm(true)}>Add invoice</Button> : null}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="responsive-cards w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Number</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Billed</th>
                <th className="px-3 py-2 font-medium">Change order</th>
                <th className="px-3 py-2 font-medium">Files</th>
                {canWrite ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => {
                const related = invoice.change_order_id ? changeOrders.find((order) => order.id === invoice.change_order_id) : null
                return (
                  <tr key={invoice.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium" data-label="Number">
                      {invoice.invoice_number}
                      {invoice.in_system ? <Badge tone="success">Processed</Badge> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular" data-label="Amount">{formatCurrency(invoice.amount)}</td>
                    <td className="px-3 py-2" data-label="Billed">{formatLocalDateForDisplay(invoice.date_billed)}</td>
                    <td className="px-3 py-2" data-label="Change order">
                      {invoice.change_order_id ? (related ? related.name : 'Deleted change order') : 'Base contract'}
                    </td>
                    <td className="px-3 py-2 tabular" data-label="Files">{attachmentCounts[invoice.id] || '—'}</td>
                    {canWrite ? (
                      <td className="px-3 py-2 text-right" data-label="Actions">
                        <Button variant="ghost" size="icon" type="button" aria-label={`Edit ${invoice.invoice_number}`} onClick={() => { setEditingInvoice(invoice); setIsDuplicateMode(false); setShowForm(true) }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" type="button" aria-label={`Duplicate ${invoice.invoice_number}`} onClick={() => { setEditingInvoice(invoice); setIsDuplicateMode(true); setShowForm(true) }}><Copy className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" type="button" aria-label={`Delete ${invoice.invoice_number}`} onClick={() => handleDelete(invoice.id)}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {canWrite ? (
        <InvoiceForm
          open={showForm}
          onSave={handleSave}
          onCancel={closeForm}
          editItem={editingInvoice}
          loading={loading}
          duplicateMode={isDuplicateMode}
        />
      ) : null}
    </div>
  )
}
