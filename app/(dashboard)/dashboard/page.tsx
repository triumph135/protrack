'use client'


import Link from 'next/link'
import { Plus, BarChart3, Building, DollarSign, FileText, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useProjects } from '@/hooks/useProjects'

export default function DashboardPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { projects, activeProject, setActiveProject, loading } = useProjects()

  const hasPermission = (area: string, level: 'read' | 'write' = 'read') => {
    if (!user) return false
    if (user.role === 'master') return true
    
    const userPermission = user.permissions[area as keyof typeof user.permissions]
    if (!userPermission || userPermission === 'none') return false
    
    if (level === 'read') return ['read', 'write'].includes(userPermission)
    if (level === 'write') return userPermission === 'write'
    
    return false
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to ProTrack!</h2>
          <p className="text-gray-600 mb-6">Get started by creating your first project.</p>
          {hasPermission('projects', 'write') ? (
            <Link
              href="/projects"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Your First Project
            </Link>
          ) : (
            <p className="text-gray-500">Ask an administrator to create a project for you.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Project Info */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600">Welcome back, {user?.name}!</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Active Project</p>
              <p className="text-lg font-semibold text-blue-600">
                {activeProject.jobNumber} - {activeProject.jobName}
              </p>
              <p className="text-sm text-gray-600">{activeProject.customer}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Project Selector */}
      {projects.length > 1 && (
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Active Project:</label>
            <select
              value={activeProject.id}
              onChange={(e) => {
                const selected = projects.find(p => p.id === e.target.value)
                if (selected) setActiveProject(selected)
              }}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.jobNumber} - {project.jobName}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <DollarSign className="h-8 w-8 text-green-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Contract Value</p>
              <p className="text-2xl font-semibold text-gray-900">
                ${activeProject.totalContractValue.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <Building className="h-8 w-8 text-blue-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Project Type</p>
              <p className="text-2xl font-semibold text-gray-900">
                {activeProject.fieldShopBoth}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-purple-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Costs</p>
              <p className="text-2xl font-semibold text-gray-900">
                $0
              </p>
              <p className="text-xs text-gray-500">Cost tracking coming next</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <BarChart3 className="h-8 w-8 text-orange-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Profit Margin</p>
              <p className="text-2xl font-semibold text-gray-900">
                100%
              </p>
              <p className="text-xs text-gray-500">No costs recorded yet</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hasPermission('material', 'write') && (
            <Link
              href="/costs?category=material"
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <DollarSign className="h-6 w-6 text-blue-500 mb-2" />
              <h4 className="font-medium text-gray-900">Add Material Cost</h4>
              <p className="text-sm text-gray-500">Record material expenses</p>
            </Link>
          )}
          
          {hasPermission('labor', 'write') && (
            <Link
              href="/costs?category=labor"
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Users className="h-6 w-6 text-green-500 mb-2" />
              <h4 className="font-medium text-gray-900">Add Labor Hours</h4>
              <p className="text-sm text-gray-500">Track employee time</p>
            </Link>
          )}
          
          {hasPermission('invoices', 'write') && (
            <Link
              href="/invoices"
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FileText className="h-6 w-6 text-purple-500 mb-2" />
              <h4 className="font-medium text-gray-900">Create Invoice</h4>
              <p className="text-sm text-gray-500">Bill your customer</p>
            </Link>
          )}
          
          {hasPermission('projects', 'write') && (
            <Link
              href="/projects"
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Building className="h-6 w-6 text-orange-500 mb-2" />
              <h4 className="font-medium text-gray-900">Manage Projects</h4>
              <p className="text-sm text-gray-500">Create and edit projects</p>
            </Link>
          )}
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="text-center py-8">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-500">Activity tracking will be available once cost tracking is implemented.</p>
        </div>
      </div>
    </div>
  )
}