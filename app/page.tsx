'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ClipboardList, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import Logo from '@/components/ui/Logo'

export default function HomePage() {
  const { user, loading } = useAuth()
  const { tenant } = useTenant()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    if (user) {
      router.push((tenant || user.tenant_id ? '/dashboard' : '/tenant-setup') as never)
    }
  }, [user, tenant, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" role="status" aria-label="Loading ProTrack">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading ProTrack...</p>
        </div>
      </div>
    )
  }

  if (user) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo size="md" />
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Project cost tracking</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Know what every job is costing you
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            ProTrack keeps labor, materials, equipment, change orders, and customer invoices in one place for each company workspace.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create a workspace
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </div>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-3">
          <li className="rounded-xl border border-slate-200 bg-white p-5">
            <Building2 className="h-6 w-6 text-blue-600" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">Jobs and change orders</h2>
            <p className="mt-1 text-sm text-slate-600">Track contract value, status, and extra work against the original job.</p>
          </li>
          <li className="rounded-xl border border-slate-200 bg-white p-5">
            <ClipboardList className="h-6 w-6 text-blue-600" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">Costs and invoices</h2>
            <p className="mt-1 text-sm text-slate-600">Enter labor, materials, equipment, and what has already been billed.</p>
          </li>
          <li className="rounded-xl border border-slate-200 bg-white p-5">
            <ShieldCheck className="h-6 w-6 text-blue-600" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">Separate company data</h2>
            <p className="mt-1 text-sm text-slate-600">Each organization has its own users, projects, and permissions.</p>
          </li>
        </ul>
      </main>
    </div>
  )
}
