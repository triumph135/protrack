'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Download, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/feedback'
import { Sheet } from '@/components/ui/sheet'

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

  const exportProjectsData = async () => {
    if (filteredProjects.length === 0) {
      toast.error('No projects to export')
      return
    }
    let changeOrdersData: ChangeOrder[] = []
    if (tenant?.id) {
      try {
        const { data, error } = await supabase
          .from('change_orders')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
        if (error) throw error
        changeOrdersData = data || []
      } catch (error) {
        console.error('Error loading change orders for export:', error)
      }
    }
    const rows = [
      ['Job Number', 'Job Name', 'Customer', 'Status', 'Base Contract Value', 'Change Orders Count', 'Total CO Value', 'Total Contract Value'],
      ...filteredProjects.map((project) => {
        const orders = changeOrdersData.filter((order) => order.project_id === project.id)
        const coTotal = orders.reduce((total, order) => total + (order.additional_contract_value || 0), 0)
        const baseContract = project.totalContractValue || 0
        return [
          project.jobNumber,
          project.jobName,
          project.customer,
          project.status || 'Active',
          baseContract.toLocaleString(),
          String(orders.length),
          coTotal.toLocaleString(),
          (baseContract + coTotal).toLocaleString(),
        ]
      }),
    ]
    const csvContent = rows.map((row) => row.map((cell) => `"${cell.toString().replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `projects_summary_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Projects"
        description="Jobs, contract values, and change orders."
        action={
          <>
            {filteredProjects.length > 0 ? <Button type="button" variant="outline" onClick={exportProjectsData}><Download className="h-4 w-4" /> Export CSV</Button> : null}
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
          <p className="pl-6 text-muted-foreground">{project.jobName}</p>
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
  onClose,
  onSave,
}: {
  open: boolean
  editing: ChangeOrder | null
  form: typeof emptyChangeOrder
  setForm: (form: typeof emptyChangeOrder) => void
  saving: boolean
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Sheet>
  )
}
