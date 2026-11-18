import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readCostNavState, revealCostNav, toggleCostNav } from '../lib/cost-nav.ts'

describe('cost nav', () => {
  it('starts with Costs open and parents collapsed', () => {
    assert.deepEqual(readCostNavState(null), { costsOpen: true, openIds: [] })
    assert.deepEqual(readCostNavState('not-json'), { costsOpen: true, openIds: [] })
  })

  it('remembers which parents are open', () => {
    const closed = toggleCostNav({ costsOpen: true, openIds: [] }, 'costs')
    assert.equal(closed.costsOpen, false)
    const withLabor = toggleCostNav(closed, 'labor')
    assert.deepEqual(withLabor.openIds, ['labor'])
    const remembered = readCostNavState(JSON.stringify(withLabor))
    assert.equal(remembered.costsOpen, false)
    assert.deepEqual(remembered.openIds, ['labor'])
    assert.deepEqual(toggleCostNav(remembered, 'labor').openIds, [])
  })

  it('reveals a child by opening Costs and its parent', () => {
    const next = revealCostNav({ costsOpen: false, openIds: ['materials'] }, ['labor'])
    assert.equal(next.costsOpen, true)
    assert.deepEqual(next.openIds, ['materials', 'labor'])
  })
})
