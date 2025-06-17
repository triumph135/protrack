export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          created_at: string
          subdomain: string
          name: string
          email: string
          phone: string | null
          plan: string
          status: string
        }
        Insert: {
          id?: string
          created_at?: string
          subdomain: string
          name: string
          email: string
          phone?: string | null
          plan?: string
          status?: string
        }
        Update: {
          id?: string
          created_at?: string
          subdomain?: string
          name?: string
          email?: string
          phone?: string | null
          plan?: string
          status?: string
        }
      }
      users: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          tenant_id: string | null
          name: string
          email: string
          role: 'master' | 'manager' | 'entry'
          permissions: Json
        }
        Insert: {
          id: string
          created_at?: string
          updated_at?: string
          tenant_id?: string | null
          name: string
          email: string
          role?: 'master' | 'manager' | 'entry'
          permissions?: Json
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          tenant_id?: string | null
          name?: string
          email?: string
          role?: 'master' | 'manager' | 'entry'
          permissions?: Json
        }
      }
      projects: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          tenant_id: string
          jobNumber: string
          jobName: string
          customer: string
          fieldShopBoth: string
          totalContractValue: number
          status: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          tenant_id: string
          jobNumber: string
          jobName: string
          customer: string
          fieldShopBoth?: string
          totalContractValue?: number
          status?: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          tenant_id?: string
          jobNumber?: string
          jobName?: string
          customer?: string
          fieldShopBoth?: string
          totalContractValue?: number
          status?: string
        }
      }
      project_costs: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          tenant_id: string
          project_id: string
          category: string
          date: string
          vendor: string | null
          invoice_number: string | null
          cost: number | null
          in_system: boolean
          description: string | null
          subcontractor_name: string | null
          employee_id: string | null
          employee_name: string | null
          st_hours: number | null
          st_rate: number | null
          ot_hours: number | null
          ot_rate: number | null
          dt_hours: number | null
          dt_rate: number | null
          per_diem: number | null
          mob_qty: number | null
          mob_rate: number | null
          change_order_id: string | null
        }
      }
      project_budgets: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          tenant_id: string
          project_id: string
          material_budget: number
          labor_budget: number
          equipment_budget: number
          subcontractor_budget: number
          others_budget: number
          cap_leases_budget: number
          consumable_budget: number
        }
      }
      customer_invoices: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          tenant_id: string
          project_id: string
          invoice_number: string
          amount: number
          date_billed: string
          change_order_id: string | null
        }
      }
      change_orders: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          tenant_id: string
          project_id: string
          name: string
          additional_contract_value: number
          description: string | null
        }
      }
      employees: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          tenant_id: string
          project_id: string | null
          name: string
          standard_rate: number
          ot_rate: number
          dt_rate: number
          mob_rate: number
        }
      }
      attachments: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          tenant_id: string
          entity_type: string
          entity_id: string
          file_name: string
          file_size: number
          file_type: string
          storage_path: string
          uploaded_by: string
          description: string | null
        }
      }
    }
  }
}