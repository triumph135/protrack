export type UserRole = 'master' | 'manager' | 'entry'

export type PermissionLevel = 'none' | 'read' | 'write'

export interface UserPermissions {
  material: PermissionLevel
  labor: PermissionLevel
  equipment: PermissionLevel
  subcontractor: PermissionLevel
  others: PermissionLevel
  capLeases: PermissionLevel
  consumable: PermissionLevel
  invoices: PermissionLevel
  projects: PermissionLevel
  users: PermissionLevel
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  permissions: UserPermissions
  tenant_id: string | null
}

export interface Tenant {
  id: string
  subdomain: string
  name: string
  email: string
  phone: string | null
  plan: string
  status: string
}

export interface Project {
  id: string
  jobNumber: string
  jobName: string
  customer: string
  fieldShopBoth: string
  totalContractValue: number
  status: string
  tenant_id: string
}

export type CostCategory = 
  | 'material' 
  | 'labor' 
  | 'equipment' 
  | 'subcontractor' 
  | 'others' 
  | 'capLeases' 
  | 'consumable'