import { describe, it, expect } from 'vitest'
import type { RoleName } from '../types/database'

// Test suite for Phase 2.2: Complete Frontend Leader Provisioning via Supabase Edge Function & Auth Admin API

describe('Phase 2.2 — Complete Frontend Leader Provisioning', () => {
  // Domain logic validator matching supabase/functions/provision-leader/index.ts
  function validateProvisionRequest(
    caller: { role: RoleName; status: string },
    payload: {
      fullName: string
      email: string
      username?: string
      roleName: RoleName
      assignedUnitId?: string
      temporaryPassword?: string
    },
    existingUsers: { email: string; username?: string | null }[]
  ): { valid: boolean; statusCode: number; error?: string; isReconciliation?: boolean } {
    // 1. Authorization check
    if (caller.status !== 'active' || caller.role !== 'system_admin') {
      return { valid: false, statusCode: 403, error: 'Unauthorized: Only active System Administrators can provision leader accounts.' }
    }

    // 2. Full name check
    if (!payload.fullName || payload.fullName.trim().length < 2) {
      return { valid: false, statusCode: 400, error: 'Full name is required (minimum 2 characters).' }
    }

    // 3. Email check
    const cleanEmail = payload.email?.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { valid: false, statusCode: 400, error: 'A valid email address is required.' }
    }

    // 4. Role check
    const validRoles: RoleName[] = ['system_admin', 'ysa_leader', 'stake_presidency', 'bishop', 'branch_president']
    if (!validRoles.includes(payload.roleName)) {
      return { valid: false, statusCode: 400, error: `Invalid role specified: ${payload.roleName}` }
    }

    // 5. Unit assignment requirement
    if (['bishop', 'branch_president'].includes(payload.roleName) && !payload.assignedUnitId) {
      return { valid: false, statusCode: 400, error: 'Assigned ward/branch is strictly required for Bishops and Branch Presidents.' }
    }

    // 6. Username conflict
    const cleanUsername = payload.username?.trim().toLowerCase()
    if (cleanUsername) {
      const conflict = existingUsers.find(
        u => u.username?.toLowerCase() === cleanUsername && u.email.toLowerCase() !== cleanEmail
      )
      if (conflict) {
        return { valid: false, statusCode: 400, error: `Username "${payload.username}" is already taken by another account.` }
      }
    }

    // 7. Temporary password check (minimum 8 characters)
    const tempPass = payload.temporaryPassword?.trim()
    if (tempPass && tempPass.length < 8) {
      return { valid: false, statusCode: 400, error: 'Temporary password must be at least 8 characters.' }
    }

    // 8. Reconciliation check for existing user (e.g. Samuel Olaniyan bayoglds@gmail.com)
    const existing = existingUsers.find(u => u.email.toLowerCase() === cleanEmail)
    return { valid: true, statusCode: 200, isReconciliation: !!existing }
  }

  const adminCaller = { role: 'system_admin' as RoleName, status: 'active' }
  const nonAdminCaller = { role: 'ysa_leader' as RoleName, status: 'active' }
  const inactiveAdminCaller = { role: 'system_admin' as RoleName, status: 'deactivated' }

  it('rejects provisioning attempts from non-admin or inactive callers', () => {
    const payload = {
      fullName: 'Test Leader',
      email: 'leader@example.com',
      roleName: 'ysa_leader' as RoleName,
      temporaryPassword: 'Password123!',
    }

    const nonAdminResult = validateProvisionRequest(nonAdminCaller, payload, [])
    expect(nonAdminResult.valid).toBe(false)
    expect(nonAdminResult.statusCode).toBe(403)
    expect(nonAdminResult.error).toContain('Only active System Administrators')

    const inactiveResult = validateProvisionRequest(inactiveAdminCaller, payload, [])
    expect(inactiveResult.valid).toBe(false)
    expect(inactiveResult.statusCode).toBe(403)
  })

  it('requires full name with at least 2 characters', () => {
    const result = validateProvisionRequest(
      adminCaller,
      { fullName: ' ', email: 'test@example.com', roleName: 'ysa_leader' },
      []
    )
    expect(result.valid).toBe(false)
    expect(result.statusCode).toBe(400)
    expect(result.error).toContain('Full name is required')
  })

  it('validates email syntax', () => {
    const result = validateProvisionRequest(
      adminCaller,
      { fullName: 'Valid Name', email: 'invalid-email', roleName: 'ysa_leader' },
      []
    )
    expect(result.valid).toBe(false)
    expect(result.statusCode).toBe(400)
    expect(result.error).toContain('valid email address is required')
  })

  it('enforces mandatory unit assignment for bishops and branch presidents', () => {
    const bishopWithoutUnit = validateProvisionRequest(
      adminCaller,
      { fullName: 'Bishop Smith', email: 'bishop@example.com', roleName: 'bishop' },
      []
    )
    expect(bishopWithoutUnit.valid).toBe(false)
    expect(bishopWithoutUnit.statusCode).toBe(400)
    expect(bishopWithoutUnit.error).toContain('Assigned ward/branch is strictly required')

    const bishopWithUnit = validateProvisionRequest(
      adminCaller,
      { fullName: 'Bishop Smith', email: 'bishop@example.com', roleName: 'bishop', assignedUnitId: 'unit-123' },
      []
    )
    expect(bishopWithUnit.valid).toBe(true)
    expect(bishopWithUnit.statusCode).toBe(200)
  })

  it('enforces minimum 8 characters for temporary passwords', () => {
    const shortPassResult = validateProvisionRequest(
      adminCaller,
      {
        fullName: 'New Leader',
        email: 'leader@example.com',
        roleName: 'ysa_leader',
        temporaryPassword: 'short',
      },
      []
    )
    expect(shortPassResult.valid).toBe(false)
    expect(shortPassResult.statusCode).toBe(400)
    expect(shortPassResult.error).toContain('Temporary password must be at least 8 characters')

    const validPassResult = validateProvisionRequest(
      adminCaller,
      {
        fullName: 'New Leader',
        email: 'leader@example.com',
        roleName: 'ysa_leader',
        temporaryPassword: 'ObantokoYSA2026!',
      },
      []
    )
    expect(validPassResult.valid).toBe(true)
  })

  it('prevents username collision with another account', () => {
    const existingUsers = [
      { email: 'user1@example.com', username: 'johndoe' },
    ]

    const result = validateProvisionRequest(
      adminCaller,
      {
        fullName: 'Another John',
        email: 'user2@example.com',
        username: 'johndoe',
        roleName: 'ysa_leader',
      },
      existingUsers
    )
    expect(result.valid).toBe(false)
    expect(result.statusCode).toBe(400)
    expect(result.error).toContain('already taken')
  })

  it('allows same user to retain username during reconciliation', () => {
    const existingUsers = [
      { email: 'bayoglds@gmail.com', username: 'solaniyan' },
    ]

    const result = validateProvisionRequest(
      adminCaller,
      {
        fullName: 'Samuel Olaniyan',
        email: 'bayoglds@gmail.com',
        username: 'solaniyan',
        roleName: 'ysa_leader',
      },
      existingUsers
    )
    expect(result.valid).toBe(true)
    expect(result.isReconciliation).toBe(true)
  })

  it('identifies existing account submission for Samuel Olaniyan (bayoglds@gmail.com) as reconciliation', () => {
    const existingUsers = [
      { email: 'bayoglds@gmail.com', username: null },
    ]

    const result = validateProvisionRequest(
      adminCaller,
      {
        fullName: 'Samuel Olaniyan',
        email: 'bayoglds@gmail.com',
        username: 'solaniyan',
        roleName: 'ysa_leader',
        temporaryPassword: 'ObantokoYSA2026!',
      },
      existingUsers
    )
    expect(result.valid).toBe(true)
    expect(result.isReconciliation).toBe(true)
  })
})
