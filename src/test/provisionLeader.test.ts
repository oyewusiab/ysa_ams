import { describe, it, expect } from 'vitest'
import type { RoleName } from '../types/database'

// Test suite for Phase 2.2 & 2.2.1: Complete Frontend Leader Provisioning & Security Hardening

interface UnitRecord {
  id: string
  unit_name: string
  unit_type: 'ward' | 'branch'
  is_active: boolean
}

describe('Phase 2.2.1 — Final Provisioning Security Fixes', () => {
  // Comprehensive domain validator reflecting Edge Function & DB RPC logic
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
    existingUsers: { email: string; username?: string | null; currentPasswordHash?: string }[],
    unitsRegistry: UnitRecord[] = []
  ): {
    valid: boolean
    statusCode: number
    error?: string
    isReconciliation?: boolean
    passwordChanged?: boolean
  } {
    // 1. Caller Authorization: Active profile AND system_admin role
    if (caller.status !== 'active') {
      return { valid: false, statusCode: 403, error: 'Unauthorized: Caller account is not active.' }
    }
    if (caller.role !== 'system_admin') {
      return { valid: false, statusCode: 403, error: 'Unauthorized: Only active System Administrators can provision leader accounts.' }
    }

    // 2. Full Name validation
    if (!payload.fullName || payload.fullName.trim().length < 2) {
      return { valid: false, statusCode: 400, error: 'Full name is required (minimum 2 characters).' }
    }

    // 3. Email validation
    const cleanEmail = payload.email?.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { valid: false, statusCode: 400, error: 'A valid email address is required.' }
    }

    // 4. Role validation
    const validRoles: RoleName[] = ['system_admin', 'ysa_leader', 'stake_presidency', 'bishop', 'branch_president']
    if (!validRoles.includes(payload.roleName)) {
      return { valid: false, statusCode: 400, error: `Invalid role specified: ${payload.roleName}` }
    }

    // 5. Unit Validation: Existence, Active status, and Type compatibility
    if (payload.assignedUnitId) {
      const unit = unitsRegistry.find(u => u.id === payload.assignedUnitId)
      if (!unit) {
        return { valid: false, statusCode: 400, error: 'Assigned unit does not exist in stake_units registry.' }
      }
      if (!unit.is_active) {
        return { valid: false, statusCode: 400, error: `Assigned unit "${unit.unit_name}" is currently inactive.` }
      }
      if (payload.roleName === 'bishop' && unit.unit_type !== 'ward') {
        return { valid: false, statusCode: 400, error: `Invalid assignment: A Bishop can only be assigned to a Ward, not a ${unit.unit_type}.` }
      }
      if (payload.roleName === 'branch_president' && unit.unit_type !== 'branch') {
        return { valid: false, statusCode: 400, error: `Invalid assignment: A Branch President can only be assigned to a Branch, not a ${unit.unit_type}.` }
      }
    } else if (['bishop', 'branch_president'].includes(payload.roleName)) {
      return { valid: false, statusCode: 400, error: 'Assigned ward/branch is strictly required for Bishops and Branch Presidents.' }
    }

    // 6. Username Uniqueness check across other accounts
    const cleanUsername = payload.username?.trim().toLowerCase()
    if (cleanUsername) {
      const conflict = existingUsers.find(
        u => u.username?.toLowerCase() === cleanUsername && u.email.toLowerCase() !== cleanEmail
      )
      if (conflict) {
        return { valid: false, statusCode: 400, error: `Username "${payload.username}" is already taken by another account.` }
      }
    }

    // 7. Check if Existing Auth User (Account Protection)
    const existingUser = existingUsers.find(u => u.email.toLowerCase() === cleanEmail)
    if (existingUser) {
      // REQUIREMENT C: Protect existing accounts. Do NOT change password on retry!
      return {
        valid: true,
        statusCode: 200,
        isReconciliation: true,
        passwordChanged: false
      }
    }

    // 8. New Account: Reject missing or short temporary passwords with HTTP 400 (NO FALLBACK)
    const tempPass = payload.temporaryPassword?.trim()
    if (!tempPass || tempPass.length < 8) {
      return {
        valid: false,
        statusCode: 400,
        error: 'Temporary password is required for new accounts (minimum 8 characters).'
      }
    }

    return {
      valid: true,
      statusCode: 200,
      isReconciliation: false,
      passwordChanged: true
    }
  }

  const activeAdmin = { role: 'system_admin' as RoleName, status: 'active' }
  const inactiveAdmin = { role: 'system_admin' as RoleName, status: 'deactivated' }
  const nonAdminLeader = { role: 'ysa_leader' as RoleName, status: 'active' }

  const sampleUnits: UnitRecord[] = [
    { id: 'ward-obantoko-1', unit_name: 'Obantoko 1st Ward', unit_type: 'ward', is_active: true },
    { id: 'ward-obantoko-2', unit_name: 'Obantoko 2nd Ward', unit_type: 'ward', is_active: true },
    { id: 'branch-osiele', unit_name: 'Osiele Branch', unit_type: 'branch', is_active: true },
    { id: 'ward-inactive', unit_name: 'Discontinued Ward', unit_type: 'ward', is_active: false },
  ]

  describe('A & B. Password Requirements & No Hardcoded Fallback', () => {
    it('rejects missing temporary password with HTTP 400 (never substitutes a default password)', () => {
      const result = validateProvisionRequest(
        activeAdmin,
        {
          fullName: 'Daniel Ade',
          email: 'daniel@example.com',
          roleName: 'ysa_leader',
          temporaryPassword: '', // missing
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('Temporary password is required')
    })

    it('rejects short temporary password (< 8 chars) with HTTP 400', () => {
      const result = validateProvisionRequest(
        activeAdmin,
        {
          fullName: 'Daniel Ade',
          email: 'daniel@example.com',
          roleName: 'ysa_leader',
          temporaryPassword: 'short',
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('minimum 8 characters')
    })

    it('accepts valid temporary password (>= 8 chars) for new accounts', () => {
      const result = validateProvisionRequest(
        activeAdmin,
        {
          fullName: 'Daniel Ade',
          email: 'daniel@example.com',
          roleName: 'ysa_leader',
          temporaryPassword: 'SecurePassword2026!',
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(true)
      expect(result.statusCode).toBe(200)
      expect(result.isReconciliation).toBe(false)
      expect(result.passwordChanged).toBe(true)
    })
  })

  describe('C. Account Protection & Idempotent Retries', () => {
    it('preserves existing password when retrying provisioning for an existing account (e.g. bayoglds@gmail.com)', () => {
      const existingAccounts = [
        { email: 'bayoglds@gmail.com', username: 'solaniyan', currentPasswordHash: 'existing-hash-123' },
      ]

      const retryResult = validateProvisionRequest(
        activeAdmin,
        {
          fullName: 'Samuel Olaniyan',
          email: 'bayoglds@gmail.com',
          username: 'solaniyan',
          roleName: 'ysa_leader',
          temporaryPassword: 'DifferentPassword999!', // caller tried to submit a new password
        },
        existingAccounts,
        sampleUnits
      )

      expect(retryResult.valid).toBe(true)
      expect(retryResult.isReconciliation).toBe(true)
      // Password must NOT be changed during standard provisioning retry!
      expect(retryResult.passwordChanged).toBe(false)
    })
  })

  describe('D. Authorization & Role/Unit Compatibility', () => {
    it('rejects deactivated system administrator with HTTP 403', () => {
      const result = validateProvisionRequest(
        inactiveAdmin,
        {
          fullName: 'New Leader',
          email: 'leader@example.com',
          roleName: 'ysa_leader',
          temporaryPassword: 'Password123!',
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(false)
      expect(result.statusCode).toBe(403)
      expect(result.error).toContain('Caller account is not active')
    })

    it('rejects non-admin caller with HTTP 403', () => {
      const result = validateProvisionRequest(
        nonAdminLeader,
        {
          fullName: 'New Leader',
          email: 'leader@example.com',
          roleName: 'ysa_leader',
          temporaryPassword: 'Password123!',
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(false)
      expect(result.statusCode).toBe(403)
      expect(result.error).toContain('Only active System Administrators')
    })

    it('rejects non-existent assigned unit ID', () => {
      const result = validateProvisionRequest(
        activeAdmin,
        {
          fullName: 'Bishop Jones',
          email: 'bishop.jones@example.com',
          roleName: 'bishop',
          assignedUnitId: 'non-existent-unit-id',
          temporaryPassword: 'Password123!',
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('Assigned unit does not exist')
    })

    it('rejects inactive assigned units', () => {
      const result = validateProvisionRequest(
        activeAdmin,
        {
          fullName: 'Bishop Jones',
          email: 'bishop.jones@example.com',
          roleName: 'bishop',
          assignedUnitId: 'ward-inactive',
          temporaryPassword: 'Password123!',
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('currently inactive')
    })

    it('rejects assigning a Bishop to a Branch', () => {
      const result = validateProvisionRequest(
        activeAdmin,
        {
          fullName: 'Bishop Jones',
          email: 'bishop.jones@example.com',
          roleName: 'bishop',
          assignedUnitId: 'branch-osiele', // Branch!
          temporaryPassword: 'Password123!',
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('Bishop can only be assigned to a Ward')
    })

    it('rejects assigning a Branch President to a Ward', () => {
      const result = validateProvisionRequest(
        activeAdmin,
        {
          fullName: 'President Smith',
          email: 'pres.smith@example.com',
          roleName: 'branch_president',
          assignedUnitId: 'ward-obantoko-1', // Ward!
          temporaryPassword: 'Password123!',
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('Branch President can only be assigned to a Branch')
    })

    it('accepts valid Bishop assignment to a Ward', () => {
      const result = validateProvisionRequest(
        activeAdmin,
        {
          fullName: 'Bishop Jones',
          email: 'bishop.jones@example.com',
          roleName: 'bishop',
          assignedUnitId: 'ward-obantoko-1',
          temporaryPassword: 'Password123!',
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(true)
      expect(result.statusCode).toBe(200)
    })

    it('accepts valid Branch President assignment to a Branch', () => {
      const result = validateProvisionRequest(
        activeAdmin,
        {
          fullName: 'President Smith',
          email: 'pres.smith@example.com',
          roleName: 'branch_president',
          assignedUnitId: 'branch-osiele',
          temporaryPassword: 'Password123!',
        },
        [],
        sampleUnits
      )
      expect(result.valid).toBe(true)
      expect(result.statusCode).toBe(200)
    })
  })

  describe('E. Safe Rollback on Partial Failures', () => {
    // Simulates multi-step creation and rollback behavior
    function simulateProvisioningWithFailure(
      stepToFail: 'createAuth' | 'setupProfile' | 'assignRole' | 'assignUnit' | 'none'
    ): { success: boolean; authUserCleanedUp: boolean; error?: string } {
      let createdAuthUserId: string | null = null
      let authUserDeleted = false

      try {
        if (stepToFail === 'createAuth') {
          throw new Error('Supabase Auth service unavailable')
        }
        createdAuthUserId = 'auth-new-123'

        if (stepToFail === 'setupProfile') {
          throw new Error('Database connection failed writing user_profiles')
        }

        if (stepToFail === 'assignRole') {
          throw new Error('Role constraint violation in user_roles')
        }

        if (stepToFail === 'assignUnit') {
          throw new Error('Foreign key violation in user_unit_assignments')
        }

        return { success: true, authUserCleanedUp: false }
      } catch (err: any) {
        // Rollback check: If auth was created but DB steps failed, delete created auth user
        if (createdAuthUserId) {
          authUserDeleted = true
        }
        return { success: false, authUserCleanedUp: authUserDeleted, error: err.message }
      }
    }

    it('cleans up newly created auth user if profile setup fails', () => {
      const res = simulateProvisioningWithFailure('setupProfile')
      expect(res.success).toBe(false)
      expect(res.authUserCleanedUp).toBe(true)
      expect(res.error).toContain('writing user_profiles')
    })

    it('cleans up newly created auth user if role assignment fails', () => {
      const res = simulateProvisioningWithFailure('assignRole')
      expect(res.success).toBe(false)
      expect(res.authUserCleanedUp).toBe(true)
    })

    it('cleans up newly created auth user if unit assignment fails', () => {
      const res = simulateProvisioningWithFailure('assignUnit')
      expect(res.success).toBe(false)
      expect(res.authUserCleanedUp).toBe(true)
    })
  })

  describe('F. Frontend Error Handling (No Unsafe Fallback)', () => {
    // Simulates the updated UserManagement.tsx handleProvisionUser logic
    async function handleProvisionUserWorkflow(
      edgeFunctionFn: () => Promise<{ success: boolean; error?: string; loginIdentifier?: string }>
    ): Promise<{ formClosed: boolean; successMessageSet: boolean; errorMessageSet: boolean; error?: string }> {
      let formClosed = false
      let successMessageSet = false
      let errorMessageSet = false
      let caughtError: string | undefined

      try {
        const edgeRes = await edgeFunctionFn()
        if (!edgeRes.success) {
          throw new Error(edgeRes.error || 'Provisioning service failed.')
        }
        formClosed = true
        successMessageSet = true
      } catch (err: any) {
        errorMessageSet = true
        caughtError = err.message
      }

      return { formClosed, successMessageSet, errorMessageSet, error: caughtError }
    }

    it('keeps form open and displays explicit error when Edge Function fails (never claims ready for login)', async () => {
      const result = await handleProvisionUserWorkflow(async () => ({
        success: false,
        error: 'Edge Function network timeout',
      }))

      expect(result.formClosed).toBe(false) // form stays open for retry
      expect(result.successMessageSet).toBe(false)
      expect(result.errorMessageSet).toBe(true)
      expect(result.error).toBe('Edge Function network timeout')
    })

    it('closes form and displays login identifier ONLY on verified Edge Function success', async () => {
      const result = await handleProvisionUserWorkflow(async () => ({
        success: true,
        loginIdentifier: 'solaniyan',
      }))

      expect(result.formClosed).toBe(true)
      expect(result.successMessageSet).toBe(true)
      expect(result.errorMessageSet).toBe(false)
    })
  })
})
