import { defaultRangeFor, RANGE_PRESETS } from './date-range'
import { REPORT_KEYS, type ReportKey, type ReportParams } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const EXTRA_KEYS: Record<ReportKey, string[]> = {
  activity: ['include_edits', 'group_detail_by'],
  job_cost_summary: ['per_project_sections'],
  cost_detail: ['categories', 'vendor', 'change_order', 'hide_netted_pairs'],
  labor_by_employee: ['employees', 'job_role', 'split_by_project'],
  invoicing_gp: [],
  portfolio: [],
  vendor_spend: ['categories', 'min_total'],
  custom: ['categories', 'vendor', 'change_order', 'employees', 'min_total'],
}

const SHARED_KEYS = ['range', 'from', 'to', 'projects', 'project_status']

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function uuidList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list of ids.`)
  if (value.length > 500) throw new Error(`${label} has too many ids.`)
  return value.map((item) => {
    if (typeof item !== 'string' || !UUID.test(item)) throw new Error(`${label} contains an invalid id.`)
    return item
  })
}

export function isReportKey(value: string): value is ReportKey {
  return (REPORT_KEYS as readonly string[]).includes(value)
}

export function parseReportParams(reportKey: string, raw: unknown): ReportParams {
  if (!isReportKey(reportKey)) throw new Error('Unknown report.')
  if (!isRecord(raw)) throw new Error('Report parameters must be an object.')
  const allowed = new Set([...SHARED_KEYS, ...EXTRA_KEYS[reportKey]])
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new Error(`Unknown parameter "${key}".`)
  }

  const range = raw.range == null ? defaultRangeFor(reportKey) : raw.range
  if (typeof range !== 'string') throw new Error('Choose a date range.')
  const year = /^year:\d{4}$/.test(range)
  if (!year && !(RANGE_PRESETS as readonly string[]).includes(range)) throw new Error('Choose a date range.')

  let projects: ReportParams['projects'] = 'all'
  if (raw.projects != null && raw.projects !== 'all') projects = uuidList(raw.projects, 'Projects')

  let projectStatus: ReportParams['project_status'] = 'all'
  if (raw.project_status != null) {
    if (raw.project_status !== 'active' && raw.project_status !== 'all') {
      throw new Error('Project status must be active or all.')
    }
    projectStatus = raw.project_status
  }

  const params: ReportParams = {
    range,
    projects,
    project_status: projectStatus,
  }
  if (typeof raw.from === 'string') params.from = raw.from
  else if (raw.from != null) throw new Error('From must be a date.')
  if (typeof raw.to === 'string') params.to = raw.to
  else if (raw.to != null) throw new Error('To must be a date.')

  if (raw.include_edits != null) {
    if (typeof raw.include_edits !== 'boolean') throw new Error('include_edits must be true or false.')
    params.include_edits = raw.include_edits
  }
  if (raw.group_detail_by != null) {
    if (raw.group_detail_by !== 'none' && raw.group_detail_by !== 'project') {
      throw new Error('Detail grouping must be none or project.')
    }
    params.group_detail_by = raw.group_detail_by
  }
  if (raw.per_project_sections != null) {
    if (typeof raw.per_project_sections !== 'boolean') throw new Error('per_project_sections must be true or false.')
    params.per_project_sections = raw.per_project_sections
  }
  if (raw.categories != null) params.categories = uuidList(raw.categories, 'Categories')
  if (raw.vendor != null) {
    if (typeof raw.vendor !== 'string' || raw.vendor.length > 255) throw new Error('Vendor filter is too long.')
    params.vendor = raw.vendor
  }
  if (raw.change_order != null) {
    if (typeof raw.change_order !== 'string' || !UUID.test(raw.change_order)) throw new Error('Change order is invalid.')
    params.change_order = raw.change_order
  }
  if (raw.hide_netted_pairs != null) {
    if (typeof raw.hide_netted_pairs !== 'boolean') throw new Error('hide_netted_pairs must be true or false.')
    params.hide_netted_pairs = raw.hide_netted_pairs
  }
  if (raw.employees != null) params.employees = uuidList(raw.employees, 'Employees')
  if (raw.job_role != null) {
    if (typeof raw.job_role !== 'string' || raw.job_role.length > 120) throw new Error('Job role filter is too long.')
    params.job_role = raw.job_role
  }
  if (raw.split_by_project != null) {
    if (typeof raw.split_by_project !== 'boolean') throw new Error('split_by_project must be true or false.')
    params.split_by_project = raw.split_by_project
  }
  if (raw.min_total != null) {
    if (typeof raw.min_total !== 'number' || !Number.isFinite(raw.min_total) || raw.min_total < 0) {
      throw new Error('Minimum total must be a number zero or greater.')
    }
    params.min_total = raw.min_total
  }
  return params
}

/** Query-string form used by report links, including the link in a scheduled email. */
export function paramsToSearch(params: ReportParams): string {
  const query = new URLSearchParams()
  query.set('range', params.range)
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  query.set('projects', params.projects === 'all' ? 'all' : params.projects.join(','))
  query.set('project_status', params.project_status)
  if (params.include_edits) query.set('include_edits', '1')
  if (params.group_detail_by && params.group_detail_by !== 'none') query.set('group_detail_by', params.group_detail_by)
  if (params.per_project_sections === false) query.set('per_project_sections', '0')
  if (params.categories?.length) query.set('categories', params.categories.join(','))
  if (params.vendor) query.set('vendor', params.vendor)
  if (params.change_order) query.set('change_order', params.change_order)
  if (params.hide_netted_pairs) query.set('hide_netted_pairs', '1')
  if (params.employees?.length) query.set('employees', params.employees.join(','))
  if (params.job_role) query.set('job_role', params.job_role)
  if (params.split_by_project) query.set('split_by_project', '1')
  if (params.min_total != null) query.set('min_total', String(params.min_total))
  return query.toString()
}

export function paramsFromSearch(reportKey: string, search: URLSearchParams): ReportParams {
  const raw: Record<string, unknown> = {}
  const range = search.get('range')
  if (range) raw.range = range
  const from = search.get('from')
  const to = search.get('to')
  if (from) raw.from = from
  if (to) raw.to = to
  const projects = search.get('projects')
  if (projects && projects !== 'all') raw.projects = projects.split(',').filter(Boolean)
  const status = search.get('project_status')
  if (status) raw.project_status = status
  if (search.get('include_edits') === '1') raw.include_edits = true
  const group = search.get('group_detail_by')
  if (group) raw.group_detail_by = group
  if (search.get('per_project_sections') === '0') raw.per_project_sections = false
  const categories = search.get('categories')
  if (categories) raw.categories = categories.split(',').filter(Boolean)
  const vendor = search.get('vendor')
  if (vendor) raw.vendor = vendor
  const change = search.get('change_order')
  if (change) raw.change_order = change
  if (search.get('hide_netted_pairs') === '1') raw.hide_netted_pairs = true
  const employees = search.get('employees')
  if (employees) raw.employees = employees.split(',').filter(Boolean)
  const role = search.get('job_role')
  if (role) raw.job_role = role
  if (search.get('split_by_project') === '1') raw.split_by_project = true
  const min = search.get('min_total')
  if (min) raw.min_total = Number(min)
  return parseReportParams(reportKey, raw)
}
