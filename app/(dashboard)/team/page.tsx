'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useCategories } from '@/contexts/CategoryContext'
import { createClient } from '@/lib/supabase'
import { permissionsForRole, userCan, type PermissionArea, type PermissionLevel, type UserPermissions } from '@/lib/permissions'
import { flattenCategoryTree } from '@/lib/categories'
import { roleLabel } from '@/lib/invites'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { Badge, EmptyState, PageHeader } from '@/components/ui/feedback'
import { confirmAction } from '@/components/ui/confirm-dialog'
import type { User } from '@/types/app.types'

interface InviteRow {
  id: string
  email: string | null
  role: string
  status: string
  invitation_token: string
  expires_at: string
  created_at: string
  invite_type?: string | null
  invited_by?: string | null
}

const AREAS: Array<{ key: PermissionArea; label: string }> = [
  { key: 'invoices', label: 'Invoices' },
  { key: 'projects', label: 'Projects' },
  { key: 'employees', label: 'Employees' },
  { key: 'users', label: 'Team' },
]

export default function TeamPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { projects } = useProjects()
  const { categories, tree, schemaPending } = useCategories()
  const [members, setMembers] = useState<User[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState<'master' | 'entry' | 'view'>('entry')
  const [permissions, setPermissions] = useState<UserPermissions>(() => permissionsForRole('entry', []))
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [link, setLink] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const supabase = createClient()
  const canManage = userCan(user, 'users', 'write')

  const load = useCallback(async () => {
    if (!tenant?.id) return
    setLoading(true)
    const people = await supabase.from('users').select('id, tenant_id, name, email, role, permissions, is_active, last_login, created_at, updated_at').eq('tenant_id', tenant.id).order('name')
    const pending = await supabase.from('user_invitations').select('*').eq('tenant_id', tenant.id).eq('status', 'pending').order('created_at', { ascending: false })
    const assigned = await supabase.from('project_assignments').select('user_id, project_id').eq('tenant_id', tenant.id)
    setMembers((people.data || []) as User[])
    setInvites((pending.error ? [] : pending.data || []) as InviteRow[])
    const map: Record<string, string[]> = {}
    for (const row of assigned.data || []) {
      map[row.user_id] = [...(map[row.user_id] || []), row.project_id]
    }
    setAssignments(map)
    setLoading(false)
  }, [supabase, tenant?.id])

  useEffect(() => {
    void load()
  }, [load])

  const fullUsers = members.filter((member) => member.role !== 'view' && member.is_active !== false).length
  const viewers = members.filter((member) => member.role === 'view' && member.is_active !== false).length
  const rows = useMemo(() => flattenCategoryTree(tree).filter((category) => !category.is_hidden), [tree])

  const applyRole = (next: 'master' | 'entry' | 'view') => {
    setRole(next)
    setPermissions(permissionsForRole(next, categories))
  }

  const send = async (type: 'email' | 'link') => {
    const response = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        emails,
        role,
        permissions,
        projectIds,
        maxUses: maxUses ? Number(maxUses) : null,
        company: tenant?.name,
      }),
    })
    const body = await response.json()
    if (!response.ok) {
      toast.error(body.error || 'Could not create the invite')
      return
    }
    if (type === 'link') {
      setLink(body.link)
      toast.success('Invite link ready')
    } else if (body.emailConfigured) {
      toast.success('Invitation sent')
      setInviteOpen(false)
    } else {
      setLink(body.invitations?.[0]?.link || '')
      toast.message(body.message)
    }
    void load()
  }

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success('Link copied')
  }

  const saveMember = async () => {
    if (!editing || !tenant?.id) return
    const { error } = await supabase.from('users').update({
      role: editing.role,
      permissions: editing.permissions,
      is_active: editing.is_active,
    }).eq('id', editing.id)
    if (error) {
      toast.error(error.message)
      return
    }
    await supabase.from('project_assignments').delete().eq('user_id', editing.id).eq('tenant_id', tenant.id)
    const chosen = assignments[editing.id] || []
    if (chosen.length > 0) {
      const { error: assignError } = await supabase.from('project_assignments').insert(chosen.map((projectId) => ({
        project_id: projectId,
        user_id: editing.id,
        tenant_id: tenant.id,
      })))
      if (assignError) toast.error(assignError.message)
    }
    toast.success('Member updated')
    setEditing(null)
    void load()
  }

  const revoke = async (invite: InviteRow) => {
    const ok = await confirmAction({ title: 'Revoke this invite?', description: 'The link will stop working.', confirmLabel: 'Revoke', destructive: true })
    if (!ok) return
    const response = await fetch(`/api/invitations/${encodeURIComponent(invite.invitation_token)}`, { method: 'DELETE' })
    if (!response.ok) {
      const body = await response.json()
      toast.error(body.error || 'Could not revoke')
      return
    }
    toast.success('Invite revoked')
    void load()
  }

  if (!canManage) return <EmptyState title="Masters manage the team" body="You need Team edit access to invite people or change access." />

  return (
    <div className="space-y-4">
      <PageHeader
        title="Team"
        description={`${fullUsers} full users · ${viewers} viewers`}
        action={
          <>
            <Button variant="outline" type="button" onClick={() => { applyRole('entry'); setLinkOpen(true); setLink('') }} disabled={schemaPending}>Invite link</Button>
            <Button type="button" onClick={() => { applyRole('entry'); setInviteOpen(true); setLink('') }} disabled={schemaPending}>Invite</Button>
          </>
        }
      />
      {schemaPending ? <p className="text-sm text-warning">Invites stay off until the database update is applied.</p> : null}
      {loading ? <div className="h-24 animate-pulse rounded-lg bg-muted" /> : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="responsive-cards w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last sign-in</th>
                <th className="px-3 py-2 text-right font-medium">Projects</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2" data-label="Name">
                    <button type="button" className="text-left" onClick={() => setEditing(member)}>
                      <div className="font-medium">{member.name}</div>
                      <div className="text-xs text-muted-foreground">{member.email}</div>
                    </button>
                  </td>
                  <td className="px-3 py-2" data-label="Role">{roleLabel(member.role)}</td>
                  <td className="px-3 py-2" data-label="Status">
                    <Badge tone={member.is_active === false ? 'warning' : 'success'}>{member.is_active === false ? 'Deactivated' : 'Active'}</Badge>
                  </td>
                  <td className="px-3 py-2" data-label="Last sign-in">{formatDate(member.last_login)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Projects">{assignments[member.id]?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Pending invites</h2>
        {invites.length === 0 ? <p className="text-sm text-muted-foreground">No pending invites.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-2 px-3 py-3 text-sm">
                <span className="font-medium">{invite.invite_type === 'link' || !invite.email ? 'Link' : invite.email}</span>
                <span className="text-muted-foreground">{roleLabel(invite.role)}</span>
                <span className="text-muted-foreground">expires {formatDate(invite.expires_at)}</span>
                <span className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" type="button" onClick={async () => {
                    const response = await fetch(`/api/invitations/${encodeURIComponent(invite.invitation_token)}/send`, { method: 'POST' })
                    const body = await response.json()
                    if (!response.ok) toast.error(body.error || 'Could not resend')
                    else if (body.link) {
                      setLink(body.link)
                      toast.message(body.message || 'Link ready')
                    } else toast.success('Resent')
                  }}>Resend</Button>
                  <Button variant="outline" size="sm" type="button" onClick={() => copy(`${window.location.origin}/join?token=${invite.invitation_token}`)}>Copy link</Button>
                  <Button variant="ghost" size="sm" type="button" onClick={() => revoke(invite)}>Revoke</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {link ? (
          <div className="rounded-lg border border-border bg-accent p-3 text-sm">
            <p>Email isn&apos;t set up yet. Copy this invite link and send it yourself.</p>
            <div className="mt-2 flex gap-2">
              <Input readOnly value={link} />
              <Button type="button" variant="outline" onClick={() => copy(link)}>Copy</Button>
            </div>
          </div>
        ) : null}
      </section>

      <Sheet open={inviteOpen} onOpenChange={setInviteOpen} title="Invite people" description="They get a link to set a password and join this company.">
        <InviteFields
          emails={emails}
          setEmails={setEmails}
          role={role}
          applyRole={applyRole}
          permissions={permissions}
          setPermissions={setPermissions}
          rows={rows}
          projects={projects}
          projectIds={projectIds}
          setProjectIds={setProjectIds}
        />
        <Button className="mt-4" type="button" onClick={() => send('email')}>Send invites</Button>
      </Sheet>

      <Sheet open={linkOpen} onOpenChange={setLinkOpen} title="Invite link" description="Anyone signed in without a company can use this link until it expires or is revoked.">
        <InviteFields
          role={role}
          applyRole={applyRole}
          permissions={permissions}
          setPermissions={setPermissions}
          rows={rows}
          projects={projects}
          projectIds={projectIds}
          setProjectIds={setProjectIds}
          maxUses={maxUses}
          setMaxUses={setMaxUses}
        />
        <Button className="mt-4" type="button" onClick={() => send('link')}>Create link</Button>
      </Sheet>

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)} title={editing ? editing.name : 'Member'} description={editing?.role === 'master' ? 'Masters can do everything. The grid is shown for reference.' : 'Choose what this person can see and change.'}>
        {editing ? (
          <div className="space-y-3">
            <Field label="Role">
              <select className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={editing.role} disabled={editing.role === 'master'} onChange={(event) => {
                const next = event.target.value as User['role']
                setEditing({ ...editing, role: next, permissions: permissionsForRole(next, categories) })
              }}>
                <option value="master">Master</option>
                <option value="entry">Project Manager</option>
                <option value="view">Viewer</option>
              </select>
            </Field>
            <AccessGrid
              disabled={editing.role === 'master'}
              permissions={editing.permissions}
              rows={rows}
              onChange={(next) => setEditing({ ...editing, permissions: next })}
            />
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Assigned projects</legend>
              {projects.map((project) => (
                <label key={project.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={(assignments[editing.id] || []).includes(project.id)}
                    onChange={(event) => {
                      const current = assignments[editing.id] || []
                      setAssignments({
                        ...assignments,
                        [editing.id]: event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id),
                      })
                    }}
                  />
                  {project.jobNumber} — {project.jobName}
                </label>
              ))}
            </fieldset>
            <div className="flex gap-2">
              <Button type="button" onClick={saveMember}>Save</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing({ ...editing, is_active: editing.is_active === false })}
              >
                {editing.is_active === false ? 'Mark for reactivation' : 'Mark for deactivation'}
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}

function InviteFields(props: {
  emails?: string
  setEmails?: (value: string) => void
  role: 'master' | 'entry' | 'view'
  applyRole: (role: 'master' | 'entry' | 'view') => void
  permissions: UserPermissions
  setPermissions: (value: UserPermissions) => void
  rows: ReturnType<typeof flattenCategoryTree>
  projects: Array<{ id: string; jobNumber: string; jobName: string }>
  projectIds: string[]
  setProjectIds: (ids: string[]) => void
  maxUses?: string
  setMaxUses?: (value: string) => void
}) {
  return (
    <div className="space-y-3">
      {props.setEmails ? (
        <Field label="Email addresses" hint="Separate several with commas">
          <Input value={props.emails} onChange={(event) => props.setEmails?.(event.target.value)} />
        </Field>
      ) : null}
      {props.setMaxUses ? (
        <Field label="Maximum uses" hint="Leave blank for no limit">
          <Input inputMode="numeric" value={props.maxUses} onChange={(event) => props.setMaxUses?.(event.target.value)} />
        </Field>
      ) : null}
      <Field label="Role">
        <select className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={props.role} onChange={(event) => props.applyRole(event.target.value as 'master' | 'entry' | 'view')}>
          <option value="entry">Project Manager</option>
          <option value="view">Viewer</option>
          <option value="master">Master</option>
        </select>
      </Field>
      <AccessGrid disabled={props.role === 'master'} permissions={props.permissions} rows={props.rows} onChange={props.setPermissions} />
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Assign projects</legend>
        {props.projects.map((project) => (
          <label key={project.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.projectIds.includes(project.id)}
              onChange={(event) => props.setProjectIds(event.target.checked ? [...props.projectIds, project.id] : props.projectIds.filter((id) => id !== project.id))}
            />
            {project.jobNumber} — {project.jobName}
          </label>
        ))}
      </fieldset>
    </div>
  )
}

function AccessGrid({
  permissions,
  rows,
  onChange,
  disabled,
}: {
  permissions: UserPermissions
  rows: ReturnType<typeof flattenCategoryTree>
  onChange: (value: UserPermissions) => void
  disabled?: boolean
}) {
  const setLevel = (key: string, level: PermissionLevel, category = false) => {
    if (category) {
      onChange({ ...permissions, categories: { ...permissions.categories, [key]: level }, version: 2 })
      return
    }
    onChange({ ...permissions, [key]: level, version: 2 })
  }
  const setExport = (key: string, value: boolean) => {
    onChange({ ...permissions, export: { ...permissions.export, [key]: value }, version: 2 })
  }
  const line = (key: string, label: string, level: PermissionLevel | undefined, category = false) => (
    <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-border py-2 text-sm" style={{ paddingLeft: label.startsWith('  ') ? 12 : 0 }}>
      <span>{label.trim()}</span>
      <span className="flex items-center gap-2">
        <select className="h-9 rounded-lg border border-input bg-card px-2 text-sm" disabled={disabled} value={level || 'none'} onChange={(event) => setLevel(key, event.target.value as PermissionLevel, category)}>
          <option value="none">No access</option>
          <option value="read">View</option>
          <option value="write">Edit</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" disabled={disabled} checked={permissions.export?.[key] !== false && (permissions.export?.[key] === true || level === 'read' || level === 'write')} onChange={(event) => setExport(key, event.target.checked)} />
          Export
        </label>
      </span>
    </div>
  )
  return (
    <div>
      {disabled ? <p className="mb-2 text-xs text-muted-foreground">Masters implicitly have every permission.</p> : null}
      {rows.map((category) => line(category.id, `${category.depth ? '  ' : ''}${category.name}`, permissions.categories?.[category.id] || (category.builtin_key ? permissions[(category.builtin_key === 'cap_leases' ? 'capLeases' : category.builtin_key) as PermissionArea] : 'none'), true))}
      {AREAS.map((area) => line(area.key, area.label, permissions[area.key]))}
    </div>
  )
}
