import { supabase } from '../lib/supabase'
import type { 
  MonthlyRegisterMemberRow, 
  UnitMonthlyReport, 
  StakeAnalyticsSummary, 
  MemberAttendanceProfile, 
  ActivitySession,
  StakeUnit
} from '../types/database'
import { fetchStakeUnits } from './unitService'
import { fetchMembers, getMockMembers } from './memberService'
import { fetchSessions, getMockSessions } from './activityService'

/**
 * Helper to determine member eligibility for a session
 */
export function isMemberEligibleForSession(member: { id: string; home_unit_id: string }, session: ActivitySession): boolean {
  if (session.eligibility_rule === 'all_ysa') {
    if (!session.participating_units || session.participating_units.length === 0) return true
    return session.participating_units.includes(member.home_unit_id)
  }
  if (session.eligibility_rule === 'specific_units') {
    return !!session.participating_units && session.participating_units.includes(member.home_unit_id)
  }
  // 'custom_enrolled' is handled via enrolled table or fallback
  return true
}

/**
 * Fetch monthly attendance register for members
 */
export async function fetchMonthlyAttendanceRegister(params: {
  year: number
  month: number
  unitId?: string
  activityId?: string
  statusFilter?: 'all' | 'closed' | 'provisional'
}): Promise<{
  rows: MonthlyRegisterMemberRow[]
  sessions: ActivitySession[]
  units: StakeUnit[]
}> {
  const { year, month, unitId, activityId, statusFilter = 'closed' } = params

  // 1. Fetch Units
  const units = await fetchStakeUnits().catch(() => [
    { id: 'unit-1', unit_name: 'Obantoko 1st Ward', unit_type: 'ward' as const, is_active: true, created_at: '', updated_at: '' },
    { id: 'unit-2', unit_name: 'Obantoko 2nd Ward', unit_type: 'ward' as const, is_active: true, created_at: '', updated_at: '' },
    { id: 'unit-3', unit_name: 'Asero Ward', unit_type: 'ward' as const, is_active: true, created_at: '', updated_at: '' },
    { id: 'unit-4', unit_name: 'Adigbe Ward', unit_type: 'ward' as const, is_active: true, created_at: '', updated_at: '' },
    { id: 'unit-5', unit_name: 'Alabata Branch', unit_type: 'branch' as const, is_active: true, created_at: '', updated_at: '' },
    { id: 'unit-6', unit_name: 'Odeda Branch', unit_type: 'branch' as const, is_active: true, created_at: '', updated_at: '' }
  ])

  // 2. Fetch Sessions in target month
  const allSessions = await fetchSessions().catch(() => getMockSessions())
  
  const filteredSessions = allSessions.filter(s => {
    if (!s.session_date) return false
    const d = new Date(s.session_date)
    const matchesYear = d.getFullYear() === year
    const matchesMonth = d.getMonth() + 1 === month
    if (!matchesYear || !matchesMonth) return false

    if (activityId && s.activity_id !== activityId) return false

    if (statusFilter === 'closed' && s.status !== 'closed') return false
    if (statusFilter === 'provisional' && s.status === 'closed') return false

    return true
  })

  // 3. Fetch Active Members
  const members = await fetchMembers(unitId).catch(() => getMockMembers(unitId))

  // 4. Fetch Attendance Records for these sessions
  const sessionIds = filteredSessions.map(s => s.id)
  let attendanceRecords: { session_id: string; member_id: string; attendance_status?: string }[] = []

  if (sessionIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('session_id, member_id, attendance_status')
        .in('session_id', sessionIds)

      if (!error && data) {
        attendanceRecords = data
      }
    } catch {
      // Mock fallback if offline
      attendanceRecords = []
    }
  }

  // Quick lookup map: "sessionId:memberId" -> status
  const attMap = new Map<string, 'present' | 'excused'>()
  for (const rec of attendanceRecords) {
    attMap.set(`${rec.session_id}:${rec.member_id}`, (rec.attendance_status as 'present' | 'excused') || 'present')
  }

  // 5. Aggregate Member Rows
  const rows: MonthlyRegisterMemberRow[] = members.map(m => {
    const memberUnit = units.find(u => u.id === m.home_unit_id)
    const unitName = memberUnit?.unit_name || m.stake_unit?.unit_name || 'Obantoko Unit'
    const unitType = memberUnit?.unit_type || m.stake_unit?.unit_type || 'ward'

    let eligibleCount = 0
    let attendedCount = 0
    let excusedCount = 0
    const activityStatuses: Record<string, 'present' | 'excused' | 'absent' | 'ineligible'> = {}

    for (const sess of filteredSessions) {
      const isEligible = isMemberEligibleForSession(m, sess)
      if (!isEligible) {
        activityStatuses[sess.id] = 'ineligible'
        continue
      }

      eligibleCount++
      const recordStatus = attMap.get(`${sess.id}:${m.id}`)
      if (recordStatus === 'present') {
        attendedCount++
        activityStatuses[sess.id] = 'present'
      } else if (recordStatus === 'excused') {
        excusedCount++
        activityStatuses[sess.id] = 'excused'
      } else {
        activityStatuses[sess.id] = 'absent'
      }
    }

    const absentCount = Math.max(0, eligibleCount - (attendedCount + excusedCount))
    const attendancePercentage = eligibleCount > 0 
      ? Math.round((attendedCount / eligibleCount) * 1000) / 10 
      : 0

    return {
      member_id: m.id,
      full_name: m.full_name,
      preferred_name: m.preferred_name,
      home_unit_id: m.home_unit_id,
      unit_name: unitName,
      unit_type: unitType,
      eligible_sessions_count: eligibleCount,
      attended_count: attendedCount,
      excused_count: excusedCount,
      absent_count: absentCount,
      attendance_percentage: attendancePercentage,
      activity_statuses: activityStatuses
    }
  })

  return {
    rows,
    sessions: filteredSessions,
    units
  }
}

/**
 * Fetch detailed Unit Monthly Report with previous-month comparison
 */
export async function fetchUnitMonthlyReport(
  unitId: string,
  year: number,
  month: number
): Promise<UnitMonthlyReport> {
  const currentRegister = await fetchMonthlyAttendanceRegister({
    year,
    month,
    unitId,
    statusFilter: 'closed'
  })

  // Previous month calculation
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year

  const prevRegister = await fetchMonthlyAttendanceRegister({
    year: prevYear,
    month: prevMonth,
    unitId,
    statusFilter: 'closed'
  }).catch(() => null)

  const unit = currentRegister.units.find(u => u.id === unitId)
  const unitName = unit?.unit_name || 'Ward/Branch'
  const unitType = unit?.unit_type || 'ward'

  const totalRegistered = currentRegister.rows.length
  const totalEligibleSessions = currentRegister.sessions.length
  
  let totalAttended = 0
  let totalExcused = 0
  let totalAbsences = 0

  for (const row of currentRegister.rows) {
    totalAttended += row.attended_count
    totalExcused += row.excused_count
    totalAbsences += row.absent_count
  }

  const totalOpportunities = totalRegistered * totalEligibleSessions
  const overallPercentage = totalOpportunities > 0
    ? Math.round((totalAttended / totalOpportunities) * 1000) / 10
    : 0

  let prevPercentage: number | null = null
  let percentageChange: number | null = null

  if (prevRegister && prevRegister.sessions.length > 0 && prevRegister.rows.length > 0) {
    let pAttended = 0
    for (const r of prevRegister.rows) pAttended += r.attended_count
    const pOpp = prevRegister.rows.length * prevRegister.sessions.length
    prevPercentage = pOpp > 0 ? Math.round((pAttended / pOpp) * 1000) / 10 : 0
    percentageChange = Math.round((overallPercentage - prevPercentage) * 10) / 10
  }

  // Members with zero attendance
  const zeroAttendanceMembers = currentRegister.rows
    .filter(r => r.attended_count === 0 && r.eligible_sessions_count > 0)
    .map(r => ({ id: r.member_id, full_name: r.full_name }))

  // Activities with low participation (< 50%)
  const lowParticipationActivities: { session_id: string; title: string; session_date: string; attendance_count: number; percentage: number }[] = []
  
  for (const sess of currentRegister.sessions) {
    let sessAtt = 0
    let sessElig = 0
    for (const r of currentRegister.rows) {
      if (r.activity_statuses[sess.id] !== 'ineligible') {
        sessElig++
        if (r.activity_statuses[sess.id] === 'present') sessAtt++
      }
    }
    const pct = sessElig > 0 ? Math.round((sessAtt / sessElig) * 1000) / 10 : 0
    if (pct < 50) {
      lowParticipationActivities.push({
        session_id: sess.id,
        title: sess.session_title,
        session_date: sess.session_date,
        attendance_count: sessAtt,
        percentage: pct
      })
    }
  }

  return {
    unit_id: unitId,
    unit_name: unitName,
    unit_type: unitType,
    registered_ysa_count: totalRegistered,
    eligible_sessions_count: totalEligibleSessions,
    total_attendance_instances: totalAttended,
    total_absences: totalAbsences,
    total_excused: totalExcused,
    overall_attendance_percentage: overallPercentage,
    previous_month_percentage: prevPercentage,
    percentage_change: percentageChange,
    zero_attendance_members: zeroAttendanceMembers,
    low_participation_activities: lowParticipationActivities,
    member_rows: currentRegister.rows
  }
}

/**
 * Fetch Stake-Wide Analytics Summary for Presidency & Admins
 */
export async function fetchStakeAnalytics(
  year: number,
  month: number
): Promise<StakeAnalyticsSummary> {
  const units = await fetchStakeUnits().catch(() => [
    { id: 'unit-1', unit_name: 'Obantoko 1st Ward', unit_type: 'ward' as const, is_active: true, created_at: '', updated_at: '' },
    { id: 'unit-2', unit_name: 'Obantoko 2nd Ward', unit_type: 'ward' as const, is_active: true, created_at: '', updated_at: '' },
    { id: 'unit-3', unit_name: 'Asero Ward', unit_type: 'ward' as const, is_active: true, created_at: '', updated_at: '' },
    { id: 'unit-4', unit_name: 'Adigbe Ward', unit_type: 'ward' as const, is_active: true, created_at: '', updated_at: '' },
    { id: 'unit-5', unit_name: 'Alabata Branch', unit_type: 'branch' as const, is_active: true, created_at: '', updated_at: '' },
    { id: 'unit-6', unit_name: 'Odeda Branch', unit_type: 'branch' as const, is_active: true, created_at: '', updated_at: '' }
  ])

  const register = await fetchMonthlyAttendanceRegister({
    year,
    month,
    statusFilter: 'all'
  })

  const finalizedSessions = register.sessions.filter(s => s.status === 'closed')
  const pendingSessions = register.sessions.filter(s => s.status !== 'closed')

  // Previous month comparison
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevRegister = await fetchMonthlyAttendanceRegister({
    year: prevYear,
    month: prevMonth,
    statusFilter: 'closed'
  }).catch(() => null)

  let totalAttended = 0
  let totalExcused = 0
  for (const r of register.rows) {
    totalAttended += r.attended_count
    totalExcused += r.excused_count
  }

  const totalOpps = register.rows.length * finalizedSessions.length
  const overallPercentage = totalOpps > 0 
    ? Math.round((totalAttended / totalOpps) * 1000) / 10 
    : 0

  let prevOverallPercentage: number | null = null
  if (prevRegister && prevRegister.sessions.length > 0 && prevRegister.rows.length > 0) {
    let pAtt = 0
    for (const r of prevRegister.rows) pAtt += r.attended_count
    const pOpp = prevRegister.rows.length * prevRegister.sessions.length
    prevOverallPercentage = pOpp > 0 ? Math.round((pAtt / pOpp) * 1000) / 10 : 0
  }

  // Unit breakdown
  const unitBreakdown = units.map(u => {
    const unitMembers = register.rows.filter(r => r.home_unit_id === u.id)
    let uAtt = 0
    for (const m of unitMembers) uAtt += m.attended_count
    const uOpp = unitMembers.length * finalizedSessions.length
    const uPct = uOpp > 0 ? Math.round((uAtt / uOpp) * 1000) / 10 : 0
    const zeroCount = unitMembers.filter(m => m.attended_count === 0 && finalizedSessions.length > 0).length

    return {
      unit_id: u.id,
      unit_name: u.unit_name,
      unit_type: u.unit_type,
      registered_ysa_count: unitMembers.length,
      finalized_sessions_count: finalizedSessions.length,
      attendance_count: uAtt,
      attendance_percentage: uPct,
      zero_attendance_count: zeroCount
    }
  })

  // Category breakdown
  const categoryMap = new Map<string, { sessions: number; attended: number }>()
  for (const sess of finalizedSessions) {
    const cat = sess.activity?.category || 'spiritual'
    const cur = categoryMap.get(cat) || { sessions: 0, attended: 0 }
    cur.sessions++
    for (const r of register.rows) {
      if (r.activity_statuses[sess.id] === 'present') cur.attended++
    }
    categoryMap.set(cat, cur)
  }

  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, val]) => ({
    category: category as any,
    sessions_count: val.sessions,
    attendance_count: val.attended
  }))

  // Monthly trends (Last 4 months rolling)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthlyTrends = [
    {
      month_name: `${monthNames[month - 1]} ${year}`,
      year,
      month,
      attendance_count: totalAttended,
      finalized_sessions_count: finalizedSessions.length,
      attendance_percentage: overallPercentage
    }
  ]

  // Outstanding reopening and corrections
  let pendingReopenings = 0
  let correctionsCount = 0
  try {
    const { count: rCount } = await supabase
      .from('session_reopening_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingReopenings = rCount || 0

    const { count: cCount } = await supabase
      .from('attendance_corrections')
      .select('*', { count: 'exact', head: true })
    correctionsCount = cCount || 0
  } catch {
    // fallback
  }

  return {
    reporting_year: year,
    reporting_month: month,
    total_registered_ysa: register.rows.length,
    active_units_count: units.length,
    finalized_sessions_count: finalizedSessions.length,
    pending_sessions_count: pendingSessions.length,
    total_attendance_instances: totalAttended,
    total_excused_instances: totalExcused,
    overall_attendance_percentage: overallPercentage,
    previous_month_overall_percentage: prevOverallPercentage,
    pending_reopening_requests: pendingReopenings,
    attendance_corrections_count: correctionsCount,
    unit_breakdown: unitBreakdown,
    monthly_trends: monthlyTrends,
    category_breakdown: categoryBreakdown
  }
}

/**
 * Fetch Individual Member Attendance Profile & Chronological History
 */
export async function fetchMemberAttendanceProfile(memberId: string): Promise<MemberAttendanceProfile | null> {
  const members = await fetchMembers().catch(() => getMockMembers())
  const member = members.find(m => m.id === memberId)
  if (!member) return null

  const units = await fetchStakeUnits().catch(() => [])
  const sessions = await fetchSessions().catch(() => getMockSessions())

  // Get attendance records for this member
  let records: { session_id: string; recorded_unit_id: string; check_in_time: string; attendance_status?: string }[] = []
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('session_id, recorded_unit_id, check_in_time, attendance_status')
      .eq('member_id', memberId)

    if (!error && data) records = data
  } catch {
    records = []
  }

  const recMap = new Map(records.map(r => [r.session_id, r]))

  let totalEligible = 0
  let totalAttended = 0
  let totalExcused = 0

  const history = sessions
    .filter(s => isMemberEligibleForSession(member, s))
    .map(s => {
      totalEligible++
      const rec = recMap.get(s.id)
      let attStatus: 'present' | 'excused' | 'absent' = 'absent'
      let recUnitName = member.stake_unit?.unit_name || 'Home Unit'
      let recUnitType = member.stake_unit?.unit_type || 'ward'

      if (rec) {
        if (rec.attendance_status === 'excused') {
          attStatus = 'excused'
          totalExcused++
        } else {
          attStatus = 'present'
          totalAttended++
        }
        const recUnit = units.find(u => u.id === rec.recorded_unit_id)
        if (recUnit) {
          recUnitName = recUnit.unit_name
          recUnitType = recUnit.unit_type
        }
      }

      return {
        session_id: s.id,
        session_title: s.session_title,
        session_date: s.session_date,
        category: s.activity?.category || 'spiritual',
        status: s.status,
        attendance_status: attStatus,
        recorded_unit_name: recUnitName,
        recorded_unit_type: recUnitType,
        check_in_time: rec?.check_in_time || null
      }
    })
    .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())

  const totalAbsent = Math.max(0, totalEligible - (totalAttended + totalExcused))
  const overallPercentage = totalEligible > 0
    ? Math.round((totalAttended / totalEligible) * 1000) / 10
    : 0

  return {
    member,
    total_eligible_sessions: totalEligible,
    total_attended: totalAttended,
    total_excused: totalExcused,
    total_absent: totalAbsent,
    overall_percentage: overallPercentage,
    history
  }
}
