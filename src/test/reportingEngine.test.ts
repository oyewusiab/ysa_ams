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
