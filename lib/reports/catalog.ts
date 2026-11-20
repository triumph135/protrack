import type { ReportKey } from './types'

export interface ReportCatalogItem {
  key: ReportKey
  title: string
  description: string
  needsInvoices?: boolean
}

export const REPORT_CATALOG: ReportCatalogItem[] = [
  {
    key: 'activity',
    title: 'Activity for a period',
    description: 'Everything that happened in a year or date range: costs, labor, invoices, reversals, moves, and change orders.',
  },
  {
    key: 'job_cost_summary',
    title: 'Job cost summary',
    description: 'Budget versus actual by category, with contract, invoiced, and gross profit.',
  },
  {
    key: 'cost_detail',
    title: 'Cost detail',
    description: 'Every cost in a date range, grouped by category, including reversals.',
  },
  {
    key: 'labor_by_employee',
    title: 'Labor by employee',
    description: 'Hours and labor cost by employee, with reversals netted.',
  },
  {
    key: 'invoicing_gp',
    title: 'Invoicing and gross profit',
    description: 'Invoiced, collected, cost, and gross profit by project.',
    needsInvoices: true,
  },
  {
    key: 'portfolio',
    title: 'Company portfolio',
    description: 'One row per project: contract, budget, cost, invoiced, and gross profit.',
  },
  {
    key: 'vendor_spend',
    title: 'Vendor spend',
    description: 'Net spend by vendor. Names that differ only by case or spacing are combined.',
  },
]

export function catalogItem(key: string): ReportCatalogItem | undefined {
  return REPORT_CATALOG.find((item) => item.key === key)
}

export function reportTitle(key: string, customName?: string | null): string {
  if (customName?.trim()) return customName.trim()
  return catalogItem(key)?.title || 'Custom report'
}
