'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { 
  BarChart3, Building, Users, FileText, 
  LogOut, Menu, X, DollarSign
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { ProjectProvider } from '@/contexts/ProjectContext'
import AuthGuard from '@/components/auth/AuthGuard'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/ui/ThemeToggle'

interface NavigationItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string
}

const navigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'Projects', href: '/projects', icon: Building, permission: 'projects' },
  { name: 'Material', href: '/costs?category=material', icon: DollarSign, permission: 'material' },
  { name: 'Labor', href: '/costs?category=labor', icon: Users, permission: 'labor' },
  { name: 'Equipment', href: '/costs?category=equipment', icon: DollarSign, permission: 'equipment' },
  { name: 'Subcontractor', href: '/costs?category=subcontractor', icon: DollarSign, permission: 'subcontractor' },
  { name: 'Others', href: '/costs?category=others', icon: DollarSign, permission: 'others' },
  { name: 'Cap Leases', href: '/costs?category=cap-leases', icon: DollarSign, permission: 'capLeases' },
  { name: 'Consumable', href: '/costs?category=consumable', icon: DollarSign, permission: 'consumable' },
  { name: 'Invoices', href: '/invoices', icon: FileText, permission: 'invoices' },
  { name: 'Users', href: '/users', icon: Users, permission: 'users' },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard requireAuth={true} requireTenant={true}>
      <ProjectProvider>
        <DashboardContent>{children}</DashboardContent>
      </ProjectProvider>
    </AuthGuard>
  )
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, signOut } = useAuth()
  const { tenant } = useTenant()
  const router = useRouter()
  const pathname = usePathname()

  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/login')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  // Filter navigation items based on permissions
  const visibleNavigation = navigation.filter(item => {
    if (!item.permission) return true
    return hasPermission(item.permission, 'read')
  })

  return (
    <div className="h-screen flex bg-gray-100 dark:bg-gray-900 transition-theme">
      {/* Mobile menu */}
      <div className={`fixed inset-0 flex z-40 md:hidden ${sidebarOpen ? '' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-gray-800 transition-theme">
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
          <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
            <div className="flex-shrink-0 flex items-center px-4">
              <Link href="/dashboard">
                <Logo size="lg" className="cursor-pointer" />
              </Link>
            </div>
            <nav className="mt-5 px-2 space-y-1">
              {visibleNavigation.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.name}
                    href={item.href as any}
                    className={`group flex items-center px-2 py-2 text-base font-medium rounded-md transition-theme ${
                      isActive
                        ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100'
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className={`mr-4 h-6 w-6 ${isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between w-full">
              <div>
                <p className="text-base font-medium text-gray-700 dark:text-gray-300">{user?.name}</p>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{tenant?.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle size="sm" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Static sidebar for desktop */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col h-0 flex-1 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-theme">
            <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
              <div className="flex items-center flex-shrink-0 px-4">
                <Link href="/dashboard">
                  <Logo size="lg" className="cursor-pointer" />
                </Link>
              </div>
              <nav className="mt-5 flex-1 px-2 space-y-1">
                {visibleNavigation.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.name}
                      href={item.href as any}
                      className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-theme ${
                        isActive
                          ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100'
                      }`}
                    >
                      <item.icon className={`mr-3 h-5 w-5 ${isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
            </div>
            <div className="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between w-full">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{user?.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{tenant?.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle size="sm" />
                  <button
                    onClick={handleSignOut}
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1 rounded transition-colors"
                    title="Sign out"
                  >
                    <LogOut className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 transition-theme">
          <div className="flex items-center justify-between">
            <button
              className="h-10 w-10 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            
            <div className="flex-1 flex justify-center">
              <Link href="/dashboard">
                <Logo size="md" className="cursor-pointer" />
              </Link>
            </div>
            
            <div className="flex items-center gap-2">
              <ThemeToggle size="sm" />
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none bg-gray-50 dark:bg-gray-900 transition-theme">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}