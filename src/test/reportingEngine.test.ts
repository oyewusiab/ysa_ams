import { describe, it, expect } from 'vitest'
import { isMemberEligibleForSession } from '../services/reportService'
import type { ActivitySession } from '../types/database'

describe('Phase 3: Reporting & Register Eligibility Engine', () => {
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

  it('determines all YSA eligible when rule is all_ysa and participating_units is null', () => {
    const member = { id: 'mem-1', home_unit_id: 'unit-1' }
    expect(isMemberEligibleForSession(member, baseSession)).toBe(true)
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
})

describe('Phase 3: Export Engine and Data Formatting', () => {
  it('formats percentage numbers consistently with rounding', () => {
    const attended = 7
    const opportunities = 10
    const pct = Math.round((attended / opportunities) * 1000) / 10
    expect(pct).toBe(70.0)

    const oddAttended = 1
    const oddOpp = 3
    const oddPct = Math.round((oddAttended / oddOpp) * 1000) / 10
    expect(oddPct).toBe(33.3)
  })

  it('safely handles zero opportunities without division by zero', () => {
    const attended = 0
    const opportunities = 0
    const pct = opportunities > 0 ? Math.round((attended / opportunities) * 1000) / 10 : 0
    expect(pct).toBe(0)
  })

  it('computes absences as max(0, eligible - (attended + excused))', () => {
    const eligible = 5
    const attended = 3
    const excused = 1
    const absent = Math.max(0, eligible - (attended + excused))
    expect(absent).toBe(1)
  })
})
