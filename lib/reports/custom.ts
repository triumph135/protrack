import { PRESET_LABELS } from './date-range'
import type { ReportParams } from './types'

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

interface FieldMeta {
  key: string
  label: string
  description: string
}

interface ColumnMeta extends FieldMeta {
  kind: 'text' | 'money' | 'hours' | 'number'
  sums: boolean
}

const COLUMN_META: Record<string, ColumnMeta> = {
  date: { key: 'date', label: 'Date', description: 'When the row was dated', kind: 'text', sums: false },
  project: { key: 'project', label: 'Project', description: 'Job name', kind: 'text', sums: false },
  job_number: { key: 'job_number', label: 'Job number', description: 'The job number', kind: 'text', sums: false },
  customer: { key: 'customer', label: 'Customer', description: 'Customer on the job', kind: 'text', sums: false },
  category: { key: 'category', label: 'Category', description: 'Cost category', kind: 'text', sums: false },
  parent_category: { key: 'parent_category', label: 'Parent category', description: 'The category above this one', kind: 'text', sums: false },
  vendor: { key: 'vendor', label: 'Vendor', description: 'Who was paid', kind: 'text', sums: false },
  employee: { key: 'employee', label: 'Employee', description: 'Person on the labor row', kind: 'text', sums: false },
  job_role: { key: 'job_role', label: 'Job role', description: 'Role on the employee card', kind: 'text', sums: false },
  description: { key: 'description', label: 'Description', description: 'What the entry says', kind: 'text', sums: false },
  invoice_number: { key: 'invoice_number', label: 'Invoice number', description: 'Vendor or customer invoice number', kind: 'text', sums: false },
  change_order: { key: 'change_order', label: 'Change order', description: 'Change order on the row', kind: 'text', sums: false },
  entry_type: { key: 'entry_type', label: 'Entry type', description: 'Original, reversal, invoice, or credit memo', kind: 'text', sums: false },
  st_hours: { key: 'st_hours', label: 'ST hours', description: 'Straight-time hours', kind: 'hours', sums: true },
  ot_hours: { key: 'ot_hours', label: 'OT hours', description: 'Overtime hours', kind: 'hours', sums: true },
  dt_hours: { key: 'dt_hours', label: 'DT hours', description: 'Double-time hours', kind: 'hours', sums: true },
  total_hours: { key: 'total_hours', label: 'Total hours', description: 'Straight, over, and double time', kind: 'hours', sums: true },
  mob: { key: 'mob', label: 'Mobilization', description: 'Mobilization quantity', kind: 'number', sums: true },
  per_diem: { key: 'per_diem', label: 'Per diem', description: 'Per diem dollars', kind: 'money', sums: true },
  amount: { key: 'amount', label: 'Amount', description: 'Net amount, reversals included', kind: 'money', sums: true },
  collected: { key: 'collected', label: 'Collected', description: 'Amount collected. Not used in gross profit.', kind: 'money', sums: true },
  type: { key: 'type', label: 'Type', description: 'Cost, invoice, edit, or category move', kind: 'text', sums: false },
  detail: { key: 'detail', label: 'Detail', description: 'What changed', kind: 'text', sums: false },
  actor: { key: 'actor', label: 'By', description: 'Who made the change', kind: 'text', sums: false },
}

const GROUP_META: Record<string, FieldMeta> = {
  project: { key: 'project', label: 'Project', description: 'One row per job' },
  category: { key: 'category', label: 'Category', description: 'One row per category' },
  parent_category: { key: 'parent_category', label: 'Parent category', description: 'One row per parent category' },
  vendor: { key: 'vendor', label: 'Vendor', description: 'One row per vendor' },
  employee: { key: 'employee', label: 'Employee', description: 'One row per person' },
  job_role: { key: 'job_role', label: 'Job role', description: 'One row per role' },
  change_order: { key: 'change_order', label: 'Change order', description: 'One row per change order' },
  entry_type: { key: 'entry_type', label: 'Entry type', description: 'Originals and reversals apart' },
  month: { key: 'month', label: 'Month', description: 'One row per calendar month' },
  quarter: { key: 'quarter', label: 'Quarter', description: 'One row per quarter' },
  year: { key: 'year', label: 'Year', description: 'One row per year' },
  type: { key: 'type', label: 'Type', description: 'Cost, invoice, edit, or move' },
}

const FILTER_META: Record<string, FieldMeta> = {
  categories: { key: 'categories', label: 'Categories', description: 'Limit to these categories' },
  vendorContains: { key: 'vendorContains', label: 'Vendor contains', description: 'Vendor name contains this text' },
  employee: { key: 'employee', label: 'Employee', description: 'One employee' },
  changeOrder: { key: 'changeOrder', label: 'Change order', description: 'One change order' },
  amountMin: { key: 'amountMin', label: 'Minimum amount', description: 'Drop rows under this amount' },
  amountMax: { key: 'amountMax', label: 'Maximum amount', description: 'Drop rows over this amount' },
}

export interface SourceDefinition {
  key: CustomSource
  title: string
  description: string
  summaryNoun: string
  columns: ColumnMeta[]
  groups: FieldMeta[]
  filters: FieldMeta[]
  defaults: string[]
}

function metaColumns(keys: readonly string[]): ColumnMeta[] {
  return keys.map((key) => COLUMN_META[key])
}

function metaGroups(keys: readonly string[]): FieldMeta[] {
  return keys.map((key) => GROUP_META[key])
}

function metaFilters(keys: readonly string[]): FieldMeta[] {
  return keys.map((key) => FILTER_META[key])
}

export const SOURCE_SCHEMA: SourceDefinition[] = [
  {
    key: 'costs',
    title: 'Costs',
    description: 'Every cost you can see, including materials and labor. Reversals stay in the total.',
    summaryNoun: 'cost',
    columns: metaColumns(COST_COLUMNS),
    groups: metaGroups(['project', 'category', 'parent_category', 'vendor', 'employee', 'job_role', 'change_order', 'entry_type', 'month', 'quarter', 'year']),
    filters: metaFilters(['categories', 'vendorContains', 'employee', 'changeOrder', 'amountMin', 'amountMax']),
    defaults: ['date', 'project', 'category', 'vendor', 'amount'],
  },
  {
    key: 'labor',
    title: 'Labor',
    description: 'Labor entries only, with hours and labor cost.',
    summaryNoun: 'labor',
    columns: metaColumns(COST_COLUMNS.filter((column) => column !== 'vendor')),
    groups: metaGroups(['project', 'category', 'parent_category', 'employee', 'job_role', 'change_order', 'entry_type', 'month', 'quarter', 'year']),
    filters: metaFilters(['categories', 'employee', 'changeOrder', 'amountMin', 'amountMax']),
    defaults: ['date', 'employee', 'total_hours', 'amount'],
  },
  {
    key: 'invoices',
    title: 'Invoices',
    description: 'Invoices and credit memos. A credit memo reduces the total.',
    summaryNoun: 'invoice',
    columns: metaColumns(INVOICE_COLUMNS),
    groups: metaGroups(['project', 'change_order', 'entry_type', 'month', 'quarter', 'year']),
    filters: metaFilters(['changeOrder', 'amountMin', 'amountMax']),
    defaults: ['date', 'project', 'invoice_number', 'amount'],
  },
  {
    key: 'activity',
    title: 'Activity',
    description: 'Costs, invoices, edits, and category moves in one list.',
    summaryNoun: 'activity',
    columns: metaColumns(ACTIVITY_COLUMNS),
    groups: metaGroups(['project', 'category', 'type', 'month', 'quarter', 'year']),
    filters: metaFilters(['categories', 'amountMin', 'amountMax']),
    defaults: ['date', 'type', 'project', 'detail', 'amount'],
  },
]

export function sourceDefinition(source: CustomSource): SourceDefinition {
  const found = SOURCE_SCHEMA.find((item) => item.key === source)
  if (!found) throw new Error('Choose a data source: costs, labor, invoices, or activity.')
  return found
}

function columnsFor(source: CustomSource): readonly string[] {
  return sourceDefinition(source).columns.map((column) => column.key)
}

function sourceLabel(source: CustomSource): string {
  return sourceDefinition(source).title
}

/** Groups the server still accepts, including older saved reports. The builder offers a shorter list. */
export function groupAllowed(source: CustomSource, field: string): boolean {
  if (field === 'type') return source === 'activity'
  if (!(GROUP_FIELDS as readonly string[]).includes(field)) return false
  if (source === 'invoices' && ['category', 'parent_category', 'vendor', 'employee', 'job_role'].includes(field)) return false
  if (source === 'activity' && ['employee', 'job_role', 'vendor'].includes(field)) return false
  return true
}

function filterAllowed(source: CustomSource, key: string): boolean {
  if (['range', 'from', 'to', 'projects', 'project_status'].includes(key)) return true
  return sourceDefinition(source).filters.some((filter) => filter.key === key)
}

export function columnBlockReason(source: CustomSource, column: string, groupBy: string[]): string | null {
  const found = sourceDefinition(source).columns.find((item) => item.key === column)
  if (!found) return 'This column does not belong to this source.'
  if (groupBy.length > 0 && !found.sums && !groupBy.includes(column)) {
    return 'A grouped report sums numbers. This column is text, so it is left out. Turn grouping off to see each row.'
  }
  return null
}

export interface BuilderDraft {
  source: CustomSource | null
  columns: string[]
  groupBy: string[]
  filters: CustomConfig['filters']
}

export function emptyBuilderDraft(): BuilderDraft {
  return { source: null, columns: [], groupBy: [], filters: { range: 'this_year', projects: 'all', project_status: 'all' } }
}

export interface CustomExample {
  title: string
  blurb: string
  draft: BuilderDraft
}

export const CUSTOM_EXAMPLES: CustomExample[] = [
  {
    title: 'Vendor spend by month',
    blurb: 'Costs grouped by vendor and month for this year.',
    draft: { source: 'costs', columns: ['vendor', 'amount'], groupBy: ['vendor', 'month'], filters: { range: 'this_year', projects: 'all', project_status: 'all' } },
  },
  {
    title: 'Labor by employee',
    blurb: 'Hours and labor cost for each person this month.',
    draft: { source: 'labor', columns: ['employee', 'total_hours', 'amount'], groupBy: ['employee'], filters: { range: 'this_month', projects: 'all', project_status: 'all' } },
  },
  {
    title: 'Invoices by project',
    blurb: 'Invoice totals for each job, all time.',
    draft: { source: 'invoices', columns: ['project', 'amount'], groupBy: ['project'], filters: { range: 'all_time', projects: 'all', project_status: 'all' } },
  },
]

function fieldLabel(key: string): string {
  return COLUMN_META[key]?.label || GROUP_META[key]?.label || FILTER_META[key]?.label || key.replaceAll('_', ' ')
}

export function changeSource(draft: BuilderDraft, source: CustomSource): { draft: BuilderDraft; removed: string[] } {
  const next = sourceDefinition(source)
  const allowedColumns = new Set(next.columns.map((column) => column.key))
  const allowedGroups = new Set(next.groups.map((group) => group.key))
  const removed: string[] = []
  for (const column of draft.columns) {
    const customOk = column.startsWith('custom:') && (source === 'costs' || source === 'labor')
    if (!allowedColumns.has(column) && !customOk) removed.push(fieldLabel(column))
  }
  const groupBy = draft.groupBy.filter((field) => {
    if (allowedGroups.has(field)) return true
    removed.push(fieldLabel(field))
    return false
  }).slice(0, 2)
  const filters: CustomConfig['filters'] = {
    range: draft.filters.range,
    from: draft.filters.from,
    to: draft.filters.to,
    projects: draft.filters.projects,
    project_status: draft.filters.project_status,
  }
  for (const filter of next.filters) {
    const key = filter.key as keyof CustomConfig['filters']
    const value = draft.filters[key]
    if (value == null || value === '') continue
    filters[key] = value as never
  }
  for (const filter of Object.keys(FILTER_META)) {
    const key = filter as keyof CustomConfig['filters']
    const value = draft.filters[key]
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue
    if (filters[key] != null) continue
    removed.push(FILTER_META[filter].label)
  }
  let columns = [...next.defaults]
  if (groupBy.length > 0) {
    columns = columns.filter((column) => !columnBlockReason(source, column, groupBy))
  }
  if (columns.length === 0) columns = next.defaults.filter((column) => column === 'amount' || COLUMN_META[column]?.sums)
  if (columns.length === 0) columns = ['amount']
  return { draft: { source, columns, groupBy, filters }, removed }
}

export function setDraftGroupBy(draft: BuilderDraft, groupBy: string[]): { draft: BuilderDraft; removed: string[] } {
  if (!draft.source) return { draft, removed: [] }
  const allowed = new Set(sourceDefinition(draft.source).groups.map((group) => group.key))
  const next = groupBy.filter((field) => allowed.has(field)).slice(0, 2)
  const removed: string[] = []
  let columns = draft.columns
  if (next.length > 0) {
    columns = columns.filter((column) => {
      if (!columnBlockReason(draft.source as CustomSource, column, next)) return true
      removed.push(fieldLabel(column))
      return false
    })
  }
  if (columns.length === 0) columns = sourceDefinition(draft.source).defaults.filter((column) => !columnBlockReason(draft.source as CustomSource, column, next))
  if (columns.length === 0) columns = ['amount']
  return { draft: { ...draft, columns, groupBy: next }, removed }
}

function rangePhrase(filters: CustomConfig['filters']): string {
  const range = filters.range || 'this_year'
  if (range === 'custom' && filters.from && filters.to) return `${filters.from} to ${filters.to}`
  const year = /^year:(\d{4})$/.exec(range)
  if (year) return year[1]
  const label = PRESET_LABELS[range] || range
  return label.charAt(0).toLowerCase() + label.slice(1)
}

export function customSummary(draft: BuilderDraft): string {
  if (!draft.source) return 'Pick a source to see a preview.'
  const noun = sourceDefinition(draft.source).summaryNoun
  const projects = draft.filters.projects && draft.filters.projects !== 'all'
    ? `for ${draft.filters.projects.length} project${draft.filters.projects.length === 1 ? '' : 's'}`
    : 'across all projects'
  const range = rangePhrase(draft.filters)
  const groupedNoun = draft.source === 'labor' ? 'labor cost' : draft.source === 'costs' ? 'costs' : draft.source === 'invoices' ? 'invoices' : 'activity'
  if (draft.groupBy.length > 0) {
    const groups = draft.groupBy.map((field) => fieldLabel(field).toLowerCase()).join(' and ')
    const detail = draft.columns.find((column) => !draft.groupBy.includes(column) && !COLUMN_META[column]?.sums)
    const by = detail ? ` by ${fieldLabel(detail).toLowerCase()}` : ''
    return `Showing ${groupedNoun}${by}, grouped by ${groups}, for ${range} ${projects}.`
  }
  const shown = draft.columns.slice(0, 3).map((column) => fieldLabel(column).toLowerCase())
  const withColumns = shown.length ? `, with ${shown.join(', ')}` : ''
  return `Showing each ${noun} row${withColumns}, for ${range} ${projects}.`
}

export function paramsForCustom(config: Pick<CustomConfig, 'filters'>, base?: Partial<ReportParams>): ReportParams {
  const params: ReportParams = {
    range: config.filters.range || base?.range || 'this_year',
    projects: config.filters.projects ?? base?.projects ?? 'all',
    project_status: config.filters.project_status || base?.project_status || 'all',
  }
  const from = config.filters.from ?? base?.from
  const to = config.filters.to ?? base?.to
  if (from) params.from = from
  if (to) params.to = to
  return params
}

export function draftToConfig(draft: BuilderDraft, customKeys: string[] = []): CustomConfig {
  if (!draft.source) throw new Error('Choose a data source: costs, labor, invoices, or activity.')
  return parseCustomConfig({
    source: draft.source,
    columns: draft.columns,
    groupBy: draft.groupBy,
    filters: draft.filters,
  }, customKeys)
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
      if (typeof field !== 'string' || !groupAllowed(source, field)) {
        if (typeof field === 'string' && (GROUP_FIELDS as readonly string[]).includes(field)) {
          throw new Error(`${sourceLabel(source)} cannot be grouped by ${field}.`)
        }
        throw new Error(`Unknown group field "${String(field)}".`)
      }
      if (!groupBy.includes(field)) groupBy.push(field)
    }
  }

  const filters: CustomConfig['filters'] = {}
  if (raw.filters != null) {
    if (!isRecord(raw.filters)) throw new Error('Filters must be an object.')
    for (const key of Object.keys(raw.filters)) {
      const value = raw.filters[key]
      const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0)
      if ((FILTER_KEYS as readonly string[]).includes(key)) {
        if (!empty && !filterAllowed(source, key)) throw new Error(`${sourceLabel(source)} cannot be filtered by ${FILTER_META[key]?.label || key}.`)
        continue
      }
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
