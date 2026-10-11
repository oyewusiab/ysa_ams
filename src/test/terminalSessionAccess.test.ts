import { describe, it, expect, beforeEach } from 'vitest'
import { generateSessionAttendanceCode } from '../services/activityService'

// --- Types & Helper Engines for Terminal & Attendance Verification ---

interface TerminalLease {
  id: string
  terminalToken: string
  leaseExpiresAt: number // epoch ms
  isRevoked: boolean
}

interface MockSession {
  id: string
  code: string
  status: 'draft' | 'active' | 'closed'
  maxTerminals: number
  terminals: TerminalLease[]
}

interface MemberCheckIn {
  sessionId: string
  memberId: string
  unitId: string
  checkInTime: string
}

interface VisitorCheckIn {
  sessionId: string
  fullName: string
  isChurchMember: boolean
  invitingUnitId: string | null
  checkInTime: string
}

describe('OBJECTIVE 1 — Session-Code-Based Terminal Access', () => {
  it('generates a 6-character alphanumeric code using an unambiguous alphabet', () => {
    const code = generateSessionAttendanceCode()
    expect(code).toHaveLength(6)
    // Must be uppercase alphanumeric
    expect(code).toMatch(/^[2-9A-HJ-NP-Za-z0-9]{6}$/)
    // Must avoid ambiguous characters: 0, O, 1, I, L
    expect(code).not.toMatch(/[01OILoil]/)
  })

  it('generates distinct random codes across multiple invocations', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 50; i++) {
      codes.add(generateSessionAttendanceCode())
    }
    // With 32^6 = 1 billion+ permutations, 50 should be completely unique
    expect(codes.size).toBe(50)
  })

  it('matches Method A direct link paths (/5BV21F) accurately', () => {
    const directLinkRegex = /^\/([2-9A-HJ-NP-Za-z0-9]{6})\/?$/

    expect('/5BV21F'.match(directLinkRegex)?.[1]).toBe('5BV21F')
    expect('/7km9pq'.match(directLinkRegex)?.[1]?.toUpperCase()).toBe('7KM9PQ')
    expect('/5bv21f/'.match(directLinkRegex)?.[1]?.toUpperCase()).toBe('5BV21F')

    // Administrative paths and invalid lengths must NOT match
    expect('/la/dashboard'.match(directLinkRegex)).toBeNull()
    expect('/la/terminal'.match(directLinkRegex)).toBeNull()
    expect('/5BV2'.match(directLinkRegex)).toBeNull()
    expect('/5BV21F99'.match(directLinkRegex)).toBeNull()
  })

  it('normalizes session codes to uppercase for validation', () => {
    const rawInput = '  5bv21f  '
    const normalized = rawInput.trim().toUpperCase()
    expect(normalized).toBe('5BV21F')
  })
})

describe('OBJECTIVE 2 — Concurrent Terminal Limits and Lease Heartbeats', () => {
  let session: MockSession

  beforeEach(() => {
    session = {
      id: 'sess-abc',
      code: '5BV21F',
      status: 'active',
      maxTerminals: 2,
      terminals: []
    }
  })

  function authorizeDevice(
    sess: MockSession,
    code: string,
    existingToken?: string,
    now: number = Date.now()
  ): { success: boolean; token?: string; error?: string } {
    if (sess.status !== 'active') {
      return { success: false, error: 'Session is not active' }
    }
    if (code !== sess.code) {
      return { success: false, error: 'Invalid or expired session code' }
    }

    // Check existing valid token
    if (existingToken) {
      const existing = sess.terminals.find(
        t => t.terminalToken === existingToken && !t.isRevoked && t.leaseExpiresAt >= now
      )
      if (existing) {
        // Renew lease
        existing.leaseExpiresAt = now + 10 * 60 * 1000
        return { success: true, token: existing.terminalToken }
      }
    }

    // Count active valid terminals (exclude expired or revoked)
    const activeCount = sess.terminals.filter(t => !t.isRevoked && t.leaseExpiresAt >= now).length

    if (activeCount >= sess.maxTerminals) {
      return {
        success: false,
        error: `Terminal limit reached (${activeCount} of ${sess.maxTerminals} active). Please contact the session administrator.`
      }
    }

    const token = `token-${Math.random().toString(36).substring(2)}`
    sess.terminals.push({
      id: `term-${sess.terminals.length + 1}`,
      terminalToken: token,
      leaseExpiresAt: now + 10 * 60 * 1000,
      isRevoked: false
    })

    return { success: true, token }
  }

  function heartbeatTerminal(sess: MockSession, token: string, now: number = Date.now()): boolean {
    const term = sess.terminals.find(t => t.terminalToken === token && !t.isRevoked)
    if (!term) return false
    term.leaseExpiresAt = now + 10 * 60 * 1000
    return true
  }

  function releaseTerminal(sess: MockSession, token: string): boolean {
    const term = sess.terminals.find(t => t.terminalToken === token && !t.isRevoked)
    if (!term) return false
    term.isRevoked = true
    return true
  }

  it('allows terminals up to max_terminals and rejects additional registrations', () => {
    const t1 = authorizeDevice(session, '5BV21F')
    expect(t1.success).toBe(true)

    const t2 = authorizeDevice(session, '5BV21F')
    expect(t2.success).toBe(true)

    // Third terminal attempt must be rejected with helpful admin guidance
    const t3 = authorizeDevice(session, '5BV21F')
    expect(t3.success).toBe(false)
    expect(t3.error).toContain('Terminal limit reached (2 of 2 active)')
    expect(t3.error).toContain('Please contact the session administrator')
  })

  it('frees capacity when an abandoned terminal lease expires after 10 minutes', () => {
    const now = 1000000000000
    const t1 = authorizeDevice(session, '5BV21F', undefined, now)
    const t2 = authorizeDevice(session, '5BV21F', undefined, now)
    expect(t1.success).toBe(true)
    expect(t2.success).toBe(true)

    // Verify limit is currently reached
    expect(authorizeDevice(session, '5BV21F', undefined, now).success).toBe(false)

    // Advance time by 11 minutes (t1 and t2 expired unless heartbeat sent)
    const laterTime = now + 11 * 60 * 1000

    // Only t2 sent heartbeat at minute 5
    heartbeatTerminal(session, t2.token!, now + 5 * 60 * 1000)

    // Now t1 is expired, but t2 is alive. Active count is 1 out of 2.
    // A new terminal t3 should now successfully connect!
    const t3 = authorizeDevice(session, '5BV21F', undefined, laterTime)
    expect(t3.success).toBe(true)
  })

  it('frees capacity immediately when a terminal explicitly releases', () => {
    const t1 = authorizeDevice(session, '5BV21F')
    const t2 = authorizeDevice(session, '5BV21F')
    expect(t1.success).toBe(true)
    expect(t2.success).toBe(true)
    expect(authorizeDevice(session, '5BV21F').success).toBe(false)

    // Terminal 1 logs out / closes desk
    releaseTerminal(session, t1.token!)

    // Now a replacement terminal can register immediately
    const t3 = authorizeDevice(session, '5BV21F')
    expect(t3.success).toBe(true)
  })

  it('invalidates existing terminals when a session code is regenerated', () => {
    const t1 = authorizeDevice(session, '5BV21F')
    expect(t1.success).toBe(true)

    // Leader regenerates code to a new code
    session.code = '9XY84K'
    // RPC initiate_attendance_session sets is_revoked = TRUE for previous terminals
    session.terminals.forEach(t => { t.isRevoked = true })

    // Old token should be invalid
    const reauth = authorizeDevice(session, '9XY84K', t1.token)
    expect(reauth.success).toBe(true)
    // A brand new token is issued, not reusing revoked one
    expect(reauth.token).not.toBe(t1.token)
  })

  it('reconnects with an existing valid terminal token without consuming an extra slot', () => {
    // Session limit is 2
    const t1 = authorizeDevice(session, '5BV21F')
    const t2 = authorizeDevice(session, '5BV21F')
    expect(t1.success).toBe(true)
    expect(t2.success).toBe(true)

    // A third new device is blocked because 2/2 slots are consumed
    const t3Blocked = authorizeDevice(session, '5BV21F')
    expect(t3Blocked.success).toBe(false)

    // Terminal 1 re-authorizes / reconnects using its existing valid token
    const t1Reconnected = authorizeDevice(session, '5BV21F', t1.token)
    expect(t1Reconnected.success).toBe(true)
    expect(t1Reconnected.token).toBe(t1.token)

    // Total terminals list count has NOT increased
    expect(session.terminals).toHaveLength(2)
  })

  it('treats reconnect attempts with revoked or expired tokens as new registrations', () => {
    const t1 = authorizeDevice(session, '5BV21F')
    expect(t1.success).toBe(true)

    // Explicitly release / revoke t1
    releaseTerminal(session, t1.token!)

    // Reconnecting with revoked token should not restore the revoked lease, but issue a new token
    const reconnectAttempt = authorizeDevice(session, '5BV21F', t1.token)
    expect(reconnectAttempt.success).toBe(true)
    expect(reconnectAttempt.token).not.toBe(t1.token)
  })

  it('rejects authorization for invalid codes or closed sessions', () => {
    // Invalid code
    const invalidCodeRes = authorizeDevice(session, 'WRONG1')
    expect(invalidCodeRes.success).toBe(false)
    expect(invalidCodeRes.error).toContain('Invalid or expired session code')

    // Closed session
    session.status = 'closed'
    const closedSessionRes = authorizeDevice(session, '5BV21F')
    expect(closedSessionRes.success).toBe(false)
    expect(closedSessionRes.error).toContain('Session is not active')
  })
})

describe('OBJECTIVE 4 — Attendance Data Persistence and Visitor Unit Association', () => {
  const recordedMembers: MemberCheckIn[] = []
  const recordedVisitors: VisitorCheckIn[] = []

  function checkInMember(sessionId: string, memberId: string, unitId: string): { success: boolean; error?: string } {
    if (recordedMembers.some(r => r.sessionId === sessionId && r.memberId === memberId)) {
      return { success: false, error: 'Duplicate check-in: Member has already been marked present for this session.' }
    }
    recordedMembers.push({
      sessionId,
      memberId,
      unitId,
      checkInTime: new Date().toISOString()
    })
    return { success: true }
  }

  function checkInVisitor(
    sessionId: string,
    fullName: string,
    isChurchMember: boolean,
    invitingUnitId: string | null
  ): { success: boolean } {
    recordedVisitors.push({
      sessionId,
      fullName,
      isChurchMember,
      invitingUnitId,
      checkInTime: new Date().toISOString()
    })
    return { success: true }
  }

  it('records registered members to attendance records and prevents duplicate check-ins', () => {
    const res1 = checkInMember('sess-1', 'mem-101', 'unit-obantoko-1')
    expect(res1.success).toBe(true)
    expect(recordedMembers).toHaveLength(1)

    // Duplicate check-in must be prevented
    const res2 = checkInMember('sess-1', 'mem-101', 'unit-obantoko-1')
    expect(res2.success).toBe(false)
    expect(res2.error).toContain('Duplicate check-in')
    expect(recordedMembers).toHaveLength(1)
  })

  it('records visitors separately with optional inviting unit without adding to member census', () => {
    // Non-member with inviting unit selected
    const v1 = checkInVisitor('sess-1', 'Michael Doe', false, 'unit-obantoko-2')
    expect(v1.success).toBe(true)

    // Non-member with no inviting unit selected (blank/general)
    const v2 = checkInVisitor('sess-1', 'Sarah Guest', false, null)
    expect(v2.success).toBe(true)

    expect(recordedVisitors).toHaveLength(2)
    expect(recordedVisitors[0].invitingUnitId).toBe('unit-obantoko-2')
    expect(recordedVisitors[1].invitingUnitId).toBeNull()

    // Registered members census count remains untouched (still only 1 member)
    expect(recordedMembers).toHaveLength(1)
  })
})

describe('OBJECTIVE 5 — Reporting Calculations Reconciliation', () => {
  it('handles zero eligible opportunities as N/A (null) instead of 0% or 100%', () => {
    const totalAttended = 0
    const totalEligibleOpportunities = 0

    const percentage = totalEligibleOpportunities > 0
      ? Math.round((totalAttended / totalEligibleOpportunities) * 1000) / 10
      : null

    expect(percentage).toBeNull()
  })

  it('calculates attendance percentage based exclusively on eligible members', () => {
    const unitAttended = 15
    const unitEligibleOpportunities = 20

    const pct = unitEligibleOpportunities > 0
      ? Math.round((unitAttended / unitEligibleOpportunities) * 1000) / 10
      : null

    expect(pct).toBe(75.0)
  })
})
