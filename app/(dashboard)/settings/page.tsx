'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, GripVertical } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useCategories } from '@/contexts/CategoryContext'
import { createClient } from '@/lib/supabase'
import { readCompanySettings } from '@/lib/company-settings'
import { timeZoneChoices } from '@/lib/reports/date-range'
import { VISIBLE_CATEGORY_LIMIT, type CostCategoryRecord } from '@/lib/categories'
import { LABOR_PRESETS, type LaborFieldDefinition } from '@/lib/labor-fields'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { EmptyState, PageHeader } from '@/components/ui/feedback'
import { confirmAction } from '@/components/ui/confirm-dialog'

type Tab = 'company' | 'categories' | 'labor' | 'access'

export default function SettingsPage() {
  const { user } = useAuth()
  const { tenant, refreshTenant } = useTenant()
  const { categories, laborFields, schemaPending, reload } = useCategories()
  const [tab, setTab] = useState<Tab>('company')
  if (user?.role !== 'master') {
    return <EmptyState title="Masters only" body="Company settings are limited to masters." />
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description={tenant?.name || 'Company'} />
      <div className="flex flex-wrap gap-2">
        {([
          ['company', 'Company'],
          ['categories', 'Cost categories'],
          ['labor', 'Labor'],
          ['access', 'Project access'],
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <Button key={id} type="button" variant={tab === id ? 'primary' : 'outline'} onClick={() => setTab(id)}>{label}</Button>
        ))}
      </div>
      {schemaPending && tab !== 'company' ? (
        <EmptyState title="Database update pending" body="These settings turn on after the Phase 2 database update. Nothing here creates tables on its own." />
      ) : null}
      {tab === 'company' && tenant ? <CompanyForm tenant={tenant} refresh={refreshTenant} /> : null}
      {tab === 'categories' && !schemaPending ? <Categories categories={categories} reload={reload} tenantId={tenant?.id || ''} /> : null}
      {tab === 'labor' && !schemaPending && tenant ? <Labor fields={laborFields} tenantId={tenant.id} settings={readCompanySettings(tenant.settings)} reload={async () => { await reload(); await refreshTenant() }} /> : null}
      {tab === 'access' && !schemaPending && tenant ? <Access tenantId={tenant.id} settings={readCompanySettings(tenant.settings)} refresh={refreshTenant} /> : null}
    </div>
  )
}

function CompanyForm({ tenant, refresh }: { tenant: { id: string; name: string; email: string; phone: string | null; settings?: Record<string, unknown> | null }; refresh: () => Promise<void> }) {
  const current = readCompanySettings(tenant.settings)
  const [name, setName] = useState(tenant.name)
  const [email, setEmail] = useState(tenant.email)
  const [phone, setPhone] = useState(tenant.phone || '')
  const [goal, setGoal] = useState(current.gp_goal_percent == null ? '' : String(current.gp_goal_percent))
  const [lockDate, setLockDate] = useState(current.books_lock_date || '')
  const [timezone, setTimezone] = useState(current.timezone)
  const supabase = createClient()
  return (
    <form className="max-w-md space-y-3" onSubmit={async (event) => {
      event.preventDefault()
      const parsedGoal = goal.trim() === '' ? null : Number(goal)
      if (parsedGoal != null && (!Number.isFinite(parsedGoal) || parsedGoal < 0 || parsedGoal > 100)) {
        toast.error('Gross profit goal must be between 0 and 100')
        return
      }
      const { error } = await supabase.from('tenants').update({
        name,
        email,
        phone,
        settings: { ...(tenant.settings || {}), gp_goal_percent: parsedGoal, books_lock_date: lockDate || null, timezone },
      }).eq('id', tenant.id)
      if (error) toast.error(error.message)
      else {
        toast.success('Company saved')
        await refresh()
      }
    }}>
      <Field label="Company name" htmlFor="company-name"><Input id="company-name" value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      <Field label="Email" htmlFor="company-email"><Input id="company-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
      <Field label="Phone" htmlFor="company-phone"><Input id="company-phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
      <Field label="Gross profit goal (%)" htmlFor="company-goal" hint="Shown on the project overview next to the actual gross profit percent.">
        <Input id="company-goal" inputMode="decimal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="20" />
      </Field>
      <Field label="Books lock date" htmlFor="books-lock" hint="Costs dated on or before this day, and invoices billed on or before it, can only be corrected with a reversal or credit memo. Leave blank to keep every date open.">
        <Input id="books-lock" type="date" value={lockDate} onChange={(event) => setLockDate(event.target.value)} />
      </Field>
      <Field label="Company timezone" htmlFor="company-timezone" hint="Report date ranges and scheduled send times use this zone.">
        <select id="company-timezone" className="h-11 w-full rounded-lg border border-input bg-card px-2 text-sm" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
          {timeZoneChoices().map((zone) => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
        </select>
      </Field>
      <Button type="submit">Save company</Button>
    </form>
  )
}

function Categories({ categories, reload, tenantId }: { categories: CostCategoryRecord[]; reload: () => Promise<void>; tenantId: string }) {
  const supabase = createClient()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'standard' | 'named' | 'labor'>('standard')
  const [parentId, setParentId] = useState('')
  const [gl, setGl] = useState('')
  const visible = categories.filter((category) => !category.is_hidden).length
  const parents = categories.filter((category) => !category.parent_id)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const ids = useMemo(() => categories.filter((category) => !category.parent_id).map((category) => category.id), [categories])

  const onDragEnd = async (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const order = arrayMove(ids, ids.indexOf(String(event.active.id)), ids.indexOf(String(event.over.id)))
    await Promise.all(order.map((id, index) => supabase.from('cost_categories').update({ sort_order: (index + 1) * 10 }).eq('id', id)))
    await reload()
  }

  const add = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const sibling = categories.filter((category) => (category.parent_id || '') === parentId)
    if (sibling.some((category) => category.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('A category with that name already exists here')
      return
    }
    const parent = categories.find((category) => category.id === parentId)
    const { error } = await supabase.from('cost_categories').insert({
      tenant_id: tenantId,
      name: trimmed,
      kind: parent ? parent.kind : kind,
      parent_id: parentId || null,
      gl_code: gl || null,
      is_builtin: false,
      sort_order: (sibling.length + 1) * 10,
    })
    if (error) toast.error(error.message)
    else {
      setName('')
      toast.success('Category added. Grant access to project managers from Team.')
      await reload()
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{visible} of {VISIBLE_CATEGORY_LIMIT} used. Parents and children both count. Hidden categories do not. A child rolls into its parent on Costs and Overview.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {parents.map((category) => (
              <CategoryRow key={category.id} category={category} nested={categories.filter((item) => item.parent_id === category.id)} reload={reload} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2">
        <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Type">
          <select className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={kind} disabled={!!parentId} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="standard">Standard</option>
            <option value="named">Named</option>
            <option value="labor">Labor</option>
          </select>
        </Field>
        <Field label="Parent" hint="Leave this empty for a top-level category such as Materials. Pick a parent for Lumber or Concrete.">
          <select className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">None</option>
            {parents.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
        <Field label="GL code"><Input value={gl} onChange={(event) => setGl(event.target.value)} /></Field>
        <Button type="button" onClick={add}>Add category</Button>
      </div>
    </div>
  )
}

function CategoryRow({ category, nested, reload }: { category: CostCategoryRecord; nested: CostCategoryRecord[]; reload: () => Promise<void> }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: category.id })
  const [name, setName] = useState(category.name)
  const supabase = createClient()
  const style = { transform: CSS.Transform.toString(transform), transition }
  const saveName = async () => {
    if (name.trim().toLowerCase() === category.name.toLowerCase()) return
    const { error } = await supabase.from('cost_categories').update({ name: name.trim() }).eq('id', category.id)
    if (error) toast.error(error.message)
    else await reload()
  }
  const hide = async (hidden: boolean) => {
    const { error } = await supabase.from('cost_categories').update({ is_hidden: hidden }).eq('id', category.id)
    if (error) toast.error(error.message)
    else await reload()
  }
  const remove = async () => {
    const ok = await confirmAction({ title: `Delete ${category.name}?`, description: 'Built-ins and categories with entries can only be hidden.', confirmLabel: 'Delete', destructive: true })
    if (!ok) return
    const { error } = await supabase.from('cost_categories').delete().eq('id', category.id)
    if (error) toast.error(error.message.includes('builtin') ? 'Built-in categories can be hidden, not deleted.' : error.message)
    else await reload()
  }
  return (
    <li ref={setNodeRef} style={style} className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="inline-flex h-11 w-8 items-center justify-center" aria-label={`Reorder ${category.name}`} {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <Input className="max-w-xs" value={name} aria-label={`Rename ${category.name}`} onChange={(event) => setName(event.target.value)} onBlur={saveName} />
        <span className="text-xs text-muted-foreground">{category.kind}{category.is_hidden ? ' · hidden' : ''}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => hide(!category.is_hidden)}>{category.is_hidden ? 'Unhide' : 'Hide'}</Button>
        {!category.is_builtin ? <Button type="button" variant="ghost" size="sm" onClick={remove}>Delete</Button> : null}
      </div>
      {nested.length > 0 ? (
        <ul className="mt-2 space-y-2 border-l border-border pl-4">
          {nested.map((child) => (
            <li key={child.id} className="flex flex-wrap items-center gap-2">
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              <ChildRow category={child} reload={reload} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function ChildRow({ category, reload }: { category: CostCategoryRecord; reload: () => Promise<void> }) {
  const [name, setName] = useState(category.name)
  const supabase = createClient()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="max-w-xs" value={name} aria-label={`Rename ${category.name}`} onChange={(event) => setName(event.target.value)} onBlur={async () => {
        if (name.trim() === category.name) return
        const { error } = await supabase.from('cost_categories').update({ name: name.trim() }).eq('id', category.id)
        if (error) toast.error(error.message)
        else await reload()
      }} />
      <span className="text-xs text-muted-foreground">{category.is_hidden ? 'hidden' : 'child'}</span>
      <Button type="button" variant="outline" size="sm" onClick={async () => {
        const { error } = await supabase.from('cost_categories').update({ is_hidden: !category.is_hidden }).eq('id', category.id)
        if (error) toast.error(error.message)
        else await reload()
      }}>{category.is_hidden ? 'Unhide' : 'Hide'}</Button>
    </div>
  )
}

function Labor({
  fields,
  tenantId,
  settings,
  reload,
}: {
  fields: LaborFieldDefinition[]
  tenantId: string
  settings: { labor_split_enabled: boolean }
  reload: () => Promise<void>
}) {
  const supabase = createClient()
  const [label, setLabel] = useState('')
  const [type, setType] = useState<'text' | 'number' | 'select' | 'boolean'>('text')
  const [choices, setChoices] = useState('')
  const enabled = fields.filter((field) => field.is_enabled).length

  const togglePreset = async (preset: typeof LABOR_PRESETS[number]) => {
    const existing = fields.find((field) => field.preset_key === preset.preset_key)
    if (!existing) {
      toast.error('Presets appear after the database update')
      return
    }
    const { error } = await supabase.from('labor_field_definitions').update({ is_enabled: !existing.is_enabled }).eq('id', existing.id)
    if (error) toast.error(error.message)
    else await reload()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-sm font-medium">Direct and indirect labor</p>
        <p className="mt-1 text-sm text-muted-foreground">Off by default. Turning it on adds Direct Labor and Indirect Labor under Labor. Existing entries stay on Labor.</p>
        <Button className="mt-3" type="button" variant="outline" onClick={async () => {
          const { error } = await supabase.rpc('set_labor_split', { p_enabled: !settings.labor_split_enabled })
          if (error) toast.error(error.message)
          else {
            toast.success(settings.labor_split_enabled ? 'Labor split turned off' : 'Labor split turned on')
            await reload()
          }
        }}>{settings.labor_split_enabled ? 'Turn off' : 'Turn on'}</Button>
      </div>
      <p className="text-sm text-muted-foreground">{enabled} of 5 labor fields enabled.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {LABOR_PRESETS.map((preset) => {
          const existing = fields.find((field) => field.preset_key === preset.preset_key)
          return (
            <button key={preset.preset_key} type="button" className="rounded-lg border border-border bg-card px-3 py-3 text-left" onClick={() => togglePreset(preset)}>
              <div className="text-sm font-medium">{preset.label}</div>
              <div className="text-xs text-muted-foreground">{existing?.is_enabled ? 'On' : 'Off'}</div>
            </button>
          )
        })}
      </div>
      <form className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2" onSubmit={async (event) => {
        event.preventDefault()
        const { error } = await supabase.from('labor_field_definitions').insert({
          tenant_id: tenantId,
          label,
          field_type: type,
          options: type === 'select' ? choices.split(',').map((item) => item.trim()).filter(Boolean) : [],
          is_enabled: true,
          sort_order: (fields.length + 1) * 10,
        })
        if (error) toast.error(error.message)
        else {
          setLabel('')
          toast.success('Field added')
          await reload()
        }
      }}>
        <Field label="Custom field label"><Input value={label} onChange={(event) => setLabel(event.target.value)} required /></Field>
        <Field label="Type">
          <select className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="select">Choices</option>
            <option value="boolean">Yes / no</option>
          </select>
        </Field>
        {type === 'select' ? <Field label="Choices" hint="Comma separated"><Input value={choices} onChange={(event) => setChoices(event.target.value)} /></Field> : null}
        <Button type="submit">Add custom field</Button>
      </form>
    </div>
  )
}

function Access({
  tenantId,
  settings,
  refresh,
}: {
  tenantId: string
  settings: { project_visibility: 'all' | 'assigned' }
  refresh: () => Promise<void>
}) {
  const supabase = createClient()
  const { tenant } = useTenant()
  const save = async (value: 'all' | 'assigned') => {
    const next = { ...(tenant?.settings || {}), project_visibility: value }
    const { error } = await supabase.from('tenants').update({ settings: next }).eq('id', tenantId)
    if (error) toast.error(error.message)
    else {
      toast.success('Project access updated')
      await refresh()
    }
  }
  return (
    <fieldset className="space-y-2 rounded-lg border border-border bg-card p-4">
      <legend className="px-1 text-sm font-medium">Project Managers and Viewers can see</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="visibility" checked={settings.project_visibility === 'all'} onChange={() => save('all')} />
        All projects
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="visibility" checked={settings.project_visibility === 'assigned'} onChange={() => save('assigned')} />
        Only projects assigned to them
      </label>
    </fieldset>
  )
}
