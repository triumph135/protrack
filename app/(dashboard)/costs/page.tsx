'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Copy, FolderInput, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useCategories } from '@/contexts/CategoryContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useCosts } from '@/hooks/useCosts'
import { useEmployees } from '@/hooks/useEmployees'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import FileAttachments from '@/components/FileAttachments'
import { QueuedFilesField } from '@/components/QueuedFilesField'
import { RecordHistory } from '@/components/RecordHistory'
import { ReverseSheet, type ReverseDraft } from '@/components/ReverseSheet'
import { MoveCostSheet } from '@/components/MoveCostSheet'
import { createClient } from '@/lib/supabase'
import { canAccessCategory, canExport } from '@/lib/permissions'
import { builtinKeyFromSlug, flattenCategoryTree, isFallbackCategoryId, legacyCategoryText, ownAmountsByCategory, rollupCategoryAmounts } from '@/lib/categories'
import { costDetailText, costGroupIds, countCostEntries, groupCostEntries, resolveEntryCategoryId, visibleCostLines, type CostGroup, type CostSortDirection, type CostSortKey } from '@/lib/cost-groups'
import { categoryBudgetState } from '@/lib/overview'
import { ExportMenu, type ExportSpec } from '@/components/export/ExportMenu'
import { CategoryName } from '@/components/costs/CategoryName'
import { calculateTotalCost, type CostCategory } from '@/lib/costs'
import { enabledLaborFields, normalizeLaborFieldValue, validateLaborFieldValue } from '@/lib/labor-fields'
import { readCompanySettings } from '@/lib/company-settings'
import { formatCurrency, formatDate, formatHours } from '@/lib/format'
import { getTodayLocalDateString } from '@/lib/dateUtils'
import { isMissingRelation, isMissingRpc } from '@/lib/security'
import { booksClosedMessage, canReverseRow, chainNetsToZero, describeSaveError, directRemaining, isBooksLocked, reversalMark } from '@/lib/reversals'
import { resolveEmployeeRates, type EmployeeRateOverride } from '@/lib/employee-rates'
import { uploadQueue } from '@/lib/uploads'
import { fileUploadService } from '@/lib/fileUploadService'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { EmptyState, PageHeader } from '@/components/ui/feedback'
import { confirmAction } from '@/components/ui/confirm-dialog'
import type { CostCategoryRecord } from '@/lib/categories'
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

const BUDGET_COLUMNS: Record<string, string> = {
  material: 'material_budget',
  labor: 'labor_budget',
  equipment: 'equipment_budget',
  subcontractor: 'subcontractor_budget',
  others: 'others_budget',
  cap_leases: 'cap_leases_budget',
  consumable: 'consumable_budget',
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
  const { categories, tree, laborFields, schemaPending, correctionsPending, loading } = useCategories()
  const { changeOrderId } = useWorkspace()
  const { entries, createCost, updateCost, deleteCost, refreshCosts } = useCosts(activeProject?.id, null)
  const { employees } = useEmployees(activeProject?.id)
  const { changeOrders } = useChangeOrders(activeProject?.id)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState<ProjectCost | null>(null)
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<CostSortKey>('date')
  const [sortDirection, setSortDirection] = useState<CostSortDirection>('desc')
  const [collapsed, setCollapsed] = useState<string[] | null>(null)
  const [queuedFiles, setQueuedFiles] = useState<File[]>([])
  const [reverseRow, setReverseRow] = useState<ProjectCost | null>(null)
  const [moveRow, setMoveRow] = useState<ProjectCost | null>(null)
  const [hideNetZero, setHideNetZero] = useState(false)
  const supabase = createClient()

  const requested = searchParams.get('category')
  const focusCategory = useMemo(() => {
    if (!requested) return null
    const builtin = builtinKeyFromSlug(requested)
    if (builtin) return categories.find((item) => item.builtin_key === builtin && !item.parent_id) || null
    return categories.find((item) => item.id === requested) || null
  }, [categories, requested])

  useEffect(() => {
    if (!focusCategory || !requested) return
    const builtin = builtinKeyFromSlug(requested)
    if (builtin && focusCategory.id !== requested) {
      router.replace(`/costs?category=${focusCategory.id}` as never)
    }
  }, [focusCategory, requested, router])

  const byId = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories])
  const ordered = useMemo(() => flattenCategoryTree(tree).filter((category) => !category.is_hidden), [tree])

  const grantFor = (category: CostCategoryRecord) => {
    const parent = category.parent_id ? byId.get(category.parent_id) : null
    return {
      id: category.id,
      builtinKey: category.builtin_key,
      parentBuiltinKey: parent?.builtin_key ?? null,
    }
  }

  const readable = useMemo(
    () => ordered.filter((category) => {
      const parent = category.parent_id ? byId.get(category.parent_id) : null
      return canAccessCategory(user, {
        id: category.id,
        builtinKey: category.builtin_key,
        parentBuiltinKey: parent?.builtin_key ?? null,
      }, 'read')
    }),
    [ordered, user, byId],
  )

  const uncategorizedView = requested === 'uncategorized'
  const listedEntries = useMemo(() => {
    if (!hideNetZero || (!focusCategory && !uncategorizedView)) return entries
    const linked = entries.map((row) => ({ id: row.id, reversal_of_id: row.reversal_of_id, amount: Number(row.cost || 0) }))
    return entries.filter((row) => !chainNetsToZero(row.id, linked))
  }, [entries, hideNetZero, focusCategory, uncategorizedView])
  const groups = useMemo(() => groupCostEntries({
    entries: uncategorizedView ? listedEntries.filter((row) => resolveEntryCategoryId(row, readable) == null) : listedEntries,
    categories: readable,
    query,
    changeOrderId,
    sortKey,
    sortDirection,
    focusCategoryId: !uncategorizedView && focusCategory && readable.some((category) => category.id === focusCategory.id) ? focusCategory.id : null,
  }), [listedEntries, readable, query, changeOrderId, sortKey, sortDirection, focusCategory, uncategorizedView])

  const budgetRollup = useMemo(() => rollupCategoryAmounts(categories, budgets), [categories, budgets])

  const storageKey = activeProject?.id ? `protrack-cost-groups:${activeProject.id}` : ''
  useEffect(() => {
    if (!storageKey) return
    try {
      const raw = localStorage.getItem(storageKey)
      const parsed = raw ? JSON.parse(raw) : []
      setCollapsed(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [])
    } catch {
      setCollapsed([])
    }
  }, [storageKey])

  const persistCollapsed = (next: string[]) => {
    setCollapsed(next)
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // The groups still collapse for this visit.
    }
  }

  useEffect(() => {
    if (!activeProject?.id) return
    let cancelled = false
    ;(async () => {
      const categoryBudgets = await supabase
        .from('project_category_budgets')
        .select('category_id, amount')
        .eq('project_id', activeProject.id)
      if (cancelled) return
      if (!categoryBudgets.error && categoryBudgets.data) {
        const next: Record<string, number> = {}
        for (const row of categoryBudgets.data) next[row.category_id] = Number(row.amount || 0)
        setBudgets(next)
        setBudgetDraft(Object.fromEntries(Object.entries(next).map(([id, amount]) => [id, String(amount)])))
        return
      }
      if (categoryBudgets.error && !isMissingRelation(categoryBudgets.error)) {
        console.error(categoryBudgets.error)
      }
      const legacy = await supabase.from('project_budgets').select('*').eq('project_id', activeProject.id).maybeSingle()
      if (cancelled || !legacy.data) return
      const next: Record<string, number> = {}
      for (const category of categories) {
        const column = category.builtin_key ? BUDGET_COLUMNS[category.builtin_key] : null
        if (column) next[category.id] = Number((legacy.data as Record<string, number | null>)[column] || 0)
      }
      setBudgets(next)
      setBudgetDraft(Object.fromEntries(Object.entries(next).map(([id, amount]) => [id, String(amount)])))
    })()
    return () => {
      cancelled = true
    }
  }, [activeProject?.id, supabase, categories])

  const formCategory = categories.find((item) => item.id === formCategoryId) || null
  const formParent = formCategory?.parent_id ? byId.get(formCategory.parent_id) : null
  const formGrant = formCategory ? grantFor(formCategory) : null
  const formCanWrite = formGrant ? canAccessCategory(user, formGrant, 'write') : false
  const settings = readCompanySettings(tenant?.settings)
  const fields = formCategory?.kind === 'labor' ? enabledLaborFields(laborFields) : []

  const openNew = (categoryId: string) => {
    setFormCategoryId(categoryId)
    setEditing(null)
    setDraft(emptyDraft())
    setQueuedFiles([])
    setOpen(true)
  }

  const openEdit = (row: ProjectCost, categoryId: string, duplicate = false) => {
    setFormCategoryId(categoryId)
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
    if (!formCategory || !activeProject || !formCanWrite) return
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
      category: (legacyCategoryText(formCategory, byId) || 'others') as ProjectCost['category'],
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
      const legacy = (formCategory.builtin_key || (formCategory.kind === 'labor' ? 'labor' : 'others')) as CostCategory
      if (editing) {
        await updateCost(legacy, editing.id, payload, { kind: formCategory.kind })
        setOpen(false)
        toast.success('Cost updated')
        return
      }
      const created = await createCost(legacy, payload, { categoryId: formCategory.id, kind: formCategory.kind }) as ProjectCost
      if (queuedFiles.length && tenant && user) {
        fileUploadService.setContext(tenant.id, user.id)
        const uploaded = await uploadQueue(queuedFiles, (file) => fileUploadService.uploadFile(file, 'cost', created.id))
        if (uploaded.error) {
          setQueuedFiles(uploaded.failed)
          setEditing(created)
          toast.error(`Cost saved. ${uploaded.error}`)
          return
        }
      }
      setQueuedFiles([])
      setOpen(false)
      toast.success('Cost added')
    } catch (error) {
      toast.error(describeSaveError(error, settings.books_lock_date, 'cost'))
    } finally {
      setSaving(false)
    }
  }

  const postReversal = async (draftValue: ReverseDraft) => {
    if (!reverseRow) return
    const hours = draftValue.hours
    const { error } = await supabase.rpc('reverse_project_cost', {
      p_cost_id: reverseRow.id,
      p_reason: draftValue.reason,
      p_date: draftValue.date,
      p_fields: hours
        ? { cost: draftValue.amount, ...hours }
        : { cost: draftValue.amount },
    })
    if (error) {
      if (isMissingRpc(error)) throw new Error('Database update pending. Reversals turn on after the Phase 2b database update.')
      throw new Error(error.message)
    }
    refreshCosts()
    toast.success('Reversal posted')
  }

  const postMove = async (categoryId: string, reason: string) => {
    if (!moveRow) return
    const { error } = await supabase.rpc('move_project_cost', {
      p_cost_id: moveRow.id,
      p_category_id: categoryId,
      p_reason: reason,
    })
    if (error) {
      if (isMissingRpc(error)) throw new Error('Database update pending. Category moves turn on after the Phase 2b database update.')
      throw new Error(describeSaveError(error, settings.books_lock_date, 'cost'))
    }
    refreshCosts()
    toast.success('Cost moved')
  }

  const saveBudget = async (category: CostCategoryRecord) => {
    if (!activeProject || !tenant || isFallbackCategoryId(category.id)) return
    if (!canAccessCategory(user, grantFor(category), 'write')) return
    const amount = Number(budgetDraft[category.id] ?? '')
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
    else {
      setBudgets((prev) => ({ ...prev, [category.id]: amount }))
      toast.success('Budget saved')
    }
  }

  const remove = async (row: ProjectCost, category: CostCategoryRecord) => {
    const ok = await confirmAction({
      title: 'Delete this cost?',
      description: 'This removes the entry from the project. Attached files are left in storage.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      const legacy = (category.builtin_key || 'others') as CostCategory
      await deleteCost(legacy, row.id)
      toast.success('Cost deleted')
    } catch (error) {
      toast.error(describeSaveError(error, settings.books_lock_date, 'cost'))
    }
  }

  if (loading) return <div className="h-24 animate-pulse rounded-lg bg-muted" />
  if (!activeProject) return <EmptyState title="Choose a project" body="Costs are filed against the project selected in the top bar." />
  if (readable.length === 0) return <EmptyState title="No categories" body="A master can add a cost category in Settings." />
  if (requested && focusCategory && !readable.some((category) => category.id === focusCategory.id)) {
    return <EmptyState title="No access" body={`You cannot view ${focusCategory.name}.`} />
  }
  if (uncategorizedView && user?.role !== 'master') {
    return <EmptyState title="No access" body="Uncategorized costs are visible to a master." />
  }

  const summaryEntries = entries.filter((row) => {
    if (changeOrderId === 'base') return !row.change_order_id
    if (changeOrderId) return row.change_order_id === changeOrderId
    return true
  })
  const summaryChangeOrder = changeOrderId === 'base'
    ? 'Base contract'
    : changeOrderId
      ? changeOrders.find((order) => order.id === changeOrderId)?.name || 'Change order'
      : 'All change orders'

  if (!focusCategory && !uncategorizedView) {
    const own = ownAmountsByCategory(summaryEntries, categories)
    const actualRollup = rollupCategoryAmounts(categories, own)
    const countRollup = rollupCategoryAmounts(categories, summaryEntries.reduce<Record<string, number>>((counts, row) => {
      const id = resolveEntryCategoryId(row, readable)
      if (!id || id === 'hidden') return counts
      counts[id] = (counts[id] || 0) + 1
      return counts
    }, {}))
    const parents = tree.flatMap((node) => {
      const children = node.children.filter((child) => readable.some((item) => item.id === child.id))
      if (readable.some((item) => item.id === node.id)) return [{ node, children }]
      return children.map((child) => ({ node: child, children: [] as typeof children }))
    })
    const uncategorizedCount = summaryEntries.filter((row) => resolveEntryCategoryId(row, readable) == null).length
    const totalActual = parents.reduce((sum, item) => sum + (actualRollup[item.node.id]?.total || 0), 0)
    const totalBudget = parents.reduce((sum, item) => sum + (budgetRollup[item.node.id]?.total || 0), 0)
    const summaryRows = parents.flatMap(({ node, children }) => [
      { id: node.id, name: node.name, depth: 0, actual: actualRollup[node.id]?.total || 0, budget: budgetRollup[node.id]?.total || 0, count: countRollup[node.id]?.total || 0 },
      ...children.map((child) => ({ id: child.id, name: child.name, depth: 1, actual: actualRollup[child.id]?.own || 0, budget: budgets[child.id] || 0, count: countRollup[child.id]?.own || 0 })),
    ])
    const summarySpec: ExportSpec = {
      filename: `${activeProject.jobNumber || 'costs'}-summary`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title: 'Costs',
      company: tenant?.name || 'Company',
      project: `${activeProject.jobNumber} — ${activeProject.jobName}`,
      filters: [`Change order: ${summaryChangeOrder}`],
      columns: ['Category', 'Entries', 'Budget', 'Actual', 'Remaining'],
      csvRows: summaryRows.map((row) => [row.depth ? `  ${row.name}` : row.name, row.count, row.budget, row.actual, row.budget - row.actual]),
      pdfRows: summaryRows.map((row) => [`${row.depth ? '  ' : ''}${row.name}`, String(row.count), formatCurrency(row.budget), formatCurrency(row.actual), formatCurrency(row.budget - row.actual)]),
      totals: [{ label: 'Cost to date', value: formatCurrency(totalActual) }, { label: 'Budget', value: formatCurrency(totalBudget) }],
      visual: {
        kpis: [
          { label: 'Cost to date', value: formatCurrency(totalActual) },
          { label: 'Budget', value: formatCurrency(totalBudget) },
          { label: 'Remaining', value: formatCurrency(totalBudget - totalActual) },
        ],
        alerts: summaryRows.filter((row) => categoryBudgetState(row.actual, row.budget) === 'over' || categoryBudgetState(row.actual, row.budget) === 'near').map((row) => `${row.name} is ${categoryBudgetState(row.actual, row.budget) === 'over' ? 'over' : 'nearing'} its budget (${formatCurrency(row.actual)} of ${formatCurrency(row.budget)}).`),
        bars: {
          title: 'Budget versus actual',
          items: parents.flatMap(({ node, children }) => [
            {
              label: node.name,
              actual: actualRollup[node.id]?.total || 0,
              budget: budgetRollup[node.id]?.total || 0,
              caption: `${formatCurrency(actualRollup[node.id]?.total || 0)} / ${formatCurrency(budgetRollup[node.id]?.total || 0)}`,
              depth: 0,
            },
            ...children.map((child) => ({
              label: child.name,
              actual: actualRollup[child.id]?.own || 0,
              budget: budgets[child.id] || 0,
              caption: `${formatCurrency(actualRollup[child.id]?.own || 0)} / ${formatCurrency(budgets[child.id] || 0)}`,
              depth: 1,
            })),
          ]),
        },
      },
    }
    return (
      <div className="space-y-4">
        <PageHeader
          title="Costs"
          description={`${activeProject.jobNumber} · ${summaryChangeOrder}. Open a category for its entries.`}
          action={<ExportMenu spec={summaryRows.length > 0 ? summarySpec : null} />}
        />
        <section className="grid gap-3 sm:grid-cols-3">
          <SummaryStat label="Cost to date" value={formatCurrency(totalActual)} />
          <SummaryStat label="Budget" value={formatCurrency(totalBudget)} />
          <SummaryStat label="Remaining" value={formatCurrency(totalBudget - totalActual)} />
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">Budget versus actual</h2>
          <div className="mt-3 space-y-3">
            {parents.map(({ node, children }) => {
              const actual = actualRollup[node.id]?.total || 0
              const budget = budgetRollup[node.id]?.total || 0
              return (
                <div key={node.id}>
                  <SummaryBar href={`/costs?category=${node.id}`} name={node.name} actual={actual} budget={budget} depth={0} />
                  {children.length > 0 ? (
                    <div className="ml-6 mt-1 border-l border-muted-foreground/45">
                      {children.map((child) => (
                        <SummaryBar
                          key={child.id}
                          href={`/costs?category=${child.id}`}
                          name={child.name}
                          actual={actualRollup[child.id]?.own || 0}
                          budget={budgets[child.id] || 0}
                          depth={1}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="responsive-cards w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">Entries</th>
                <th className="px-3 py-2 text-right font-medium">Budget</th>
                <th className="px-3 py-2 text-right font-medium">Actual</th>
                <th className="px-3 py-2 text-right font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.id} className={`border-b border-border last:border-0 ${row.depth ? 'text-[13px] text-muted-foreground' : ''}`}>
                  <td className="px-3 py-2" data-label="Category">
                    <CategoryName depth={row.depth}>
                      <Link className={row.depth ? 'text-muted-foreground hover:text-foreground' : 'font-medium text-primary'} href={`/costs?category=${row.id}` as never}>{row.name}</Link>
                    </CategoryName>
                  </td>
                  <td className="px-3 py-2 text-right tabular" data-label="Entries">{row.count}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Budget">{formatCurrency(row.budget)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Actual">{formatCurrency(row.actual)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Remaining">{formatCurrency(row.budget - row.actual)}</td>
                </tr>
              ))}
              {user?.role === 'master' && uncategorizedCount > 0 ? (
                <tr>
                  <td className="px-3 py-2" data-label="Category"><Link className="text-primary" href={'/costs?category=uncategorized' as never}>Uncategorized</Link></td>
                  <td className="px-3 py-2 text-right tabular" data-label="Entries">{uncategorizedCount}</td>
                  <td className="px-3 py-2 text-right" data-label="Budget">—</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Actual">{formatCurrency(summaryEntries.filter((row) => resolveEntryCategoryId(row, readable) == null).reduce((sum, row) => sum + Number(row.cost || 0), 0))}</td>
                  <td className="px-3 py-2" />
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    )
  }

  const collapsedIds = collapsed || []
  const collapsedSet = new Set(collapsedIds)
  const groupIds = costGroupIds(groups)
  const visibleCount = countCostEntries(groups)
  const categoryNames = new Map(readable.map((category) => [category.id, category.name]))
  const shown = visibleCostLines(groups, collapsedSet, categoryNames).filter((line) => {
    if (!line.categoryId) return user?.role === 'master'
    const category = readable.find((item) => item.id === line.categoryId)
    return category ? canExport(user, category.id, grantFor(category)) : false
  })
  const shownTotal = shown.reduce((sum, line) => sum + line.amount, 0)
  const changeOrderLabel = changeOrderId === 'base'
    ? 'Base contract'
    : changeOrderId
      ? changeOrders.find((order) => order.id === changeOrderId)?.name || 'Change order'
      : 'All change orders'
  const focusBudget = focusCategory ? budgetRollup[focusCategory.id]?.total || 0 : 0
  const focusChildren = focusCategory
    ? (tree.find((node) => node.id === focusCategory.id)?.children || []).filter((child) => readable.some((item) => item.id === child.id))
    : []
  const focusBars = [
    {
      label: focusCategory?.name || 'Uncategorized',
      actual: groups[0]?.total || shownTotal,
      budget: focusBudget,
      caption: `${formatCurrency(groups[0]?.total || shownTotal)} / ${focusBudget > 0 ? formatCurrency(focusBudget) : 'No budget'}`,
    },
    ...focusChildren.map((child) => {
      const actual = groups[0]?.children.find((group) => group.categoryId === child.id)?.total || 0
      const budget = budgets[child.id] || 0
      return {
        label: child.name,
        actual,
        budget,
        caption: `${formatCurrency(actual)} / ${budget > 0 ? formatCurrency(budget) : 'No budget'}`,
        depth: 1,
      }
    }),
  ]
  const exportSpec: ExportSpec = {
    filename: `${activeProject.jobNumber || 'costs'}-${focusCategory?.name || 'costs'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: focusCategory ? `${focusCategory.name} costs` : 'Costs',
    company: tenant?.name || 'Company',
    project: `${activeProject.jobNumber} — ${activeProject.jobName}`,
    filters: [
      query.trim() ? `Search: ${query.trim()}` : 'Search: none',
      `Sort: ${sortKey} ${sortDirection}`,
      `Change order: ${changeOrderLabel}`,
    ],
    columns: ['Category', 'Date', 'Details', 'Amount'],
    csvRows: shown.map((line) => line.kind === 'collapsed' || !line.row
      ? [line.path, '', `${line.entryCount} entries`, line.amount]
      : [line.path, line.row.date || '', costDetailText(line.row), Number(line.row.cost || 0)]),
    pdfRows: shown.map((line) => line.kind === 'collapsed' || !line.row
      ? [line.path, '', `${line.entryCount} entries`, formatCurrency(line.amount)]
      : [line.path, line.row.date || '', costDetailText(line.row) || '—', formatCurrency(line.row.cost)]),
    rowDepth: shown.map((line) => (line.path.includes(' / ') ? 1 : 0)),
    totals: [{ label: 'Shown total', value: formatCurrency(shownTotal) }],
    visual: {
      kpis: [
        { label: focusCategory?.name || 'Uncategorized', value: formatCurrency(shownTotal) },
        { label: 'Budget', value: formatCurrency(focusBudget) },
        { label: 'Remaining', value: formatCurrency(focusBudget - shownTotal) },
        { label: 'Entries', value: String(visibleCount) },
      ],
      bars: { title: 'Budget versus actual', items: focusBars },
    },
  }
  const addTarget = focusCategory && readable.some((category) => category.id === focusCategory.id)
    ? focusCategory
    : readable.find((category) => canAccessCategory(user, grantFor(category), 'write')) || null
  const addTargetWritable = addTarget ? canAccessCategory(user, grantFor(addTarget), 'write') : false

  const parentName = focusCategory?.parent_id ? byId.get(focusCategory.parent_id)?.name : null
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <Link className="text-primary" href="/costs">Costs</Link>
        {parentName ? <span> / <Link className="text-primary" href={`/costs?category=${focusCategory?.parent_id}` as never}>{parentName}</Link></span> : null}
      </p>
      <PageHeader
        title={focusCategory ? focusCategory.name : 'Uncategorized'}
        description={`${visibleCount} entries · ${summaryChangeOrder}`}
        action={
          <>
            <Button variant="outline" type="button" onClick={() => persistCollapsed([])}>Expand all</Button>
            <Button variant="outline" type="button" onClick={() => persistCollapsed(groupIds)}>Collapse all</Button>
            <ExportMenu spec={exportSpec} />
            <Button
              type="button"
              onClick={() => addTarget && openNew(addTarget.id)}
              disabled={!addTargetWritable}
            >
              <Plus className="h-4 w-4" /> Add cost
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input className="flex-1" placeholder="Search costs" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search costs" />
        <select
          className="h-11 rounded-lg border border-input bg-card px-3 text-sm sm:w-40"
          aria-label="Sort costs"
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as CostSortKey)}
        >
          <option value="date">Date</option>
          <option value="amount">Amount</option>
          <option value="details">Details</option>
        </select>
        <Button variant="outline" type="button" onClick={() => setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')}>
          {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={hideNetZero} onChange={(event) => setHideNetZero(event.target.checked)} />
          Hide reversals and their originals that net to zero
        </label>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="No costs match" body="Try a different search, or add a cost to a category." />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <CostBranch
              key={group.categoryId || 'uncategorized'}
              group={group}
              depth={0}
              readable={readable}
              collapsedIds={collapsedIds}
              budgetRollup={budgetRollup}
              budgetDraft={budgetDraft}
              schemaPending={schemaPending}
              correctionsPending={correctionsPending}
              laborSplit={settings.labor_split_enabled}
              booksLockDate={settings.books_lock_date}
              entries={entries}
              canWriteCategory={(category) => canAccessCategory(user, grantFor(category), 'write')}
              onToggle={(id) => persistCollapsed(collapsedIds.includes(id) ? collapsedIds.filter((item) => item !== id) : [...collapsedIds, id])}
              onBudgetDraft={(id, value) => setBudgetDraft((prev) => ({ ...prev, [id]: value }))}
              onSaveBudget={saveBudget}
              onAdd={openNew}
              onEdit={openEdit}
              onDelete={remove}
              onReverse={setReverseRow}
              onMove={setMoveRow}
            />
          ))}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen} title={formCategory ? (editing ? `Edit ${formCategory.name}` : `Add ${formCategory.name}`) : 'Cost'} description="Amounts use the category type. Labor is hours times rates.">
        {formCategory ? (
          <div className="space-y-3">
            <Field label="Date" htmlFor="cost-date">
              <Input id="cost-date" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
            </Field>
            {formCategory.kind === 'labor' ? <LaborFields draft={draft} setDraft={setDraft} employees={employees} projectId={activeProject?.id} /> : null}
            {formCategory.kind === 'named' ? (
              <Field label={formCategory.builtin_key === 'equipment' || formParent?.builtin_key === 'equipment' ? 'Equipment name' : 'Name'} htmlFor="named">
                <Input id="named" value={draft.subcontractor_name} onChange={(event) => setDraft({ ...draft, subcontractor_name: event.target.value })} />
              </Field>
            ) : null}
            {formCategory.kind !== 'labor' ? (
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
            {editing && isBooksLocked(settings.books_lock_date, draft.date) ? (
              <p className="text-sm text-destructive">{booksClosedMessage(settings.books_lock_date, 'cost')}</p>
            ) : null}
            {editing && tenant && user ? (
              <>
                <FileAttachments entityType="cost" entityId={editing.id} tenantId={tenant.id} userId={user.id} canEdit={formCanWrite} />
                <RecordHistory entityType="cost" entityId={editing.id} />
              </>
            ) : (
              <QueuedFilesField files={queuedFiles} onChange={setQueuedFiles} />
            )}
            <Button type="button" onClick={save} disabled={saving || !formCanWrite || (!!editing && isBooksLocked(settings.books_lock_date, draft.date))}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        ) : null}
      </Sheet>
      <ReverseSheet
        open={!!reverseRow}
        title="Reverse this cost"
        noun="cost"
        remaining={reverseRow ? costRemaining(reverseRow, entries) : 0}
        hours={reverseRow && laborCategory(reverseRow, categories) ? hourRemaining(reverseRow, entries) : undefined}
        onClose={() => setReverseRow(null)}
        onConfirm={postReversal}
      />
      <MoveCostSheet
        open={!!moveRow}
        categories={readable}
        currentCategoryId={moveRow?.category_id}
        currentKind={moveRow ? categories.find((item) => item.id === moveRow.category_id)?.kind : null}
        onClose={() => setMoveRow(null)}
        onConfirm={postMove}
      />
    </div>
  )
}

function costRemaining(row: ProjectCost, rows: ProjectCost[]) {
  return directRemaining(Number(row.cost || 0), rows.filter((item) => item.reversal_of_id === row.id).map((item) => Number(item.cost || 0)))
}

function hourRemaining(row: ProjectCost, rows: ProjectCost[]) {
  const children = rows.filter((item) => item.reversal_of_id === row.id)
  const part = (key: 'st_hours' | 'ot_hours' | 'dt_hours' | 'per_diem' | 'mob' | 'mob_qty') =>
    directRemaining(Number(row[key] || 0), children.map((item) => Number(item[key] || 0)))
  return {
    st_hours: part('st_hours'),
    ot_hours: part('ot_hours'),
    dt_hours: part('dt_hours'),
    per_diem: part('per_diem'),
    mob: part('mob'),
    mob_qty: part('mob_qty'),
  }
}

function laborCategory(row: ProjectCost, categories: CostCategoryRecord[]) {
  return categories.find((item) => item.id === row.category_id)?.kind === 'labor' || row.category === 'labor'
}

function SummaryBar({ href, name, actual, budget, depth }: { href: string; name: string; actual: number; budget: number; depth: number }) {
  const max = Math.max(actual, budget, 1)
  return (
    <Link href={href as never} className={`relative block rounded-md py-1 hover:bg-muted ${depth > 0 ? 'pl-3' : 'px-1'}`}>
      {depth > 0 ? <span aria-hidden className="absolute left-0 top-1/2 h-px w-3 bg-muted-foreground/45" /> : null}
      <div className={`mb-1 flex justify-between gap-3 ${depth > 0 ? 'pl-3 text-[13px] text-muted-foreground' : 'text-sm'}`}>
        <span className="min-w-0 truncate">{name}</span>
        <span className="tabular">{formatCurrency(actual)} / {budget > 0 ? formatCurrency(budget) : 'No budget'}</span>
      </div>
      <div className={`relative overflow-hidden rounded-full bg-muted ${depth > 0 ? 'ml-3 h-1.5' : 'h-2'}`}>
        <div className={`absolute inset-y-0 left-0 ${actual > budget && budget > 0 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${Math.min(100, (actual / max) * 100)}%` }} />
      </div>
    </Link>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
    </div>
  )
}

function CostBranch({
  group,
  depth,
  readable,
  collapsedIds,
  budgetRollup,
  budgetDraft,
  schemaPending,
  correctionsPending,
  laborSplit,
  booksLockDate,
  entries,
  canWriteCategory,
  onToggle,
  onBudgetDraft,
  onSaveBudget,
  onAdd,
  onEdit,
  onDelete,
  onReverse,
  onMove,
}: {
  group: CostGroup<ProjectCost>
  depth: number
  readable: CostCategoryRecord[]
  collapsedIds: string[]
  budgetRollup: Record<string, { total: number }>
  budgetDraft: Record<string, string>
  schemaPending: boolean
  correctionsPending: boolean
  laborSplit: boolean
  booksLockDate: string | null
  entries: ProjectCost[]
  canWriteCategory: (category: CostCategoryRecord) => boolean
  onToggle: (id: string) => void
  onBudgetDraft: (id: string, value: string) => void
  onSaveBudget: (category: CostCategoryRecord) => void
  onAdd: (categoryId: string) => void
  onEdit: (row: ProjectCost, categoryId: string, duplicate?: boolean) => void
  onDelete: (row: ProjectCost, category: CostCategoryRecord) => void
  onReverse: (row: ProjectCost) => void
  onMove: (row: ProjectCost) => void
}) {
  const category = readable.find((item) => item.id === group.categoryId) || null
  const groupKey = group.categoryId || 'uncategorized'
  const isOpen = !collapsedIds.includes(groupKey)
  const canWrite = category ? canWriteCategory(category) : false
  const budget = category ? Number(budgetRollup[category.id]?.total || 0) : 0
  const name = category?.name || 'Uncategorized'
  const count = countCostEntries([group])
  const unassigned = category?.builtin_key === 'labor' && laborSplit
  return (
    <section className={depth === 0 ? 'rounded-lg border border-border bg-card' : 'ml-6 border-l border-muted-foreground/45'}>
      <div className={`sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-card px-3 py-2 sm:flex-row sm:items-center ${depth > 0 ? 'relative pl-5' : ''}`}>
        {depth > 0 ? <span aria-hidden className="absolute left-0 top-1/2 h-px w-3 bg-muted-foreground/45" /> : null}
        <button
          type="button"
          className="flex min-h-11 flex-1 items-center gap-2 text-left"
          aria-expanded={isOpen}
          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${name}`}
          onClick={() => onToggle(groupKey)}
        >
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span>
            <span className={depth > 0 ? 'text-[13px] font-medium text-muted-foreground' : 'font-medium'}>{name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {count} {count === 1 ? 'entry' : 'entries'}
              {group.children.length > 0 ? ' · includes children' : ''}
            </span>
          </span>
        </button>
        <BudgetMeter actual={group.total} budget={budget} />
        {category && !schemaPending && !isFallbackCategoryId(category.id) ? (
          <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); onSaveBudget(category) }}>
            <label className="sr-only" htmlFor={`budget-${category.id}`}>Budget for {name}</label>
            <Input
              id={`budget-${category.id}`}
              className="tabular h-9 w-28 min-h-9"
              inputMode="decimal"
              value={budgetDraft[category.id] ?? ''}
              onChange={(event) => onBudgetDraft(category.id, event.target.value)}
              disabled={!canWrite}
              aria-label={`Budget for ${name}`}
            />
            <Button variant="outline" size="sm" type="submit" disabled={!canWrite}>Save</Button>
          </form>
        ) : null}
        {category ? (
          <Button type="button" size="sm" onClick={() => onAdd(category.id)} disabled={!canWrite}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        ) : null}
      </div>
      {isOpen ? (
        <>
          {group.rows.length === 0 && group.children.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No entries in {name}.</p>
          ) : group.rows.length > 0 ? (
            <div className="overflow-x-auto">
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
                  {group.rows.map((row) => {
                    const mark = reversalMark(row, entries)
                    return (
                    <tr key={row.id} id={`cost-${row.id}`} className="cost-row border-b border-border last:border-0">
                      <td className="px-3 py-2" data-label="Date">{formatDate(row.date)}</td>
                      <td className="px-3 py-2" data-label="Details">
                        <div>
                          {row.description || row.vendor || row.subcontractor_name || row.employee_name || '—'}
                          {mark === 'reversed' ? <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs">Reversed</span> : null}
                          {mark === 'partial' ? <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs">Partially reversed</span> : null}
                          {mark === 'reversal' ? (
                            <button type="button" className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-primary" onClick={() => document.getElementById(`cost-${row.reversal_of_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                              Reversal
                            </button>
                          ) : null}
                        </div>
                        {category?.kind === 'labor' ? (
                          <div className="text-xs text-muted-foreground tabular">
                            ST {formatHours(row.st_hours)} · OT {formatHours(row.ot_hours)} · DT {formatHours(row.dt_hours)}
                            {unassigned && !row.category_id ? ' · Labor (unassigned)' : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular" data-label="Amount">{formatCurrency(row.cost)}</td>
                      <td className="px-3 py-2 text-right" data-label="Actions">
                        {category ? (
                          <>
                            <Button variant="ghost" size="icon" type="button" aria-label="Duplicate" onClick={() => onEdit(row, category.id, true)} disabled={!canWrite}><Copy className="h-4 w-4" /></Button>
                            {!correctionsPending && canWrite && canReverseRow(Number(row.cost || 0), entries.filter((item) => item.reversal_of_id === row.id).map((item) => Number(item.cost || 0)), row.reversed_at) ? (
                              <Button variant="ghost" size="icon" type="button" aria-label="Reverse" onClick={() => onReverse(row)}><Undo2 className="h-4 w-4" /></Button>
                            ) : null}
                            {!correctionsPending && canWrite && !row.reversal_of_id ? (
                              <Button variant="ghost" size="icon" type="button" aria-label={isBooksLocked(booksLockDate, row.date) ? booksClosedMessage(booksLockDate, 'cost') : 'Move'} title={isBooksLocked(booksLockDate, row.date) ? booksClosedMessage(booksLockDate, 'cost') : 'Move'} onClick={() => onMove(row)} disabled={isBooksLocked(booksLockDate, row.date)}><FolderInput className="h-4 w-4" /></Button>
                            ) : null}
                            <Button variant="ghost" size="icon" type="button" aria-label={isBooksLocked(booksLockDate, row.date) ? booksClosedMessage(booksLockDate, 'cost') : 'Edit'} title={isBooksLocked(booksLockDate, row.date) ? booksClosedMessage(booksLockDate, 'cost') : 'Edit'} onClick={() => onEdit(row, category.id)} disabled={!canWrite || !!row.reversal_of_id || !!row.reversed_at || isBooksLocked(booksLockDate, row.date)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" type="button" aria-label={isBooksLocked(booksLockDate, row.date) ? booksClosedMessage(booksLockDate, 'cost') : 'Delete'} title={isBooksLocked(booksLockDate, row.date) ? booksClosedMessage(booksLockDate, 'cost') : 'Delete'} onClick={() => onDelete(row, category)} disabled={!canWrite || !!row.reversal_of_id || !!row.reversed_at || isBooksLocked(booksLockDate, row.date)}><Trash2 className="h-4 w-4" /></Button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {group.children.map((child) => (
            <CostBranch
              key={child.categoryId || 'child'}
              group={child}
              depth={depth + 1}
              readable={readable}
              collapsedIds={collapsedIds}
              budgetRollup={budgetRollup}
              budgetDraft={budgetDraft}
              schemaPending={schemaPending}
              correctionsPending={correctionsPending}
              laborSplit={laborSplit}
              booksLockDate={booksLockDate}
              entries={entries}
              canWriteCategory={canWriteCategory}
              onToggle={onToggle}
              onBudgetDraft={onBudgetDraft}
              onSaveBudget={onSaveBudget}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              onReverse={onReverse}
              onMove={onMove}
            />
          ))}
        </>
      ) : null}
    </section>
  )
}

function BudgetMeter({ actual, budget }: { actual: number; budget: number }) {
  const set = budget > 0
  const ratio = set ? Math.min(actual / budget, 1) : 0
  const over = set && actual > budget
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={`h-full ${over ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <span className={`text-xs tabular ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
        {formatCurrency(actual)} / {set ? formatCurrency(budget) : 'No budget'}
      </span>
    </div>
  )
}

function LaborFields({
  draft,
  setDraft,
  employees,
  projectId,
}: {
  draft: Draft
  setDraft: (draft: Draft) => void
  employees: Array<{ id: string; name: string; standard_rate: number; ot_rate: number; dt_rate: number; mob_rate?: number | null }>
  projectId?: string
}) {
  const [rateNote, setRateNote] = useState<string | null>(null)
  useEffect(() => {
    if (!draft.employee_id) {
      setRateNote(null)
      return
    }
    const employee = employees.find((item) => item.id === draft.employee_id)
    if (!employee || !projectId) return
    let active = true
    void (async () => {
      const client = createClient()
      const { data, error } = await client.rpc('employee_rates_as_of', {
        p_employee_id: draft.employee_id,
        p_project_id: projectId,
        p_on: draft.date,
      })
      let resolved = null as ReturnType<typeof resolveEmployeeRates> | null
      const row = Array.isArray(data) ? data[0] : data
      if (!error && row && typeof row === 'object' && 'source' in row) {
        const card = row as { source: 'override' | 'employee'; standard_rate: number; ot_rate: number; dt_rate: number; mob_rate: number | null; effective_date: string | null }
        resolved = {
          standard_rate: Number(card.standard_rate),
          ot_rate: Number(card.ot_rate),
          dt_rate: Number(card.dt_rate),
          mob_rate: card.mob_rate == null ? null : Number(card.mob_rate),
          effective_date: card.effective_date,
          source: card.source,
        }
      } else if (isMissingRpc(error)) {
        const loaded = await client.from('employee_project_rates').select('project_id, effective_date, standard_rate, ot_rate, dt_rate, mob_rate').eq('employee_id', draft.employee_id)
        const overrides = ((loaded.data || []) as EmployeeRateOverride[])
        resolved = resolveEmployeeRates(employee, overrides, projectId, draft.date)
      }
      if (!active || !resolved) return
      setRateNote(resolved.source === 'override' && resolved.effective_date
        ? `Using the rate for this project, effective ${resolved.effective_date}.`
        : null)
      setDraft({
        ...draft,
        st_rate: String(resolved.standard_rate),
        ot_rate: String(resolved.ot_rate),
        dt_rate: String(resolved.dt_rate),
        mob_rate: resolved.mob_rate == null ? draft.mob_rate : String(resolved.mob_rate),
      })
    })()
    return () => {
      active = false
    }
    // Rates refresh when the employee, project, or entry date changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.employee_id, draft.date, projectId])
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
      <div className="flex items-end pb-2 text-sm text-muted-foreground">{rateNote}</div>
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
