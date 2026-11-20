const SOURCES = ['costs', 'labor', 'invoices', 'activity'] as const
export type CustomSource = (typeof SOURCES)[number]

export const COST_COLUMNS = [
  'date',
  'project',
  'job_number',
  'customer',
  'category',
  'parent_category',
  'vendor',
  'employee',
  'job_role',
  'description',
  'invoice_number',
  'change_order',
  'entry_type',
  'st_hours',
  'ot_hours',
  'dt_hours',
  'total_hours',
  'mob',
  'per_diem',
  'amount',
] as const

export const INVOICE_COLUMNS = [
  'date',
  'project',
  'job_number',
  'customer',
  'invoice_number',
  'change_order',
  'entry_type',
  'amount',
  'collected',
] as const

export const ACTIVITY_COLUMNS = ['date', 'type', 'project', 'job_number', 'category', 'detail', 'amount', 'actor'] as const

export const GROUP_FIELDS = [
  'project',
  'category',
  'parent_category',
  'vendor',
  'employee',
  'job_role',
  'change_order',
  'entry_type',
  'month',
  'quarter',
  'year',
] as const

const FILTER_KEYS = [
  'range',
  'from',
  'to',
  'projects',
  'project_status',
  'categories',
  'vendorContains',
  'employee',
  'changeOrder',
  'amountMin',
  'amountMax',
] as const

export interface CustomConfig {
  source: CustomSource
  columns: string[]
  groupBy: string[]
  filters: {
    range?: string
    from?: string
    to?: string
    projects?: 'all' | string[]
    project_status?: 'active' | 'all'
    categories?: string[]
    vendorContains?: string
    employee?: string
    changeOrder?: string
    amountMin?: number
    amountMax?: number
  }
  sort?: { column: string; direction: 'asc' | 'desc' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function columnsFor(source: CustomSource): readonly string[] {
  if (source === 'invoices') return INVOICE_COLUMNS
  if (source === 'activity') return ACTIVITY_COLUMNS
  if (source === 'labor') return COST_COLUMNS.filter((column) => column !== 'vendor')
  return COST_COLUMNS
}

export function customColumnAllowed(source: CustomSource, column: string, customKeys: string[]): boolean {
  if ((columnsFor(source) as readonly string[]).includes(column)) return true
  if ((source === 'costs' || source === 'labor') && column.startsWith('custom:')) {
    const key = column.slice('custom:'.length)
    return /^[a-z0-9_]{1,40}$/.test(key) && customKeys.includes(key)
  }
  return false
}

/**
 * Whitelist only. Unknown sources, columns, and filters are rejected.
 * A filter may not drop reversal rows while keeping their originals.
 */
export function parseCustomConfig(raw: unknown, customKeys: string[] = []): CustomConfig {
  if (!isRecord(raw)) throw new Error('Custom report config must be an object.')
  for (const key of Object.keys(raw)) {
    if (!['source', 'columns', 'groupBy', 'filters', 'sort'].includes(key)) {
      throw new Error(`Unknown custom report field "${key}".`)
    }
  }
  if (typeof raw.source !== 'string' || !(SOURCES as readonly string[]).includes(raw.source)) {
    throw new Error('Choose a data source: costs, labor, invoices, or activity.')
  }
  const source = raw.source as CustomSource
  if (!Array.isArray(raw.columns) || raw.columns.length === 0) throw new Error('Choose at least one column.')
  if (raw.columns.length > 40) throw new Error('A custom report can have at most 40 columns.')
  const columns: string[] = []
  for (const column of raw.columns) {
    if (typeof column !== 'string' || !customColumnAllowed(source, column, customKeys)) {
      throw new Error(`Unknown column "${String(column)}".`)
    }
    if (!columns.includes(column)) columns.push(column)
  }

  const groupBy: string[] = []
  if (raw.groupBy != null) {
    if (!Array.isArray(raw.groupBy)) throw new Error('Group by must be a list.')
    if (raw.groupBy.length > 2) throw new Error('Group by at most two fields.')
    for (const field of raw.groupBy) {
      if (typeof field !== 'string' || !(GROUP_FIELDS as readonly string[]).includes(field)) {
        throw new Error(`Unknown group field "${String(field)}".`)
      }
      if (source === 'invoices' && ['category', 'parent_category', 'vendor', 'employee', 'job_role'].includes(field)) {
        throw new Error(`Invoices cannot be grouped by ${field}.`)
      }
      if (source === 'activity' && ['employee', 'job_role', 'vendor'].includes(field)) {
        throw new Error(`Activity cannot be grouped by ${field}.`)
      }
      if (!groupBy.includes(field)) groupBy.push(field)
    }
  }

  const filters: CustomConfig['filters'] = {}
  if (raw.filters != null) {
    if (!isRecord(raw.filters)) throw new Error('Filters must be an object.')
    for (const key of Object.keys(raw.filters)) {
      if ((FILTER_KEYS as readonly string[]).includes(key)) continue
      if (/reversal/i.test(key) || key === 'entryTypes' || key === 'entry_type' || key === 'hideReversals') {
        throw new Error('A custom report cannot drop reversal rows on their own.')
      }
      throw new Error(`Unknown filter "${key}".`)
    }
    const incoming = raw.filters
    if (incoming.range != null) {
      if (typeof incoming.range !== 'string') throw new Error('Choose a date range.')
      filters.range = incoming.range
    }
    if (typeof incoming.from === 'string') filters.from = incoming.from
    if (typeof incoming.to === 'string') filters.to = incoming.to
    if (incoming.projects === 'all') filters.projects = 'all'
    else if (Array.isArray(incoming.projects)) {
      filters.projects = incoming.projects.map((item) => {
        if (typeof item !== 'string') throw new Error('Projects must be ids.')
        return item
      })
    } else if (incoming.projects != null) throw new Error('Projects filter is invalid.')
    if (incoming.project_status != null) {
      if (incoming.project_status !== 'active' && incoming.project_status !== 'all') {
        throw new Error('Project status must be active or all.')
      }
      filters.project_status = incoming.project_status
    }
    if (incoming.categories != null) {
      if (!Array.isArray(incoming.categories)) throw new Error('Categories must be a list.')
      filters.categories = incoming.categories.map((item) => {
        if (typeof item !== 'string') throw new Error('Categories must be ids.')
        return item
      })
    }
    if (incoming.vendorContains != null) {
      if (typeof incoming.vendorContains !== 'string') throw new Error('Vendor filter must be text.')
      filters.vendorContains = incoming.vendorContains
    }
    if (incoming.employee != null) {
      if (typeof incoming.employee !== 'string') throw new Error('Employee filter is invalid.')
      filters.employee = incoming.employee
    }
    if (incoming.changeOrder != null) {
      if (typeof incoming.changeOrder !== 'string') throw new Error('Change order filter is invalid.')
      filters.changeOrder = incoming.changeOrder
    }
    if (incoming.amountMin != null) {
      if (typeof incoming.amountMin !== 'number' || !Number.isFinite(incoming.amountMin)) throw new Error('Minimum amount must be a number.')
      filters.amountMin = incoming.amountMin
    }
    if (incoming.amountMax != null) {
      if (typeof incoming.amountMax !== 'number' || !Number.isFinite(incoming.amountMax)) throw new Error('Maximum amount must be a number.')
      filters.amountMax = incoming.amountMax
    }
  }

  let sort: CustomConfig['sort']
  if (raw.sort != null) {
    if (!isRecord(raw.sort)) throw new Error('Sort must be an object.')
    for (const key of Object.keys(raw.sort)) {
      if (key !== 'column' && key !== 'direction') throw new Error(`Unknown sort field "${key}".`)
    }
    if (typeof raw.sort.column !== 'string' || !columns.includes(raw.sort.column) && !groupBy.includes(raw.sort.column) && raw.sort.column !== 'count') {
      throw new Error('Sort by one of the selected columns.')
    }
    if (raw.sort.direction !== 'asc' && raw.sort.direction !== 'desc') throw new Error('Sort direction must be asc or desc.')
    sort = { column: raw.sort.column, direction: raw.sort.direction }
  }

  return { source, columns, groupBy, filters, sort }
}
