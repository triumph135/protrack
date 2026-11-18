'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { createClient } from '@/lib/supabase'
import ProjectModal from '@/components/ProjectModal'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import type { ChangeOrder, Project } from '@/types/app.types'
import { userCan } from '@/lib/permissions'
import { formatCurrency } from '@/lib/format'
import { ExportMenu, type ExportSpec } from '@/components/export/ExportMenu'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/feedback'
import { Sheet } from '@/components/ui/sheet'
import FileAttachments from '@/components/FileAttachments'

const emptyChangeOrder = { name: '', description: '', additional_contract_value: 0 }

export default function ProjectsPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { projects, loading, createProject, updateProject, deleteProject, setActiveProject, activeProject } = useProjects()
  const [showModal, setShowModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [orders, setOrders] = useState<ChangeOrder[]>([])
  const supabase = createClient()
  const canWrite = userCan(user, 'projects', 'write')

  const filteredProjects = projects.filter((project) => {
    const haystack = `${project.jobNumber} ${project.jobName} ${project.customer}`.toLowerCase()
    const matchesSearch = haystack.includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleDeleteProject = async (project: Project) => {
    const confirmed = await confirmAction({
      title: `Delete ${project.jobName}?`,
      description: 'This also deletes the costs, invoices, and change orders on the project.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deleteProject(project.id)
      toast.success('Project deleted')
    } catch (error) {
      console.error('Error deleting project:', error)
      toast.error('Error deleting project. Please try again.')
    }
  }

  useEffect(() => {
    if (!tenant?.id) return
    let cancelled = false
    supabase.from('change_orders').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).then(({ data }) => {
      if (!cancelled) setOrders(data || [])
    })
    return () => {
      cancelled = true
    }
    // createClient is stable enough for this refresh; expandedProjects.size refetches after a row is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, expandedProjects.size])

  const exportSpec = useMemo<ExportSpec>(() => {
    const csvRows: Array<Array<string | number>> = []
    const pdfRows: string[][] = []
    let contractTotal = 0
    for (const project of filteredProjects) {
      const projectOrders = orders.filter((order) => order.project_id === project.id)
      const contract = (project.totalContractValue || 0) + projectOrders.reduce((sum, order) => sum + Number(order.additional_contract_value || 0), 0)
      contractTotal += contract
      const status = project.status || 'Active'
      csvRows.push([project.jobNumber, project.jobName, project.customer, status, contract, '', '', ''])
      pdfRows.push([project.jobNumber, project.jobName, project.customer, status, formatCurrency(contract), '', '', ''])
      if (!expandedProjects.has(project.id)) continue
      for (const order of projectOrders) {
        csvRows.push([project.jobNumber, project.jobName, project.customer, '', '', order.name, Number(order.additional_contract_value || 0), order.description || ''])
        pdfRows.push([project.jobNumber, '', '', '', '', order.name, formatCurrency(order.additional_contract_value || 0), order.description || ''])
      }
    }
    return {
      filename: 'projects',
      title: 'Projects',
      company: tenant?.name || 'Company',
      filters: [
        searchTerm.trim() ? `Search: ${searchTerm.trim()}` : 'Search: none',
        statusFilter === 'all' ? 'Status: all' : `Status: ${statusFilter}`,
        'Change orders are included only for expanded jobs',
      ],
      columns: ['Job number', 'Job name', 'Customer', 'Status', 'Contract', 'Change order', 'Change order amount', 'Description'],
      csvRows,
      pdfRows,
      totals: [{ label: 'Contract', value: formatCurrency(contractTotal) }],
    }
  }, [filteredProjects, orders, expandedProjects, tenant?.name, searchTerm, statusFilter])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Projects"
        description="Jobs, contract values, and change orders."
        action={
          <>
            <ExportMenu spec={filteredProjects.length > 0 ? exportSpec : null} />
            {canWrite ? <Button type="button" onClick={() => { setEditingProject(null); setShowModal(true) }}><Plus className="h-4 w-4" /> Add project</Button> : null}
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input className="flex-1" placeholder="Search job, name, or customer" aria-label="Search projects" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
        <select className="h-11 rounded-lg border border-input bg-card px-3 text-sm sm:w-48" aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Completed">Completed</option>
          <option value="On Hold">On Hold</option>
        </select>
      </div>

      {loading ? <Skeleton className="h-40" /> : filteredProjects.length === 0 ? (
        <EmptyState
          title={projects.length === 0 ? 'No projects yet' : 'No projects match'}
          body={projects.length === 0 ? 'Add the first job to start tracking costs and invoices.' : 'Try a different search or status.'}
          action={canWrite && projects.length === 0 ? <Button type="button" onClick={() => setShowModal(true)}>Add project</Button> : null}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="responsive-cards w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 text-right font-medium">Contract</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project) => (
                <ProjectRows
                  key={project.id}
                  project={project}
                  isActive={activeProject?.id === project.id}
                  isExpanded={expandedProjects.has(project.id)}
                  canWrite={canWrite}
                  onToggle={() => {
                    setExpandedProjects((current) => {
                      const next = new Set(current)
                      if (next.has(project.id)) next.delete(project.id)
                      else next.add(project.id)
                      return next
                    })
                  }}
                  onSetActive={() => setActiveProject(project)}
                  onEdit={() => { setEditingProject(project); setShowModal(true) }}
                  onDelete={() => handleDeleteProject(project)}
                  onExpand={() => setExpandedProjects((current) => new Set(current).add(project.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProjectModal
        open={showModal}
        project={editingProject}
        onSave={async (projectData) => {
          if (editingProject) await updateProject(editingProject.id, projectData)
          else await createProject(projectData)
          setShowModal(false)
          setEditingProject(null)
          toast.success(editingProject ? 'Project updated' : 'Project created')
        }}
        onCancel={() => { setShowModal(false); setEditingProject(null) }}
      />

    </div>
  )
}

function statusTone(status: string | undefined): 'success' | 'neutral' | 'warning' {
  if (status === 'Active') return 'success'
  if (status === 'On Hold') return 'warning'
  return 'neutral'
}

function ProjectRows({
  project,
  isActive,
  isExpanded,
  canWrite,
  onToggle,
  onSetActive,
  onEdit,
  onDelete,
  onExpand,
}: {
  project: Project
  isActive: boolean
  isExpanded: boolean
  canWrite: boolean
  onToggle: () => void
  onSetActive: () => void
  onEdit: () => void
  onDelete: () => void
  onExpand: () => void
}) {
  const { changeOrders, createChangeOrder, updateChangeOrder, deleteChangeOrder, loading } = useChangeOrders(project.id)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ChangeOrder | null>(null)
  const [form, setForm] = useState(emptyChangeOrder)
  const [saving, setSaving] = useState(false)
  const changeOrderTotal = changeOrders.reduce((sum, order) => sum + (order.additional_contract_value || 0), 0)
  const { user: currentUser } = useAuth()
  const { tenant } = useTenant()
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    const client = createClient()
    let active = true
    void (async () => {
      const projectFiles = await client.from('attachments').select('id', { count: 'exact', head: true }).eq('entity_type', 'project').eq('entity_id', project.id)
      const next: Record<string, number> = { [project.id]: projectFiles.count || 0 }
      const ids = changeOrders.map((order) => order.id)
      if (ids.length > 0) {
        const { data, error } = await client.from('attachments').select('entity_id').eq('entity_type', 'change_order').in('entity_id', ids)
        if (!error) {
          for (const row of data || []) next[row.entity_id] = (next[row.entity_id] || 0) + 1
        }
      }
      if (active) setFileCounts(next)
    })()
    return () => { active = false }
    // Counts refresh when the change-order list changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, changeOrders.map((order) => order.id).join(',')])

  const handleDeleteChangeOrder = async (order: ChangeOrder) => {
    const confirmed = await confirmAction({
      title: 'Delete this change order?',
      description: 'Costs and invoices tied to it stay on the project, without this change order.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deleteChangeOrder(order.id)
      toast.success('Change order deleted')
    } catch (error) {
      console.error('Error deleting change order:', error)
      toast.error('Error deleting change order. Please try again.')
    }
  }

  return (
    <>
      <tr className="border-b border-border">
        <td className="px-3 py-2" data-label="Job">
          <button type="button" className="inline-flex items-center gap-2 text-left font-medium" onClick={onToggle}>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span>{project.jobNumber}</span>
          </button>
          <p className="pl-6 text-muted-foreground">{project.jobName}{(fileCounts[project.id] || 0) > 0 ? ` · ${fileCounts[project.id]} files` : ''}</p>
        </td>
        <td className="px-3 py-2" data-label="Customer">{project.customer}</td>
        <td className="px-3 py-2 text-right" data-label="Contract">
          <p className="tabular">{formatCurrency((project.totalContractValue || 0) + changeOrderTotal)}</p>
          <p className="text-xs text-muted-foreground tabular">Base {formatCurrency(project.totalContractValue)} · CO {formatCurrency(changeOrderTotal)}</p>
        </td>
        <td className="px-3 py-2" data-label="Status">
          <Badge tone={statusTone(project.status)}>{project.status || 'Active'}</Badge>
          {isActive ? <span className="ml-2"><Badge tone="success">Current</Badge></span> : null}
        </td>
        <td className="px-3 py-2 text-right" data-label="Actions">
          {!isActive ? <Button type="button" variant="outline" size="sm" onClick={onSetActive}>Use</Button> : null}
          {canWrite ? (
            <>
              <Button variant="ghost" size="icon" type="button" aria-label={`Edit ${project.jobNumber}`} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" type="button" aria-label={`Delete ${project.jobNumber}`} onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
            </>
          ) : null}
        </td>
      </tr>
      {isExpanded ? (
        <tr className="border-b border-border bg-muted/40">
          <td className="change-order-panel px-3 py-3" colSpan={5}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Change orders ({loading ? '…' : changeOrders.length})</p>
              {canWrite ? <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(null); setForm(emptyChangeOrder); setSheetOpen(true); onExpand() }}><Plus className="h-4 w-4" /> Add</Button> : null}
            </div>
            {changeOrders.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">No change orders on this job.</p>
            ) : (
              <ul className="space-y-2">
                {changeOrders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                    <div>
                      <p className="font-medium">{order.name}</p>
                      <p className="text-sm text-muted-foreground">
                        <span className="tabular">{formatCurrency(order.additional_contract_value || 0)}</span>
                        {order.description ? ` · ${order.description}` : ''}
                        {(fileCounts[order.id] || 0) > 0 ? ` · ${fileCounts[order.id]} files` : ''}
                      </p>
                    </div>
                    {canWrite ? (
                      <div>
                        <Button variant="ghost" size="icon" type="button" aria-label={`Edit ${order.name}`} onClick={() => { setEditing(order); setForm({ name: order.name, description: order.description || '', additional_contract_value: order.additional_contract_value || 0 }); setSheetOpen(true) }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" type="button" aria-label={`Delete ${order.name}`} onClick={() => handleDeleteChangeOrder(order)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      ) : null}
      <ChangeOrderSheet
        open={sheetOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        saving={saving}
        tenantId={tenant?.id}
        userId={currentUser?.id}
        onClose={() => setSheetOpen(false)}
        onSave={async () => {
          if (!form.name.trim()) {
            toast.error('Name the change order')
            return
          }
          try {
            setSaving(true)
            if (editing) await updateChangeOrder(editing.id, form)
            else await createChangeOrder(form)
            toast.success(editing ? 'Change order updated' : 'Change order added')
            setSheetOpen(false)
          } catch (error) {
            console.error('Error saving change order:', error)
            toast.error('Error saving change order. Please try again.')
          } finally {
            setSaving(false)
          }
        }}
      />
    </>
  )
}

function ChangeOrderSheet({
  open,
  editing,
  form,
  setForm,
  saving,
  tenantId,
  userId,
  onClose,
  onSave,
}: {
  open: boolean
  editing: ChangeOrder | null
  form: typeof emptyChangeOrder
  setForm: (form: typeof emptyChangeOrder) => void
  saving: boolean
  tenantId?: string
  userId?: string
  onClose: () => void
  onSave: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }} title={editing ? 'Edit change order' : 'Add change order'} description="Extra contract value is added to the job total.">
      <div className="space-y-3">
        <Field label="Name" htmlFor={`co-name-${editing?.id || 'new'}`}>
          <Input id={`co-name-${editing?.id || 'new'}`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="CO-001" />
        </Field>
        <Field label="Additional value" htmlFor={`co-value-${editing?.id || 'new'}`}>
          <Input id={`co-value-${editing?.id || 'new'}`} className="tabular" inputMode="decimal" value={form.additional_contract_value} onChange={(event) => setForm({ ...form, additional_contract_value: parseFloat(event.target.value) || 0 })} />
        </Field>
        <Field label="Description" htmlFor={`co-description-${editing?.id || 'new'}`}>
          <Input id={`co-description-${editing?.id || 'new'}`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </Field>
        {editing && tenantId && userId ? (
          <FileAttachments entityType="change_order" entityId={editing.id} tenantId={tenantId} userId={userId} canEdit />
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Sheet>
  )
}
