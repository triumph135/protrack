'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  BarChart3,
  Building2,
  ChevronDown,
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
import { COST_NAV_STORAGE_KEY, defaultCostNavState, readCostNavState, revealCostNav, toggleCostNav, type CostNavState } from '@/lib/cost-nav'
import { roleLabel } from '@/lib/invites'
import Logo from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Notice } from '@/components/ui/feedback'
import { cn } from '@/lib/cn'
import { showsJobSelectors } from '@/lib/shell-scope'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const { tenant } = useTenant()
  const { projects, activeProject, setActiveProject } = useProjects()
  const { tree, schemaPending, correctionsPending, loading } = useCategories()
  const { changeOrderId, setChangeOrderId } = useWorkspace()
  const { changeOrders } = useChangeOrders(activeProject?.id)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [navState, setNavState] = useState<CostNavState>(defaultCostNavState())
  const [navReady, setNavReady] = useState(false)

  const flat = useMemo(() => flattenCategoryTree(tree), [tree])
  const readableIds = useMemo(() => {
    const allowed = new Set<string>()
    for (const category of flat) {
      if (category.is_hidden) continue
      const parent = category.parent_id ? flat.find((item) => item.id === category.parent_id) : null
      if (canAccessCategory(user, {
        id: category.id,
        builtinKey: category.builtin_key,
        parentBuiltinKey: parent?.builtin_key ?? null,
      }, 'read')) allowed.add(category.id)
    }
    return allowed
  }, [flat, user])

  const costNodes = useMemo(() => {
    const top: Array<{ id: string; name: string; children: Array<{ id: string; name: string }> }> = []
    for (const node of tree) {
      const children = node.children.filter((child) => readableIds.has(child.id)).map((child) => ({ id: child.id, name: child.name }))
      if (readableIds.has(node.id)) top.push({ id: node.id, name: node.name, children })
      else {
        for (const child of children) top.push({ id: child.id, name: child.name, children: [] })
      }
    }
    return top
  }, [tree, readableIds])

  const activeCategoryId = pathname === '/costs' ? searchParams.get('category') : null

  useEffect(() => {
    try {
      setNavState(readCostNavState(localStorage.getItem(COST_NAV_STORAGE_KEY)))
    } catch {
      setNavState(defaultCostNavState())
    }
    setNavReady(true)
  }, [])

  useEffect(() => {
    if (!navReady || !activeCategoryId || activeCategoryId === 'uncategorized') return
    const category = flat.find((item) => item.id === activeCategoryId)
    const ancestors = category?.parent_id ? [category.parent_id] : []
    setNavState((current) => {
      const next = revealCostNav(current, ancestors)
      if (next.costsOpen === current.costsOpen && next.openIds.join('|') === current.openIds.join('|')) return current
      try {
        localStorage.setItem(COST_NAV_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // The tree still opens for this visit.
      }
      return next
    })
  }, [navReady, activeCategoryId, flat])

  const persistNav = (next: CostNavState) => {
    setNavState(next)
    try {
      localStorage.setItem(COST_NAV_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // The click still toggles until reload.
    }
  }

  const linksBefore = [
    { href: '/dashboard', label: 'Overview', icon: 'overview' as const },
    ...(userCan(user, 'projects', 'read') ? [{ href: '/projects', label: 'Projects', icon: 'projects' as const }] : []),
  ]
  const linksAfter = [
    ...(userCan(user, 'invoices', 'read') ? [{ href: '/invoices', label: 'Invoices', icon: 'invoices' as const }] : []),
    ...(user?.tenant_id ? [{ href: '/reports', label: 'Reports', icon: 'reports' as const }] : []),
    ...(userCan(user, 'employees', 'read') ? [{ href: '/employees', label: 'Employees', icon: 'employees' as const }] : []),
    ...(userCan(user, 'users', 'write') ? [{ href: '/team', label: 'Team', icon: 'team' as const }] : []),
    ...(user?.role === 'master' ? [{ href: '/settings', label: 'Settings', icon: 'settings' as const }] : []),
  ]

  const signOutNow = async () => {
    await signOut()
    router.push('/login')
  }

  const go = () => setMobileOpen(false)
  const itemClass = (active: boolean, nested = false) => cn(
    'flex min-h-11 min-w-0 flex-1 items-center rounded-lg px-2',
    nested ? 'text-[13px]' : 'text-sm',
    active
      ? 'bg-accent font-medium text-accent-foreground'
      : nested
        ? 'font-normal text-muted-foreground hover:bg-muted hover:text-foreground'
        : 'text-foreground hover:bg-muted',
  )
  const navList = (rail: boolean) => (
    <nav className="space-y-0.5" aria-label="Main">
      {linksBefore.map((item) => (
        <Link key={item.href} href={item.href as never} onClick={go} title={item.label} className={cn(itemClass(pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))), rail && 'justify-center px-0')}>
          <NavIcon name={item.icon} />
          {rail ? null : <span className="truncate">{item.label}</span>}
        </Link>
      ))}
      {costNodes.length > 0 ? (
        <div>
          <div className="flex items-center">
            {rail ? null : (
              <button
                type="button"
                className="inline-flex h-11 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
                aria-expanded={navState.costsOpen}
                aria-label={navState.costsOpen ? 'Collapse costs' : 'Expand costs'}
                onClick={() => persistNav(toggleCostNav(navState, 'costs'))}
              >
                {navState.costsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
            <Link href="/costs" onClick={go} title="Costs" className={cn(itemClass(pathname === '/costs' && !activeCategoryId), rail && 'justify-center px-0')}>
              <NavIcon name="costs" />
              {rail ? null : <span className="truncate">Costs</span>}
            </Link>
          </div>
          {navState.costsOpen && !rail ? costNodes.map((node) => {
            const open = navState.openIds.includes(node.id)
            return (
              <div key={node.id}>
                <div className="flex items-center pl-2">
                  {node.children.length > 0 ? (
                    <button
                      type="button"
                      className="inline-flex h-11 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
                      aria-expanded={open}
                      aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
                      onClick={() => persistNav(toggleCostNav(navState, node.id))}
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  ) : <span className="w-8 shrink-0" aria-hidden />}
                  <Link href={`/costs?category=${node.id}` as never} onClick={go} title={node.name} className={itemClass(activeCategoryId === node.id)}>
                    <span className="truncate">{node.name}</span>
                  </Link>
                </div>
                {open && node.children.length > 0 ? (
                  <div className="ml-12 border-l border-muted-foreground/45">
                    {node.children.map((child) => (
                      <div key={child.id} className="relative flex items-center">
                        <span aria-hidden className="absolute left-0 top-1/2 h-px w-3 bg-muted-foreground/45" />
                        <Link
                          href={`/costs?category=${child.id}` as never}
                          onClick={go}
                          title={child.name}
                          className={cn(itemClass(activeCategoryId === child.id, true), 'ml-3')}
                        >
                          <span className="truncate">{child.name}</span>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          }) : null}
        </div>
      ) : null}
      {linksAfter.map((item) => (
        <Link key={item.href} href={item.href as never} onClick={go} title={item.label} className={cn(itemClass(pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))), rail && 'justify-center px-0')}>
          <NavIcon name={item.icon} />
          {rail ? null : <span className="truncate">{item.label}</span>}
        </Link>
      ))}
    </nav>
  )

  const activeProjects = projects.filter((project) => project.status === 'Active' || project.id === activeProject?.id)
  const showJobSelectors = showsJobSelectors(pathname)

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
        <div className="flex-1 overflow-y-auto px-2 pb-4">{loading ? <div className="h-8 animate-pulse rounded bg-muted" /> : navList(collapsed)}</div>
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
          {showJobSelectors ? (
            <>
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
            </>
          ) : null}
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
            ) : correctionsPending ? (
              <Notice>Database update pending. Reversals, category moves, and project rates turn on after the Phase 2b database update. Existing costs and invoices still work.</Notice>
            ) : null}
            {children}
          </div>
        </main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} title="Menu" side="left">
        <div className="mb-4">
          <Logo size="sm" />
        </div>
        {navList(false)}
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
  if (name === 'reports') return <BarChart3 className={className} />
  if (name === 'employees') return <Users className={className} />
  if (name === 'team') return <Users className={className} />
  if (name === 'settings') return <Settings className={className} />
  return <FileText className={className} />
}
