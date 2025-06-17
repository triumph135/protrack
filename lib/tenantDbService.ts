import { createClient } from '@/lib/supabase'

interface Project {
  id: string
  jobNumber: string
  jobName: string
  customer: string
  fieldShopBoth: string
  totalContractValue: number
  status: string
  tenant_id: string
  created_at: string
  updated_at: string
}

interface ProjectData {
  jobNumber: string
  jobName: string
  customer: string
  fieldShopBoth: string
  totalContractValue: number
  status?: string
}

class TenantDbService {
  private currentTenant: string | null = null
  private supabase = createClient()

  setTenant(tenantId: string) {
    this.currentTenant = tenantId
  }

  getCurrentTenant() {
    return this.currentTenant
  }

  // Projects with status management and tenant isolation
  projects = {
    getAll: async (includeInactive = false): Promise<Project[]> => {
      if (!this.currentTenant) throw new Error('No tenant context')
      
      let query = this.supabase
        .from('projects')
        .select('*')
        .eq('tenant_id', this.currentTenant)
        .order('created_at', { ascending: false })
      
      // Filter to only active projects unless specifically requesting all
      if (!includeInactive) {
        query = query.eq('status', 'Active')
      }
      
      const { data, error } = await query
      if (error) throw error
      return data || []
    },

    getAllWithStatus: async (): Promise<Project[]> => {
      if (!this.currentTenant) throw new Error('No tenant context')
      
      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .eq('tenant_id', this.currentTenant)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    },

    create: async (projectData: ProjectData): Promise<Project> => {
      if (!this.currentTenant) throw new Error('No tenant context')
      
      const { data, error } = await this.supabase
        .from('projects')
        .insert([{ 
          ...projectData, 
          tenant_id: this.currentTenant, 
          status: projectData.status || 'Active' 
        }])
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    update: async (projectId: string, updates: Partial<ProjectData>): Promise<Project> => {
      if (!this.currentTenant) throw new Error('No tenant context')
      
      const { data, error } = await this.supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId)
        .eq('tenant_id', this.currentTenant)
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    updateStatus: async (projectId: string, status: string): Promise<Project> => {
      if (!this.currentTenant) throw new Error('No tenant context')
      
      const { data, error } = await this.supabase
        .from('projects')
        .update({ status })
        .eq('id', projectId)
        .eq('tenant_id', this.currentTenant)
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    delete: async (projectId: string): Promise<void> => {
      if (!this.currentTenant) throw new Error('No tenant context')
      
      const { error } = await this.supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('tenant_id', this.currentTenant)
      
      if (error) throw error
    }
  }

  // Change Orders with tenant isolation
  changeOrders = {
    getAllByProject: async (projectId: string) => {
      if (!this.currentTenant) throw new Error('No tenant context')
      
      const { data, error } = await this.supabase
        .from('change_orders')
        .select('*')
        .eq('project_id', projectId)
        .eq('tenant_id', this.currentTenant)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    },

    create: async (projectId: string, changeOrderData: any) => {
      if (!this.currentTenant) throw new Error('No tenant context')
      
      const { data, error } = await this.supabase
        .from('change_orders')
        .insert([{ 
          ...changeOrderData, 
          project_id: projectId,
          tenant_id: this.currentTenant 
        }])
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    update: async (changeOrderId: string, updates: any) => {
      if (!this.currentTenant) throw new Error('No tenant context')
      
      const { data, error } = await this.supabase
        .from('change_orders')
        .update(updates)
        .eq('id', changeOrderId)
        .eq('tenant_id', this.currentTenant)
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    delete: async (changeOrderId: string) => {
      if (!this.currentTenant) throw new Error('No tenant context')
      
      const { error } = await this.supabase
        .from('change_orders')
        .delete()
        .eq('id', changeOrderId)
        .eq('tenant_id', this.currentTenant)
      
      if (error) throw error
    }
  }
}

// Create a singleton instance
export const tenantDbService = new TenantDbService()
export default tenantDbService