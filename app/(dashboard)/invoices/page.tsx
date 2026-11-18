'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useCategories } from '@/contexts/CategoryContext'
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
import { ExportMenu, type ExportSpec } from '@/components/export/ExportMenu'
import { Button } from '@/components/ui/button'
import { ReverseSheet, type ReverseDraft } from '@/components/ReverseSheet'
import { createClient } from '@/lib/supabase'
import { canReverseRow, reversalMark } from '@/lib/reversals'
import { isMissingRpc } from '@/lib/security'
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
  const { correctionsPending } = useCategories()
  const selectedChangeOrder = changeOrderId ?? 'all'
  const [showForm, setShowForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<CustomerInvoice | null>(null)
  const [isDuplicateMode, setIsDuplicateMode] = useState(false)
  const [creditInvoice, setCreditInvoice] = useState<CustomerInvoice | null>(null)
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
        const updated = await updateInvoice(editingInvoice.id, invoiceData)
        toast.success('Invoice updated')
        return updated as CustomerInvoice
      }
      const created = await createInvoice(invoiceData)
      toast.success('Invoice saved')
      return created as CustomerInvoice
    } catch (saveError) {
      console.error('Error saving invoice:', saveError)
      toast.error('Error saving invoice. Please try again.')
    }
  }

  const postCredit = async (draft: ReverseDraft) => {
    if (!creditInvoice) return
    const supabase = createClient()
    const { error: creditError } = await supabase.rpc('reverse_customer_invoice', {
      p_invoice_id: creditInvoice.id,
      p_reason: draft.reason,
      p_date: draft.date,
      p_amount: draft.amount,
    })
    if (creditError) {
      if (isMissingRpc(creditError)) throw new Error('Database update pending. Credit memos turn on after the Phase 2b database update.')
      throw new Error(creditError.message)
    }
    await loadInvoices()
    toast.success('Credit memo posted')
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
  const collectedTotal = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_collected || 0), 0)
  const invoiceRows = filteredInvoices.map((invoice) => {
    const changeOrderName = invoice.change_order_id
      ? changeOrders.find((order) => order.id === invoice.change_order_id)?.name || 'Deleted change order'
      : 'Base contract'
    return {
      number: invoice.invoice_number || '',
      amount: Number(invoice.amount || 0),
      collected: Number(invoice.amount_collected || 0),
      billed: invoice.date_billed,
      changeOrder: changeOrderName,
      processed: Boolean(invoice.in_system),
      files: attachmentCounts[invoice.id] || 0,
    }
  })
  const exportSpec: ExportSpec = {
    filename: `${activeProject?.jobNumber || 'invoices'}-invoices`,
    title: 'Invoices',
    company: tenant?.name || 'Company',
    project: activeProject ? `${activeProject.jobNumber} — ${activeProject.jobName}` : undefined,
    filters: [
      filters.startDate || filters.endDate ? `Billed ${filters.startDate || 'start'} to ${filters.endDate || 'end'}` : 'Billed: all dates',
      filters.invoiceNumber ? `Number contains ${filters.invoiceNumber}` : 'Number: all',
      filters.minAmount || filters.maxAmount ? `Amount ${filters.minAmount || '0'} to ${filters.maxAmount || 'any'}` : 'Amount: all',
      `Change order: ${scopeName()}`,
    ],
    columns: ['Number', 'Amount', 'Collected', 'Billed', 'Change order', 'Processed', 'Files'],
    csvRows: invoiceRows.map((row) => [row.number, row.amount, row.collected, row.billed, row.changeOrder, row.processed, row.files]),
    pdfRows: invoiceRows.map((row) => [row.number, formatCurrency(row.amount), formatCurrency(row.collected), row.billed, row.changeOrder, row.processed ? 'Yes' : 'No', String(row.files)]),
    totals: [
      { label: 'Billed', value: formatCurrency(filteredTotal) },
      { label: 'Collected', value: formatCurrency(collectedTotal) },
    ],
    visual: {
      kpis: [
        { label: 'Invoices', value: String(filteredInvoices.length) },
        { label: 'Billed', value: formatCurrency(filteredTotal) },
        { label: 'Collected', value: formatCurrency(collectedTotal), detail: `${formatCurrency(filteredTotal - collectedTotal)} outstanding` },
      ],
    },
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
            <ExportMenu spec={filteredInvoices.length > 0 ? exportSpec : null} />
            {canWrite ? <Button type="button" onClick={() => { setEditingInvoice(null); setIsDuplicateMode(false); setShowForm(true) }}><Plus className="h-4 w-4" /> Add invoice</Button> : null}
          </>
        }
      />

      <p className="text-sm text-muted-foreground">
        {filteredInvoices.length} invoice{filteredInvoices.length === 1 ? '' : 's'} · <span className="tabular font-medium text-foreground">{formatCurrency(filteredTotal)}</span> billed · <span className="tabular font-medium text-foreground">{formatCurrency(collectedTotal)}</span> collected. The change order in the top bar filters this list.
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
                <th className="px-3 py-2 text-right font-medium">Collected</th>
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
                      {reversalMark(invoice, filteredInvoices) === 'reversed' ? <Badge>Reversed</Badge> : null}
                      {reversalMark(invoice, filteredInvoices) === 'partial' ? <Badge>Partially reversed</Badge> : null}
                      {reversalMark(invoice, filteredInvoices) === 'reversal' ? <Badge>Credit memo</Badge> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular" data-label="Amount">{formatCurrency(invoice.amount)}</td>
                    <td className="px-3 py-2 text-right tabular" data-label="Collected">{formatCurrency(invoice.amount_collected || 0)}</td>
                    <td className="px-3 py-2" data-label="Billed">{formatLocalDateForDisplay(invoice.date_billed)}</td>
                    <td className="px-3 py-2" data-label="Change order">
                      {invoice.change_order_id ? (related ? related.name : 'Deleted change order') : 'Base contract'}
                    </td>
                    <td className="px-3 py-2 tabular" data-label="Files">{attachmentCounts[invoice.id] || '—'}</td>
                    {canWrite ? (
                      <td className="px-3 py-2 text-right" data-label="Actions">
                        {!correctionsPending && canReverseRow(Number(invoice.amount || 0), filteredInvoices.filter((item) => item.reversal_of_id === invoice.id).map((item) => Number(item.amount || 0)), invoice.reversed_at) ? (
                          <Button variant="ghost" size="icon" type="button" aria-label={`Credit memo for ${invoice.invoice_number}`} onClick={() => setCreditInvoice(invoice)}><Undo2 className="h-4 w-4" /></Button>
                        ) : null}
                        <Button variant="ghost" size="icon" type="button" aria-label={`Edit ${invoice.invoice_number}`} onClick={() => { setEditingInvoice(invoice); setIsDuplicateMode(false); setShowForm(true) }} disabled={!!invoice.reversal_of_id || !!invoice.reversed_at}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" type="button" aria-label={`Duplicate ${invoice.invoice_number}`} onClick={() => { setEditingInvoice(invoice); setIsDuplicateMode(true); setShowForm(true) }}><Copy className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" type="button" aria-label={`Delete ${invoice.invoice_number}`} onClick={() => handleDelete(invoice.id)} disabled={!!invoice.reversal_of_id || !!invoice.reversed_at}><Trash2 className="h-4 w-4" /></Button>
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
      <ReverseSheet
        open={!!creditInvoice}
        title="Post a credit memo"
        noun="invoice"
        remaining={creditInvoice ? Number(creditInvoice.amount || 0) + filteredInvoices.filter((item) => item.reversal_of_id === creditInvoice.id).reduce((sum, item) => sum + Number(item.amount || 0), 0) : 0}
        dateLabel="Date billed"
        onClose={() => setCreditInvoice(null)}
        onConfirm={postCredit}
      />
    </div>
  )
}
