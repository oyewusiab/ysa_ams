import { describe, it, expect } from 'vitest'
import type { RoleName } from '../types/database'

// --- Security & Domain Logic Engines for Phase 2.1 ---

// 1. Leader Provisioning Control (No public signup for leaders)
function provisionLeaderAccount(
  callerRole: RoleName,
  callerStatus: string,
  params: {
    fullName: string
    email: string
    username?: string
    role: RoleName
    assignedUnitId?: string
  }
): { success: boolean; error?: string } {
  if (callerStatus !== 'active' || callerRole !== 'system_admin') {
    return { success: false, error: 'Unauthorized: Only an active system administrator can provision accounts.' }
  }

  if (['bishop', 'branch_president'].includes(params.role) && !params.assignedUnitId) {
    return { success: false, error: 'Assigned unit is required for unit leaders.' }
  }

  return { success: true }
}

// 2. Resolve username or email securely without leaking enumeration
function resolveAuthIdentifier(
  identifier: string,
  profiles: { email: string; username?: string | null; accountStatus: string }[]
): string | null {
  const clean = identifier.trim()
  if (!clean) return null
  if (clean.includes('@')) {
    return clean.toLowerCase()
  }
  const match = profiles.find(
    p => p.username?.toLowerCase() === clean.toLowerCase() && p.accountStatus === 'active'
  )
  return match ? match.email.toLowerCase() : null
}

// 3. Name Suggestions (Without account requirement or personal data leak)
interface HistoricalRecord {
  name: string
  unitId?: string | null
  isNonMember: boolean
  isRegisteredMember: boolean
}

function getAttendanceNameSuggestions(
  query: string,
  dataset: HistoricalRecord[]
): { suggested_name: string; suggested_unit_id?: string | null; is_known_member: boolean }[] {
  const clean = query.trim().toLowerCase()
  if (clean.length < 2) return []

  const matches = dataset.filter(d => d.name.toLowerCase().includes(clean))
  // Return deduped by name, preserving unit if available
  const seen = new Set<string>()
  const result: any[] = []

  for (const m of matches) {
    const key = m.name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push({
        suggested_name: m.name,
        suggested_unit_id: m.unitId,
        is_known_member: m.isRegisteredMember
      })
    }
  }

  return result
}

// 4. Public Attendance Submission & Validation (Database/RPC rule emulation)
interface PublicSubmissionInput {
  sessionId: string
  sessionStatus: 'draft' | 'active' | 'closed'
  sessionExpiresAt: number
  attendeeName: string
  isNonMember: boolean
  selectedUnitId?: string | null
}

interface StoredSubmission {
  sessionId: string
  normalizedName: string
  isNonMember: boolean
  selectedUnitId?: string | null
}

function submitPublicAttendance(
  input: PublicSubmissionInput,
  existingSubmissions: StoredSubmission[]
): { success: boolean; error?: string } {
  const cleanName = input.attendeeName.trim()
  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: 'Attendee name is required (minimum 2 characters).' }
  }

  if (input.sessionStatus !== 'active') {
    return { success: false, error: 'Attendance session is not active.' }
  }

  if (Date.now() > input.sessionExpiresAt) {
    return { success: false, error: 'Attendance session has expired.' }
  }

  // Unit conditionally required: Mandatory if isNonMember is FALSE
  if (!input.isNonMember && !input.selectedUnitId) {
    return { success: false, error: 'Unit is required for Church members. Please select your ward or branch.' }
  }

  const normName = cleanName.toLowerCase().replace(/\s+/g, ' ')
  // Check duplicate submission for same session and attendee
  const isDuplicate = existingSubmissions.some(
    s => s.sessionId === input.sessionId && s.normalizedName === normName
  )
  if (isDuplicate) {
    return { success: false, error: `Attendance already recorded for ${cleanName} in this session.` }
  }

  existingSubmissions.push({
    sessionId: input.sessionId,
    normalizedName: normName,
    isNonMember: input.isNonMember,
    selectedUnitId: input.selectedUnitId || null
  })

  return { success: true }
}

// -----------------------------------------------------------------------------
// Test Suite: Phase 2.1 Attendance Security & Public Attendance
// -----------------------------------------------------------------------------

describe('Phase 2.1 — Attendance Security, Provisioning, and Public Experience', () => {

  describe('1. Authentication & Account Provisioning', () => {
    it('An unauthenticated visitor or non-admin cannot provision a leader account', () => {
      expect(provisionLeaderAccount('ysa_leader', 'active', {
        fullName: 'New Leader',
        email: 'leader@example.com',
        role: 'ysa_leader'
      }).success).toBe(false)
    })

    it('A System Administrator can securely provision a leader with role and unit', () => {
      const res = provisionLeaderAccount('system_admin', 'active', {
        fullName: 'Bishop John Doe',
        email: 'bishop.doe@example.com',
        role: 'bishop',
        assignedUnitId: 'unit-obantoko-1'
      })
      expect(res.success).toBe(true)
    })

    it('Provisioning a Bishop without an assigned ward is strictly rejected', () => {
      const res = provisionLeaderAccount('system_admin', 'active', {
        fullName: 'Bishop Without Ward',
        email: 'bishop@example.com',
        role: 'bishop',
        assignedUnitId: undefined
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('Assigned unit is required')
    })

    it('Resolves email when email is provided', () => {
      const email = resolveAuthIdentifier('admin@example.com', [])
      expect(email).toBe('admin@example.com')
    })

    it('Resolves username to user email securely when username matches', () => {
      const profiles = [
        { email: 'oyewusi.adebayo1@gmail.com', username: 'adebayo_admin', accountStatus: 'active' }
      ]
      const email = resolveAuthIdentifier('adebayo_admin', profiles)
      expect(email).toBe('oyewusi.adebayo1@gmail.com')
    })

    it('Returns null for unknown username without throwing or leaking error details', () => {
      const profiles = [
        { email: 'oyewusi.adebayo1@gmail.com', username: 'adebayo_admin', accountStatus: 'active' }
      ]
      expect(resolveAuthIdentifier('unknown_user', profiles)).toBeNull()
    })

    it('Deactivated accounts cannot resolve their username for login', () => {
      const profiles = [
        { email: 'inactive@example.com', username: 'inactive_user', accountStatus: 'deactivated' }
      ]
      expect(resolveAuthIdentifier('inactive_user', profiles)).toBeNull()
    })
  })

  describe('2. Public Attendance Form (No YSA Account Required)', () => {
    it('Allows an attendee to mark attendance with name and unit without an account', () => {
      const submissions: StoredSubmission[] = []
      const res = submitPublicAttendance({
        sessionId: 'sess-active-1',
        sessionStatus: 'active',
        sessionExpiresAt: Date.now() + 60000,
        attendeeName: 'Oluwaseun Bakare',
        isNonMember: false,
        selectedUnitId: 'unit-obantoko-2'
      }, submissions)

      expect(res.success).toBe(true)
      expect(submissions.length).toBe(1)
      expect(submissions[0].normalizedName).toBe('oluwaseun bakare')
    })

    it('Requires unit selection when non-member is NOT checked', () => {
      const submissions: StoredSubmission[] = []
      const res = submitPublicAttendance({
        sessionId: 'sess-active-1',
        sessionStatus: 'active',
        sessionExpiresAt: Date.now() + 60000,
        attendeeName: 'Oluwaseun Bakare',
        isNonMember: false,
        selectedUnitId: undefined // Missing unit!
      }, submissions)

      expect(res.success).toBe(false)
      expect(res.error).toContain('Unit is required for Church members')
    })

    it('Allows a non-member to submit attendance without selecting a unit', () => {
      const submissions: StoredSubmission[] = []
      const res = submitPublicAttendance({
        sessionId: 'sess-active-1',
        sessionStatus: 'active',
        sessionExpiresAt: Date.now() + 60000,
        attendeeName: 'Visiting Friend John',
        isNonMember: true,
        selectedUnitId: undefined
      }, submissions)

      expect(res.success).toBe(true)
      expect(submissions.length).toBe(1)
      expect(submissions[0].isNonMember).toBe(true)
      expect(submissions[0].selectedUnitId).toBeNull()
    })

    it('Rejects duplicate attendance submissions for the same person in the same session', () => {
      const submissions: StoredSubmission[] = []
      const payload: PublicSubmissionInput = {
        sessionId: 'sess-active-1',
        sessionStatus: 'active',
        sessionExpiresAt: Date.now() + 60000,
        attendeeName: 'Funmilayo Balogun',
        isNonMember: false,
        selectedUnitId: 'unit-alabata'
      }

      const first = submitPublicAttendance(payload, submissions)
      expect(first.success).toBe(true)

      // Duplicate attempt (even with slightly varied whitespace or casing)
      const dup = submitPublicAttendance({
        ...payload,
        attendeeName: '  FUNMILAYO   BALOGUN  '
      }, submissions)

      expect(dup.success).toBe(false)
      expect(dup.error).toContain('Attendance already recorded')
    })

    it('Rejects attendance submission when the session is closed or expired', () => {
      const submissions: StoredSubmission[] = []
      const closed = submitPublicAttendance({
        sessionId: 'sess-closed-1',
        sessionStatus: 'closed',
        sessionExpiresAt: Date.now() + 60000,
        attendeeName: 'Sunday Adeleke',
        isNonMember: false,
        selectedUnitId: 'unit-asero'
      }, submissions)
      expect(closed.success).toBe(false)
      expect(closed.error).toContain('not active')

      const expired = submitPublicAttendance({
        sessionId: 'sess-exp-1',
        sessionStatus: 'active',
        sessionExpiresAt: Date.now() - 5000, // Expired
        attendeeName: 'Sunday Adeleke',
        isNonMember: false,
        selectedUnitId: 'unit-asero'
      }, submissions)
      expect(expired.success).toBe(false)
      expect(expired.error).toContain('expired')
    })
  })

  describe('3. Historical Name Suggestions', () => {
    const historicalData: HistoricalRecord[] = [
      { name: 'Babajide Adeleke', unitId: 'unit-1', isNonMember: false, isRegisteredMember: true },
      { name: 'Oluchi Nwachukwu', unitId: 'unit-2', isNonMember: false, isRegisteredMember: true },
      { name: 'Emmanuel Adeyemi', unitId: 'unit-3', isNonMember: false, isRegisteredMember: true },
      { name: 'Guest Michael', unitId: null, isNonMember: true, isRegisteredMember: false }
    ]

    it('Returns empty suggestions when search query is less than 2 characters', () => {
      expect(getAttendanceNameSuggestions('a', historicalData)).toEqual([])
      expect(getAttendanceNameSuggestions(' ', historicalData)).toEqual([])
    })

    it('Returns matching suggestions without exposing sensitive personal info', () => {
      const results = getAttendanceNameSuggestions('ade', historicalData)
      expect(results.length).toBe(2)
      expect(results.map(r => r.suggested_name)).toContain('Babajide Adeleke')
      expect(results.map(r => r.suggested_name)).toContain('Emmanuel Adeyemi')
      // Ensure no phone or email properties are returned
      expect((results[0] as any).phone).toBeUndefined()
      expect((results[0] as any).email).toBeUndefined()
    })

    it('Distinguishes known members from guests/visitors', () => {
      const results = getAttendanceNameSuggestions('Guest', historicalData)
      expect(results.length).toBe(1)
      expect(results[0].suggested_name).toBe('Guest Michael')
      expect(results[0].is_known_member).toBe(false)
    })
  })
})
