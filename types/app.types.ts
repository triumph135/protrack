// Base types for ProTrack application

export interface Tenant {
  id: string
  subdomain: string
  name: string
  email: string
  phone?: string
  status?: string
  plan?: string
  settings?: any
  created_at?: string
  updated_at?: string
  subscription_ends_at?: string
  billing_info?: any
}

export interface UserPermissions {
  material: 'none' | 'read' | 'write'
  labor: 'none' | 'read' | 'write'
  equipment: 'none' | 'read' | 'write'
  subcontractor: 'none' | 'read' | 'write'
  others: 'none' | 'read' | 'write'
  capLeases: 'none' | 'read' | 'write'
  consumable: 'none' | 'read' | 'write'
  invoices: 'none' | 'read' | 'write'
  projects: 'none' | 'read' | 'write'
  users: 'none' | 'read' | 'write'
}

export interface User {
  id: string
  tenant_id?: string
  name: string
  email: string
  role: 'master' | 'entry' | 'view'
  permissions: UserPermissions
  password_hash?: string
  is_active?: boolean
  last_login?: string
  created_at?: string
  updated_at?: string
}

export interface Project {
  id: string
  tenant_id: string
  jobNumber: string
  jobName: string
  customer: string
  fieldShopBoth?: string
  totalContractValue?: number
  status?: string
  created_at?: string
  updated_at?: string
}

export interface ChangeOrder {
  id: string
  project_id: string
  tenant_id: string
  name: string
  description?: string
  additional_contract_value?: number
  created_at?: string
  updated_at?: string
}

export interface Employee {
  id: string
  tenant_id: string
  name: string
  standard_rate: number
  ot_rate: number
  dt_rate: number
  project_id?: string
  mob?: number
  mob_rate?: number
  created_at?: string
  updated_at?: string
}

export interface ProjectBudget {
  id: string
  tenant_id: string
  project_id: string
  material_budget?: number
  labor_budget?: number
  equipment_budget?: number
  subcontractor_budget?: number
  others_budget?: number
  cap_leases_budget?: number
  consumable_budget?: number
  created_at?: string
  updated_at?: string
  updated_by?: string
}

export interface ProjectCost {
  id: string
  tenant_id: string
  project_id: string
  category: 'material' | 'labor' | 'equipment' | 'subcontractor' | 'others' | 'cap_leases' | 'consumable'
  date: string
  cost?: number
  vendor?: string
  invoice_number?: string
  in_system?: boolean
  
  // Labor specific fields (matching database exactly)
  employee_name?: string
  employee_id?: string
  st_hours?: number
  st_rate?: number
  ot_hours?: number
  ot_rate?: number
  dt_hours?: number
  dt_rate?: number
  per_diem?: number
  mob?: number
  mob_qty?: number
  mob_rate?: number
  
  // Subcontractor/Equipment specific
  subcontractor_name?: string
  
  description?: string
  change_order_id?: string
  created_at?: string
  updated_at?: string
}

export interface MaterialCost {
  id: string
  project_id: string
  date: string
  vendor: string
  invoice_number: string
  cost: number
  in_system?: boolean
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface LaborCost {
  id: string
  project_id: string
  employee_name: string
  employee_id?: string
  date: string
  st_hours?: number
  st_rate?: number
  ot_hours?: number
  ot_rate?: number
  dt_hours?: number
  dt_rate?: number
  per_diem?: number
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface EquipmentCost {
  id: string
  project_id: string
  subcontractor_name?: string
  date: string
  vendor: string
  invoice_number: string
  cost: number
  in_system?: boolean
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface SubcontractorCost {
  id: string
  project_id: string
  subcontractor_name: string
  date: string
  vendor: string
  invoice_number: string
  cost: number
  in_system?: boolean
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface OtherCost {
  id: string
  project_id: string
  date: string
  vendor: string
  invoice_number: string
  cost: number
  in_system?: boolean
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface CapLeaseCost {
  id: string
  project_id: string
  date: string
  vendor: string
  invoice_number: string
  cost: number
  in_system?: boolean
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface ConsumableCost {
  id: string
  project_id: string
  date: string
  vendor: string
  invoice_number: string
  cost: number
  in_system?: boolean
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface CustomerInvoice {
  id: string
  tenant_id: string
  project_id: string
  invoice_number: string
  amount: number
  date_billed: string
  change_order_id?: string
  in_system?: boolean
  created_at?: string
  updated_at?: string
}

export interface Attachment {
  id: string
  tenant_id: string
  entity_type: string
  entity_id: string
  file_name: string
  file_size: number
  file_type: string
  storage_path: string
  uploaded_by?: string
  description?: string
  created_at?: string
  updated_at?: string
}

// Updated types/app.types.ts

export interface UserInvitation {
  id: string
  tenant_id: string
  email: string
  role: 'master' | 'entry' | 'view'
  permissions: UserPermissions
  invited_by: string
  invitation_token: string
  status: 'pending' | 'accepted' | 'expired'
  expires_at: string
  created_at: string
  updated_at: string
}

// Update the User interface to include role type union
export interface User {
  id: string
  tenant_id?: string
  name: string
  email: string
  role: 'master' | 'entry' | 'view'  // Updated to be more specific
  permissions: UserPermissions
  password_hash?: string
  is_active?: boolean
  last_login?: string
  created_at?: string
  updated_at?: string
}