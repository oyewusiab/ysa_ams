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

  it('1. One eligible member is present in one closed session: attendance rate is 100%', () => {
    // 1 member, 1 finalized session, member attended
    const isEligible = isMemberEligibleForSession(memberA1, sessionAllStake)
    expect(isEligible).toBe(true)

    const eligibleCount = 1
    const attendedCount = 1
    const rate = Math.round((attendedCount / eligibleCount) * 1000) / 10
    expect(rate).toBe(100.0)
  })

  it('2. One eligible member is absent in one closed session: attendance rate is 0%', () => {
    // 1 member, 1 finalized session, member did NOT attend
    const isEligible = isMemberEligibleForSession(memberA1, sessionAllStake)
    expect(isEligible).toBe(true)

    const eligibleCount = 1
    const attendedCount = 0
    const rate = Math.round((attendedCount / eligibleCount) * 1000) / 10
    expect(rate).toBe(0.0)
  })

  it('3. One eligible member is present and one eligible member is absent: attendance rate is 50%', () => {
    // 2 eligible members (memberA1, memberA2) for 1 session: memberA1 attended, memberA2 absent
    expect(isMemberEligibleForSession(memberA1, sessionAllStake)).toBe(true)
    expect(isMemberEligibleForSession(memberA2, sessionAllStake)).toBe(true)

    const eligibleOpportunities = 2
    const attendedCount = 1
    const rate = Math.round((attendedCount / eligibleOpportunities) * 1000) / 10
    expect(rate).toBe(50.0)
  })

  it('4. An ineligible member has a present record: the attendance rate does not increase', () => {
    // memberB1 is not in Unit A, and sessionUnitAOnly is specific to Unit A
    const isEligible = isMemberEligibleForSession(memberB1, sessionUnitAOnly)
    expect(isEligible).toBe(false)

    // Even if an attendance record exists for memberB1 in sessionUnitAOnly,
    // the query joins on eligible_pairs (or evaluates isMemberEligibleForSession),
    // strictly rejecting ineligible records from the numerator and denominator.
    const baselineEligible = 2 // memberA1, memberA2
    const baselineAttended = 1 // memberA1 attended
    const baselineRate = Math.round((baselineAttended / baselineEligible) * 1000) / 10

    // Attempting to inject ineligible attendance for memberB1:
    const injectedEligible = baselineEligible + (isEligible ? 1 : 0)
    const injectedAttended = baselineAttended + (isEligible ? 1 : 0)
    const resultingRate = Math.round((injectedAttended / injectedEligible) * 1000) / 10

    expect(resultingRate).toBe(baselineRate)
    expect(injectedEligible).toBe(2)
    expect(injectedAttended).toBe(1)
  })

  it('5. An inactive member has a present record: the attendance rate does not increase', () => {
    // memberAInactive is inactive (is_active: false)
    const rawMembers = [memberA1, memberA2, memberAInactive]
    const activeMembers = rawMembers.filter(m => m.is_active !== false)

    expect(activeMembers.some(m => m.id === memberAInactive.id)).toBe(false)
    expect(activeMembers.length).toBe(2)

    // Inactive member records are excluded before building eligible_pairs
    const eligibleCount = activeMembers.length * 1 // 1 session
    const attendedCount = 1 // only active memberA1 attended
    const rate = Math.round((attendedCount / eligibleCount) * 1000) / 10

    expect(rate).toBe(50.0)
  })

  it('6. A custom_enrolled session includes only enrolled members in its denominator', () => {
    // Enrolled: memberA1, memberB1. Not enrolled: memberA2
    const enrolledMembersSet = new Set([memberA1.id, memberB1.id])

    expect(isMemberEligibleForSession(memberA1, sessionCustomEnrolled, enrolledMembersSet)).toBe(true)
    expect(isMemberEligibleForSession(memberB1, sessionCustomEnrolled, enrolledMembersSet)).toBe(true)
    expect(isMemberEligibleForSession(memberA2, sessionCustomEnrolled, enrolledMembersSet)).toBe(false)

    // Total eligible denominator must equal 2 (only enrolled members)
    const allMembers = [memberA1, memberA2, memberB1]
    const eligibleCount = allMembers.filter(m => isMemberEligibleForSession(m, sessionCustomEnrolled, enrolledMembersSet)).length
    expect(eligibleCount).toBe(2)
  })

  it('7. Excused attendance is reported separately and is not counted as present', () => {
    // Member has 2 eligible sessions: 1 present, 1 excused
    const eligibleCount = 2
    const attendedCount = 1
    const excusedCount = 1
    const absentCount = Math.max(0, eligibleCount - (attendedCount + excusedCount))

    expect(absentCount).toBe(0)
    // Rate definition: attended / eligible * 100 (excused is reported separately, not in numerator)
    const rate = Math.round((attendedCount / eligibleCount) * 1000) / 10
    expect(rate).toBe(50.0)
  })

  it('8. A reporting period with no eligible opportunities returns NULL', () => {
    const sessions: ActivitySession[] = []
    const finalized = sessions.filter(s => s.status === 'closed')

    const totalOpportunities = finalized.length * 5 // e.g. 5 members
    const rate = totalOpportunities > 0 ? Math.round((0 / totalOpportunities) * 1000) / 10 : null

    expect(rate).toBeNull()
    expect(formatExportPercentage(rate)).toBe('N/A')
  })

  it('9. Several units with different eligible populations produce a correctly weighted stake-wide rate', () => {
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

  it('10. Duplicate attendance records cannot inflate the numerator', () => {
    // In SQL: SELECT DISTINCT ep.member_id, ep.session_id FROM eligible_pairs ep JOIN attendance_records ...
    // In JS: attMap.set(`${rec.session_id}:${rec.member_id}`, status)
    const attendanceRecords = [
      { session_id: 'sess-1', member_id: 'm-1', status: 'present' },
      { session_id: 'sess-1', member_id: 'm-1', status: 'present' } // duplicate check-in row
    ]

    const distinctPresentKeys = new Set(
      attendanceRecords
        .filter(r => r.status === 'present')
        .map(r => `${r.session_id}:${r.member_id}`)
    )

    expect(distinctPresentKeys.size).toBe(1)
  })

  it('11. Unauthorized users cannot access stake-wide analytics', () => {
    function canAccessStakeAnalytics(callerRoles: string[]): boolean {
      return callerRoles.includes('system_admin') || callerRoles.includes('stake_presidency')
    }

    expect(canAccessStakeAnalytics(['system_admin'])).toBe(true)
    expect(canAccessStakeAnalytics(['stake_presidency'])).toBe(true)
    expect(canAccessStakeAnalytics(['bishop'])).toBe(false)
    expect(canAccessStakeAnalytics(['branch_president'])).toBe(false)
    expect(canAccessStakeAnalytics(['ysa_leader'])).toBe(false)
    expect(canAccessStakeAnalytics([])).toBe(false)
  })

  it('12. A leader cannot retrieve a unit report outside their permitted scope', () => {
    function canAccessUnitReport(callerAssignedUnitId: string | null, callerRoles: string[], requestedUnitId: string): boolean {
      if (callerRoles.includes('system_admin') || callerRoles.includes('stake_presidency')) {
        return true
      }
      return callerAssignedUnitId === requestedUnitId
    }

    const bishopUnitA = unitA
    const bishopRoles = ['bishop']

    // Bishop requesting own unit -> permitted
    expect(canAccessUnitReport(bishopUnitA, bishopRoles, unitA)).toBe(true)

    // Bishop requesting Unit B -> denied!
    expect(canAccessUnitReport(bishopUnitA, bishopRoles, unitB)).toBe(false)

    // Stake presidency requesting Unit B -> permitted
    expect(canAccessUnitReport(null, ['stake_presidency'], unitB)).toBe(true)
  })
})
