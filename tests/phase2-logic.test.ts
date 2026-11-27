import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calculateTotalCost } from '../lib/costs.ts'
import { canAccessCategory, canExport, permissionsForRole, userCan } from '../lib/permissions.ts'
import {
  buildCategoryTree,
  ownAmountsByCategory,
  rollupCategoryAmounts,
  type CostCategoryRecord,
} from '../lib/categories.ts'
import { validateLaborFieldValue } from '../lib/labor-fields.ts'
import { inviteJoinPath, inviteJoinUrl } from '../lib/invites.ts'
import { readCompanySettings } from '../lib/company-settings.ts'
import { isMissingRelation, isValidInvitationToken } from '../lib/security.ts'
import { renderInviteEmail } from '../lib/email/invite.ts'

const material: CostCategoryRecord = {
  id: 'mat',
  tenant_id: 't',
  builtin_key: 'material',
  name: 'Material',
  kind: 'standard',
  parent_id: null,
  sort_order: 10,
  is_hidden: false,
  is_builtin: true,
  gl_code: null,
}

const labor: CostCategoryRecord = {
  ...material,
  id: 'lab',
  builtin_key: 'labor',
  name: 'Labor',
  kind: 'labor',
  sort_order: 20,
}

const direct: CostCategoryRecord = {
  ...labor,
  id: 'dir',
  builtin_key: null,
  name: 'Direct Labor',
  parent_id: 'lab',
  is_builtin: false,
  sort_order: 21,
}

describe('calculateTotalCost by kind', () => {
  it('uses hours for labor and the amount for named and standard', () => {
    const input = { cost: 10, st_hours: 2, st_rate: 40 }
    assert.equal(calculateTotalCost('labor', input), 80)
    assert.equal(calculateTotalCost('named', input), 10)
    assert.equal(calculateTotalCost('standard', input), 10)
    assert.equal(calculateTotalCost('equipment', input), 10)
  })
})

describe('category permissions', () => {
  const user = {
    role: 'entry',
    permissions: {
      material: 'none' as const,
      labor: 'read' as const,
      equipment: 'write' as const,
      subcontractor: 'read' as const,
      others: 'read' as const,
      capLeases: 'read' as const,
      consumable: 'read' as const,
      invoices: 'read' as const,
      projects: 'read' as const,
      users: 'none' as const,
    },
  }

  it('honors an explicit category grant over the legacy key', () => {
    assert.equal(canAccessCategory({
      ...user,
      permissions: { ...user.permissions, categories: { mat: 'write' } },
    }, { id: 'mat', builtinKey: 'material' }, 'write'), true)
  })

  it('falls back to the legacy key and allows an omitted built-in', () => {
    assert.equal(canAccessCategory(user, { id: 'mat', builtinKey: 'material' }, 'read'), false)
    assert.equal(canAccessCategory(user, { id: 'lab', builtinKey: 'labor' }, 'write'), false)
    assert.equal(canAccessCategory(user, { id: 'lab', builtinKey: 'labor' }, 'read'), true)
    assert.equal(canAccessCategory({ role: 'entry', permissions: {} }, { id: 'mat', builtinKey: 'material' }, 'write'), true)
  })

  it('denies a custom category until it is granted', () => {
    assert.equal(canAccessCategory(user, { id: 'custom', builtinKey: null }, 'read'), false)
    assert.equal(canAccessCategory(user, { id: 'dir', parentBuiltinKey: 'labor' }, 'read'), true)
  })

  it('lets masters through and keeps employee access on the labor key', () => {
    assert.equal(canAccessCategory({ role: 'master', permissions: {} }, { id: 'custom' }, 'write'), true)
    assert.equal(userCan(user, 'employees', 'read'), true)
    assert.equal(userCan(user, 'employees', 'write'), false)
  })

  it('writes an explicit level for every category in a role preset', () => {
    const preset = permissionsForRole('view', [{ id: 'mat' }, { id: 'lab' }])
    assert.equal(preset.version, 2)
    assert.equal(preset.categories?.mat, 'read')
    assert.equal(preset.users, 'none')
    assert.equal(preset.export?.mat, false)
    assert.equal(canExport({ role: 'view', permissions: preset }, 'mat', { id: 'mat', builtinKey: 'material' }), false)
  })
})

describe('category tree and rollup', () => {
  it('nests one level and rolls child amounts into the parent', () => {
    const tree = buildCategoryTree([material, labor, direct])
    assert.equal(tree.length, 2)
    assert.equal(tree[1].children[0].id, 'dir')
    const own = ownAmountsByCategory([
      { category_id: 'lab', cost: 100 },
      { category_id: 'dir', cost: 40 },
      { category: 'material', cost: 25 },
    ], [material, labor, direct])
    const rollup = rollupCategoryAmounts([material, labor, direct], own)
    assert.equal(rollup.lab.own, 100)
    assert.equal(rollup.lab.total, 140)
    assert.equal(rollup.mat.total, 25)
  })
})

describe('labor fields and invites', () => {
  it('validates custom field types', () => {
    assert.equal(validateLaborFieldValue({ label: 'Crew', field_type: 'select', options: ['A'] }, 'B'), 'Crew must be one of the listed choices')
    assert.equal(validateLaborFieldValue({ label: 'Code', field_type: 'number', options: [] }, '12'), null)
    assert.equal(validateLaborFieldValue({ label: 'Billable', field_type: 'boolean', options: [] }, 'maybe'), 'Billable must be yes or no')
  })

  it('builds a join link and rejects a short token', () => {
    assert.equal(inviteJoinPath('abc'), '/join?token=abc')
    assert.equal(inviteJoinUrl('https://protrackusa.com/', 'abc'), 'https://protrackusa.com/join?token=abc')
    assert.equal(isValidInvitationToken('short'), false)
    assert.equal(isValidInvitationToken('a'.repeat(24)), true)
  })

  it('treats missing settings as today\'s defaults', () => {
    assert.deepEqual(readCompanySettings(undefined), { labor_split_enabled: false, project_visibility: 'all', gp_goal_percent: null, books_lock_date: null, timezone: 'America/New_York' })
    assert.equal(readCompanySettings({ project_visibility: 'assigned' }).project_visibility, 'assigned')
    assert.equal(readCompanySettings({ gp_goal_percent: 20 }).gp_goal_percent, 20)
    assert.equal(readCompanySettings({ gp_goal_percent: 'high' }).gp_goal_percent, null)
  })

  it('recognizes a missing relation without treating every error as one', () => {
    assert.equal(isMissingRelation({ code: '42P01', message: 'relation cost_categories does not exist' }), true)
    assert.equal(isMissingRelation({ code: '42501', message: 'permission denied' }), false)
  })

  it('includes the company and the join url in the invite email', () => {
    const email = renderInviteEmail({
      company: 'Acme',
      inviter: 'Ada',
      role: 'entry',
      url: 'https://protrackusa.com/join?token=abc',
      expires: 'Nov 20, 2026',
    })
    assert.match(email.subject, /Acme/)
    assert.match(email.text, /Project Manager/)
    assert.match(email.html, /join\?token=abc/)
  })
})
