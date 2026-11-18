'use client'

import { useEffect, useState } from 'react'
import type { Employee } from '@/types/app.types'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'

interface EmployeeModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (employeeData: Omit<Employee, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<void>
  employee?: Employee | null
  loading?: boolean
  projectId?: string
}

export default function EmployeeModal({
  isOpen,
  onClose,
  onSubmit,
  employee,
  loading = false,
  projectId,
}: EmployeeModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    standard_rate: '',
    ot_rate: '',
    dt_rate: '',
    mob: '',
    mob_rate: '',
    project_id: projectId || '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    if (employee) {
      setFormData({
        name: employee.name || '',
        standard_rate: employee.standard_rate?.toString() || '',
        ot_rate: employee.ot_rate?.toString() || '',
        dt_rate: employee.dt_rate?.toString() || '',
        mob: employee.mob?.toString() || '',
        mob_rate: employee.mob_rate?.toString() || '',
        project_id: employee.project_id || '',
      })
    } else {
      setFormData({
        name: '',
        standard_rate: '',
        ot_rate: '',
        dt_rate: '',
        mob: '',
        mob_rate: '',
        project_id: projectId || '',
      })
    }
    setErrors({})
  }, [isOpen, employee, projectId])

  const setField = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validateForm = () => {
    const next: Record<string, string> = {}
    if (!formData.name.trim()) next.name = 'Employee name is required'
    const rate = (value: string, label: string) => {
      if (!value || Number.isNaN(Number(value)) || Number(value) < 0) next[label] = 'Enter a rate of zero or more'
    }
    rate(formData.standard_rate, 'standard_rate')
    rate(formData.ot_rate, 'ot_rate')
    rate(formData.dt_rate, 'dt_rate')
    if (formData.mob && (Number.isNaN(Number(formData.mob)) || Number(formData.mob) < 0)) next.mob = 'MOB value must be a number'
    if (formData.mob_rate && (Number.isNaN(Number(formData.mob_rate)) || Number(formData.mob_rate) < 0)) next.mob_rate = 'MOB rate must be a number'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validateForm()) return
    await onSubmit({
      name: formData.name.trim(),
      standard_rate: Number(formData.standard_rate),
      ot_rate: Number(formData.ot_rate),
      dt_rate: Number(formData.dt_rate),
      mob: formData.mob ? Number(formData.mob) : undefined,
      mob_rate: formData.mob_rate ? Number(formData.mob_rate) : undefined,
      project_id: formData.project_id || undefined,
    })
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose() }}
      title={employee ? 'Edit employee' : 'Add employee'}
      description="Straight time, overtime, and double time rates fill in on labor entries."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name" htmlFor="employee-name" error={errors.name}>
          <Input id="employee-name" value={formData.name} onChange={(event) => setField('name', event.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="ST rate" htmlFor="st-rate" error={errors.standard_rate}>
            <Input id="st-rate" className="tabular" inputMode="decimal" value={formData.standard_rate} onChange={(event) => setField('standard_rate', event.target.value)} />
          </Field>
          <Field label="OT rate" htmlFor="ot-rate" error={errors.ot_rate}>
            <Input id="ot-rate" className="tabular" inputMode="decimal" value={formData.ot_rate} onChange={(event) => setField('ot_rate', event.target.value)} />
          </Field>
          <Field label="DT rate" htmlFor="dt-rate" error={errors.dt_rate}>
            <Input id="dt-rate" className="tabular" inputMode="decimal" value={formData.dt_rate} onChange={(event) => setField('dt_rate', event.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mob quantity" htmlFor="mob" error={errors.mob} hint="Optional">
            <Input id="mob" className="tabular" inputMode="decimal" value={formData.mob} onChange={(event) => setField('mob', event.target.value)} />
          </Field>
          <Field label="Mob rate" htmlFor="mob-rate" error={errors.mob_rate}>
            <Input id="mob-rate" className="tabular" inputMode="decimal" value={formData.mob_rate} onChange={(event) => setField('mob_rate', event.target.value)} />
          </Field>
        </div>
        <Field label="Assignment" htmlFor="assignment" hint="Company-wide people can be used on any project.">
          <select id="assignment" className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={formData.project_id} onChange={(event) => setField('project_id', event.target.value)}>
            <option value="">Company-wide</option>
            {projectId ? <option value={projectId}>Current project only</option> : null}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Saving…' : employee ? 'Save employee' : 'Add employee'}</Button>
        </div>
      </form>
    </Sheet>
  )
}
