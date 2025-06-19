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
  const [initialized, setInitialized] = useState(false)
  const [lastUserId, setLastUserId] = useState<string | null>(null)
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  const refreshTenant = async () => {
    console.log('TenantContext: refreshTenant called', { 
      user: !!user, 
      userEmail: user?.email, 
      tenantId: user?.tenant_id,
      authLoading,
      initialized
    })

    // If auth is still loading, wait
    if (authLoading) {
      console.log('TenantContext: Auth still loading, waiting...')
      return
    }

    // If no user, clear tenant and finish loading
    if (!user) {
      console.log('TenantContext: No user, clearing tenant')
      if (tenant !== null) setTenant(null)
      if (loading) setLoading(false)
      if (!initialized) setInitialized(true)
      return
    }

    // If user has no tenant_id, they have no tenant
    if (!user.tenant_id) {
      console.log('TenantContext: User has no tenant_id')
      if (tenant !== null) setTenant(null)
      if (loading) setLoading(false)
      if (!initialized) setInitialized(true)
      return
    }

    // If we already have the correct tenant, don't reload
    if (tenant && tenant.id === user.tenant_id && initialized) {
      console.log('TenantContext: Tenant already loaded and current, no reload needed')
      if (loading) setLoading(false)
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
      if (tenant !== null) setTenant(null)
    } finally {
      console.log('TenantContext: Setting loading to false and initialized to true')
      if (loading) setLoading(false)
      if (!initialized) setInitialized(true)
    }
  }

  useEffect(() => {
    console.log('TenantContext: useEffect triggered', { 
      user: !!user, 
      userEmail: user?.email,
      tenantId: user?.tenant_id,
      authLoading,
      initialized,
      hasCurrentTenant: !!tenant,
      lastUserId,
      currentUserId: user?.id
    })
    
    // Check if user actually changed (including null -> user, user -> null, user1 -> user2)
    const userChanged = lastUserId !== (user?.id || null)
    const needsInitialization = !initialized && !authLoading
    
    if (needsInitialization || (userChanged && !authLoading)) {
      console.log('TenantContext: Refreshing tenant data', { 
        needsInitialization, 
        userChanged, 
        lastUserId, 
        currentUserId: user?.id 
      })
      
      // Update the tracked user ID
      setLastUserId(user?.id || null)
      
      if (!initialized) setLoading(true)
      refreshTenant()
    } else {
      console.log('TenantContext: No refresh needed')
    }
  }, [user?.id, user?.tenant_id, authLoading])

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