'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useCategories } from '@/contexts/CategoryContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useCosts } from '@/hooks/useCosts'
import { useEmployees } from '@/hooks/useEmployees'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import FileAttachments from '@/components/FileAttachments'
import { createClient } from '@/lib/supabase'
import { canAccessCategory, canExport } from '@/lib/permissions'
import { builtinKeyFromSlug, isFallbackCategoryId, legacyCategoryText } from '@/lib/categories'
import { calculateTotalCost, type CostCategory } from '@/lib/costs'
import { enabledLaborFields, normalizeLaborFieldValue, validateLaborFieldValue } from '@/lib/labor-fields'
import { readCompanySettings } from '@/lib/company-settings'
import { formatCurrency, formatDate, formatHours } from '@/lib/format'
import { getTodayLocalDateString } from '@/lib/dateUtils'
import { isMissingRelation } from '@/lib/security'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { EmptyState, PageHeader } from '@/components/ui/feedback'
import { confirmAction } from '@/components/ui/confirm-dialog'
import type { ProjectCost } from '@/types/app.types'

type Draft = {
  date: string
  description: string
  vendor: string
  invoice_number: string
  cost: string
  in_system: boolean
  subcontractor_name: string
  employee_id: string
  st_hours: string
  st_rate: string
  ot_hours: string
  ot_rate: string
  dt_hours: string
  dt_rate: string
  per_diem: string
  mob_qty: string
  mob_rate: string
  custom_fields: Record<string, string>
}

const emptyDraft = (): Draft => ({
  date: getTodayLocalDateString(),
  description: '',
  vendor: '',
  invoice_number: '',
  cost: '',
  in_system: false,
  subcontractor_name: '',
  employee_id: '',
  st_hours: '',
  st_rate: '',
  ot_hours: '',
  ot_rate: '',
  dt_hours: '',
  dt_rate: '',
  per_diem: '',
  mob_qty: '',
  mob_rate: '',
  custom_fields: {},
})

export default function CostsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { activeProject } = useProjects()
  const { categories, laborFields, schemaPending, loading } = useCategories()
  const { changeOrderId } = useWorkspace()
  const { entries, createCost, updateCost, deleteCost } = useCosts(activeProject?.id, null)
  const { employees } = useEmployees(activeProject?.id)
  const { changeOrders } = useChangeOrders(activeProject?.id)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState<ProjectCost | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [budget, setBudget] = useState('')
  const [query, setQuery] = useState('')
  const supabase = createClient()

  const requested = searchParams.get('category')
  const category = useMemo(() => {
    if (!requested) return categories.find((item) => !item.is_hidden) || null
    const builtin = builtinKeyFromSlug(requested)
    if (builtin) return categories.find((item) => item.builtin_key === builtin) || null
    return categories.find((item) => item.id === requested) || null
  }, [categories, requested])

  useEffect(() => {
    if (!category || !requested) return
    const builtin = builtinKeyFromSlug(requested)
    if (builtin && category.id !== requested) {
      router.replace(`/costs?category=${category.id}` as never)
    }
  }, [category, requested, router])

  useEffect(() => {
    if (requested || !category) return
    router.replace(`/costs?category=${category.id}` as never)
  }, [requested, category, router])

  const byId = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories])
  const parent = category?.parent_id ? byId.get(category.parent_id) : null
  const grant = category
    ? { id: category.id, builtinKey: category.builtin_key, parentBuiltinKey: parent?.builtin_key ?? null }
    : null
  const canRead = grant ? canAccessCategory(user, grant, 'read') : false
  const canWrite = grant ? canAccessCategory(user, grant, 'write') : false
  const exportAllowed = grant ? canExport(user, category!.id, grant) : false
  const settings = readCompanySettings(tenant?.settings)
  const fields = category?.kind === 'labor' ? enabledLaborFields(laborFields) : []

  const rows = useMemo(() => {
    if (!category) return []
    return entries.filter((row) => {
      const sameCategory = row.category_id
        ? row.category_id === category.id
        : row.category === (category.builtin_key || (category.kind === 'labor' ? 'labor' : 'others'))
      if (!sameCategory) return false
      if (changeOrderId === 'base') return !row.change_order_id
      if (changeOrderId) return row.change_order_id === changeOrderId
      return true
    }).filter((row) => {
      const haystack = `${row.description || ''} ${row.vendor || ''} ${row.employee_name || ''} ${row.subcontractor_name || ''}`.toLowerCase()
      return haystack.includes(query.toLowerCase())
    })
  }, [entries, category, changeOrderId, query])

  useEffect(() => {
    if (!category || !activeProject?.id || isFallbackCategoryId(category.id)) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('project_category_budgets')
        .select('amount')
        .eq('project_id', activeProject.id)
        .eq('category_id', category.id)
        .maybeSingle()
      if (cancelled) return
      if (error && isMissingRelation(error)) return
      setBudget(data ? String(data.amount) : '')
    })()
    return () => {
      cancelled = true
    }
  }, [category, activeProject?.id, supabase])

  const openNew = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setOpen(true)
  }

  const openEdit = (row: ProjectCost, duplicate = false) => {
    setEditing(duplicate ? null : row)
    setDraft({
      ...emptyDraft(),
      date: row.date,
      description: row.description || '',
      vendor: row.vendor || '',
      invoice_number: row.invoice_number || '',
      cost: row.cost != null ? String(row.cost) : '',
      in_system: !!row.in_system,
      subcontractor_name: row.subcontractor_name || '',
      employee_id: row.employee_id || '',
      st_hours: row.st_hours != null ? String(row.st_hours) : '',
      st_rate: row.st_rate != null ? String(row.st_rate) : '',
      ot_hours: row.ot_hours != null ? String(row.ot_hours) : '',
      ot_rate: row.ot_rate != null ? String(row.ot_rate) : '',
      dt_hours: row.dt_hours != null ? String(row.dt_hours) : '',
      dt_rate: row.dt_rate != null ? String(row.dt_rate) : '',
      per_diem: row.per_diem != null ? String(row.per_diem) : '',
      mob_qty: row.mob_qty != null ? String(row.mob_qty) : '',
      mob_rate: row.mob_rate != null ? String(row.mob_rate) : '',
      custom_fields: Object.fromEntries(Object.entries(row.custom_fields || {}).map(([key, value]) => [key, String(value ?? '')])),
    })
    setOpen(true)
  }

  const save = async () => {
    if (!category || !activeProject || !canWrite) return
    for (const field of fields) {
      const message = validateLaborFieldValue(field, draft.custom_fields[field.id])
      if (message) {
        toast.error(message)
        return
      }
    }
    const employee = employees.find((item) => item.id === draft.employee_id)
    const numeric = (value: string) => (value === '' ? null : Number(value))
    const payload: Omit<ProjectCost, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> = {
      project_id: activeProject.id,
      category: (legacyCategoryText(category, byId) || 'others') as ProjectCost['category'],
      date: draft.date,
      description: draft.description || undefined,
      vendor: draft.vendor || undefined,
      invoice_number: draft.invoice_number || undefined,
      cost: numeric(draft.cost) || 0,
      in_system: draft.in_system,
      subcontractor_name: draft.subcontractor_name || undefined,
      employee_id: draft.employee_id || undefined,
      employee_name: employee?.name,
      st_hours: numeric(draft.st_hours) || undefined,
      st_rate: numeric(draft.st_rate) || undefined,
      ot_hours: numeric(draft.ot_hours) || undefined,
      ot_rate: numeric(draft.ot_rate) || undefined,
      dt_hours: numeric(draft.dt_hours) || undefined,
      dt_rate: numeric(draft.dt_rate) || undefined,
      per_diem: numeric(draft.per_diem) || undefined,
      mob_qty: numeric(draft.mob_qty) || undefined,
      mob_rate: numeric(draft.mob_rate) || undefined,
      change_order_id: changeOrderId && changeOrderId !== 'base' ? changeOrderId : undefined,
      custom_fields: Object.fromEntries(fields.map((field) => [field.id, normalizeLaborFieldValue(field, draft.custom_fields[field.id])])),
    }
    setSaving(true)
    try {
      const legacy = (category.builtin_key || (category.kind === 'labor' ? 'labor' : 'others')) as CostCategory
      if (editing) {
        await updateCost(legacy, editing.id, payload, { kind: category.kind })
      } else {
        await createCost(legacy, payload, { categoryId: category.id, kind: category.kind })
      }
      setOpen(false)
      toast.success(editing ? 'Cost updated' : 'Cost added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save this cost')
    } finally {
      setSaving(false)
    }
  }

  const saveBudget = async () => {
    if (!category || !activeProject || !tenant || isFallbackCategoryId(category.id)) return
    const amount = Number(budget)
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a budget of zero or more')
      return
    }
    const { error } = await supabase.from('project_category_budgets').upsert({
      tenant_id: tenant.id,
      project_id: activeProject.id,
      category_id: category.id,
      amount,
      updated_by: user?.id,
    }, { onConflict: 'project_id,category_id' })
    if (error) toast.error(error.message)
    else toast.success('Budget saved')
  }

  const remove = async (row: ProjectCost) => {
    const ok = await confirmAction({
      title: 'Delete this cost?',
      description: 'This removes the entry from the project. Attached files are left in storage.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok || !category) return
    try {
      const legacy = (category.builtin_key || 'others') as CostCategory
      await deleteCost(legacy, row.id)
      toast.success('Cost deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete this cost')
    }
  }

  const exportCsv = () => {
    if (!exportAllowed) {
      toast.error('You do not have export access for this category')
      return
    }
    if (rows.length === 0) {
      toast.error('No data to export')
      return
    }
    const headers = ['Date', 'Description', 'Amount', ...fields.map((field) => field.label)]
    const lines = rows.map((row) => [
      row.date,
      row.description || row.vendor || row.employee_name || '',
      row.cost || 0,
      ...fields.map((field) => row.custom_fields?.[field.id] ?? ''),
    ].join(','))
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeProject?.jobNumber || 'costs'}_${category?.name || 'category'}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="h-24 animate-pulse rounded-lg bg-muted" />
  if (!activeProject) return <EmptyState title="Choose a project" body="Costs are filed against the project selected in the top bar." />
  if (!category) return <EmptyState title="No categories" body="A master can add a cost category in Settings." />
  if (!canRead) return <EmptyState title="No access" body={`You cannot view ${category.name}.`} />

  const total = rows.reduce((sum, row) => sum + Number(row.cost || 0), 0)
  const unassigned = category.builtin_key === 'labor' && settings.labor_split_enabled

  return (
    <div className="space-y-4">
      <PageHeader
        title={category.name}
        description={unassigned ? 'Entries filed before the split stay here as Labor (unassigned).' : `${rows.length} entries in this view`}
        action={
          <>
            {exportAllowed ? (
              <Button variant="outline" type="button" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
            ) : null}
            <Button type="button" onClick={openNew} disabled={!canWrite} title={canWrite ? undefined : 'You have view-only access'}>
              <Plus className="h-4 w-4" /> Add cost
            </Button>
          </>
        }
      />

      {!schemaPending && !isFallbackCategoryId(category.id) ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
          <Field label="Budget for this category">
            <Input className="tabular w-40" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} disabled={!canWrite} />
          </Field>
          <Button variant="outline" type="button" onClick={saveBudget} disabled={!canWrite}>Save budget</Button>
          <p className="ml-auto text-sm text-muted-foreground">Spent <span className="tabular text-foreground">{formatCurrency(total)}</span></p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Spent <span className="tabular text-foreground">{formatCurrency(total)}</span></p>
      )}

      <Input placeholder="Search this category" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search costs" />

      {rows.length === 0 ? (
        <EmptyState title={`No costs yet in ${category.name}.`} body="Add the first one." action={canWrite ? <Button onClick={openNew}>Add cost</Button> : null} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="responsive-cards w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Details</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2" data-label="Date">{formatDate(row.date)}</td>
                  <td className="px-3 py-2" data-label="Details">
                    <div>{row.description || row.vendor || row.subcontractor_name || row.employee_name || '—'}</div>
                    {category.kind === 'labor' ? (
                      <div className="text-xs text-muted-foreground tabular">
                        ST {formatHours(row.st_hours)} · OT {formatHours(row.ot_hours)} · DT {formatHours(row.dt_hours)}
                        {unassigned && !row.category_id ? ' · Labor (unassigned)' : ''}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular" data-label="Amount">{formatCurrency(row.cost)}</td>
                  <td className="px-3 py-2 text-right" data-label="Actions">
                    <Button variant="ghost" size="icon" type="button" aria-label="Duplicate" onClick={() => openEdit(row, true)} disabled={!canWrite}><Copy className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" type="button" aria-label="Edit" onClick={() => openEdit(row)} disabled={!canWrite}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" type="button" aria-label="Delete" onClick={() => remove(row)} disabled={!canWrite}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen} title={editing ? `Edit ${category.name}` : `Add ${category.name}`} description="Amounts use the category type. Labor is hours times rates.">
        <div className="space-y-3">
          <Field label="Date" htmlFor="cost-date">
            <Input id="cost-date" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
          </Field>
          {category.kind === 'labor' ? <LaborFields draft={draft} setDraft={setDraft} employees={employees} /> : null}
          {category.kind === 'named' ? (
            <Field label={category.builtin_key === 'equipment' || parent?.builtin_key === 'equipment' ? 'Equipment name' : 'Name'} htmlFor="named">
              <Input id="named" value={draft.subcontractor_name} onChange={(event) => setDraft({ ...draft, subcontractor_name: event.target.value })} />
            </Field>
          ) : null}
          {category.kind !== 'labor' ? (
            <>
              <Field label="Vendor" htmlFor="vendor"><Input id="vendor" value={draft.vendor} onChange={(event) => setDraft({ ...draft, vendor: event.target.value })} /></Field>
              <Field label="Invoice number" htmlFor="invoice"><Input id="invoice" value={draft.invoice_number} onChange={(event) => setDraft({ ...draft, invoice_number: event.target.value })} /></Field>
              <Field label="Cost" htmlFor="amount"><Input id="amount" className="tabular" inputMode="decimal" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.in_system} onChange={(event) => setDraft({ ...draft, in_system: event.target.checked })} /> In the accounting system</label>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Total <span className="tabular text-foreground">{formatCurrency(calculateTotalCost('labor', {
              st_hours: Number(draft.st_hours || 0),
              st_rate: Number(draft.st_rate || 0),
              ot_hours: Number(draft.ot_hours || 0),
              ot_rate: Number(draft.ot_rate || 0),
              dt_hours: Number(draft.dt_hours || 0),
              dt_rate: Number(draft.dt_rate || 0),
              per_diem: Number(draft.per_diem || 0),
              mob_qty: Number(draft.mob_qty || 0),
              mob_rate: Number(draft.mob_rate || 0),
            }))}</span></p>
          )}
          <Field label="Description" htmlFor="description">
            <Textarea id="description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Field>
          {fields.map((field) => (
            <Field key={field.id} label={field.label} htmlFor={field.id}>
              {field.field_type === 'boolean' ? (
                <select id={field.id} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={draft.custom_fields[field.id] || ''} onChange={(event) => setDraft({ ...draft, custom_fields: { ...draft.custom_fields, [field.id]: event.target.value } })}>
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : field.field_type === 'select' ? (
                <select id={field.id} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={draft.custom_fields[field.id] || ''} onChange={(event) => setDraft({ ...draft, custom_fields: { ...draft.custom_fields, [field.id]: event.target.value } })}>
                  <option value="">—</option>
                  {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <Input id={field.id} inputMode={field.field_type === 'number' ? 'decimal' : undefined} value={draft.custom_fields[field.id] || ''} onChange={(event) => setDraft({ ...draft, custom_fields: { ...draft.custom_fields, [field.id]: event.target.value } })} />
              )}
            </Field>
          ))}
          {changeOrders.length > 0 ? (
            <p className="text-xs text-muted-foreground">This entry is filed to {changeOrderId && changeOrderId !== 'base' ? changeOrders.find((order) => order.id === changeOrderId)?.name : 'the base contract'}.</p>
          ) : null}
          {editing && tenant && user ? (
            <FileAttachments entityType="cost" entityId={editing.id} tenantId={tenant.id} userId={user.id} canEdit={canWrite} />
          ) : null}
          <Button type="button" onClick={save} disabled={saving || !canWrite}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </Sheet>
    </div>
  )
}

function LaborFields({
  draft,
  setDraft,
  employees,
}: {
  draft: Draft
  setDraft: (draft: Draft) => void
  employees: Array<{ id: string; name: string; standard_rate: number; ot_rate: number; dt_rate: number; mob_rate?: number | null }>
}) {
  const chooseEmployee = (id: string) => {
    const employee = employees.find((item) => item.id === id)
    setDraft({
      ...draft,
      employee_id: id,
      st_rate: employee ? String(employee.standard_rate) : draft.st_rate,
      ot_rate: employee ? String(employee.ot_rate) : draft.ot_rate,
      dt_rate: employee ? String(employee.dt_rate) : draft.dt_rate,
      mob_rate: employee?.mob_rate != null ? String(employee.mob_rate) : draft.mob_rate,
    })
  }
  const number = (key: keyof Draft, label: string) => (
    <Field label={label} htmlFor={key}>
      <Input id={key} className="tabular" inputMode="decimal" value={String(draft[key] || '')} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
    </Field>
  )
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Employee" htmlFor="employee">
        <select id="employee" className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={draft.employee_id} onChange={(event) => chooseEmployee(event.target.value)}>
          <option value="">Select</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </select>
      </Field>
      <div />
      {number('st_hours', 'ST hours')}
      {number('st_rate', 'ST rate')}
      {number('ot_hours', 'OT hours')}
      {number('ot_rate', 'OT rate')}
      {number('dt_hours', 'DT hours')}
      {number('dt_rate', 'DT rate')}
      {number('per_diem', 'Per diem')}
      {number('mob_qty', 'Mob quantity')}
      {number('mob_rate', 'Mob rate')}
    </div>
  )
}
