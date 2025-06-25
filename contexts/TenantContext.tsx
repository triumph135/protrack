'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
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
  const [initialized, setInitialized] = useState(false)
  const [lastUserId, setLastUserId] = useState<string | null>(null)
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  const refreshTenant = useCallback(async () => {
    console.log('TenantContext: refreshTenant called', { user: user?.email, tenantId: user?.tenant_id })
    
    try {
      setLoading(true)
      
      if (!user) {
        console.log('TenantContext: No user, clearing tenant')
        setTenant(null)
        setLoading(false)
        setInitialized(true)
        return
      }
  
      if (!user.tenant_id) {
        console.log('TenantContext: User has no tenant_id')
        setTenant(null)
        setLoading(false)
        setInitialized(true)
        return
      }
  
      console.log('TenantContext: Fetching tenant data for ID:', user.tenant_id)
      const { data, error: fetchError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', user.tenant_id)
        .single()
  
      console.log('TenantContext: Database response:', { data, error: fetchError })
  
      if (fetchError) throw fetchError
  
      if (data) {
        console.log('TenantContext: Setting tenant in context:', data.name)
        setTenant(data)
      } else {
        console.log('TenantContext: No tenant data found')
        setTenant(null)
      }
      
      console.log('TenantContext: Setting loading to false and initialized to true')
      setLoading(false)
      setInitialized(true)
      
    } catch (err: any) {
      console.error('TenantContext: Error refreshing tenant:', err)
      setTenant(null)
      setLoading(false)
      setInitialized(true)
    }
  }, [user, supabase])

  useEffect(() => {
    console.log('TenantContext: useEffect triggered', { 
      user: user?.email, 
      authLoading, 
      currentTenant: tenant?.name,
      tenantLoading: loading
    })
    
    // Don't proceed if auth is still loading
    if (authLoading) {
      console.log('TenantContext: Auth still loading, waiting...')
      return
    }
    
    // Check if refresh is needed
    const shouldRefresh = user && (!tenant || tenant.id !== user.tenant_id)
    
    if (shouldRefresh) {
      console.log('TenantContext: Refreshing tenant data', { 
        userId: user.id, 
        userTenantId: user.tenant_id,
        currentTenantId: tenant?.id 
      })
      refreshTenant()
    } else {
      console.log('TenantContext: No refresh needed')
      // Ensure loading is false if we don't need to refresh
      if (loading) {
        setLoading(false)
        setInitialized(true)
      }
    }
  }, [user, authLoading, refreshTenant]) // Remove tenant from dependencies to prevent loops

  console.log('TenantContext: Rendering with state:', { 
    tenant: !!tenant, 
    tenantName: tenant?.name, 
    loading,
    authLoading,
    initialized
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