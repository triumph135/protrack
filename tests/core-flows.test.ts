import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calculateTotalCost } from '../lib/costs.ts'
import { hasPermission, userCan } from '../lib/permissions.ts'
import {
  isAlreadyRegisteredMessage,
  isExpired,
  isMissingRpc,
  isValidInvitationToken,
  isValidSubdomain,
  mayClaimInvitedAuthUser,
  safeInternalPath,
} from '../lib/security.ts'

describe('cost totals', () => {
  it('adds labor hours, rates, per diem, and mobilization', () => {
    const total = calculateTotalCost('labor', {
      st_hours: 8,
      st_rate: 50,
      ot_hours: 2,
      ot_rate: 75,
      dt_hours: 1,
      dt_rate: 100,
      per_diem: 40,
      mob_qty: 1,
      mob_rate: 25,
    })
    assert.equal(total, 8 * 50 + 2 * 75 + 100 + 40 + 25)
  })

  it('ignores non-numeric labor input', () => {
    assert.equal(calculateTotalCost('labor', { st_hours: Number.NaN, st_rate: 10 }), 0)
  })

  it('uses the entered amount for material costs', () => {
    assert.equal(calculateTotalCost('material', { cost: 125.125, st_hours: 99 }), 125.13)
  })
})

describe('permissions', () => {
  const entry = {
    material: 'read' as const,
    labor: 'none' as const,
    equipment: 'write' as const,
    subcontractor: 'none' as const,
    others: 'none' as const,
    capLeases: 'none' as const,
    consumable: 'none' as const,
    invoices: 'none' as const,
    projects: 'read' as const,
    users: 'none' as const,
  }

  it('treats write as readable and none as denied', () => {
    assert.equal(hasPermission(entry, 'material', 'read'), true)
    assert.equal(hasPermission(entry, 'material', 'write'), false)
    assert.equal(hasPermission(entry, 'equipment', 'write'), true)
    assert.equal(hasPermission(entry, 'labor', 'read'), false)
    assert.equal(hasPermission(null, 'projects', 'read'), false)
  })

  it('lets a master read and write every area', () => {
    assert.equal(userCan({ role: 'master', permissions: entry }, 'users', 'write'), true)
    assert.equal(userCan({ role: 'entry', permissions: entry }, 'users', 'read'), false)
  })
})

describe('tenant and auth guards', () => {
  it('allows only same-site relative paths', () => {
    assert.equal(safeInternalPath('/dashboard'), '/dashboard')
    assert.equal(safeInternalPath('/costs?category=labor'), '/costs?category=labor')
    assert.equal(safeInternalPath('https://evil.example'), '/dashboard')
    assert.equal(safeInternalPath('//evil.example'), '/dashboard')
    assert.equal(safeInternalPath('/%2F%2Fevil.example'), '/dashboard')
    assert.equal(safeInternalPath('/\\evil'), '/dashboard')
    assert.equal(safeInternalPath(null, '/login'), '/login')
  })

  it('rejects expired or malformed invitations', () => {
    assert.equal(isExpired('2000-01-01T00:00:00.000Z', new Date('2026-01-01')), true)
    assert.equal(isExpired('2099-01-01T00:00:00.000Z', new Date('2026-01-01')), false)
    assert.equal(isExpired('not-a-date'), true)
    assert.equal(isValidInvitationToken('abc'), false)
    assert.equal(isValidInvitationToken('11111111-2222-3333-4444-555555555555'), true)
  })

  it('does not let an older account be claimed by a new invitation', () => {
    assert.equal(
      mayClaimInvitedAuthUser(
        { created_at: '2026-01-01T00:00:00.000Z' },
        '2026-06-01T00:00:00.000Z'
      ),
      false
    )
    assert.equal(
      mayClaimInvitedAuthUser(
        { created_at: '2026-06-01T00:00:10.000Z' },
        '2026-06-01T00:00:00.000Z'
      ),
      true
    )
  })

  it('recognizes an existing auth account and a missing database function', () => {
    assert.equal(isAlreadyRegisteredMessage('A user with this email address has already been registered'), true)
    assert.equal(isAlreadyRegisteredMessage('network down'), false)
    assert.equal(isMissingRpc({ code: 'PGRST202' }), true)
    assert.equal(isMissingRpc({ message: 'Could not find the function public.create_workspace' }), true)
    assert.equal(isMissingRpc({ message: 'permission denied' }), false)
  })

  it('checks workspace subdomains', () => {
    assert.equal(isValidSubdomain('acme-field'), true)
    assert.equal(isValidSubdomain('A'), false)
    assert.equal(isValidSubdomain('-acme'), false)
  })
})
