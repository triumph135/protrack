'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building, Mail, Phone, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import AuthGuard from '@/components/auth/AuthGuard'
import { ENTRY_PERMISSIONS, MASTER_PERMISSIONS } from '@/lib/permissions'
import { isMissingRpc, isValidSubdomain } from '@/lib/security'

export default function TenantSetupPage() {
  return (
    <AuthGuard requireAuth={true} requireTenant={false}>
      <TenantSetupContent />
    </AuthGuard>
  )
}

function TenantSetupContent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tenantData, setTenantData] = useState({
    subdomain: '',
    name: '',
    email: '',
    phone: '',
    plan: 'professional'
  })
  
  const router = useRouter()
  const { user, supabaseUser, refreshUser } = useAuth()
  const supabase = createClient()

  // Check if user exists in database, create if necessary
  useEffect(() => {
    const ensureUserExists = async () => {
      if (supabaseUser && !user) {
        try {
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: supabaseUser.id,
              email: supabaseUser.email || '',
              name: supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
              role: 'entry',
              tenant_id: null,
              permissions: ENTRY_PERMISSIONS
            })

          if (insertError) {
            console.error('Error creating user profile in tenant setup:', insertError)
          } else {
            await refreshUser()
          }
        } catch (error) {
          console.error('Failed to create user profile:', error)
        }
      }
    }

    ensureUserExists()
  }, [supabaseUser, user, supabase, refreshUser])

  const validateSubdomain = (subdomain: string) => {
    const regex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,48}[a-zA-Z0-9]$/
    return regex.test(subdomain)
  }

  const checkSubdomainAvailable = async (subdomain: string) => {
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('subdomain', subdomain)
      .single()
    
    return !data // If no data, subdomain is available
  }

  const handleOrgNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const orgName = e.target.value
    const subdomain = orgName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
    
    setTenantData({ ...tenantData, name: orgName, subdomain })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (user?.tenant_id) {
        throw new Error('This account already belongs to an organization')
      }

      const subdomain = tenantData.subdomain.toLowerCase()
      if (!validateSubdomain(subdomain) || !isValidSubdomain(subdomain)) {
        throw new Error('Subdomain must be 3-50 characters, alphanumeric and hyphens only')
      }

      const { error: rpcError } = await supabase.rpc('create_workspace', {
        p_name: tenantData.name.trim(),
        p_subdomain: subdomain,
        p_email: tenantData.email.trim(),
        p_phone: tenantData.phone || null,
        p_plan: tenantData.plan,
      })

      if (rpcError && !isMissingRpc(rpcError)) {
        throw new Error(rpcError.message)
      }

      if (isMissingRpc(rpcError)) {
        const available = await checkSubdomainAvailable(subdomain)
        if (!available) {
          throw new Error('This subdomain is already taken')
        }

        const { data: newTenant, error: tenantError } = await supabase
          .from('tenants')
          .insert({
            ...tenantData,
            subdomain,
            status: 'active'
          })
          .select()
          .single()

        if (tenantError) throw tenantError

        const userId = user?.id || supabaseUser?.id
        if (!userId) {
          throw new Error('Unable to identify user for tenant setup')
        }

        const { error: updateError } = await supabase
          .from('users')
          .update({
            tenant_id: newTenant.id,
            role: 'master',
            permissions: MASTER_PERMISSIONS
          })
          .eq('id', userId)
          .is('tenant_id', null)

        if (updateError) throw updateError
      }

      // Refresh user data
      await refreshUser()

      // Redirect to dashboard
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (user?.tenant_id) {
    return (
      <>
        <h2 className="text-3xl font-extrabold text-gray-900 text-center">
          Your workspace is ready
        </h2>
        <p className="mt-2 text-center text-gray-600">
          This account already belongs to an organization.
        </p>
        <div className="mt-8">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Go to dashboard
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="text-3xl font-extrabold text-gray-900 text-center">
        Set up your ProTrack workspace
      </h2>
      <p className="mt-2 text-center text-gray-600">
        Create your organization&apos;s project tracking environment
      </p>

      <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Organization Name
            </label>
            <div className="mt-1 relative">
              <input
                type="text"
                required
                value={tenantData.name}
                onChange={handleOrgNameChange}
                className="appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Your Company Name"
                disabled={loading}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Building className="h-5 w-5 text-gray-400" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Subdomain
            </label>
            <div className="mt-1 relative">
              <input
                type="text"
                required
                value={tenantData.subdomain}
                onChange={(e) => setTenantData({ ...tenantData, subdomain: e.target.value })}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="your-company"
                disabled={loading}
              />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              This will be your unique workspace identifier: {tenantData.subdomain || 'your-company'}.protrack.com
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Contact Email
            </label>
            <div className="mt-1 relative">
              <input
                type="email"
                required
                value={tenantData.email}
                onChange={(e) => setTenantData({ ...tenantData, email: e.target.value })}
                className="appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="contact@yourcompany.com"
                disabled={loading}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Phone Number
            </label>
            <div className="mt-1 relative">
              <input
                type="tel"
                value={tenantData.phone}
                onChange={(e) => setTenantData({ ...tenantData, phone: e.target.value })}
                className="appearance-none block w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="+1 (555) 123-4567"
                disabled={loading}
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-gray-400" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Plan
            </label>
            <div className="mt-1">
              <select
                value={tenantData.plan}
                onChange={(e) => setTenantData({ ...tenantData, plan: e.target.value })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                <option value="professional">Professional - $35/month</option>
                <option value="enterprise">Enterprise - $65/month</option>
              </select>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                'Create Workspace'
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}