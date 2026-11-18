import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { employeeProjectIdForSave, employeeScopeLabel } from '../lib/employee-scope.ts'

const projects = [
  { id: '22222222-2222-4222-8222-2222222222a1', jobNumber: 'JOB-A-001', jobName: 'Acme Test Job' },
  { id: '22222222-2222-4222-8222-2222222222a2', jobNumber: 'JOB-A-002', jobName: 'Acme Shop Job' },
]

describe('employee scope', () => {
  it('labels a null assignment as global, including the seeded Alex Rivera row', () => {
    assert.equal(employeeScopeLabel(null, projects), 'Global')
    assert.equal(employeeScopeLabel(undefined, projects), 'Global')
    assert.equal(employeeScopeLabel('   ', projects), 'Global')
  })

  it('names the assigned project, including one that is not the active job', () => {
    assert.equal(
      employeeScopeLabel('22222222-2222-4222-8222-2222222222a1', projects),
      'JOB-A-001 — Acme Test Job',
    )
    assert.equal(
      employeeScopeLabel('22222222-2222-4222-8222-2222222222a2', projects),
      'JOB-A-002 — Acme Shop Job',
    )
  })

  it('does not call an unknown project the current project', () => {
    assert.equal(employeeScopeLabel('99999999-9999-4999-8999-999999999999', projects), 'Assigned project')
  })

  it('persists a cleared assignment as null so the update is not dropped', () => {
    assert.equal(employeeProjectIdForSave(''), null)
    assert.equal(employeeProjectIdForSave('   '), null)
    assert.equal(employeeProjectIdForSave(undefined), null)
    assert.equal(employeeProjectIdForSave(null), null)
    const payload = { project_id: employeeProjectIdForSave('') }
    assert.equal(JSON.stringify(payload), '{"project_id":null}')
    assert.equal(employeeProjectIdForSave('22222222-2222-4222-8222-2222222222a2'), '22222222-2222-4222-8222-2222222222a2')
  })
})
