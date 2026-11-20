export const REPORT_KEYS = [
  'activity',
  'job_cost_summary',
  'cost_detail',
  'labor_by_employee',
  'invoicing_gp',
  'portfolio',
  'vendor_spend',
  'custom',
] as const

export type ReportKey = (typeof REPORT_KEYS)[number]

export type ColumnKind = 'text' | 'money' | 'hours' | 'number' | 'percent'

export interface ReportColumn {
  key: string
  label: string
  kind: ColumnKind
}

export type ReportCell = string | number | null

export interface ReportRow {
  cells: ReportCell[]
  depth?: number
  vendorKey?: string
}

export interface ReportSection {
  title: string
  columns: ReportColumn[]
  rows: ReportRow[]
  totals?: ReportCell[]
  /** Summary table. The PDF keeps it on one page with the overview row size. */
  fitOnePage?: boolean
}

export interface ReportKpi {
  label: string
  value: string
  detail?: string
  cents?: number | null
}

export interface BuiltReport {
  key: string
  title: string
  rangeLabel: string
  filters: string[]
  kpis: ReportKpi[]
  sections: ReportSection[]
  notes: string[]
}

export interface ReportProject {
  id: string
  jobNumber: string
  jobName: string
  customer: string
  status: string | null
  totalContractValue: number | null
}

export interface ReportCategory {
  id: string
  name: string
  kind: string
  parent_id: string | null
  builtin_key: string | null
  sort_order: number
  is_hidden: boolean
}

export interface ReportCost {
  id: string
  project_id: string
  category_id: string | null
  category: string | null
  date: string
  cost: number | null
  vendor: string | null
  invoice_number: string | null
  description: string | null
  employee_name: string | null
  employee_id: string | null
  st_hours: number | null
  ot_hours: number | null
  dt_hours: number | null
  per_diem: number | null
  mob_qty: number | null
  change_order_id: string | null
  custom_fields?: Record<string, string | number | null> | null
  reversal_of_id: string | null
  reversed_at: string | null
  reversal_reason: string | null
  created_at: string | null
}

export interface ReportInvoice {
  id: string
  project_id: string
  invoice_number: string
  amount: number
  amount_collected: number | null
  date_billed: string
  change_order_id: string | null
  reversal_of_id: string | null
  reversal_reason: string | null
  created_at: string | null
}

export interface ReportChangeOrder {
  id: string
  project_id: string
  name: string
  additional_contract_value: number | null
  created_at: string | null
}

export interface ReportEvent {
  id: string
  entity_type: string
  entity_id: string
  event_type: string
  actor_id: string | null
  reason: string | null
  before_data: Record<string, unknown>
  after_data: Record<string, unknown>
  created_at: string
}

export interface ReportAttachment {
  id: string
  entity_type: string
  entity_id: string
  file_name: string
  uploaded_by: string | null
  created_at: string | null
}

export interface ReportEmployee {
  id: string
  name: string
  job_role: string | null
}

export interface ReportBudget {
  project_id: string
  category_id: string
  amount: number
}

export interface ReportLegacyBudget {
  project_id: string
  material_budget?: number | null
  labor_budget?: number | null
  equipment_budget?: number | null
  subcontractor_budget?: number | null
  others_budget?: number | null
  cap_leases_budget?: number | null
  consumable_budget?: number | null
}

export interface ReportDataset {
  companyName: string
  timezone: string
  generatedAt: string
  /** True when project_category_budgets could be read. Empty then means no budget, not the legacy columns. */
  useCategoryBudgets: boolean
  invoicesRead: boolean
  /** Masters may see deleted-entity events. */
  isMaster: boolean
  projects: ReportProject[]
  categories: ReportCategory[]
  costs: ReportCost[]
  invoices: ReportInvoice[]
  changeOrders: ReportChangeOrder[]
  events: ReportEvent[]
  attachments: ReportAttachment[]
  employees: ReportEmployee[]
  budgets: ReportBudget[]
  legacyBudgets: ReportLegacyBudget[]
  actors: Record<string, string>
  gpGoalPercent: number | null
  laborFields?: Array<{ key: string; label: string }>
}

export interface ReportParams {
  range: string
  from?: string
  to?: string
  projects: 'all' | string[]
  project_status: 'active' | 'all'
  include_edits?: boolean
  group_detail_by?: 'none' | 'project'
  per_project_sections?: boolean
  categories?: string[]
  vendor?: string
  change_order?: string
  hide_netted_pairs?: boolean
  employees?: string[]
  job_role?: string
  split_by_project?: boolean
  min_total?: number
}

export interface AccessScope {
  tenant_id: string | null
  user_id: string
  role: string | null
  is_active: boolean
  timezone: string
  project_ids: string[]
  read_category_ids: string[]
  invoices_read: boolean
  employees_read: boolean
  can_schedule: boolean
}
