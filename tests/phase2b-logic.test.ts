import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { grossProfit, grossProfitPercent } from '../lib/overview.ts'
import { booksClosedMessage, canReverseRow, chainNetsToZero, describeSaveError, directRemaining, reversalPreview, reversalProposal, reversalStatement } from '../lib/reversals.ts'
import { resolveEmployeeRates } from '../lib/employee-rates.ts'
import { uploadQueue } from '../lib/uploads.ts'
import { readCompanySettings } from '../lib/company-settings.ts'

describe('phase 2b remaining amounts', () => {
  it('nets a full reversal to zero and rejects a second full reversal', () => {
    const remaining = directRemaining(100, [-100])
    assert.equal(remaining, 0)
    assert.throws(() => reversalProposal(0, null), /Nothing left to reverse/)
  })

  it('accepts a partial reversal and the remainder, and rejects an oversize one', () => {
    assert.equal(reversalProposal(100, -40), -40)
    assert.equal(directRemaining(100, [-40, -60]), 0)
    assert.throws(() => reversalProposal(60, -70), /past zero/)
  })

  it('stores a positive amount as the opposite sign, including a full reversal that lands on zero', () => {
    assert.equal(reversalProposal(1000, 1000), -1000)
    assert.equal(reversalProposal(1000, 400), -400)
    assert.equal(reversalProposal(1000, null), -1000)
    assert.deepEqual(reversalStatement(1000, reversalProposal(1000, 1000)), { netted: 1000, left: 0 })
    assert.deepEqual(reversalStatement(1000, reversalProposal(1000, 400)), { netted: 400, left: 600 })
    assert.equal(reversalProposal(600, 600), -600)
    assert.equal(directRemaining(1000, [-400, -600]), 0)
    assert.throws(() => reversalProposal(1000, 1000.01), /past zero/)
    assert.throws(() => reversalProposal(1000, 0), /greater than zero/)
    assert.equal(reversalProposal(-400, 400), 400)
  })

  it('recomputes the summary from the positive amount the person typed', () => {
    assert.deepEqual(
      { netted: reversalPreview(1000, '250').netted, left: reversalPreview(1000, '250').left, error: reversalPreview(1000, '250').error },
      { netted: 250, left: 750, error: null },
    )
    assert.equal(reversalPreview(1000, '1000').left, 0)
    assert.equal(reversalPreview(1000, '1000').signed, -1000)
    assert.match(reversalPreview(1000, '0').error || '', /greater than zero/)
    assert.match(reversalPreview(1000, '1001').error || '', /past zero/)
  })

  it('turns a closed-period database error into a books-lock message', () => {
    const lock = '2026-03-01'
    const closed = { code: 'P0001', message: 'This date is in a closed period. Reverse the entry instead of editing it.' }
    assert.equal(
      describeSaveError(closed, lock, 'cost'),
      booksClosedMessage(lock, 'cost'),
    )
    assert.match(describeSaveError(closed, lock, 'cost'), /Books are closed through .+ Reverse this entry instead of editing it\./)
    assert.match(
      describeSaveError({ message: 'This billed date is in a closed period. Post a credit memo instead of editing it.' }, lock, 'invoice'),
      /Post a credit memo instead of editing it\./,
    )
    assert.match(
      describeSaveError({ message: 'That date is in a closed period. Choose a later date.' }, lock, 'cost'),
      /Choose a later date\./,
    )
    assert.equal(describeSaveError({ message: 'Vendor is required' }, lock, 'cost'), 'Vendor is required')
    assert.equal(describeSaveError({}, null, 'cost'), 'Could not save this cost.')
  })

  it('states the amount netted and what remains', () => {
    assert.deepEqual(reversalStatement(100, -40), { netted: 40, left: 60 })
  })

  it('hides a chain only when the whole chain nets to zero', () => {
    const rows = [
      { id: 'a', reversal_of_id: null, amount: 100 },
      { id: 'b', reversal_of_id: 'a', amount: -100 },
      { id: 'c', reversal_of_id: null, amount: 80 },
      { id: 'd', reversal_of_id: 'c', amount: -30 },
    ]
    assert.equal(chainNetsToZero('a', rows), true)
    assert.equal(chainNetsToZero('b', rows), true)
    assert.equal(chainNetsToZero('c', rows), false)
    assert.equal(canReverseRow(100, [-100], '2026-11-01'), false)
    assert.equal(canReverseRow(80, [-30], null), true)
  })
})

describe('phase 2b gross profit', () => {
  it('leaves the percent empty when nothing is invoiced', () => {
    assert.equal(grossProfitPercent(0, 100), null)
    assert.equal(grossProfit(0, 100), -100)
  })

  it('reduces billed amount and gross profit when a credit memo is included', () => {
    const billed = 2300 + -500
    const cost = 4834.5
    assert.equal(grossProfit(billed, cost), 1800 - 4834.5)
    assert.ok((grossProfitPercent(billed, cost) as number) < (grossProfitPercent(2300, cost) as number))
  })

  it('increases gross profit when a full cost reversal reduces cost', () => {
    const before = grossProfit(2300, 4834.5)
    const after = grossProfit(2300, 4834.5 - 250)
    assert.equal(after - before, 250)
  })
})

describe('phase 2b employee rates', () => {
  const employee = { standard_rate: 45, ot_rate: 67.5, dt_rate: 90, mob_rate: 25 }
  const overrides = [
    { project_id: 'job', effective_date: '2026-06-01', standard_rate: 99, ot_rate: 100, dt_rate: 101, mob_rate: 10 },
    { project_id: 'job', effective_date: '2026-07-01', standard_rate: 120, ot_rate: 130, dt_rate: 140, mob_rate: 11 },
  ]

  it('uses the employee card before any override', () => {
    const rate = resolveEmployeeRates(employee, overrides, 'job', '2026-05-01')
    assert.equal(rate.source, 'employee')
    assert.equal(rate.standard_rate, 45)
  })

  it('uses the override in effect on that date and ignores a later one', () => {
    const onDate = resolveEmployeeRates(employee, overrides, 'job', '2026-06-01')
    const later = resolveEmployeeRates(employee, overrides, 'job', '2026-07-01')
    assert.equal(onDate.source, 'override')
    assert.equal(onDate.standard_rate, 99)
    assert.equal(onDate.effective_date, '2026-06-01')
    assert.equal(later.standard_rate, 120)
  })
})

describe('phase 2b upload queue', () => {
  it('stops at the first failure and keeps the rest queued', async () => {
    const result = await uploadQueue(['a', 'b', 'c'], async (item) => {
      if (item === 'b') throw new Error('storage rejected b')
    })
    assert.deepEqual(result.uploaded, ['a'])
    assert.deepEqual(result.failed, ['b', 'c'])
    assert.equal(result.error, 'storage rejected b')
  })
})

describe('books lock date', () => {
  it('reads an ISO date and ignores anything else', () => {
    assert.equal(readCompanySettings({ books_lock_date: '2026-03-01' }).books_lock_date, '2026-03-01')
    assert.equal(readCompanySettings({ books_lock_date: 'March' }).books_lock_date, null)
  })
})
