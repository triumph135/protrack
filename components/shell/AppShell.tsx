'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/contexts/ProjectContext'
import { useCategories } from '@/contexts/CategoryContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { canAccessCategory, userCan } from '@/lib/permissions'
import { flattenCategoryTree } from '@/lib/categories'
import { roleLabel } from '@/lib/invites'
import Logo from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Notice } from '@/components/ui/feedback'
import { cn } from '@/lib/cn'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const { tenant } = useTenant()
  const { projects, activeProject, setActiveProject } = useProjects()
  const { tree, schemaPending, loading } = useCategories()
  const { changeOrderId, setChangeOrderId } = useWorkspace()
  const { changeOrders } = useChangeOrders(activeProject?.id)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const nav = useMemo(() => {
    const items: Array<{ href: string; label: string; depth: number; icon?: 'overview' | 'costs' | 'projects' | 'invoices' | 'employees' | 'team' | 'settings' }> = [
      { href: '/dashboard', label: 'Overview', depth: 0, icon: 'overview' },
    ]
    if (userCan(user, 'projects', 'read')) {
      items.push({ href: '/projects', label: 'Projects', depth: 0, icon: 'projects' })
    }
    const flat = flattenCategoryTree(tree)
    const readable = flat.filter((category) => {
      if (category.is_hidden) return false
      const parent = category.parent_id ? flat.find((item) => item.id === category.parent_id) : null
      return canAccessCategory(user, {
        id: category.id,
        builtinKey: category.builtin_key,
        parentBuiltinKey: parent?.builtin_key ?? null,
      }, 'read')
    })
    if (readable.length > 0) {
      items.push({ href: '/costs', label: 'Costs', depth: 0, icon: 'costs' })
    }
    if (userCan(user, 'invoices', 'read')) {
      items.push({ href: '/invoices', label: 'Invoices', depth: 0, icon: 'invoices' })
    }
    if (userCan(user, 'employees', 'read')) {
      items.push({ href: '/employees', label: 'Employees', depth: 0, icon: 'employees' })
    }
    if (userCan(user, 'users', 'write')) {
      items.push({ href: '/team', label: 'Team', depth: 0, icon: 'team' })
    }
    if (user?.role === 'master') {
      items.push({ href: '/settings', label: 'Settings', depth: 0, icon: 'settings' })
    }
    return items
  }, [tree, user])

  const isActive = (href: string) => {
    const [path, query] = href.split('?')
    if (pathname !== path) return false
    if (!query) return !searchParams.get('category')
    return searchParams.get('category') === new URLSearchParams(query).get('category')
  }

  const signOutNow = async () => {
    await signOut()
    router.push('/login')
  }

  const navList = (
    <nav className="space-y-0.5" aria-label="Main">
      {nav.map((item) => {
        const active = isActive(item.href)
        return (
          <Link
            key={item.href + item.label}
            href={item.href as never}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex min-h-11 items-center rounded-lg px-2 text-sm',
              active ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground hover:bg-muted',
              collapsed && 'justify-center px-0'
            )}
            style={{ paddingLeft: collapsed ? undefined : 8 + item.depth * 12 }}
            title={item.label}
          >
            <NavIcon name={item.icon} />
            {collapsed ? null : <span className="truncate">{item.label}</span>}
          </Link>
        )
      })}
    </nav>
  )

  const activeProjects = projects.filter((project) => project.status === 'Active' || project.id === activeProject?.id)

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className={cn('hidden border-r border-border bg-sidebar md:flex md:flex-col', collapsed ? 'w-16' : 'w-60')}>
        <div className="flex h-14 items-center justify-between px-3">
          {collapsed ? null : (
            <Link href="/dashboard" aria-label="ProTrack home">
              <Logo size="sm" />
            </Link>
          )}
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">{loading ? <div className="h-8 animate-pulse rounded bg-muted" /> : navList}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-border bg-card px-3">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <label className="sr-only" htmlFor="project-switcher">Project</label>
          <select
            id="project-switcher"
            className="h-11 max-w-[16rem] rounded-lg border border-input bg-card px-2 text-sm"
            value={activeProject?.id || ''}
            onChange={(event) => {
              const next = projects.find((project) => project.id === event.target.value)
              if (next) setActiveProject(next)
            }}
          >
            {activeProjects.length === 0 ? <option value="">No project</option> : null}
            {activeProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.jobNumber} — {project.jobName}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="change-order-switcher">Change order</label>
          <select
            id="change-order-switcher"
            className="hidden h-11 max-w-[14rem] rounded-lg border border-input bg-card px-2 text-sm sm:block"
            value={changeOrderId || 'all'}
            onChange={(event) => setChangeOrderId(event.target.value === 'all' ? null : event.target.value)}
          >
            <option value="all">All change orders</option>
            <option value="base">Base contract</option>
            {changeOrders.map((order) => (
              <option key={order.id} value={order.id}>{order.name}</option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(user?.role)} · {tenant?.name}</p>
            </div>
            <ThemeToggle />
            <Button variant="ghost" size="icon" type="button" onClick={signOutNow} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-4">
            {schemaPending ? (
              <Notice>Database update pending. Custom categories, team links, and company settings turn on after the Phase 2 database update. Existing costs still work.</Notice>
            ) : null}
            {children}
          </div>
        </main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} title="Menu" side="left">
        <div className="mb-4">
          <Logo size="sm" />
        </div>
        {navList}
      </Sheet>
    </div>
  )
}

function NavIcon({ name }: { name?: string }) {
  const className = 'mr-2 h-4 w-4 shrink-0 text-muted-foreground'
  if (name === 'overview') return <BarChart3 className={className} />
  if (name === 'costs') return <Layers className={className} />
  if (name === 'projects') return <Building2 className={className} />
  if (name === 'invoices') return <Receipt className={className} />
  if (name === 'employees') return <Users className={className} />
  if (name === 'team') return <Users className={className} />
  if (name === 'settings') return <Settings className={className} />
  if (name === undefined) return <FileText className="mr-2 h-4 w-4 shrink-0 text-muted-foreground opacity-0" />
  return <FileText className={className} />
}
