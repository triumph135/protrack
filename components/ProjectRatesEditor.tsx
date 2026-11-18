'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/feedback'
import { isMissingRelation } from '@/lib/security'
import { formatCurrency } from '@/lib/format'

interface RateRow {
  id: string
  project_id: string
  effective_date: string
  standard_rate: number
  ot_rate: number
  dt_rate: number
  mob_rate: number | null
}

interface ProjectOption {
  id: string
  jobNumber: string
  jobName: string
}

const EMPTY = { project_id: '', effective_date: '', standard_rate: '', ot_rate: '', dt_rate: '', mob_rate: '' }

export function ProjectRatesEditor({
  employeeId,
  tenantId,
  projects,
  previewRows,
}: {
  employeeId: string
  tenantId: string
  projects: ProjectOption[]
  previewRows?: RateRow[]
}) {
  const [rows, setRows] = useState<RateRow[]>(previewRows || [])
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const supabase = createClient()
    const { data, error: loadError } = await supabase
      .from('employee_project_rates')
      .select('id, project_id, effective_date, standard_rate, ot_rate, dt_rate, mob_rate')
      .eq('employee_id', employeeId)
      .order('effective_date', { ascending: false })
    if (loadError) {
      if (isMissingRelation(loadError)) setPending(true)
      else setError(loadError.message)
      return
    }
    setRows((data || []) as RateRow[])
  }

  useEffect(() => {
    if (previewRows) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId])

  const add = async () => {
    const standard = Number(draft.standard_rate)
    const ot = Number(draft.ot_rate)
    const dt = Number(draft.dt_rate)
    if (!draft.project_id || !draft.effective_date || [standard, ot, dt].some((value) => !Number.isFinite(value) || value < 0)) {
      setError('Choose a project, an effective date, and rates of zero or more.')
      return
    }
    const supabase = createClient()
    const { error: insertError } = await supabase.from('employee_project_rates').insert({
      employee_id: employeeId,
      project_id: draft.project_id,
      tenant_id: tenantId,
      effective_date: draft.effective_date,
      standard_rate: standard,
      ot_rate: ot,
      dt_rate: dt,
      mob_rate: draft.mob_rate === '' ? null : Number(draft.mob_rate),
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setDraft(EMPTY)
    setError(null)
    await load()
  }

  const remove = async (id: string) => {
    const supabase = createClient()
    const { error: deleteError } = await supabase.from('employee_project_rates').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else await load()
  }

  if (pending) {
    return <Notice>Database update pending. Project rates turn on after the Phase 2b database update.</Notice>
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">Project rates</p>
        <p className="text-sm text-muted-foreground">Used for labor dated on or after this date on that project. Existing entries keep the rates they were saved with.</p>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No project rates yet. The employee card rates are used.</p> : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const project = projects.find((item) => item.id === row.project_id)
            return (
              <li key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <div>
                  <p className="text-foreground">{project ? `${project.jobNumber} · ${project.jobName}` : 'Project'}</p>
                  <p className="text-muted-foreground">
                    Effective {row.effective_date} · ST {formatCurrency(Number(row.standard_rate))} · OT {formatCurrency(Number(row.ot_rate))} · DT {formatCurrency(Number(row.dt_rate))}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => void remove(row.id)}>Remove</Button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project">
          <select className="flex h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={draft.project_id} onChange={(event) => setDraft({ ...draft, project_id: event.target.value })}>
            <option value="">Choose a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.jobNumber} · {project.jobName}</option>
            ))}
          </select>
        </Field>
        <Field label="Effective date">
          <Input type="date" value={draft.effective_date} onChange={(event) => setDraft({ ...draft, effective_date: event.target.value })} />
        </Field>
        <Field label="ST rate"><Input type="number" min="0" step="0.01" value={draft.standard_rate} onChange={(event) => setDraft({ ...draft, standard_rate: event.target.value })} /></Field>
        <Field label="OT rate"><Input type="number" min="0" step="0.01" value={draft.ot_rate} onChange={(event) => setDraft({ ...draft, ot_rate: event.target.value })} /></Field>
        <Field label="DT rate"><Input type="number" min="0" step="0.01" value={draft.dt_rate} onChange={(event) => setDraft({ ...draft, dt_rate: event.target.value })} /></Field>
        <Field label="Mob rate"><Input type="number" min="0" step="0.01" value={draft.mob_rate} onChange={(event) => setDraft({ ...draft, mob_rate: event.target.value })} /></Field>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" variant="outline" onClick={() => void add()}>Add project rate</Button>
    </div>
  )
}
