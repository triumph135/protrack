import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import { readCompanySettings } from '@/lib/company-settings'
import { normalizeTimeZone, resolveRange } from './date-range'
import { resolveCategoryId } from './compute'
import type {
  AccessScope,
  ReportAttachment,
  ReportBudget,
  ReportCategory,
  ReportChangeOrder,
  ReportCost,
  ReportDataset,
  ReportEmployee,
  ReportEvent,
  ReportInvoice,
  ReportLegacyBudget,
  ReportParams,
  ReportProject,
} from './types'

const PAGE = 1000
export const SOURCE_ROW_CAP = 50_000
export const TOO_LARGE = 'This report is too large. Narrow the date range or projects.'

type Admin = SupabaseClient<Database>

export function parseScope(value: unknown): AccessScope {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const list = (key: string) => (Array.isArray(row[key]) ? row[key].map((item) => String(item)) : [])
  return {
    tenant_id: typeof row.tenant_id === 'string' ? row.tenant_id : null,
    user_id: typeof row.user_id === 'string' ? row.user_id : '',
    role: typeof row.role === 'string' ? row.role : null,
    is_active: row.is_active === true,
    timezone: normalizeTimeZone(typeof row.timezone === 'string' ? row.timezone : null),
    project_ids: list('project_ids'),
    read_category_ids: list('read_category_ids'),
    invoices_read: row.invoices_read === true,
    employees_read: row.employees_read === true,
    can_schedule: row.can_schedule === true,
  }
}

export async function loadScope(admin: Admin, userId: string): Promise<AccessScope> {
  const { data, error } = await admin.rpc('report_access_scope', { p_user_id: userId })
  if (error) throw error
  return parseScope(data as Json)
}

async function page<T>(
  label: string,
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  sink: T[],
): Promise<void> {
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    const rows = data || []
    sink.push(...rows)
    if (sink.length > SOURCE_ROW_CAP) throw new Error(TOO_LARGE)
    if (rows.length < PAGE) return
  }
}

function withAncestors(categories: ReportCategory[], ids: Set<string>): ReportCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const keep = new Set(ids)
  for (const id of ids) {
    let current = byId.get(id)
    while (current?.parent_id) {
      keep.add(current.parent_id)
      current = byId.get(current.parent_id)
    }
  }
  return categories.filter((category) => keep.has(category.id))
}

export async function loadDataset(admin: Admin, scope: AccessScope, params: ReportParams): Promise<ReportDataset> {
  if (!scope.tenant_id) {
    return emptyDataset(scope)
  }
  const range = resolveRange(
    { range: params.range, from: params.from, to: params.to },
    scope.timezone,
  )
  const wanted = params.projects === 'all' ? scope.project_ids : params.projects.filter((id) => scope.project_ids.includes(id))
  const { data: projectRows, error: projectError } = await admin
    .from('projects')
    .select('id, jobNumber, jobName, customer, status, totalContractValue')
    .eq('tenant_id', scope.tenant_id)
    .in('id', wanted.length ? wanted : ['00000000-0000-0000-0000-000000000000'])
  if (projectError) throw new Error(projectError.message)
  let projects: ReportProject[] = (projectRows || []).map((row) => ({
    id: row.id,
    jobNumber: row.jobNumber,
    jobName: row.jobName,
    customer: row.customer,
    status: row.status,
    totalContractValue: row.totalContractValue,
  }))
  if (params.project_status === 'active') {
    projects = projects.filter((project) => (project.status || '').toLowerCase() === 'active')
  }
  const projectIds = projects.map((project) => project.id)

  const { data: categoryRows, error: categoryError } = await admin
    .from('cost_categories')
    .select('id, name, kind, parent_id, builtin_key, sort_order, is_hidden')
    .eq('tenant_id', scope.tenant_id)
  if (categoryError) throw new Error(categoryError.message)
  const allCategories: ReportCategory[] = (categoryRows || []).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    parent_id: row.parent_id,
    builtin_key: row.builtin_key,
    sort_order: row.sort_order,
    is_hidden: row.is_hidden,
  }))
  const readable = new Set(scope.read_category_ids)
  const categories = withAncestors(allCategories, readable)

  const { data: tenantRow, error: tenantError } = await admin
    .from('tenants')
    .select('name, settings')
    .eq('id', scope.tenant_id)
    .maybeSingle()
  if (tenantError) throw new Error(tenantError.message)
  const settings = readCompanySettings(tenantRow?.settings)

  const costs: ReportCost[] = []
  const invoices: ReportInvoice[] = []
  const events: ReportEvent[] = []
  const attachments: ReportAttachment[] = []
  if (projectIds.length > 0) {
    await page('costs', async (from, to) => {
      let query = admin
        .from('project_costs')
        .select('id, project_id, category_id, category, date, cost, vendor, invoice_number, description, employee_name, employee_id, st_hours, ot_hours, dt_hours, per_diem, mob_qty, change_order_id, custom_fields, reversal_of_id, reversed_at, reversal_reason, created_at')
        .eq('tenant_id', scope.tenant_id!)
        .in('project_id', projectIds)
        .order('id', { ascending: true })
        .range(from, to)
      if (range.from) query = query.gte('date', range.from)
      if (range.to) query = query.lte('date', range.to)
      const result = await query
      return { data: (result.data || []) as ReportCost[], error: result.error }
    }, costs)

    if (scope.invoices_read) {
      await page('invoices', async (from, to) => {
        let query = admin
          .from('customer_invoices')
          .select('id, project_id, invoice_number, amount, amount_collected, date_billed, change_order_id, reversal_of_id, reversal_reason, created_at')
          .eq('tenant_id', scope.tenant_id!)
          .in('project_id', projectIds)
          .order('id', { ascending: true })
          .range(from, to)
        if (range.from) query = query.gte('date_billed', range.from)
        if (range.to) query = query.lte('date_billed', range.to)
        const result = await query
        return {
          data: (result.data || []).map((row) => ({ ...row, amount_collected: row.amount_collected })),
          error: result.error,
        }
      }, invoices)
    }

    await page('events', async (from, to) => {
      let query = admin
        .from('record_events')
        .select('id, entity_type, entity_id, event_type, actor_id, reason, before_data, after_data, created_at')
        .eq('tenant_id', scope.tenant_id!)
        .order('created_at', { ascending: true })
        .range(from, to)
      if (range.from) query = query.gte('created_at', `${range.from}T00:00:00.000Z`)
      if (range.to) query = query.lte('created_at', `${addUtcDays(range.to, 2)}T23:59:59.999Z`)
      const result = await query
      return {
        data: (result.data || []).map((row) => ({
          ...row,
          before_data: (row.before_data && typeof row.before_data === 'object' ? row.before_data : {}) as Record<string, unknown>,
          after_data: (row.after_data && typeof row.after_data === 'object' ? row.after_data : {}) as Record<string, unknown>,
        })),
        error: result.error,
      }
    }, events)

    await page('attachments', async (from, to) => {
      let query = admin
        .from('attachments')
        .select('id, entity_type, entity_id, file_name, uploaded_by, created_at')
        .eq('tenant_id', scope.tenant_id!)
        .order('id', { ascending: true })
        .range(from, to)
      if (range.from) query = query.gte('created_at', `${range.from}T00:00:00.000Z`)
      if (range.to) query = query.lte('created_at', `${addUtcDays(range.to, 2)}T23:59:59.999Z`)
      const result = await query
      return { data: result.data || [], error: result.error }
    }, attachments)
  }

  const visibleCosts = costs.filter((row) => {
    const id = resolveCategoryId(row, allCategories)
    return !!id && readable.has(id)
  }).map((row) => ({
    ...row,
    custom_fields: row.custom_fields && typeof row.custom_fields === 'object' && !Array.isArray(row.custom_fields)
      ? row.custom_fields as Record<string, string | number | null>
      : null,
  }))

  const loaded = visibleCosts.length + invoices.length + events.length + attachments.length
  if (loaded > SOURCE_ROW_CAP) throw new Error(TOO_LARGE)

  const { data: orderRows, error: orderError } = projectIds.length
    ? await admin.from('change_orders').select('id, project_id, name, additional_contract_value, created_at').eq('tenant_id', scope.tenant_id).in('project_id', projectIds)
    : { data: [], error: null }
  if (orderError) throw new Error(orderError.message)

  const { data: employeeRows, error: employeeError } = await admin
    .from('employees')
    .select('id, name, job_role')
    .eq('tenant_id', scope.tenant_id)
  if (employeeError) throw new Error(employeeError.message)

  const { data: budgetRows, error: budgetError } = projectIds.length
    ? await admin.from('project_category_budgets').select('project_id, category_id, amount').eq('tenant_id', scope.tenant_id).in('project_id', projectIds)
    : { data: [], error: null }
  const useCategoryBudgets = !budgetError
  let legacy: ReportLegacyBudget[] = []
  if (budgetError && projectIds.length) {
    const legacyResult = await admin.from('project_budgets').select('project_id, material_budget, labor_budget, equipment_budget, subcontractor_budget, others_budget, cap_leases_budget, consumable_budget').eq('tenant_id', scope.tenant_id).in('project_id', projectIds)
    if (legacyResult.error) throw new Error(legacyResult.error.message)
    legacy = legacyResult.data || []
  }

  const { data: userRows, error: userError } = await admin.from('users').select('id, name').eq('tenant_id', scope.tenant_id)
  if (userError) throw new Error(userError.message)
  const actors: Record<string, string> = {}
  for (const user of userRows || []) actors[user.id] = user.name

  const { data: fieldRows } = await admin
    .from('labor_field_definitions')
    .select('preset_key, label, is_enabled')
    .eq('tenant_id', scope.tenant_id)
    .eq('is_enabled', true)

  return {
    companyName: tenantRow?.name || 'Company',
    timezone: scope.timezone || settings.timezone,
    generatedAt: new Date().toISOString(),
    useCategoryBudgets,
    invoicesRead: scope.invoices_read,
    isMaster: scope.role === 'master',
    projects,
    categories,
    costs: visibleCosts,
    invoices,
    changeOrders: (orderRows || []) as ReportChangeOrder[],
    events,
    attachments,
    employees: (employeeRows || []) as ReportEmployee[],
    budgets: useCategoryBudgets ? ((budgetRows || []) as ReportBudget[]) : [],
    legacyBudgets: legacy,
    actors,
    gpGoalPercent: settings.gp_goal_percent,
    laborFields: (fieldRows || []).map((field) => ({ key: field.preset_key || field.label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: field.label })),
  }
}

function emptyDataset(scope: AccessScope): ReportDataset {
  return {
    companyName: '',
    timezone: scope.timezone,
    generatedAt: new Date().toISOString(),
    useCategoryBudgets: true,
    invoicesRead: false,
    isMaster: false,
    projects: [],
    categories: [],
    costs: [],
    invoices: [],
    changeOrders: [],
    events: [],
    attachments: [],
    employees: [],
    budgets: [],
    legacyBudgets: [],
    actors: {},
    gpGoalPercent: null,
  }
}

function addUtcDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
