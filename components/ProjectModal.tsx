'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEmployees } from '@/hooks/useEmployees'
import EmployeeModal from '@/components/EmployeeModal'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import type { Employee, Project } from '@/types/app.types'
import { formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/feedback'
import { Sheet } from '@/components/ui/sheet'

interface ProjectModalProps {
  open: boolean
  project?: Project | null
  onSave: (projectData: Omit<Project, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
}

export default function ProjectModal({ project, onSave, onCancel, open }: ProjectModalProps) {
  const [formData, setFormData] = useState({
    jobNumber: '',
    jobName: '',
    customer: '',
    fieldShopBoth: 'Field',
    totalContractValue: 0,
    status: 'Active',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'project' | 'employees'>('project')
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [employeeLoading, setEmployeeLoading] = useState(false)
  const { employees, loading: employeesLoading, createEmployee, updateEmployee, deleteEmployee } = useEmployees(project?.id)

  useEffect(() => {
    if (!open) return
    setActiveTab('project')
    if (project) {
      setFormData({
        jobNumber: project.jobNumber || '',
        jobName: project.jobName || '',
        customer: project.customer || '',
        fieldShopBoth: project.fieldShopBoth || 'Field',
        totalContractValue: project.totalContractValue || 0,
        status: project.status || 'Active',
      })
    } else {
      setFormData({
        jobNumber: '',
        jobName: '',
        customer: '',
        fieldShopBoth: 'Field',
        totalContractValue: 0,
        status: 'Active',
      })
    }
    setErrors({})
  }, [project, open])

  const handleInputChange = (field: keyof typeof formData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!formData.jobNumber.trim()) next.jobNumber = 'Job number is required'
    if (!formData.jobName.trim()) next.jobName = 'Project name is required'
    if (!formData.customer.trim()) next.customer = 'Customer is required'
    if (formData.totalContractValue < 0) next.totalContractValue = 'Contract value cannot be negative'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    try {
      setLoading(true)
      await onSave(formData)
    } catch (error) {
      console.error('Error saving project:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteEmployee = async (employee: Employee) => {
    const confirmed = await confirmAction({
      title: `Delete ${employee.name}?`,
      description: 'This removes the employee from the company.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deleteEmployee(employee.id)
    } catch (error) {
      console.error('Error deleting employee:', error)
      toast.error('Error deleting employee. Please try again.')
    }
  }

  const handleCreateEmployee = async (employeeData: Omit<Employee, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    try {
      setEmployeeLoading(true)
      if (editingEmployee) await updateEmployee(editingEmployee.id, employeeData)
      else await createEmployee({ ...employeeData, project_id: project?.id || undefined })
      setShowEmployeeModal(false)
      setEditingEmployee(null)
    } finally {
      setEmployeeLoading(false)
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => { if (!next) onCancel() }}
        title={project ? 'Edit project' : 'New project'}
        description="Job number, customer, and the base contract value."
      >
        <div className="mb-4 flex gap-2 border-b border-border">
          <button type="button" className={`min-h-11 border-b-2 px-2 text-sm ${activeTab === 'project' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`} onClick={() => setActiveTab('project')}>Details</button>
          <button type="button" className={`min-h-11 border-b-2 px-2 text-sm ${activeTab === 'employees' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`} onClick={() => setActiveTab('employees')}>Employees ({employees.length})</button>
        </div>
        {activeTab === 'project' ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Job number" htmlFor="job-number" error={errors.jobNumber}>
              <Input id="job-number" value={formData.jobNumber} onChange={(event) => handleInputChange('jobNumber', event.target.value)} />
            </Field>
            <Field label="Project name" htmlFor="job-name" error={errors.jobName}>
              <Input id="job-name" value={formData.jobName} onChange={(event) => handleInputChange('jobName', event.target.value)} />
            </Field>
            <Field label="Customer" htmlFor="customer" error={errors.customer}>
              <Input id="customer" value={formData.customer} onChange={(event) => handleInputChange('customer', event.target.value)} />
            </Field>
            <Field label="Project type" htmlFor="project-type">
              <select id="project-type" className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={formData.fieldShopBoth} onChange={(event) => handleInputChange('fieldShopBoth', event.target.value)}>
                <option value="Field">Field</option>
                <option value="Shop">Shop</option>
                <option value="Both">Both</option>
              </select>
            </Field>
            <Field label="Contract value" htmlFor="contract-value" error={errors.totalContractValue}>
              <Input id="contract-value" className="tabular" inputMode="decimal" value={formData.totalContractValue} onChange={(event) => handleInputChange('totalContractValue', parseFloat(event.target.value) || 0)} />
            </Field>
            <Field label="Status" htmlFor="project-status">
              <select id="project-status" className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={formData.status} onChange={(event) => handleInputChange('status', event.target.value)}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving…' : project ? 'Save project' : 'Create project'}</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button type="button" onClick={() => { setEditingEmployee(null); setShowEmployeeModal(true) }}><Plus className="h-4 w-4" /> Add employee</Button>
            </div>
            {employeesLoading ? <p className="text-sm text-muted-foreground">Loading employees…</p> : employees.length === 0 ? (
              <EmptyState title="No employees" body="Add people here so labor entries on this job can use their rates." />
            ) : (
              <ul className="space-y-2">
                {employees.map((employee) => (
                  <li key={employee.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                    <div>
                      <p className="font-medium">{employee.name}</p>
                      <p className="text-sm text-muted-foreground tabular">
                        ST {formatCurrency(employee.standard_rate)} · OT {formatCurrency(employee.ot_rate)} · DT {formatCurrency(employee.dt_rate)}
                      </p>
                    </div>
                    <div>
                      <Button variant="ghost" size="icon" type="button" aria-label={`Edit ${employee.name}`} onClick={() => { setEditingEmployee(employee); setShowEmployeeModal(true) }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" type="button" aria-label={`Delete ${employee.name}`} onClick={() => handleDeleteEmployee(employee)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>
      <EmployeeModal
        isOpen={showEmployeeModal}
        onClose={() => { setShowEmployeeModal(false); setEditingEmployee(null) }}
        onSubmit={handleCreateEmployee}
        employee={editingEmployee}
        loading={employeeLoading}
        projectId={project?.id}
      />
    </>
  )
}
