import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groupCostEntries, resolveEntryCategoryId, visibleCostLines } from '../lib/cost-groups.ts'

const categories = [
  { id: 'mat', builtin_key: 'material', parent_id: null },
  { id: 'lab', builtin_key: 'labor', parent_id: null },
  { id: 'weld', builtin_key: null, parent_id: 'lab' },
]

const entries = [
  { id: '1', category_id: 'mat', category: 'material', cost: 250, date: '2026-01-15', description: 'Steel', change_order_id: null },
  { id: '2', category: 'labor', cost: 100, date: '2026-02-02', description: 'Crew', employee_name: 'Alex' },
  { id: '3', category_id: 'weld', category: 'labor', cost: 40, date: '2026-02-01', description: 'Field welds', change_order_id: 'co-1' },
  { id: '4', category_id: 'secret', category: 'others', cost: 9, date: '2026-02-03', description: 'Hidden' },
  { id: '5', cost: 5, date: '2026-01-01', description: 'No category' },
]

describe('cost groups', () => {
  it('nests children under parents and rolls their totals up', () => {
    const groups = groupCostEntries({ entries, categories })
    assert.deepEqual(groups.map((group) => group.categoryId), ['mat', 'lab', null])
    const labor = groups[1]
    assert.equal(labor.ownTotal, 100)
    assert.equal(labor.children.length, 1)
    assert.equal(labor.children[0].categoryId, 'weld')
    assert.equal(labor.total, 140)
    assert.equal(resolveEntryCategoryId(entries[3], categories), 'hidden')
    assert.equal(groups.some((group) => group.rows.some((row) => row.id === '4')), false)
  })

  it('filters and sorts inside each group', () => {
    const searched = groupCostEntries({ entries, categories, query: 'weld' })
    assert.equal(searched[0].categoryId, 'lab')
    assert.equal(searched[0].children[0].rows[0].id, '3')

    const base = groupCostEntries({ entries, categories, changeOrderId: 'base' })
    assert.equal(base.some((group) => group.categoryId === 'lab' && group.children.some((child) => child.rows.some((row) => row.id === '3'))), false)

    const byAmount = groupCostEntries({
      entries: [
        { id: 'a', category_id: 'mat', cost: 10, date: '2026-01-01', description: 'B' },
        { id: 'b', category_id: 'mat', cost: 30, date: '2026-01-02', description: 'A' },
      ],
      categories,
      sortKey: 'amount',
      sortDirection: 'asc',
    })
    assert.deepEqual(byAmount[0].rows.map((row) => row.id), ['a', 'b'])
  })

  it('keeps an empty focused parent and its children', () => {
    const groups = groupCostEntries({ entries: [], categories, focusCategoryId: 'lab' })
    assert.equal(groups.length, 1)
    assert.equal(groups[0].categoryId, 'lab')
    assert.equal(groups[0].children[0].categoryId, 'weld')
  })

  it('exports collapsed groups as one summary and hides their children', () => {
    const groups = groupCostEntries({ entries, categories })
    const names = new Map([['mat', 'Material'], ['lab', 'Labor'], ['weld', 'Direct']])
    const lines = visibleCostLines(groups, new Set(['lab']), names)
    const labor = lines.find((line) => line.path === 'Labor')
    assert.equal(labor?.kind, 'collapsed')
    assert.equal(labor?.entryCount, 2)
    assert.equal(labor?.amount, 140)
    assert.equal(lines.some((line) => line.path.includes('Direct')), false)
    const material = lines.find((line) => line.kind === 'entry' && line.path === 'Material')
    assert.equal(material?.row?.id, '1')
  })
})
