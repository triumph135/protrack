import { buildCategoryTree, rollupCategoryAmounts, type CostCategoryRecord } from '@/lib/categories'
import { formatCurrency, formatHours, formatPercent } from '@/lib/format'
import { categoryBudgetState, grossProfit, grossProfitPercent } from '@/lib/overview'
import { reportTitle } from './catalog'
import { parseCustomConfig, type CustomConfig } from './custom'
import { dateInRange, formatLongDate, resolveRange, zonedDate, type ResolvedRange } from './date-range'
import { fromCents, toCents } from './money'
import type {
  BuiltReport,
  ReportCategory,
  ReportCell,
  ReportChangeOrder,
  ReportColumn,
  ReportCost,
  ReportDataset,
  ReportInvoice,
  ReportKpi,
  ReportParams,
  ReportProject,
  ReportRow,
  ReportSection,
} from './types'
import { vendorDisplayName, vendorKey } from './vendor'

const NET_NOTE = 'Reversals and credit memos are included, so totals are net.'
const CURRENT_NOTE = 'Budgets and contract value are current figures. They are not limited to this date range.'
const GP_NOTE = 'Gross profit is invoiced minus cost. Collected cash is not part of gross profit.'
export const INVOICE_HIDDEN_NOTE = 'Invoices hidden: no invoice access.'
export const NO_LABOR_ACCESS = 'No labor access'

const LEGACY_BUDGET: Record<string, keyof NonNullable<ReportDataset['legacyBudgets'][number]>> = {
  material: 'material_budget',
  labor: 'labor_budget',
  equipment: 'equipment_budget',
  subcontractor: 'subcontractor_budget',
  others: 'others_budget',
  cap_leases: 'cap_leases_budget',
  consumable: 'consumable_budget',
}

function asCategory(category: ReportCategory): CostCategoryRecord {
  return {
    ...category,
    tenant_id: '',
    kind: category.kind === 'labor' || category.kind === 'named' ? category.kind : 'standard',
    is_builtin: !!category.builtin_key,
    gl_code: null,
  }
}

function money(cents: number): number {
  return fromCents(cents)
}

function moneyText(cents: number): string {
  return formatCurrency(fromCents(cents))
}

function kpiMoney(label: string, cents: number, detail?: string): ReportKpi {
  return { label, value: moneyText(cents), cents, detail }
}

export function selectedProjects(dataset: ReportDataset, params: ReportParams): ReportProject[] {
  let projects = dataset.projects
  if (params.project_status === 'active') {
    projects = projects.filter((project) => (project.status || '').toLowerCase() === 'active')
  }
  if (params.projects !== 'all') {
    const ids = new Set(params.projects)
    projects = projects.filter((project) => ids.has(project.id))
  }
  return projects
}

function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

export function resolveCategoryId(
  row: { category_id: string | null; category: string | null },
  categories: ReportCategory[],
): string | null {
  if (row.category_id && categories.some((category) => category.id === row.category_id)) return row.category_id
  const key = (row.category || '').trim()
  if (!key) return null
  return categories.find((category) => category.builtin_key === key && !category.parent_id)?.id ?? null
}

function categoryPath(id: string | null, categories: ReportCategory[]): string {
  if (!id) return ''
  const map = byId(categories)
  const names: string[] = []
  const seen = new Set<string>()
  let current = map.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    names.unshift(current.name)
    current = current.parent_id ? map.get(current.parent_id) : undefined
  }
  return names.join(' / ')
}

function parentName(id: string | null, categories: ReportCategory[]): string {
  if (!id) return ''
  const map = byId(categories)
  const category = map.get(id)
  if (!category) return ''
  if (!category.parent_id) return category.name
  return map.get(category.parent_id)?.name || category.name
}

function isLaborCategory(id: string | null, categories: ReportCategory[]): boolean {
  if (!id) return false
  const map = byId(categories)
  const seen = new Set<string>()
  let current = map.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (current.kind === 'labor') return true
    current = current.parent_id ? map.get(current.parent_id) : undefined
  }
  return false
}

function projectLabel(project: ReportProject | undefined): string {
  if (!project) return ''
  return `${project.jobNumber} ${project.jobName}`
}

function inRangeCosts(dataset: ReportDataset, params: ReportParams, range: ResolvedRange): ReportCost[] {
  const projects = new Set(selectedProjects(dataset, params).map((project) => project.id))
  const categories = params.categories?.length ? new Set(params.categories) : null
  return dataset.costs.filter((row) => {
    if (!projects.has(row.project_id)) return false
    if (!dateInRange(row.date, range)) return false
    const categoryId = resolveCategoryId(row, dataset.categories)
    if (categories && (!categoryId || !categories.has(categoryId))) return false
    return true
  })
}

function inRangeInvoices(dataset: ReportDataset, params: ReportParams, range: ResolvedRange): ReportInvoice[] {
  if (!dataset.invoicesRead) return []
  const projects = new Set(selectedProjects(dataset, params).map((project) => project.id))
  return dataset.invoices.filter((row) => projects.has(row.project_id) && dateInRange(row.date_billed, range))
}

function entryLabel(row: ReportCost, rows: ReportCost[]): string {
  if (row.reversal_of_id) return 'Reversal'
  const reversals = rows.filter((item) => item.reversal_of_id === row.id)
  if (reversals.length === 0) return row.reversed_at ? 'Reversed' : 'Original'
  const net = toCents(row.cost) + reversals.reduce((sum, item) => sum + toCents(item.cost), 0)
  if (net === 0 || row.reversed_at) return 'Reversed'
  return 'Partially reversed'
}

function withoutNettedPairs(rows: ReportCost[]): ReportCost[] {
  const reversals = new Map<string, ReportCost[]>()
  for (const row of rows) {
    if (!row.reversal_of_id) continue
    const list = reversals.get(row.reversal_of_id) || []
    list.push(row)
    reversals.set(row.reversal_of_id, list)
  }
  const drop = new Set<string>()
  for (const row of rows) {
    if (row.reversal_of_id) continue
    const partners = reversals.get(row.id) || []
    if (partners.length === 0) continue
    const net = toCents(row.cost) + partners.reduce((sum, item) => sum + toCents(item.cost), 0)
    if (net === 0) {
      drop.add(row.id)
      partners.forEach((item) => drop.add(item.id))
    }
  }
  return rows.filter((row) => !drop.has(row.id))
}

function contractCents(project: ReportProject, orders: ReportChangeOrder[]): number {
  const changes = orders
    .filter((order) => order.project_id === project.id)
    .reduce((sum, order) => sum + toCents(order.additional_contract_value), 0)
  return toCents(project.totalContractValue) + changes
}

function budgetMap(dataset: ReportDataset, projectId: string): Record<string, number> {
  if (dataset.useCategoryBudgets) {
    const next: Record<string, number> = {}
    for (const row of dataset.budgets) {
      if (row.project_id === projectId) next[row.category_id] = Number(row.amount || 0)
    }
    return next
  }
  const legacy = dataset.legacyBudgets.find((row) => row.project_id === projectId)
  const next: Record<string, number> = {}
  if (!legacy) return next
  for (const category of dataset.categories) {
    const column = category.builtin_key ? LEGACY_BUDGET[category.builtin_key] : undefined
    if (!column || category.parent_id) continue
    next[category.id] = Number(legacy[column] || 0)
  }
  return next
}

function actorFor(dataset: ReportDataset, entityId: string, types: string[]): string {
  const event = dataset.events.find((item) => item.entity_id === entityId && types.includes(item.event_type))
  if (!event?.actor_id) return ''
  return dataset.actors[event.actor_id] || ''
}

function stamp(row: { created_at: string | null }, date: string): string {
  return row.created_at || `${date}T00:00:00.000Z`
}

interface ActivityItem {
  date: string
  time: string
  type: string
  projectId: string
  category: string
  detail: string
  cents: number | null
  actor: string
}

function activityItems(dataset: ReportDataset, params: ReportParams, range: ResolvedRange): ActivityItem[] {
  const projects = selectedProjects(dataset, params)
  const projectIds = new Set(projects.map((project) => project.id))
  const costs = inRangeCosts(dataset, { ...params, categories: undefined }, range)
  const invoices = inRangeInvoices(dataset, params, range)
  const items: ActivityItem[] = []

  for (const row of costs) {
    const categoryId = resolveCategoryId(row, dataset.categories)
    const labor = isLaborCategory(categoryId, dataset.categories)
    const reversal = !!row.reversal_of_id
    items.push({
      date: row.date,
      time: stamp(row, row.date),
      type: reversal ? 'Cost reversal' : labor ? 'Labor' : 'Cost',
      projectId: row.project_id,
      category: categoryPath(categoryId, dataset.categories),
      detail: reversal
        ? reversalDetail(row, dataset.costs)
        : row.employee_name
          ? [row.employee_name, hoursText(row), row.description].filter(Boolean).join(' · ')
          : [row.vendor, row.description, row.invoice_number].filter(Boolean).join(' · '),
      cents: toCents(row.cost),
      actor: actorFor(dataset, row.id, reversal ? ['reversed', 'created'] : ['created']),
    })
  }

  for (const row of invoices) {
    const credit = !!row.reversal_of_id
    const original = credit ? dataset.invoices.find((item) => item.id === row.reversal_of_id) : undefined
    items.push({
      date: row.date_billed,
      time: stamp(row, row.date_billed),
      type: credit ? 'Credit memo' : 'Invoice',
      projectId: row.project_id,
      category: '',
      detail: credit
        ? `Reversal of ${original ? formatLongDate(original.date_billed) : 'the original'}, ${original ? moneyText(toCents(original.amount)) : row.invoice_number}.${row.reversal_reason ? ` ${row.reversal_reason}` : ''}`
        : row.invoice_number,
      cents: toCents(row.amount),
      actor: actorFor(dataset, row.id, credit ? ['credit_memo', 'created'] : ['created']),
    })
  }

  for (const event of dataset.events) {
    const day = zonedDate(event.created_at, dataset.timezone)
    if (!dateInRange(day, range)) continue
    if (event.event_type === 'moved' && event.entity_type === 'cost') {
      const cost = dataset.costs.find((row) => row.id === event.entity_id)
      if (!cost || !projectIds.has(cost.project_id)) continue
      const from = String(event.before_data.category_name || event.before_data.category || '')
      const to = String(event.after_data.category_name || event.after_data.category || '')
      items.push({
        date: day || '',
        time: event.created_at,
        type: 'Category move',
        projectId: cost.project_id,
        category: categoryPath(resolveCategoryId(cost, dataset.categories), dataset.categories),
        detail: `Moved from ${from || 'unknown'} to ${to || 'unknown'}${event.reason ? `: ${event.reason}` : ''}`,
        cents: null,
        actor: event.actor_id ? dataset.actors[event.actor_id] || '' : '',
      })
    }
    if (!params.include_edits) continue
    if (event.event_type === 'updated' && event.entity_type === 'cost') {
      const cost = dataset.costs.find((row) => row.id === event.entity_id)
      if (!cost || !projectIds.has(cost.project_id)) continue
      items.push({
        date: day || '',
        time: event.created_at,
        type: 'Edit',
        projectId: cost.project_id,
        category: categoryPath(resolveCategoryId(cost, dataset.categories), dataset.categories),
        detail: event.reason || 'Edited',
        cents: null,
        actor: event.actor_id ? dataset.actors[event.actor_id] || '' : '',
      })
    }
    if (event.event_type === 'deleted' && dataset.isMaster) {
      const projectId = String(event.before_data.project_id || '')
      if (!projectIds.has(projectId)) continue
      items.push({
        date: day || '',
        time: event.created_at,
        type: 'Deletion',
        projectId,
        category: '',
        detail: event.reason || 'Deleted',
        cents: null,
        actor: event.actor_id ? dataset.actors[event.actor_id] || '' : '',
      })
    }
  }

  for (const order of dataset.changeOrders) {
    if (!projectIds.has(order.project_id)) continue
    const day = zonedDate(order.created_at, dataset.timezone)
    if (!dateInRange(day, range)) continue
    items.push({
      date: day || '',
      time: order.created_at || '',
      type: 'Change order',
      projectId: order.project_id,
      category: '',
      detail: order.name,
      cents: toCents(order.additional_contract_value),
      actor: '',
    })
  }

  const visibleCostIds = new Set(dataset.costs.filter((row) => projectIds.has(row.project_id)).map((row) => row.id))
  const visibleInvoiceIds = new Set(dataset.invoices.filter((row) => projectIds.has(row.project_id)).map((row) => row.id))
  const visibleOrderIds = new Set(dataset.changeOrders.filter((row) => projectIds.has(row.project_id)).map((row) => row.id))
  for (const file of dataset.attachments) {
    const allowed =
      (file.entity_type === 'cost' && visibleCostIds.has(file.entity_id)) ||
      (file.entity_type === 'customer_invoice' && dataset.invoicesRead && visibleInvoiceIds.has(file.entity_id)) ||
      (file.entity_type === 'project' && projectIds.has(file.entity_id)) ||
      (file.entity_type === 'change_order' && visibleOrderIds.has(file.entity_id))
    if (!allowed) continue
    const day = zonedDate(file.created_at, dataset.timezone)
    if (!dateInRange(day, range)) continue
    const projectId =
      file.entity_type === 'project'
        ? file.entity_id
        : file.entity_type === 'cost'
          ? dataset.costs.find((row) => row.id === file.entity_id)?.project_id || ''
          : file.entity_type === 'customer_invoice'
            ? dataset.invoices.find((row) => row.id === file.entity_id)?.project_id || ''
            : dataset.changeOrders.find((row) => row.id === file.entity_id)?.project_id || ''
    items.push({
      date: day || '',
      time: file.created_at || '',
      type: 'Attachment',
      projectId,
      category: '',
      detail: file.file_name,
      cents: null,
      actor: file.uploaded_by ? dataset.actors[file.uploaded_by] || '' : '',
    })
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.type.localeCompare(b.type))
  return items
}

function reversalDetail(row: ReportCost, all: ReportCost[]): string {
  const original = all.find((item) => item.id === row.reversal_of_id)
  const when = original ? formatLongDate(original.date) : 'the original'
  const amount = original ? moneyText(toCents(original.cost)) : ''
  const reason = row.reversal_reason ? ` ${row.reversal_reason}` : ''
  return `Reversal of ${when}${amount ? `, ${amount}` : ''}.${reason}`.trim()
}

function hoursText(row: ReportCost): string {
  return [
    Number(row.st_hours || 0) ? `${formatHours(row.st_hours)} ST` : '',
    Number(row.ot_hours || 0) ? `${formatHours(row.ot_hours)} OT` : '',
    Number(row.dt_hours || 0) ? `${formatHours(row.dt_hours)} DT` : '',
  ].filter(Boolean).join(', ')
}

const DETAIL_COLUMNS: ReportColumn[] = [
  { key: 'date', label: 'Date', kind: 'text' },
  { key: 'type', label: 'Type', kind: 'text' },
  { key: 'project', label: 'Project', kind: 'text' },
  { key: 'category', label: 'Category path', kind: 'text' },
  { key: 'detail', label: 'Detail', kind: 'text' },
  { key: 'amount', label: 'Amount', kind: 'money' },
  { key: 'actor', label: 'By', kind: 'text' },
]

function detailRows(items: ActivityItem[], projects: Map<string, ReportProject>): ReportRow[] {
  return items.map((item) => ({
    cells: [
      item.date,
      item.type,
      projectLabel(projects.get(item.projectId)),
      item.category,
      item.detail,
      item.cents == null ? null : money(item.cents),
      item.actor,
    ],
  }))
}

export function buildActivity(dataset: ReportDataset, params: ReportParams): BuiltReport {
  const range = resolveRange(params, dataset.timezone)
  const projects = selectedProjects(dataset, params)
  const projectMap = byId(projects)
  const costs = inRangeCosts(dataset, { ...params, categories: undefined }, range)
  const invoices = inRangeInvoices(dataset, params, range)
  const items = activityItems(dataset, params, range).filter((item) => !item.projectId || projectMap.has(item.projectId))
  const costCents = costs.reduce((sum, row) => sum + toCents(row.cost), 0)
  const laborCosts = costs.filter((row) => isLaborCategory(resolveCategoryId(row, dataset.categories), dataset.categories))
  const laborCents = laborCosts.reduce((sum, row) => sum + toCents(row.cost), 0)
  const laborHours = laborCosts.reduce((sum, row) => sum + Number(row.st_hours || 0) + Number(row.ot_hours || 0) + Number(row.dt_hours || 0), 0)
  const invoicedCents = invoices.reduce((sum, row) => sum + toCents(row.amount), 0)
  const creditCents = invoices.filter((row) => row.reversal_of_id).reduce((sum, row) => sum + toCents(row.amount), 0)
  const orders = items.filter((item) => item.type === 'Change order')
  const orderCents = orders.reduce((sum, item) => sum + (item.cents || 0), 0)

  const kpis: ReportKpi[] = [
    kpiMoney('Costs', costCents),
    kpiMoney('Labor cost', laborCents),
    { label: 'Labor hours', value: formatHours(laborHours) },
  ]
  if (dataset.invoicesRead) {
    const profit = grossProfit(fromCents(invoicedCents), fromCents(costCents))
    const percent = grossProfitPercent(fromCents(invoicedCents), fromCents(costCents))
    kpis.push(
      kpiMoney('Invoiced', invoicedCents),
      kpiMoney('Credit memos', creditCents),
      { label: 'Gross profit', value: formatCurrency(profit), cents: toCents(profit), detail: percent == null ? undefined : formatPercent(percent) },
    )
  }
  kpis.push({
    label: 'Change orders added',
    value: String(orders.length),
    detail: moneyText(orderCents),
    cents: orderCents,
  })

  const sections: ReportSection[] = [
    categoryActivitySection(dataset, costs),
    typeSection(items, params.include_edits === true),
  ]
  const detail = items
  if ((params.group_detail_by || 'none') === 'project') {
    for (const project of projects) {
      sections.push({
        title: `Detail · ${projectLabel(project)}`,
        columns: DETAIL_COLUMNS,
        rows: detailRows(detail.filter((item) => item.projectId === project.id), projectMap),
      })
    }
  } else {
    sections.push({
      title: 'Chronological detail',
      columns: DETAIL_COLUMNS,
      rows: detailRows(detail, projectMap),
    })
  }

  const notes = [NET_NOTE]
  if (!dataset.invoicesRead) notes.push(INVOICE_HIDDEN_NOTE)
  notes.push('Category moves are informational. The cost itself is counted in its current category.')
  notes.push(CURRENT_NOTE)
  return {
    key: 'activity',
    title: 'Activity for a period',
    rangeLabel: range.label,
    filters: filterLine(projects, params),
    kpis,
    sections,
    notes,
  }
}

function categoryActivitySection(dataset: ReportDataset, costs: ReportCost[]): ReportSection {
  const columns: ReportColumn[] = [
    { key: 'category', label: 'Category', kind: 'text' },
    { key: 'entries', label: 'Entries', kind: 'number' },
    { key: 'gross', label: 'Gross entered', kind: 'money' },
    { key: 'reversals', label: 'Reversals', kind: 'money' },
    { key: 'net', label: 'Net', kind: 'money' },
  ]
  const own = new Map<string, { entries: number; gross: number; reversals: number; net: number }>()
  for (const row of costs) {
    const id = resolveCategoryId(row, dataset.categories)
    if (!id) continue
    const bucket = own.get(id) || { entries: 0, gross: 0, reversals: 0, net: 0 }
    const cents = toCents(row.cost)
    bucket.entries += 1
    bucket.net += cents
    if (row.reversal_of_id) bucket.reversals += cents
    else bucket.gross += cents
    own.set(id, bucket)
  }

  const categories = dataset.categories.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const childrenOf = new Map<string | null, ReportCategory[]>()
  for (const category of categories) {
    const list = childrenOf.get(category.parent_id) || []
    list.push(category)
    childrenOf.set(category.parent_id, list)
  }
  const rolled = (id: string): { entries: number; gross: number; reversals: number; net: number } => {
    const self = own.get(id) || { entries: 0, gross: 0, reversals: 0, net: 0 }
    const acc = { ...self }
    for (const child of childrenOf.get(id) || []) {
      const nested = rolled(child.id)
      acc.entries += nested.entries
      acc.gross += nested.gross
      acc.reversals += nested.reversals
      acc.net += nested.net
    }
    return acc
  }
  const rows: ReportRow[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const category of childrenOf.get(parent) || []) {
      const hasChild = (childrenOf.get(category.id) || []).some((child) => rolled(child.id).entries > 0)
      const stats = depth === 0 ? rolled(category.id) : own.get(category.id) || { entries: 0, gross: 0, reversals: 0, net: 0 }
      const visible = stats.entries > 0 || hasChild || (depth === 0 && rolled(category.id).entries > 0)
      if (!visible) continue
      if (category.is_hidden && stats.entries === 0 && !hasChild) continue
      rows.push({
        depth,
        cells: [category.name, stats.entries, money(stats.gross), money(stats.reversals), money(stats.net)],
      })
      if (depth === 0) walk(category.id, 1)
    }
  }
  walk(null, 0)
  const loose = costs.filter((row) => !resolveCategoryId(row, dataset.categories))
  if (loose.length > 0) {
    const gross = loose.filter((row) => !row.reversal_of_id).reduce((sum, row) => sum + toCents(row.cost), 0)
    const reversals = loose.filter((row) => row.reversal_of_id).reduce((sum, row) => sum + toCents(row.cost), 0)
    rows.push({
      cells: ['Uncategorized', loose.length, money(gross), money(reversals), money(gross + reversals)],
    })
  }
  const top = rows.filter((row) => !row.depth)
  const totalEntries = top.reduce((sum, row) => sum + Number(row.cells[1] || 0), 0)
  const totalGross = top.reduce((sum, row) => sum + toCents(row.cells[2] as number), 0)
  const totalReversals = top.reduce((sum, row) => sum + toCents(row.cells[3] as number), 0)
  const totalNet = top.reduce((sum, row) => sum + toCents(row.cells[4] as number), 0)
  const totals: ReportCell[] = ['Total', totalEntries, money(totalGross), money(totalReversals), money(totalNet)]
  return { title: 'Totals by category', columns, rows, totals, fitOnePage: true }
}

function typeSection(items: ActivityItem[], includeEdits: boolean): ReportSection {
  const order = [
    'Cost',
    'Labor',
    'Cost reversal',
    'Invoice',
    'Credit memo',
    'Category move',
    'Change order',
    'Attachment',
    ...(includeEdits ? ['Edit', 'Deletion'] : []),
  ]
  const labels: Record<string, string> = {
    Cost: 'Cost entries',
    Labor: 'Labor entries',
    'Cost reversal': 'Cost reversals',
    Invoice: 'Invoices',
    'Credit memo': 'Credit memos',
    'Category move': 'Category moves',
    'Change order': 'Change orders',
    Attachment: 'Attachments added',
    Edit: 'Edits',
    Deletion: 'Deletions',
  }
  const monetary = new Set(['Cost', 'Labor', 'Cost reversal', 'Invoice', 'Credit memo', 'Change order'])
  const rows: ReportRow[] = order.map((type) => {
    const matching = items.filter((item) => item.type === type)
    const cents = matching.reduce((sum, item) => sum + (item.cents || 0), 0)
    return { cells: [labels[type], matching.length, monetary.has(type) ? money(cents) : null] }
  })
  return {
    title: 'Totals by type',
    columns: [
      { key: 'type', label: 'Type', kind: 'text' },
      { key: 'count', label: 'Count', kind: 'number' },
      { key: 'amount', label: 'Amount', kind: 'money' },
    ],
    rows,
    fitOnePage: true,
  }
}

function filterLine(projects: ReportProject[], params: ReportParams): string[] {
  const scope = params.projects === 'all' ? 'All projects I can see' : projects.map((project) => project.jobNumber).join(', ')
  const status = params.project_status === 'active' ? 'Active projects' : 'All statuses'
  return [scope || 'No projects', status]
}

function jobSections(dataset: ReportDataset, params: ReportParams, range: ResolvedRange): { sections: ReportSection[]; costCents: number; budgetCents: number; invoicedCents: number; contract: number } {
  const projects = selectedProjects(dataset, params)
  const split = params.per_project_sections ?? projects.length > 1
  const groups = split ? projects.map((project) => [project]) : [projects]
  let costCents = 0
  let budgetCents = 0
  let invoicedCents = 0
  let contract = 0
  const sections: ReportSection[] = []
  const invoices = inRangeInvoices(dataset, params, range)
  for (const group of groups) {
    if (group.length === 0) continue
    const ids = new Set(group.map((project) => project.id))
    const costs = inRangeCosts(dataset, params, range).filter((row) => ids.has(row.project_id))
    const section = budgetSection(
      dataset,
      group.length === 1 ? `Budget versus actual · ${projectLabel(group[0])}` : 'Budget versus actual',
      costs,
      mergeBudgets(dataset, group),
    )
    sections.push(section)
    const net = toCents(section.totals?.[2] ?? 0)
    const budget = toCents(section.totals?.[1] ?? 0)
    costCents += net
    budgetCents += budget
    invoicedCents += invoices.filter((row) => ids.has(row.project_id)).reduce((sum, row) => sum + toCents(row.amount), 0)
    contract += group.reduce((sum, project) => sum + contractCents(project, dataset.changeOrders), 0)
  }
  return { sections, costCents, budgetCents, invoicedCents, contract }
}

function mergeBudgets(dataset: ReportDataset, projects: ReportProject[]): Record<string, number> {
  const merged: Record<string, number> = {}
  for (const project of projects) {
    const map = budgetMap(dataset, project.id)
    for (const [id, amount] of Object.entries(map)) merged[id] = (merged[id] || 0) + amount
  }
  return merged
}

function budgetSection(dataset: ReportDataset, title: string, costs: ReportCost[], budgets: Record<string, number>): ReportSection {
  const categories = dataset.categories.map(asCategory)
  const ownAmounts: Record<string, number> = {}
  for (const row of costs) {
    const id = resolveCategoryId(row, dataset.categories)
    if (!id) continue
    ownAmounts[id] = (ownAmounts[id] || 0) + fromCents(toCents(row.cost))
  }
  const actualRollup = rollupCategoryAmounts(categories, ownAmounts)
  const budgetRollup = rollupCategoryAmounts(categories, budgets)
  const tree = buildCategoryTree(categories)
  const rows: ReportRow[] = []
  let budgetTop = 0
  let actualTop = 0
  for (const category of tree) {
    const actual = toCents(actualRollup[category.id]?.total || 0)
    const budget = toCents(budgetRollup[category.id]?.total || 0)
    budgetTop += budget
    actualTop += actual
    rows.push({ depth: 0, cells: budgetCells(category.name, budget, actual) })
    for (const child of category.children) {
      const childActual = toCents(actualRollup[child.id]?.own || 0)
      const childBudget = toCents(budgets[child.id] || 0)
      rows.push({ depth: 1, cells: budgetCells(child.name, childBudget, childActual) })
    }
  }
  return {
    title,
    fitOnePage: true,
    columns: [
      { key: 'category', label: 'Category', kind: 'text' },
      { key: 'budget', label: 'Budget', kind: 'money' },
      { key: 'actual', label: 'Actual', kind: 'money' },
      { key: 'variance', label: 'Variance', kind: 'money' },
      { key: 'used', label: '% used', kind: 'percent' },
      { key: 'status', label: 'Status', kind: 'text' },
    ],
    rows,
    totals: ['Total', money(budgetTop), money(actualTop), money(budgetTop - actualTop), budgetTop > 0 ? (actualTop / budgetTop) * 100 : null, ''],
  }
}

function budgetCells(name: string, budget: number, actual: number): ReportCell[] {
  const state = categoryBudgetState(fromCents(actual), fromCents(budget))
  const status = state === 'over' ? 'Over' : state === 'near' ? 'Near' : state === 'within' ? 'Within' : 'No budget'
  const used = budget > 0 ? (actual / budget) * 100 : null
  return [name, money(budget), money(actual), money(budget - actual), used, status]
}

export function buildJobCostSummary(dataset: ReportDataset, params: ReportParams): BuiltReport {
  const range = resolveRange(params, dataset.timezone)
  const summary = jobSections(dataset, params, range)
  const profit = grossProfit(fromCents(summary.invoicedCents), fromCents(summary.costCents))
  const percent = dataset.invoicesRead ? grossProfitPercent(fromCents(summary.invoicedCents), fromCents(summary.costCents)) : null
  const kpis: ReportKpi[] = [
    kpiMoney('Contract', summary.contract),
    kpiMoney('Budget', summary.budgetCents),
    kpiMoney('Cost', summary.costCents),
  ]
  if (dataset.invoicesRead) {
    kpis.push(kpiMoney('Invoiced', summary.invoicedCents))
    kpis.push({ label: 'Gross profit', value: formatCurrency(profit), cents: toCents(profit), detail: percent == null ? undefined : formatPercent(percent) })
  }
  const notes = [NET_NOTE, CURRENT_NOTE, GP_NOTE]
  if (!dataset.invoicesRead) notes.push(INVOICE_HIDDEN_NOTE)
  return {
    key: 'job_cost_summary',
    title: 'Job cost summary',
    rangeLabel: range.label,
    filters: filterLine(selectedProjects(dataset, params), params),
    kpis,
    sections: summary.sections,
    notes,
  }
}

export function buildCostDetail(dataset: ReportDataset, params: ReportParams): BuiltReport {
  const range = resolveRange(params, dataset.timezone)
  let costs = inRangeCosts(dataset, params, range)
  if (params.vendor) {
    const needle = vendorKey(params.vendor)
    costs = costs.filter((row) => {
      const key = vendorKey(row.vendor)
      return key === needle || key.includes(needle)
    })
  }
  if (params.change_order) costs = costs.filter((row) => row.change_order_id === params.change_order)
  if (params.hide_netted_pairs) costs = withoutNettedPairs(costs)
  const projects = byId(selectedProjects(dataset, params))
  const orders = byId(dataset.changeOrders)
  const columns: ReportColumn[] = [
    { key: 'date', label: 'Date', kind: 'text' },
    { key: 'project', label: 'Project', kind: 'text' },
    { key: 'category', label: 'Category', kind: 'text' },
    { key: 'who', label: 'Vendor / Employee', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'text' },
    { key: 'invoice', label: 'Invoice #', kind: 'text' },
    { key: 'change_order', label: 'Change order', kind: 'text' },
    { key: 'entry', label: 'Entry', kind: 'text' },
    { key: 'amount', label: 'Amount', kind: 'money' },
  ]
  const grouped = new Map<string, ReportCost[]>()
  for (const row of costs) {
    const id = resolveCategoryId(row, dataset.categories) || 'none'
    const list = grouped.get(id) || []
    list.push(row)
    grouped.set(id, list)
  }
  const sections: ReportSection[] = []
  const ordered = dataset.categories.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const push = (id: string, title: string) => {
    const rows = (grouped.get(id) || []).slice().sort((a, b) => a.date.localeCompare(b.date) || (a.created_at || '').localeCompare(b.created_at || ''))
    if (rows.length === 0) return
    const body: ReportRow[] = rows.map((row) => ({
      cells: [
        row.date,
        projectLabel(projects.get(row.project_id)),
        categoryPath(resolveCategoryId(row, dataset.categories), dataset.categories),
        row.vendor || row.employee_name || '',
        row.reversal_of_id ? reversalDetail(row, dataset.costs) : row.description || '',
        row.invoice_number || '',
        row.change_order_id ? orders.get(row.change_order_id)?.name || '' : '',
        entryLabel(row, costs),
        money(toCents(row.cost)),
      ],
    }))
    const total = rows.reduce((sum, row) => sum + toCents(row.cost), 0)
    sections.push({
      title,
      columns,
      rows: body,
      totals: ['', '', '', '', '', '', '', 'Subtotal', money(total)],
    })
  }
  for (const category of ordered) push(category.id, categoryPath(category.id, dataset.categories))
  if (grouped.has('none')) push('none', 'Uncategorized')
  const total = costs.reduce((sum, row) => sum + toCents(row.cost), 0)
  return {
    key: 'cost_detail',
    title: 'Cost detail',
    rangeLabel: range.label,
    filters: filterLine(selectedProjects(dataset, params), params),
    kpis: [kpiMoney('Cost', total), { label: 'Entries', value: String(costs.length) }],
    sections,
    notes: [NET_NOTE, 'Hiding pairs that net to zero removes both the original and its reversals.'],
  }
}

export function buildLabor(dataset: ReportDataset, params: ReportParams): BuiltReport {
  const range = resolveRange(params, dataset.timezone)
  const laborIds = new Set(dataset.categories.filter((category) => isLaborCategory(category.id, dataset.categories)).map((category) => category.id))
  if (laborIds.size === 0) {
    return {
      key: 'labor_by_employee',
      title: 'Labor by employee',
      rangeLabel: range.label,
      filters: filterLine(selectedProjects(dataset, params), params),
      kpis: [],
      sections: [],
      notes: [NO_LABOR_ACCESS],
    }
  }
  let costs = inRangeCosts(dataset, params, range).filter((row) => laborIds.has(resolveCategoryId(row, dataset.categories) || ''))
  if (params.employees?.length) {
    const ids = new Set(params.employees)
    costs = costs.filter((row) => row.employee_id && ids.has(row.employee_id))
  }
  const employees = byId(dataset.employees)
  if (params.job_role) {
    const role = params.job_role.trim().toLowerCase()
    costs = costs.filter((row) => (employees.get(row.employee_id || '')?.job_role || '').trim().toLowerCase() === role)
  }
  const projects = byId(selectedProjects(dataset, params))
  const split = params.split_by_project === true
  const groups = new Map<string, ReportCost[]>()
  for (const row of costs) {
    const who = row.employee_id || `name:${(row.employee_name || '').trim().toLowerCase()}`
    const key = split ? `${who}|${row.project_id}` : who
    const list = groups.get(key) || []
    list.push(row)
    groups.set(key, list)
  }
  const columns: ReportColumn[] = [
    { key: 'employee', label: 'Employee', kind: 'text' },
    { key: 'role', label: 'Job role', kind: 'text' },
    ...(split ? [{ key: 'project', label: 'Project', kind: 'text' as const }] : []),
    { key: 'st', label: 'ST hrs', kind: 'hours' },
    { key: 'ot', label: 'OT hrs', kind: 'hours' },
    { key: 'dt', label: 'DT hrs', kind: 'hours' },
    { key: 'total', label: 'Total hrs', kind: 'hours' },
    { key: 'mob', label: 'Mob', kind: 'number' },
    { key: 'per_diem', label: 'Per diem', kind: 'money' },
    { key: 'cost', label: 'Labor cost', kind: 'money' },
  ]
  const rows: ReportRow[] = [...groups.entries()].map(([key, list]) => {
    const sample = list[0]
    const employee = sample.employee_id ? employees.get(sample.employee_id) : undefined
    const name = employee?.name || sample.employee_name || 'Unknown'
    const st = list.reduce((sum, row) => sum + Number(row.st_hours || 0), 0)
    const ot = list.reduce((sum, row) => sum + Number(row.ot_hours || 0), 0)
    const dt = list.reduce((sum, row) => sum + Number(row.dt_hours || 0), 0)
    const mob = list.reduce((sum, row) => sum + Number(row.mob_qty || 0), 0)
    const perDiem = list.reduce((sum, row) => sum + toCents(row.per_diem), 0)
    const cost = list.reduce((sum, row) => sum + toCents(row.cost), 0)
    const cells: ReportCell[] = [name, employee?.job_role || '']
    if (split) cells.push(projectLabel(projects.get(key.split('|')[1])))
    cells.push(st, ot, dt, st + ot + dt, mob, money(perDiem), money(cost))
    return { cells }
  }).sort((a, b) => String(a.cells[0]).localeCompare(String(b.cells[0])))
  const costIndex = columns.findIndex((column) => column.key === 'cost')
  const totalCost = rows.reduce((sum, row) => sum + toCents(row.cells[costIndex] as number), 0)
  const totalHours = rows.reduce((sum, row) => sum + Number(row.cells[columns.findIndex((column) => column.key === 'total')] || 0), 0)
  return {
    key: 'labor_by_employee',
    title: 'Labor by employee',
    rangeLabel: range.label,
    filters: filterLine(selectedProjects(dataset, params), params),
    kpis: [
      { label: 'Labor hours', value: formatHours(totalHours) },
      kpiMoney('Labor cost', totalCost),
      { label: 'Employees', value: String(new Set(rows.map((row) => row.cells[0])).size) },
    ],
    sections: [{ title: 'Labor', columns, rows, totals: laborTotals(columns, rows) }],
    notes: [NET_NOTE, 'Hours and cost are the values stored on each labor row, including negative reversal rows.'],
  }
}

function laborTotals(columns: ReportColumn[], rows: ReportRow[]): ReportCell[] {
  return columns.map((column, index) => {
    if (index === 0) return 'Total'
    if (column.kind === 'text') return ''
    if (column.kind === 'money') return money(rows.reduce((sum, row) => sum + toCents(row.cells[index] as number), 0))
    return rows.reduce((sum, row) => sum + Number(row.cells[index] || 0), 0)
  })
}

export function buildInvoicing(dataset: ReportDataset, params: ReportParams): BuiltReport {
  const range = resolveRange(params, dataset.timezone)
  const projects = selectedProjects(dataset, params)
  const costs = inRangeCosts(dataset, params, range)
  const invoices = inRangeInvoices(dataset, params, range)
  const columns: ReportColumn[] = [
    { key: 'job', label: 'Job #', kind: 'text' },
    { key: 'project', label: 'Project', kind: 'text' },
    { key: 'customer', label: 'Customer', kind: 'text' },
    { key: 'contract', label: 'Contract', kind: 'money' },
    { key: 'invoiced', label: 'Invoiced', kind: 'money' },
    { key: 'collected', label: 'Collected', kind: 'money' },
    { key: 'outstanding', label: 'Outstanding', kind: 'money' },
    { key: 'cost', label: 'Cost', kind: 'money' },
    { key: 'gp', label: 'Gross profit', kind: 'money' },
    { key: 'gp_percent', label: 'GP%', kind: 'percent' },
    { key: 'billed', label: '% of contract billed', kind: 'percent' },
  ]
  const rows: ReportRow[] = projects.map((project) => {
    const invoiced = invoices.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + toCents(row.amount), 0)
    const collected = invoices.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + toCents(row.amount_collected), 0)
    const cost = costs.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + toCents(row.cost), 0)
    const contract = contractCents(project, dataset.changeOrders)
    const profit = invoiced - cost
    const percent = grossProfitPercent(fromCents(invoiced), fromCents(cost))
    const billed = contract > 0 ? (invoiced / contract) * 100 : null
    return {
      cells: [project.jobNumber, project.jobName, project.customer, money(contract), money(invoiced), money(collected), money(invoiced - collected), money(cost), money(profit), percent, billed],
    }
  })
  const totals = sumMoneyRows(columns, rows, [3, 4, 5, 6, 7, 8])
  const invoiced = toCents(totals[4] as number)
  const cost = toCents(totals[7] as number)
  const contract = toCents(totals[3] as number)
  totals[9] = grossProfitPercent(fromCents(invoiced), fromCents(cost))
  totals[10] = contract > 0 ? (invoiced / contract) * 100 : null
  const profit = invoiced - cost
  return {
    key: 'invoicing_gp',
    title: 'Invoicing and gross profit',
    rangeLabel: range.label,
    filters: filterLine(projects, params),
    kpis: [
      kpiMoney('Invoiced', invoiced),
      kpiMoney('Cost', cost),
      { label: 'Gross profit', value: moneyText(profit), cents: profit, detail: totals[9] == null ? undefined : formatPercent(Number(totals[9])) },
    ],
    sections: [{ title: 'By project', columns, rows, totals, fitOnePage: true }],
    notes: [NET_NOTE, GP_NOTE, CURRENT_NOTE],
  }
}

function sumMoneyRows(columns: ReportColumn[], rows: ReportRow[], indexes: number[]): ReportCell[] {
  const totals: ReportCell[] = columns.map((_, index) => (index === 0 ? 'Total' : ''))
  for (const index of indexes) {
    totals[index] = money(rows.reduce((sum, row) => sum + toCents(row.cells[index] as number), 0))
  }
  return totals
}

export function buildPortfolio(dataset: ReportDataset, params: ReportParams): BuiltReport {
  const range = resolveRange(params, dataset.timezone)
  const projects = selectedProjects(dataset, params)
  const costs = inRangeCosts(dataset, params, range)
  const invoices = inRangeInvoices(dataset, params, range)
  const columns: ReportColumn[] = [
    { key: 'job', label: 'Job #', kind: 'text' },
    { key: 'project', label: 'Project', kind: 'text' },
    { key: 'status', label: 'Status', kind: 'text' },
    { key: 'contract', label: 'Contract', kind: 'money' },
    { key: 'budget', label: 'Budget', kind: 'money' },
    { key: 'cost', label: 'Cost', kind: 'money' },
    { key: 'used', label: '% of budget used', kind: 'percent' },
    { key: 'invoiced', label: 'Invoiced', kind: 'money' },
    { key: 'gp', label: 'Gross profit', kind: 'money' },
    { key: 'gp_percent', label: 'GP%', kind: 'percent' },
    { key: 'over', label: 'Over-budget categories', kind: 'number' },
  ]
  const rows: ReportRow[] = projects.map((project) => {
    const projectCosts = costs.filter((row) => row.project_id === project.id)
    const cost = projectCosts.reduce((sum, row) => sum + toCents(row.cost), 0)
    const invoiced = invoices.filter((row) => row.project_id === project.id).reduce((sum, row) => sum + toCents(row.amount), 0)
    const contract = contractCents(project, dataset.changeOrders)
    const section = budgetSection(dataset, '', projectCosts, budgetMap(dataset, project.id))
    const budget = toCents(section.totals?.[1] ?? 0)
    const over = section.rows.filter((row) => row.cells[5] === 'Over').length
    const profit = dataset.invoicesRead ? invoiced - cost : null
    const percent = dataset.invoicesRead ? grossProfitPercent(fromCents(invoiced), fromCents(cost)) : null
    return {
      cells: [
        project.jobNumber,
        project.jobName,
        project.status || '',
        money(contract),
        money(budget),
        money(cost),
        budget > 0 ? (cost / budget) * 100 : null,
        dataset.invoicesRead ? money(invoiced) : null,
        profit == null ? null : money(profit),
        percent,
        over,
      ],
    }
  })
  const contract = rows.reduce((sum, row) => sum + toCents(row.cells[3] as number), 0)
  const budget = rows.reduce((sum, row) => sum + toCents(row.cells[4] as number), 0)
  const cost = rows.reduce((sum, row) => sum + toCents(row.cells[5] as number), 0)
  const invoiced = dataset.invoicesRead ? rows.reduce((sum, row) => sum + toCents(row.cells[7] as number), 0) : 0
  const profit = invoiced - cost
  const kpis: ReportKpi[] = [
    { label: 'Projects', value: String(projects.length) },
    kpiMoney('Contract', contract),
    kpiMoney('Budget', budget),
    kpiMoney('Cost', cost),
  ]
  if (dataset.invoicesRead) {
    const percent = grossProfitPercent(fromCents(invoiced), fromCents(cost))
    kpis.push(kpiMoney('Invoiced', invoiced))
    kpis.push({
      label: 'Gross profit',
      value: moneyText(profit),
      cents: profit,
      detail: [percent == null ? null : formatPercent(percent), dataset.gpGoalPercent == null ? null : `Goal ${formatPercent(dataset.gpGoalPercent)}`].filter(Boolean).join(' · ') || undefined,
    })
  }
  const notes = [NET_NOTE, CURRENT_NOTE, GP_NOTE]
  if (dataset.gpGoalPercent != null) notes.push('The gross profit goal is a comparison only. It does not change the numbers.')
  if (!dataset.invoicesRead) notes.push(INVOICE_HIDDEN_NOTE)
  return {
    key: 'portfolio',
    title: 'Company portfolio',
    rangeLabel: range.label,
    filters: filterLine(projects, params),
    kpis,
    sections: [{
      title: 'Projects',
      columns,
      rows,
      fitOnePage: true,
      totals: ['Total', '', '', money(contract), money(budget), money(cost), budget > 0 ? (cost / budget) * 100 : null, dataset.invoicesRead ? money(invoiced) : null, dataset.invoicesRead ? money(profit) : null, dataset.invoicesRead ? grossProfitPercent(fromCents(invoiced), fromCents(cost)) : null, rows.reduce((sum, row) => sum + Number(row.cells[10] || 0), 0)],
    }],
    notes,
  }
}

export function buildVendorSpend(dataset: ReportDataset, params: ReportParams): BuiltReport {
  const range = resolveRange(params, dataset.timezone)
  const costs = inRangeCosts(dataset, params, range).filter((row) => !isLaborCategory(resolveCategoryId(row, dataset.categories), dataset.categories))
  const groups = new Map<string, ReportCost[]>()
  for (const row of costs) {
    const key = vendorKey(row.vendor)
    const list = groups.get(key) || []
    list.push(row)
    groups.set(key, list)
  }
  const rows: ReportRow[] = []
  for (const [key, list] of groups) {
    const net = list.reduce((sum, row) => sum + toCents(row.cost), 0)
    if (params.min_total != null && net < toCents(params.min_total)) continue
    const categoryCounts = new Map<string, number>()
    for (const row of list) {
      const name = categoryPath(resolveCategoryId(row, dataset.categories), dataset.categories) || 'Uncategorized'
      categoryCounts.set(name, (categoryCounts.get(name) || 0) + toCents(row.cost))
    }
    const top = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    const projectCount = new Set(list.map((row) => row.project_id)).size
    rows.push({
      vendorKey: key,
      cells: [key ? vendorDisplayName(list.map((row) => row.vendor)) : '(No vendor)', list.length, projectCount, top?.[0] || '', money(net)],
    })
  }
  rows.sort((a, b) => toCents(b.cells[4] as number) - toCents(a.cells[4] as number) || String(a.cells[0]).localeCompare(String(b.cells[0])))
  const total = rows.reduce((sum, row) => sum + toCents(row.cells[4] as number), 0)
  return {
    key: 'vendor_spend',
    title: 'Vendor spend',
    rangeLabel: range.label,
    filters: filterLine(selectedProjects(dataset, params), params),
    kpis: [kpiMoney('Net spend', total), { label: 'Vendors', value: String(rows.length) }],
    sections: [{
      title: 'Vendors',
      fitOnePage: true,
      columns: [
        { key: 'vendor', label: 'Vendor', kind: 'text' },
        { key: 'entries', label: 'Entries', kind: 'number' },
        { key: 'projects', label: 'Projects', kind: 'number' },
        { key: 'category', label: 'Top category', kind: 'text' },
        { key: 'net', label: 'Net spend', kind: 'money' },
      ],
      rows,
      totals: ['Total', rows.reduce((sum, row) => sum + Number(row.cells[1] || 0), 0), '', '', money(total)],
    }],
    notes: [NET_NOTE, 'Vendor names that differ only by capital letters or extra spaces are one vendor. Labor rows are not included.'],
  }
}

export function buildCustom(dataset: ReportDataset, config: CustomConfig, name?: string): BuiltReport {
  const parsed = parseCustomConfig(config, (dataset.laborFields || []).map((field) => field.key))
  const params: ReportParams = {
    range: parsed.filters.range || 'this_year',
    from: parsed.filters.from,
    to: parsed.filters.to,
    projects: parsed.filters.projects || 'all',
    project_status: parsed.filters.project_status || 'all',
    categories: parsed.filters.categories,
    vendor: parsed.filters.vendorContains,
    change_order: parsed.filters.changeOrder,
    employees: parsed.filters.employee ? [parsed.filters.employee] : undefined,
  }
  const range = resolveRange(params, dataset.timezone)
  const records = customRecords(dataset, parsed, params, range).filter((record) => {
    if (parsed.filters.amountMin != null && (record.cents == null || record.cents < toCents(parsed.filters.amountMin))) return false
    if (parsed.filters.amountMax != null && (record.cents == null || record.cents > toCents(parsed.filters.amountMax))) return false
    return true
  })
  const grouped = parsed.groupBy.length > 0
  const columns = grouped ? groupedColumns(parsed) : parsed.columns.map((key) => columnFor(key, dataset))
  let rows: ReportRow[] = grouped ? groupRecords(records, parsed) : records.map((record) => ({ cells: parsed.columns.map((key) => record.values[key] ?? null) }))
  if (parsed.sort) {
    const index = columns.findIndex((column) => column.key === parsed.sort?.column)
    if (index >= 0) {
      const direction = parsed.sort.direction === 'desc' ? -1 : 1
      rows = rows.slice().sort((a, b) => direction * compareCells(a.cells[index], b.cells[index]))
    }
  }
  return {
    key: 'custom',
    title: name?.trim() || 'Custom report',
    rangeLabel: range.label,
    filters: filterLine(selectedProjects(dataset, params), params),
    kpis: [kpiMoney('Amount', records.reduce((sum, record) => sum + (record.cents || 0), 0)), { label: 'Rows', value: String(rows.length) }],
    sections: [{ title: parsed.source, columns, rows, fitOnePage: columns.length <= 8 && rows.length <= 40 }],
    notes: [NET_NOTE, 'This report cannot leave out reversal rows while keeping the originals.'],
  }
}

interface CustomRecord {
  cents: number | null
  values: Record<string, ReportCell>
  group: Record<string, string>
  hours: Record<string, number>
}

function customRecords(dataset: ReportDataset, config: CustomConfig, params: ReportParams, range: ResolvedRange): CustomRecord[] {
  const projects = byId(selectedProjects(dataset, params))
  const orders = byId(dataset.changeOrders)
  const employees = byId(dataset.employees)
  if (config.source === 'invoices') {
    return inRangeInvoices(dataset, params, range).map((row) => {
      const project = projects.get(row.project_id)
      const values: Record<string, ReportCell> = {
        date: row.date_billed,
        project: project?.jobName || '',
        job_number: project?.jobNumber || '',
        customer: project?.customer || '',
        invoice_number: row.invoice_number,
        change_order: row.change_order_id ? orders.get(row.change_order_id)?.name || '' : '',
        entry_type: row.reversal_of_id ? 'Credit memo' : 'Invoice',
        amount: money(toCents(row.amount)),
        collected: money(toCents(row.amount_collected)),
      }
      return { cents: toCents(row.amount), values, group: groupValues(config, values, row.date_billed), hours: {} }
    })
  }
  if (config.source === 'activity') {
    return activityItems(dataset, { ...params, include_edits: false }, range)
      .filter((item) => !item.projectId || projects.has(item.projectId))
      .map((item) => {
        const project = projects.get(item.projectId)
        const values: Record<string, ReportCell> = {
          date: item.date,
          type: item.type,
          project: project?.jobName || '',
          job_number: project?.jobNumber || '',
          category: item.category,
          detail: item.detail,
          amount: item.cents == null ? null : money(item.cents),
          actor: item.actor,
        }
        return { cents: item.cents, values, group: groupValues(config, values, item.date), hours: {} }
      })
  }
  let costs = inRangeCosts(dataset, params, range)
  if (config.source === 'labor') {
    costs = costs.filter((row) => isLaborCategory(resolveCategoryId(row, dataset.categories), dataset.categories))
  }
  if (config.filters.vendorContains) {
    const needle = vendorKey(config.filters.vendorContains)
    costs = costs.filter((row) => vendorKey(row.vendor).includes(needle))
  }
  if (config.filters.changeOrder) costs = costs.filter((row) => row.change_order_id === config.filters.changeOrder)
  if (config.filters.employee) {
    const needle = config.filters.employee
    costs = costs.filter((row) => row.employee_id === needle || (row.employee_name || '').toLowerCase() === needle.toLowerCase())
  }
  return costs.map((row) => {
    const project = projects.get(row.project_id)
    const categoryId = resolveCategoryId(row, dataset.categories)
    const employee = row.employee_id ? employees.get(row.employee_id) : undefined
    const values: Record<string, ReportCell> = {
      date: row.date,
      project: project?.jobName || '',
      job_number: project?.jobNumber || '',
      customer: project?.customer || '',
      category: categoryPath(categoryId, dataset.categories),
      parent_category: parentName(categoryId, dataset.categories),
      vendor: row.vendor || (isLaborCategory(categoryId, dataset.categories) ? '' : '(No vendor)'),
      employee: employee?.name || row.employee_name || '',
      job_role: employee?.job_role || '',
      description: row.description || '',
      invoice_number: row.invoice_number || '',
      change_order: row.change_order_id ? orders.get(row.change_order_id)?.name || '' : '',
      entry_type: entryLabel(row, costs),
      st_hours: Number(row.st_hours || 0),
      ot_hours: Number(row.ot_hours || 0),
      dt_hours: Number(row.dt_hours || 0),
      total_hours: Number(row.st_hours || 0) + Number(row.ot_hours || 0) + Number(row.dt_hours || 0),
      mob: Number(row.mob_qty || 0),
      per_diem: money(toCents(row.per_diem)),
      amount: money(toCents(row.cost)),
    }
    for (const field of dataset.laborFields || []) {
      const raw = row.custom_fields?.[field.key]
      values[`custom:${field.key}`] = raw == null ? '' : String(raw)
    }
    return {
      cents: toCents(row.cost),
      values,
      group: groupValues(config, values, row.date),
      hours: {
        st_hours: Number(row.st_hours || 0),
        ot_hours: Number(row.ot_hours || 0),
        dt_hours: Number(row.dt_hours || 0),
        total_hours: Number(row.st_hours || 0) + Number(row.ot_hours || 0) + Number(row.dt_hours || 0),
        mob: Number(row.mob_qty || 0),
      },
    }
  })
}

function groupValues(config: CustomConfig, values: Record<string, ReportCell>, date: string): Record<string, string> {
  const parts = parseDateParts(date)
  const out: Record<string, string> = {}
  for (const field of config.groupBy) {
    if (field === 'month') out[field] = parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}` : ''
    else if (field === 'quarter') out[field] = parts ? `${parts.year} Q${Math.floor((parts.month - 1) / 3) + 1}` : ''
    else if (field === 'year') out[field] = parts ? String(parts.year) : ''
    else if (field === 'vendor') {
      const raw = String(values.vendor || '')
      out[field] = raw === '(No vendor)' ? '' : vendorKey(raw)
    }
    else out[field] = String(values[field] ?? '')
  }
  return out
}

function parseDateParts(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(value)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) }
}

function columnFor(key: string, dataset: { laborFields?: ReportDataset['laborFields'] }): ReportColumn {
  const field = dataset.laborFields?.find((item) => `custom:${item.key}` === key)
  if (field) return { key, label: field.label, kind: 'text' }
  const labels: Record<string, [string, ReportColumn['kind']]> = {
    date: ['Date', 'text'],
    project: ['Project', 'text'],
    job_number: ['Job #', 'text'],
    customer: ['Customer', 'text'],
    category: ['Category', 'text'],
    parent_category: ['Parent category', 'text'],
    vendor: ['Vendor', 'text'],
    employee: ['Employee', 'text'],
    job_role: ['Job role', 'text'],
    description: ['Description', 'text'],
    invoice_number: ['Invoice #', 'text'],
    change_order: ['Change order', 'text'],
    entry_type: ['Entry type', 'text'],
    st_hours: ['ST hrs', 'hours'],
    ot_hours: ['OT hrs', 'hours'],
    dt_hours: ['DT hrs', 'hours'],
    total_hours: ['Total hrs', 'hours'],
    mob: ['Mob', 'number'],
    per_diem: ['Per diem', 'money'],
    amount: ['Amount', 'money'],
    collected: ['Collected', 'money'],
    type: ['Type', 'text'],
    detail: ['Detail', 'text'],
    actor: ['By', 'text'],
    count: ['Count', 'number'],
  }
  const found = labels[key] || [key, 'text']
  return { key, label: found[0], kind: found[1] }
}

function groupedColumns(config: CustomConfig): ReportColumn[] {
  const keys = [...config.groupBy, 'count']
  for (const column of config.columns) {
    if (['amount', 'collected', 'per_diem', 'st_hours', 'ot_hours', 'dt_hours', 'total_hours', 'mob'].includes(column) && !keys.includes(column)) {
      keys.push(column)
    }
  }
  return keys.map((key) => columnFor(key, { laborFields: [] }))
}

function groupRecords(records: CustomRecord[], config: CustomConfig): ReportRow[] {
  const buckets = new Map<string, CustomRecord[]>()
  for (const record of records) {
    const key = config.groupBy.map((field) => record.group[field] || '').join('||')
    const list = buckets.get(key) || []
    list.push(record)
    buckets.set(key, list)
  }
  return [...buckets.values()].map((list) => {
    const cells: ReportCell[] = config.groupBy.map((field) => {
      if (field === 'vendor') {
        const spellings = list.map((record) => String(record.values.vendor || ''))
        return vendorKey(spellings[0]) ? vendorDisplayName(spellings) : '(No vendor)'
      }
      return list[0].group[field] || ''
    })
    cells.push(list.length)
    for (const column of config.columns) {
      if (!['amount', 'collected', 'per_diem', 'st_hours', 'ot_hours', 'dt_hours', 'total_hours', 'mob'].includes(column)) continue
      if (column === 'amount' || column === 'collected' || column === 'per_diem') {
        cells.push(money(list.reduce((sum, record) => sum + toCents(record.values[column] as number), 0)))
      } else {
        cells.push(list.reduce((sum, record) => sum + Number(record.hours[column] || record.values[column] || 0), 0))
      }
    }
    return { cells }
  })
}

function compareCells(a: ReportCell, b: ReportCell): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a ?? '').localeCompare(String(b ?? ''))
}

export function buildReport(dataset: ReportDataset, key: string, params: ReportParams, custom?: { config: unknown; name?: string }): BuiltReport {
  if (key === 'activity') return buildActivity(dataset, params)
  if (key === 'job_cost_summary') return buildJobCostSummary(dataset, params)
  if (key === 'cost_detail') return buildCostDetail(dataset, params)
  if (key === 'labor_by_employee') return buildLabor(dataset, params)
  if (key === 'invoicing_gp') {
    if (!dataset.invoicesRead) throw new Error('You do not have invoice access.')
    return buildInvoicing(dataset, params)
  }
  if (key === 'portfolio') return buildPortfolio(dataset, params)
  if (key === 'vendor_spend') return buildVendorSpend(dataset, params)
  if (key === 'custom') {
    if (!custom) throw new Error('A custom report needs a saved configuration.')
    const config = parseCustomConfig(custom.config, (dataset.laborFields || []).map((field) => field.key))
    if (config.source === 'invoices' && !dataset.invoicesRead) throw new Error('You do not have invoice access.')
    return buildCustom(dataset, config, custom.name || reportTitle('custom'))
  }
  throw new Error('Unknown report.')
}
