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
      attachments: {
        Row: {
          id: string
          tenant_id: string
          entity_type: string
          entity_id: string
          file_name: string
          file_size: number
          file_type: string
          storage_path: string
          uploaded_by: string | null
          description: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          entity_type: string
          entity_id: string
          file_name: string
          file_size: number
          file_type: string
          storage_path: string
          uploaded_by?: string | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          entity_type?: string
          entity_id?: string
          file_name?: string
          file_size?: number
          file_type?: string
          storage_path?: string
          uploaded_by?: string | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      audit_logs: {
        Row: {
          id: string
          tenant_id: string | null
          user_id: string | null
          action: string
          resource: string | null
          resource_id: string | null
          ip_address: string | null
          user_agent: string | null
          success: boolean | null
          error_message: string | null
          metadata: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          action: string
          resource?: string | null
          resource_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          success?: boolean | null
          error_message?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          action?: string
          resource?: string | null
          resource_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          success?: boolean | null
          error_message?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
      }
      cap_lease_costs: {
        Row: {
          id: string
          project_id: string
          date: string
          vendor: string
          invoice_number: string
          cost: number
          in_system: boolean | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          project_id: string
          date: string
          vendor: string
          invoice_number: string
          cost: number
          in_system?: boolean | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          date?: string
          vendor?: string
          invoice_number?: string
          cost?: number
          in_system?: boolean | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      change_orders: {
        Row: {
          id: string
          project_id: string
          tenant_id: string
          name: string
          description: string | null
          additional_contract_value: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          project_id: string
          tenant_id: string
          name: string
          description?: string | null
          additional_contract_value?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          additional_contract_value?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      customer_invoices: {
        Row: {
          id: string
          tenant_id: string
          project_id: string
          invoice_number: string
          amount: number
          date_billed: string
          created_at: string | null
          updated_at: string | null
          change_order_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          project_id: string
          invoice_number: string
          amount: number
          date_billed: string
          created_at?: string | null
          updated_at?: string | null
          change_order_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          project_id?: string
          invoice_number?: string
          amount?: number
          date_billed?: string
          created_at?: string | null
          updated_at?: string | null
          change_order_id?: string | null
        }
      }
      employees: {
        Row: {
          id: string
          tenant_id: string
          name: string
          standard_rate: number
          ot_rate: number
          dt_rate: number
          created_at: string | null
          updated_at: string | null
          project_id: string | null
          mob: number | null
          mob_rate: number | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          standard_rate: number
          ot_rate: number
          dt_rate: number
          created_at?: string | null
          updated_at?: string | null
          project_id?: string | null
          mob?: number | null
          mob_rate?: number | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          standard_rate?: number
          ot_rate?: number
          dt_rate?: number
          created_at?: string | null
          updated_at?: string | null
          project_id?: string | null
          mob?: number | null
          mob_rate?: number | null
        }
      }
      projects: {
        Row: {
          id: string
          tenant_id: string
          jobNumber: string
          jobName: string
          customer: string
          fieldShopBoth: string | null
          totalContractValue: number | null
          status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          jobNumber: string
          jobName: string
          customer: string
          fieldShopBoth?: string | null
          totalContractValue?: number | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          jobNumber?: string
          jobName?: string
          customer?: string
          fieldShopBoth?: string | null
          totalContractValue?: number | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      project_budgets: {
        Row: {
          id: string
          tenant_id: string
          project_id: string
          material_budget: number | null
          labor_budget: number | null
          equipment_budget: number | null
          subcontractor_budget: number | null
          others_budget: number | null
          cap_leases_budget: number | null
          consumable_budget: number | null
          created_at: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          project_id: string
          material_budget?: number | null
          labor_budget?: number | null
          equipment_budget?: number | null
          subcontractor_budget?: number | null
          others_budget?: number | null
          cap_leases_budget?: number | null
          consumable_budget?: number | null
          created_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          project_id?: string
          material_budget?: number | null
          labor_budget?: number | null
          equipment_budget?: number | null
          subcontractor_budget?: number | null
          others_budget?: number | null
          cap_leases_budget?: number | null
          consumable_budget?: number | null
          created_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
      }
      project_costs: {
        Row: {
          id: string
          tenant_id: string
          project_id: string
          category: string
          date: string
          cost: number | null
          vendor: string | null
          invoice_number: string | null
          in_system: boolean | null
          employee_name: string | null
          st_hours: number | null
          st_rate: number | null
          ot_hours: number | null
          ot_rate: number | null
          dt_hours: number | null
          dt_rate: number | null
          per_diem: number | null
          subcontractor_name: string | null
          created_at: string | null
          updated_at: string | null
          description: string | null
          change_order_id: string | null
          employee_id: string | null
          mob: number | null
          mob_qty: number | null
          mob_rate: number | null
        }
        Insert: {
          id?: string
          tenant_id: string
          project_id: string
          category: string
          date: string
          cost?: number | null
          vendor?: string | null
          invoice_number?: string | null
          in_system?: boolean | null
          employee_name?: string | null
          st_hours?: number | null
          st_rate?: number | null
          ot_hours?: number | null
          ot_rate?: number | null
          dt_hours?: number | null
          dt_rate?: number | null
          per_diem?: number | null
          subcontractor_name?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          change_order_id?: string | null
          employee_id?: string | null
          mob?: number | null
          mob_qty?: number | null
          mob_rate?: number | null
        }
        Update: {
          id?: string
          tenant_id?: string
          project_id?: string
          category?: string
          date?: string
          cost?: number | null
          vendor?: string | null
          invoice_number?: string | null
          in_system?: boolean | null
          employee_name?: string | null
          st_hours?: number | null
          st_rate?: number | null
          ot_hours?: number | null
          ot_rate?: number | null
          dt_hours?: number | null
          dt_rate?: number | null
          per_diem?: number | null
          subcontractor_name?: string | null
          created_at?: string | null
          updated_at?: string | null
          description?: string | null
          change_order_id?: string | null
          employee_id?: string | null
          mob?: number | null
          mob_qty?: number | null
          mob_rate?: number | null
        }
      }
      tenants: {
        Row: {
          id: string
          subdomain: string
          name: string
          email: string
          phone: string | null
          status: string | null
          plan: string | null
          settings: Json | null
          created_at: string | null
          updated_at: string | null
          subscription_ends_at: string | null
          billing_info: Json | null
        }
        Insert: {
          id?: string
          subdomain: string
          name: string
          email: string
          phone?: string | null
          status?: string | null
          plan?: string | null
          settings?: Json | null
          created_at?: string | null
          updated_at?: string | null
          subscription_ends_at?: string | null
          billing_info?: Json | null
        }
        Update: {
          id?: string
          subdomain?: string
          name?: string
          email?: string
          phone?: string | null
          status?: string | null
          plan?: string | null
          settings?: Json | null
          created_at?: string | null
          updated_at?: string | null
          subscription_ends_at?: string | null
          billing_info?: Json | null
        }
      }
      users: {
        Row: {
          id: string
          tenant_id: string | null
          name: string
          email: string
          role: string
          permissions: Json | null
          password_hash: string | null
          is_active: boolean | null
          last_login: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          name: string
          email: string
          role: string
          permissions?: Json | null
          password_hash?: string | null
          is_active?: boolean | null
          last_login?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          name?: string
          email?: string
          role?: string
          permissions?: Json | null
          password_hash?: string | null
          is_active?: boolean | null
          last_login?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}