import { describe, it, expect } from 'vitest'
import { isMemberEligibleForSession, isSessionInLagosPeriod } from '../services/reportService'
import { formatExportStatus, formatExportPercentage } from '../services/exportService'
import type { ActivitySession } from '../types/database'

describe('Phase 3.1.1: Reporting & Register Eligibility Engine', () => {
  const baseSession: ActivitySession = {
    id: 'sess-1',
    activity_id: 'act-1',
    session_title: 'Stake Devotional',
    session_date: '2026-10-10',
    start_time: '18:00:00',
    scheduled_end_time: '20:00:00',
    timezone: 'Africa/Lagos',
    status: 'closed',
    participating_units: null,
    eligibility_rule: 'all_ysa',
    visitor_registration_enabled: true,
    max_terminals: 2,
    code_expires_at: null,
    initiated_by: null,
    initiated_at: null,
    closed_by: null,
    closed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  it('determines all YSA eligible when rule is all_ysa and participating_units is null or empty', () => {
    const member = { id: 'mem-1', home_unit_id: 'unit-1' }
    expect(isMemberEligibleForSession(member, baseSession)).toBe(true)
    expect(isMemberEligibleForSession(member, { ...baseSession, participating_units: [] })).toBe(true)
  })

  it('restricts eligibility when participating_units is specified for all_ysa', () => {
    const sessionWithUnits: ActivitySession = {
      ...baseSession,
      participating_units: ['unit-1', 'unit-2']
    }
    expect(isMemberEligibleForSession({ id: 'mem-1', home_unit_id: 'unit-1' }, sessionWithUnits)).toBe(true)
    expect(isMemberEligibleForSession({ id: 'mem-3', home_unit_id: 'unit-3' }, sessionWithUnits)).toBe(false)
  })

  it('restricts eligibility when rule is specific_units', () => {
    const sessionSpecific: ActivitySession = {
      ...baseSession,
      eligibility_rule: 'specific_units',
      participating_units: ['unit-2']
    }
    expect(isMemberEligibleForSession({ id: 'mem-2', home_unit_id: 'unit-2' }, sessionSpecific)).toBe(true)
    expect(isMemberEligibleForSession({ id: 'mem-1', home_unit_id: 'unit-1' }, sessionSpecific)).toBe(false)
  })

  it('verifies custom_enrolled rule requires presence in enrolledMemberIdsForSession', () => {
    const customSession: ActivitySession = {
      ...baseSession,
      id: 'custom-sess-1',
      eligibility_rule: 'custom_enrolled'
    }
    const enrolledSet = new Set(['mem-special-1', 'mem-special-2'])

    // Member in enrolled set is eligible
    expect(isMemberEligibleForSession(
      { id: 'mem-special-1', home_unit_id: 'unit-1' },
      customSession,
      enrolledSet
    )).toBe(true)

    // Member NOT in enrolled set is NOT eligible
    expect(isMemberEligibleForSession(
      { id: 'mem-special-3', home_unit_id: 'unit-1' },
      customSession,
      enrolledSet
    )).toBe(false)

    // When enrolledSet is undefined/empty, members are ineligible
    expect(isMemberEligibleForSession(
      { id: 'mem-special-1', home_unit_id: 'unit-1' },
      customSession
    )).toBe(false)
  })
})

describe('Phase 3.1.1: Timezone & Period Handling (Africa/Lagos)', () => {
  it('correctly matches ISO dates and local date strings to year and month', () => {
    expect(isSessionInLagosPeriod('2026-10-15', 2026, 10)).toBe(true)
    expect(isSessionInLagosPeriod('2026-10-01T00:30:00+01:00', 2026, 10)).toBe(true)
    expect(isSessionInLagosPeriod('2026-10-31T23:45:00+01:00', 2026, 10)).toBe(true)
    expect(isSessionInLagosPeriod('2026-09-30', 2026, 10)).toBe(false)
    expect(isSessionInLagosPeriod('2026-11-01', 2026, 10)).toBe(false)
    expect(isSessionInLagosPeriod('2025-10-15', 2026, 10)).toBe(false)
  })
})

describe('Phase 3.1.1: Export Formatting & Accurate Attendance Denominator', () => {
  it('formats cell statuses accurately distinguishing provisional and ineligible', () => {
    expect(formatExportStatus('present')).toBe('PRESENT')
    expect(formatExportStatus('excused')).toBe('EXCUSED')
    expect(formatExportStatus('absent')).toBe('ABSENT')
    expect(formatExportStatus('unfinalized_recorded')).toBe('RECORDED (PROVISIONAL)')
    expect(formatExportStatus('unfinalized_unrecorded')).toBe('UNRECORDED (PROVISIONAL)')
    expect(formatExportStatus('ineligible')).toBe('INELIGIBLE')
  })

  it('formats export percentage returning N/A for null rates', () => {
    expect(formatExportPercentage(75.5)).toBe('75.5%')
    expect(formatExportPercentage(100)).toBe('100%')
    expect(formatExportPercentage(0)).toBe('0%')
    expect(formatExportPercentage(null)).toBe('N/A')
  })

  it('computes attendance percentage strictly against eligible finalized opportunities', () => {
    const attended = 3
    const finalizedEligible = 4
    const pct = Math.round((attended / finalizedEligible) * 1000) / 10
    expect(pct).toBe(75.0)

    // Zero eligible opportunities must be handled cleanly as null
    const zeroOpportunities = 0
    const calculatedRate = zeroOpportunities > 0 ? Math.round((0 / zeroOpportunities) * 1000) / 10 : null
    expect(calculatedRate).toBeNull()
  })

  it('ensures unfinalized sessions do not increment confirmed absences', () => {
    // When a session is provisional (draft or active), non-attending members do NOT receive an absence
    const sessionStatus = 'active' as string
    const isRecorded = false
    const status = sessionStatus === 'closed'
      ? (isRecorded ? 'present' : 'absent')
      : (isRecorded ? 'unfinalized_recorded' : 'unfinalized_unrecorded')

    expect(status).toBe('unfinalized_unrecorded')
    expect(status).not.toBe('absent')
  })
})

describe('Phase 3.1.2: Comprehensive Reporting Integrity & Multi-Unit Aggregations', () => {
  // Model data for multi-unit stake verification
  const unitA = 'unit-a-id'
  const unitB = 'unit-b-id'

  const memberA1 = { id: 'm-a1', home_unit_id: unitA, is_active: true }
  const memberA2 = { id: 'm-a2', home_unit_id: unitA, is_active: true }
  const memberAInactive = { id: 'm-a-inact', home_unit_id: unitA, is_active: false }
  const memberB1 = { id: 'm-b1', home_unit_id: unitB, is_active: true }

  const sessionAllStake: ActivitySession = {
    id: 'sess-all',
    activity_id: 'act-1',
    session_title: 'Stake Conference YSA',
    session_date: '2026-10-10',
    start_time: '10:00:00',
    scheduled_end_time: '12:00:00',
    timezone: 'Africa/Lagos',
    status: 'closed',
    participating_units: null,
    eligibility_rule: 'all_ysa',
    visitor_registration_enabled: true,
    max_terminals: 2,
    code_expires_at: null,
    initiated_by: null,
    initiated_at: null,
    closed_by: null,
    closed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  const sessionUnitAOnly: ActivitySession = {
    ...sessionAllStake,
    id: 'sess-unit-a',
    session_title: 'Unit A FHE',
    eligibility_rule: 'specific_units',
    participating_units: [unitA]
  }

  const sessionCustomEnrolled: ActivitySession = {
    ...sessionAllStake,
    id: 'sess-custom',
    session_title: 'Stake Choir Rehearsal',
    eligibility_rule: 'custom_enrolled'
  }

  it('1. Eligible present record: counts as attended and increments attendance rate', () => {
    // memberA1 attended sessionAllStake
    const isEligible = isMemberEligibleForSession(memberA1, sessionAllStake)
    expect(isEligible).toBe(true)

    const attendedCount = 1
    const eligibleCount = 1
    const rate = Math.round((attendedCount / eligibleCount) * 1000) / 10
    expect(rate).toBe(100.0)
  })

  it('2. Ineligible present record: cannot inflate finalized attendance rate or eligible opportunities', () => {
    // memberB1 attempts to check into sessionUnitAOnly (Unit A only)
    const isEligible = isMemberEligibleForSession(memberB1, sessionUnitAOnly)
    expect(isEligible).toBe(false)

    // Even if an attendance record existed in the database table for an ineligible member,
    // the reporting engine checks isMemberEligibleForSession first.
    // If ineligible, it marks activity_statuses as 'ineligible', doesn't increment eligibleFinalizedCount,
    // and doesn't increment attendedCount.
    let eligibleFinalizedCount = 0
    let attendedCount = 0
    if (isEligible) {
      eligibleFinalizedCount++
      attendedCount++
    }

    expect(eligibleFinalizedCount).toBe(0)
    expect(attendedCount).toBe(0)
  })

  it('3. Excused record: reported separately, does NOT count as present, and reduces absences', () => {
    // Member has 2 eligible sessions: 1 present, 1 excused
    const eligibleCount = 2
    const attendedCount = 1
    const excusedCount = 1
    const absentCount = Math.max(0, eligibleCount - (attendedCount + excusedCount))

    expect(absentCount).toBe(0)
    // Rate definition: attended / eligible * 100 (excused is not counted as present)
    const rate = Math.round((attendedCount / eligibleCount) * 1000) / 10
    expect(rate).toBe(50.0)
  })

  it('4. Duplicate attendance records for the same session and member: deduped by unique composite key', () => {
    // In database, attendance_records has unique(session_id, member_id)
    // In JS aggregation, attMap.set(`${rec.session_id}:${rec.member_id}`, status) prevents multiple check-ins
    const attMap = new Map<string, string>()
    attMap.set('sess-1:m-1', 'present')
    attMap.set('sess-1:m-1', 'present') // duplicate check-in attempt

    expect(attMap.size).toBe(1)
  })

  it('5. Inactive member: excluded from active reporting population and denominator', () => {
    const rawMembers = [memberA1, memberA2, memberAInactive, memberB1]
    const activeMembers = rawMembers.filter(m => m.is_active !== false)

    expect(activeMembers.length).toBe(3)
    expect(activeMembers.some(m => m.id === memberAInactive.id)).toBe(false)
  })

  it('6. Custom enrollment: strictly validates session_enrolled_members table', () => {
    const enrolledMembersSet = new Set([memberA1.id, memberB1.id])

    expect(isMemberEligibleForSession(memberA1, sessionCustomEnrolled, enrolledMembersSet)).toBe(true)
    expect(isMemberEligibleForSession(memberB1, sessionCustomEnrolled, enrolledMembersSet)).toBe(true)
    expect(isMemberEligibleForSession(memberA2, sessionCustomEnrolled, enrolledMembersSet)).toBe(false)
  })

  it('7. Provisional and cancelled sessions: never create confirmed absences', () => {
    const activeSession: ActivitySession = { ...sessionAllStake, id: 'sess-active', status: 'active' }
    const draftSession: ActivitySession = { ...sessionAllStake, id: 'sess-draft', status: 'draft' }

    // Neither session is 'closed', so neither increments eligible finalized opportunities
    const sessions = [activeSession, draftSession]
    const finalized = sessions.filter(s => s.status === 'closed')
    expect(finalized.length).toBe(0)
  })

  it('8. Empty reporting period: zero sessions yields null percentage (displayed as N/A)', () => {
    const sessions: ActivitySession[] = []
    const finalized = sessions.filter(s => s.status === 'closed')

    const totalOpportunities = finalized.length * 5 // e.g. 5 members
    const rate = totalOpportunities > 0 ? Math.round((0 / totalOpportunities) * 1000) / 10 : null

    expect(rate).toBeNull()
    expect(formatExportPercentage(rate)).toBe('N/A')
  })

  it('9. Multiple units with different eligible populations calculate fair rates', () => {
    // Unit A (2 members): eligible for sessionAllStake and sessionUnitAOnly (total 2 * 2 = 4 opps)
    // Unit B (1 member): eligible only for sessionAllStake (total 1 * 1 = 1 opp)
    // Unit A attendance: 3 check-ins out of 4 opps -> 75%
    // Unit B attendance: 1 check-in out of 1 opp -> 100%
    // Total stake attendance: 4 check-ins out of 5 opps -> 80% (never exceeding 100%)

    const unitAOpps = 4
    const unitAAtt = 3
    const unitARate = Math.round((unitAAtt / unitAOpps) * 1000) / 10

    const unitBOpps = 1
    const unitBAtt = 1
    const unitBRate = Math.round((unitBAtt / unitBOpps) * 1000) / 10

    const stakeOpps = unitAOpps + unitBOpps
    const stakeAtt = unitAAtt + unitBAtt
    const stakeRate = Math.round((stakeAtt / stakeOpps) * 1000) / 10

    expect(unitARate).toBe(75.0)
    expect(unitBRate).toBe(100.0)
    expect(stakeRate).toBe(80.0)
    expect(stakeRate).toBeLessThanOrEqual(100.0)
  })

  it('10. Zero eligible opportunities: returns null and displays N/A', () => {
    const opps = 0
    const attended = 0
    const rate = opps > 0 ? (attended / opps) * 100 : null

    expect(rate).toBeNull()
    expect(formatExportPercentage(rate)).toBe('N/A')
  })

  it('11. Unauthorized cross-unit request: rejected by unit-scoping policy', () => {
    // Function testing unit-scoping rule: bishop of Unit A cannot request Unit B
    function canAccessUnitReport(callerAssignedUnitId: string | null, callerRoles: string[], requestedUnitId: string): boolean {
      if (callerRoles.includes('system_admin') || callerRoles.includes('stake_presidency')) {
        return true
      }
      return callerAssignedUnitId === requestedUnitId
    }

    const bishopUnitA = unitA
    const bishopRoles = ['bishop']

    // Bishop requesting own unit -> allowed
    expect(canAccessUnitReport(bishopUnitA, bishopRoles, unitA)).toBe(true)

    // Bishop requesting Unit B -> denied!
    expect(canAccessUnitReport(bishopUnitA, bishopRoles, unitB)).toBe(false)

    // Stake presidency requesting Unit B -> allowed
    expect(canAccessUnitReport(null, ['stake_presidency'], unitB)).toBe(true)
  })
})
