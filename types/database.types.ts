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
          amount_collected: number
          date_billed: string
          created_at: string | null
          updated_at: string | null
          change_order_id: string | null
          reversal_of_id: string | null
          reversed_at: string | null
          reversal_reason: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          project_id: string
          invoice_number: string
          amount: number
          amount_collected?: number
          date_billed: string
          created_at?: string | null
          updated_at?: string | null
          change_order_id?: string | null
          reversal_of_id?: string | null
          reversed_at?: string | null
          reversal_reason?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          project_id?: string
          invoice_number?: string
          amount?: number
          amount_collected?: number
          date_billed?: string
          created_at?: string | null
          updated_at?: string | null
          change_order_id?: string | null
          reversal_of_id?: string | null
          reversed_at?: string | null
          reversal_reason?: string | null
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
          category_id: string | null
          custom_fields: Json
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
          reversal_of_id: string | null
          reversed_at: string | null
          reversal_reason: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          project_id: string
          category?: string
          category_id?: string | null
          custom_fields?: Json
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
          reversal_of_id?: string | null
          reversed_at?: string | null
          reversal_reason?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          project_id?: string
          category?: string
          category_id?: string | null
          custom_fields?: Json
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
          reversal_of_id?: string | null
          reversed_at?: string | null
          reversal_reason?: string | null
        }
      }
      user_invitations: {
        Row: {
          id: string
          tenant_id: string
          email: string | null
          role: string
          permissions: Json | null
          invited_by: string | null
          invitation_token: string
          status: string
          expires_at: string
          created_at: string
          updated_at: string | null
          invite_type: string
          max_uses: number | null
          use_count: number
          accepted_by: string | null
          accepted_at: string | null
          revoked_at: string | null
          last_sent_at: string | null
          send_count: number
        }
        Insert: {
          id?: string
          tenant_id: string
          email?: string | null
          role: string
          permissions?: Json | null
          invited_by?: string | null
          invitation_token?: string
          status?: string
          expires_at?: string
          created_at?: string
          updated_at?: string | null
          invite_type?: string
          max_uses?: number | null
          use_count?: number
          accepted_by?: string | null
          accepted_at?: string | null
          revoked_at?: string | null
          last_sent_at?: string | null
          send_count?: number
        }
        Update: {
          id?: string
          tenant_id?: string
          email?: string | null
          role?: string
          permissions?: Json | null
          invited_by?: string | null
          invitation_token?: string
          status?: string
          expires_at?: string
          created_at?: string
          updated_at?: string | null
          invite_type?: string
          max_uses?: number | null
          use_count?: number
          accepted_by?: string | null
          accepted_at?: string | null
          revoked_at?: string | null
          last_sent_at?: string | null
          send_count?: number
        }
      }
      cost_categories: {
        Row: {
          id: string
          tenant_id: string
          builtin_key: string | null
          name: string
          kind: string
          parent_id: string | null
          sort_order: number
          is_hidden: boolean
          is_builtin: boolean
          gl_code: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          builtin_key?: string | null
          name: string
          kind: string
          parent_id?: string | null
          sort_order?: number
          is_hidden?: boolean
          is_builtin?: boolean
          gl_code?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          builtin_key?: string | null
          name?: string
          kind?: string
          parent_id?: string | null
          sort_order?: number
          is_hidden?: boolean
          is_builtin?: boolean
          gl_code?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      project_category_budgets: {
        Row: {
          id: string
          tenant_id: string
          project_id: string
          category_id: string
          amount: number
          updated_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          project_id: string
          category_id: string
          amount?: number
          updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          project_id?: string
          category_id?: string
          amount?: number
          updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      labor_field_definitions: {
        Row: {
          id: string
          tenant_id: string
          label: string
          field_type: string
          options: Json
          preset_key: string | null
          is_enabled: boolean
          sort_order: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          label: string
          field_type: string
          options?: Json
          preset_key?: string | null
          is_enabled?: boolean
          sort_order?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          label?: string
          field_type?: string
          options?: Json
          preset_key?: string | null
          is_enabled?: boolean
          sort_order?: number
          created_at?: string | null
          updated_at?: string | null
        }
      }
      project_assignments: {
        Row: {
          project_id: string
          user_id: string
          tenant_id: string
          created_at: string
        }
        Insert: {
          project_id: string
          user_id: string
          tenant_id: string
          created_at?: string
        }
        Update: {
          project_id?: string
          user_id?: string
          tenant_id?: string
          created_at?: string
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
      record_events: {
        Row: {
          id: string
          tenant_id: string
          entity_type: string
          entity_id: string
          event_type: string
          actor_id: string | null
          reason: string | null
          before_data: Json
          after_data: Json
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          entity_type: string
          entity_id: string
          event_type: string
          actor_id?: string | null
          reason?: string | null
          before_data?: Json
          after_data?: Json
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          entity_type?: string
          entity_id?: string
          event_type?: string
          actor_id?: string | null
          reason?: string | null
          before_data?: Json
          after_data?: Json
          created_at?: string
        }
      }
      employee_project_rates: {
        Row: {
          id: string
          employee_id: string
          project_id: string
          tenant_id: string
          effective_date: string
          standard_rate: number
          ot_rate: number
          dt_rate: number
          mob_rate: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          employee_id: string
          project_id: string
          tenant_id: string
          effective_date: string
          standard_rate: number
          ot_rate: number
          dt_rate: number
          mob_rate?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          employee_id?: string
          project_id?: string
          tenant_id?: string
          effective_date?: string
          standard_rate?: number
          ot_rate?: number
          dt_rate?: number
          mob_rate?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_workspace: {
        Args: {
          p_name: string
          p_subdomain: string
          p_email: string
          p_phone?: string | null
          p_plan?: string | null
        }
        Returns: Json
      }
      accept_tenant_invitation: {
        Args: {
          p_token: string
        }
        Returns: Json
      }
      register_invitation_send: {
        Args: {
          p_invitation_id: string
        }
        Returns: undefined
      }
      set_labor_split: {
        Args: {
          p_enabled: boolean
        }
        Returns: undefined
      }
      apply_invite_project_assignments: {
        Args: {
          p_token: string
        }
        Returns: undefined
      }
      reverse_project_cost: {
        Args: {
          p_cost_id: string
          p_reason: string
          p_date: string
          p_fields?: Json | null
        }
        Returns: string
      }
      reverse_customer_invoice: {
        Args: {
          p_invoice_id: string
          p_reason: string
          p_date: string
          p_amount?: number | null
        }
        Returns: string
      }
      move_project_cost: {
        Args: {
          p_cost_id: string
          p_category_id: string
          p_reason: string
        }
        Returns: undefined
      }
      employee_rates_as_of: {
        Args: {
          p_employee_id: string
          p_project_id: string
          p_on: string
        }
        Returns: {
          standard_rate: number
          ot_rate: number
          dt_rate: number
          mob_rate: number | null
          effective_date: string | null
          source: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}