'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import {
  buildCategoryTree,
  fallbackCategories,
  type CategoryNode,
  type CostCategoryRecord,
} from '@/lib/categories'
import { isMissingRelation } from '@/lib/security'
import type { LaborFieldDefinition } from '@/lib/labor-fields'
import { parseFieldOptions } from '@/lib/labor-fields'

interface CategoryContextValue {
  categories: CostCategoryRecord[]
  tree: CategoryNode[]
  laborFields: LaborFieldDefinition[]
  schemaPending: boolean
  loading: boolean
  reload: () => Promise<void>
}

const CategoryContext = createContext<CategoryContextValue | undefined>(undefined)

export function CategoryProvider({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant()
  const [categories, setCategories] = useState<CostCategoryRecord[]>([])
  const [laborFields, setLaborFields] = useState<LaborFieldDefinition[]>([])
  const [schemaPending, setSchemaPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    const supabase = createClient()
    if (!tenant?.id) {
      setCategories([])
      setLaborFields([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('cost_categories')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true })

    if (error && isMissingRelation(error)) {
      setSchemaPending(true)
      setCategories(fallbackCategories(tenant.id))
      setLaborFields([])
      setLoading(false)
      return
    }

    if (error) {
      console.error('Could not load cost categories', error)
      setCategories(fallbackCategories(tenant.id))
      setLoading(false)
      return
    }

    setSchemaPending(false)
    setCategories((data || []) as CostCategoryRecord[])

    const fields = await supabase
      .from('labor_field_definitions')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true })

    if (!fields.error) {
      setLaborFields(
        (fields.data || []).map((row) => ({
          ...row,
          field_type: row.field_type as LaborFieldDefinition['field_type'],
          options: parseFieldOptions(row.options),
        }))
      )
    }
    setLoading(false)
  }, [tenant?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  const tree = useMemo(() => buildCategoryTree(categories), [categories])

  const value = useMemo(
    () => ({ categories, tree, laborFields, schemaPending, loading, reload }),
    [categories, tree, laborFields, schemaPending, loading, reload]
  )

  return <CategoryContext.Provider value={value}>{children}</CategoryContext.Provider>
}

export function useCategories() {
  const context = useContext(CategoryContext)
  if (!context) throw new Error('useCategories must be used within CategoryProvider')
  return context
}
