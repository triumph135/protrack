'use client'

import { createContext, useContext, useState } from 'react'

interface WorkspaceContextValue {
  changeOrderId: string | null
  setChangeOrderId: (id: string | null) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [changeOrderId, setChangeOrderId] = useState<string | null>(null)
  return (
    <WorkspaceContext.Provider value={{ changeOrderId, setChangeOrderId }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return context
}
