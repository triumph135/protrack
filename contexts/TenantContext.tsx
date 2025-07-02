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

  const refreshTenant = useCallback(async (retryCount = 0) => {
    try {
      setLoading(true)
      
      if (!user) {
        setTenant(null)
        setLoading(false)
        setInitialized(true)
        return
      }
  
      if (!user.tenant_id) {
        setTenant(null)
        setLoading(false)
        setInitialized(true)
        return
      }
  
      const { data, error: fetchError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', user.tenant_id)
        .single()
  
      if (fetchError) throw fetchError
  
      if (data) {
        setTenant(data)
      } else {
        setTenant(null)
      }
      
      setLoading(false)
      setInitialized(true)
      
    } catch (err: any) {
      console.error('TenantContext: Error refreshing tenant:', err)
      
      // Retry once after a delay if this is the first failure
      if (retryCount === 0 && user?.tenant_id) {
        console.log('TenantContext: Retrying tenant fetch in 2 seconds...')
        setTimeout(() => {
          refreshTenant(1) // Retry with count=1 to prevent infinite retries
        }, 2000)
        return
      }
      
      // Don't clear existing tenant data on retry failure if we already have it
      if (!tenant) {
        setTenant(null)
      }
      setLoading(false)
      setInitialized(true)
    }
  }, [user, supabase, tenant])

  useEffect(() => {
    // Don't proceed if auth is still loading
    if (authLoading) {
      return
    }
    
    // Check if refresh is needed
    const shouldRefresh = user && user.tenant_id && (!tenant || tenant.id !== user.tenant_id)
    
    if (shouldRefresh) {
      refreshTenant()
    } else if (user && !user.tenant_id) {
      // User has no tenant_id, so no tenant to load
      setTenant(null)
      setLoading(false)
      setInitialized(true)
    } else {
      // Ensure loading is false if we don't need to refresh
      if (loading) {
        setLoading(false)
        setInitialized(true)
      }
    }
  }, [user, authLoading, refreshTenant]) // Remove tenant from dependencies to prevent loops

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