import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { showsJobSelectors } from '../lib/shell-scope.ts'

describe('job selectors', () => {
  it('hides them on company pages and keeps them on job pages', () => {
    for (const path of ['/reports', '/reports/activity', '/reports/custom/new', '/reports/custom/abc', '/employees', '/employees/rates', '/team', '/settings', '/settings/company']) {
      assert.equal(showsJobSelectors(path), false, path)
    }
    for (const path of ['/dashboard', '/projects', '/costs', '/costs/materials', '/invoices', '/users']) {
      assert.equal(showsJobSelectors(path), true, path)
    }
  })
})