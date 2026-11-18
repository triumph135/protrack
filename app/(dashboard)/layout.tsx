'use client'

import { Suspense } from 'react'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { CategoryProvider } from '@/contexts/CategoryContext'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import AuthGuard from '@/components/auth/AuthGuard'
import AppShell from '@/components/shell/AppShell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAuth={true} requireTenant={true}>
      <ProjectProvider>
        <CategoryProvider>
          <WorkspaceProvider>
            <Suspense fallback={null}>
              <AppShell>{children}</AppShell>
            </Suspense>
          </WorkspaceProvider>
        </CategoryProvider>
      </ProjectProvider>
    </AuthGuard>
  )
}
