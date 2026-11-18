export type LaborFieldType = 'text' | 'number' | 'select' | 'boolean'

export interface LaborFieldDefinition {
  id: string
  tenant_id: string
  label: string
  field_type: LaborFieldType
  options: string[]
  preset_key: string | null
  is_enabled: boolean
  sort_order: number
}

export const LABOR_PRESETS: Array<Pick<LaborFieldDefinition, 'label' | 'field_type' | 'options' | 'preset_key' | 'sort_order'>> = [
  { label: 'Cost code', field_type: 'text', options: [], preset_key: 'cost_code', sort_order: 10 },
  { label: 'Crew', field_type: 'select', options: [], preset_key: 'crew', sort_order: 20 },
  { label: 'Shift', field_type: 'select', options: ['Day', 'Night'], preset_key: 'shift', sort_order: 30 },
  { label: 'Billable', field_type: 'boolean', options: [], preset_key: 'billable', sort_order: 40 },
]

export function parseFieldOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

/** Returns an error message, or null when the value is acceptable. */
export function validateLaborFieldValue(
  field: Pick<LaborFieldDefinition, 'field_type' | 'options' | 'label'>,
  value: unknown
): string | null {
  if (value === undefined || value === null || value === '') return null

  if (field.field_type === 'number') {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return `${field.label} must be a number`
    return null
  }

  if (field.field_type === 'boolean') {
    if (typeof value === 'boolean') return null
    if (value === 'true' || value === 'false') return null
    return `${field.label} must be yes or no`
  }

  if (field.field_type === 'select') {
    const text = String(value)
    if (field.options.length > 0 && !field.options.includes(text)) {
      return `${field.label} must be one of the listed choices`
    }
    return null
  }

  if (typeof value !== 'string') return `${field.label} must be text`
  return null
}

export function normalizeLaborFieldValue(
  field: Pick<LaborFieldDefinition, 'field_type'>,
  value: unknown
): string | number | boolean | null {
  if (value === undefined || value === null || value === '') return null
  if (field.field_type === 'number') return Number(value)
  if (field.field_type === 'boolean') return value === true || value === 'true'
  return String(value)
}

export function enabledLaborFields(fields: LaborFieldDefinition[]): LaborFieldDefinition[] {
  return fields
    .filter((field) => field.is_enabled)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
}
