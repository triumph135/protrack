import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groupCostEntries, resolveEntryCategoryId } from '../lib/cost-groups.ts'

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
  it('groups readable rows in category order and hides categories the caller cannot see', () => {
    const groups = groupCostEntries({ entries, categories })
    assert.deepEqual(groups.map((group) => group.categoryId), ['mat', 'lab', 'weld', null])
    assert.equal(groups[0].total, 250)
    assert.equal(groups[1].rows[0].id, '2')
    assert.equal(resolveEntryCategoryId(entries[3], categories), 'hidden')
    assert.equal(groups.some((group) => group.rows.some((row) => row.id === '4')), false)
  })

  it('filters and sorts inside each group', () => {
    const searched = groupCostEntries({ entries, categories, query: 'weld' })
    assert.deepEqual(searched.map((group) => group.categoryId), ['weld'])

    const base = groupCostEntries({ entries, categories, changeOrderId: 'base' })
    assert.equal(base.some((group) => group.rows.some((row) => row.id === '3')), false)

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

    const byDetails = groupCostEntries({
      entries: [
        { id: 'a', category_id: 'mat', cost: 10, date: '2026-01-01', description: 'B' },
        { id: 'b', category_id: 'mat', cost: 30, date: '2026-01-02', description: 'A' },
      ],
      categories,
      sortKey: 'details',
      sortDirection: 'asc',
    })
    assert.deepEqual(byDetails[0].rows.map((row) => row.id), ['b', 'a'])
  })

  it('keeps an empty focused category so its header can still be shown', () => {
    const groups = groupCostEntries({ entries: [], categories, focusCategoryId: 'lab' })
    assert.equal(groups.length, 1)
    assert.equal(groups[0].categoryId, 'lab')
    assert.equal(groups[0].rows.length, 0)
  })
})
