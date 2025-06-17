'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { createClient } from '@/lib/supabase'

interface Tenant {
  id: string
  subdomain: string
  name: string
  email: string
  phone: string | null
  plan: string
  status: string
}

interface TenantContextType {
  tenant: Tenant | null
  loading: boolean
  refreshTenant: () => Promise<void>
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const supabase = createClient()

  const refreshTenant = async () => {
    console.log('TenantContext: refreshTenant called', { 
      user: !!user, 
      userEmail: user?.email, 
      tenantId: user?.tenant_id 
    })

    if (!user?.tenant_id) {
      console.log('TenantContext: No tenant_id found, setting tenant to null')
      setTenant(null)
      setLoading(false)
      return
    }

    try {
      console.log('TenantContext: Fetching tenant data for ID:', user.tenant_id)
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', user.tenant_id)
        .single()

      console.log('TenantContext: Database response:', { 
        data: !!data, 
        error: error?.message, 
        tenantName: data?.name 
      })

      if (error) throw error
      
      console.log('TenantContext: Setting tenant in context:', data.name)
      setTenant(data)
    } catch (error) {
      console.error('TenantContext: Error fetching tenant:', error)
      setTenant(null)
    } finally {
      console.log('TenantContext: Setting loading to false')
      setLoading(false)
    }
  }

  useEffect(() => {
    console.log('TenantContext: useEffect triggered', { 
      user: !!user, 
      userEmail: user?.email,
      tenantId: user?.tenant_id 
    })
    
    // Reset loading state when user changes
    setLoading(true)
    refreshTenant()
  }, [user?.id, user?.tenant_id]) // Depend on both user.id and user.tenant_id specifically

  console.log('TenantContext: Rendering with state:', { 
    tenant: !!tenant, 
    tenantName: tenant?.name, 
    loading 
  })

  return (
    <TenantContext.Provider value={{ tenant, loading, refreshTenant }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}