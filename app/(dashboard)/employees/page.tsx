'use client'

import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useEmployees } from '@/hooks/useEmployees'
import EmployeeModal from '@/components/EmployeeModal'
import { confirmAction } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { userCan } from '@/lib/permissions'
import { employeeScopeLabel } from '@/lib/employee-scope'
import { formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/feedback'
import type { Employee } from '@/types/app.types'

export default function EmployeesPage() {
  const { user } = useAuth()
  const { activeProject, projects } = useProjects()
  const { employees, loading, createEmployee, updateEmployee, deleteEmployee } = useEmployees()
  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [projectFilter, setProjectFilter] = useState<'all' | 'global' | 'project'>('all')

  const canRead = userCan(user, 'employees', 'read')
  const canWrite = userCan(user, 'employees', 'write')

  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch = searchTerm === '' || employee.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesProject = projectFilter === 'all'
      || (projectFilter === 'global' && !employee.project_id)
      || (projectFilter === 'project' && employee.project_id === activeProject?.id)
    return matchesSearch && matchesProject
  })

  const handleDeleteEmployee = async (employeeId: string) => {
    const employee = employees.find((item) => item.id === employeeId)
    if (!employee) return
    const confirmed = await confirmAction({
      title: `Delete ${employee.name}?`,
      description: 'This removes the employee from the company.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    try {
      await deleteEmployee(employeeId)
      toast.success('Employee deleted')
    } catch (error) {
      console.error('Error deleting employee:', error)
      toast.error('Error deleting employee. Please try again.')
    }
  }

  const handleSubmitEmployee = async (employeeData: Omit<Employee, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    if (editingEmployee) await updateEmployee(editingEmployee.id, employeeData)
    else await createEmployee(employeeData)
    setShowModal(false)
    setEditingEmployee(null)
    toast.success(editingEmployee ? 'Employee updated' : 'Employee added')
  }

  if (!canRead) {
    return <EmptyState title="No access" body="You don't have permission to view employees." />
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Employees"
        description="Rates used when someone enters labor."
        action={canWrite ? <Button type="button" onClick={() => { setEditingEmployee(null); setShowModal(true) }}><Plus className="h-4 w-4" /> Add employee</Button> : null}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total" value={String(employees.length)} />
        <Stat label="Global" value={String(employees.filter((employee) => !employee.project_id).length)} />
        <Stat label="This project" value={String(employees.filter((employee) => employee.project_id === activeProject?.id).length)} />
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input className="flex-1" placeholder="Search employees" aria-label="Search employees" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
        <select
          className="h-11 rounded-lg border border-input bg-card px-3 text-sm sm:w-56"
          aria-label="Filter employees"
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value as 'all' | 'global' | 'project')}
        >
          <option value="all">All employees</option>
          <option value="global">Global only</option>
          <option value="project">Current project only</option>
        </select>
      </div>

      {loading ? <Skeleton className="h-40" /> : filteredEmployees.length === 0 ? (
        <EmptyState
          title={searchTerm || projectFilter !== 'all' ? 'No employees match' : 'No employees yet'}
          body={searchTerm || projectFilter !== 'all' ? 'Try a different name or filter.' : 'Add the first person so labor entries can use their rates.'}
          action={canWrite && !searchTerm && projectFilter === 'all' ? <Button type="button" onClick={() => setShowModal(true)}>Add employee</Button> : null}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="responsive-cards w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">ST</th>
                <th className="px-3 py-2 text-right font-medium">OT</th>
                <th className="px-3 py-2 text-right font-medium">DT</th>
                <th className="px-3 py-2 text-right font-medium">Mob</th>
                <th className="px-3 py-2 font-medium">Scope</th>
                {canWrite ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium" data-label="Name">{employee.name}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="ST">{formatCurrency(employee.standard_rate)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="OT">{formatCurrency(employee.ot_rate)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="DT">{formatCurrency(employee.dt_rate)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Mob">{employee.mob_rate ? formatCurrency(employee.mob_rate) : '—'}</td>
                  <td className="px-3 py-2" data-label="Scope">
                    <Badge tone={employee.project_id ? 'neutral' : 'success'}>{employeeScopeLabel(employee.project_id, projects)}</Badge>
                  </td>
                  {canWrite ? (
                    <td className="px-3 py-2 text-right" data-label="Actions">
                      <Button variant="ghost" size="icon" type="button" aria-label={`Edit ${employee.name}`} onClick={() => { setEditingEmployee(employee); setShowModal(true) }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" type="button" aria-label={`Delete ${employee.name}`} onClick={() => handleDeleteEmployee(employee.id)}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EmployeeModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingEmployee(null) }}
        onSubmit={handleSubmitEmployee}
        employee={editingEmployee}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
    </div>
  )
}
