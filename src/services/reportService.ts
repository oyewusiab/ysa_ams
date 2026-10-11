import { supabase } from '../lib/supabase'
import type { 
  MonthlyRegisterMemberRow, 
  UnitMonthlyReport, 
  StakeAnalyticsSummary, 
  MemberAttendanceProfile, 
  ActivitySession,
  StakeUnit,
  ActivityCellAttendanceStatus
} from '../types/database'
import { fetchStakeUnits } from './unitService'
import { fetchMembers } from './memberService'
import { fetchSessions } from './activityService'

/**
 * Robust helper to verify if a session date falls in target Year & Month
 * in the official Africa/Lagos (UTC+1) timezone.
 */
export function isSessionInLagosPeriod(sessionDateStr: string, year: number, month: number): boolean {
  if (!sessionDateStr) return false
  // Format is standard ISO date "YYYY-MM-DD"
  const parts = sessionDateStr.split('-')
  if (parts.length >= 2) {
    const sYear = parseInt(parts[0], 10)
    const sMonth = parseInt(parts[1], 10)
    return sYear === year && sMonth === month
  }
  // Fallback parsing
  const d = new Date(sessionDateStr)
  return d.getFullYear() === year && (d.getMonth() + 1) === month
}

/**
 * Authoritative Member Eligibility Evaluator:
 * - 'all_ysa': if participating_units is empty/null, all YSA eligible; otherwise member's unit must be included.
 * - 'specific_units': member's unit MUST be included in participating_units.
 * - 'custom_enrolled': member MUST be present in enrolledMemberIds set for this session.
 */
export function isMemberEligibleForSession(
  member: { id: string; home_unit_id: string },
  session: ActivitySession,
  enrolledMemberIdsForSession?: Set<string>
): boolean {
  if (session.eligibility_rule === 'all_ysa') {
    if (!session.participating_units || session.participating_units.length === 0) return true
    return session.participating_units.includes(member.home_unit_id)
  }

  if (session.eligibility_rule === 'specific_units') {
    if (!session.participating_units || session.participating_units.length === 0) return false
    return session.participating_units.includes(member.home_unit_id)
  }

  if (session.eligibility_rule === 'custom_enrolled') {
    if (!enrolledMemberIdsForSession) return false
    return enrolledMemberIdsForSession.has(member.id)
  }

  return false
}

/**
 * Fetch monthly attendance register for members.
 * Enforces:
 * 1. Strict database queries (throws on error with message, no silent fallback).
 * 2. Unfinalized sessions never generate confirmed absences.
 * 3. Exact custom enrollment check via session_enrolled_members.
 * 4. Percentage is null when eligible opportunities = 0.
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

  // 1. Authoritative Units Fetch
  const units = await fetchStakeUnits()

  // 2. Authoritative Sessions Fetch
  const allSessions = await fetchSessions()
  
  const filteredSessions = allSessions.filter(s => {
    if (!isSessionInLagosPeriod(s.session_date, year, month)) return false
    if (activityId && s.activity_id !== activityId) return false

    if (statusFilter === 'closed' && s.status !== 'closed') return false
    if (statusFilter === 'provisional' && s.status === 'closed') return false

    return true
  })

  // 3. Authoritative Active Members Fetch
  const rawMembers = await fetchMembers(unitId)
  const members = rawMembers.filter(m => m.is_active !== false)

  // 4. Fetch Custom Enrolled records if any sessions use custom_enrolled
  const customEnrolledSessions = filteredSessions.filter(s => s.eligibility_rule === 'custom_enrolled')
  const enrolledMap = new Map<string, Set<string>>() // sessionId -> Set of memberIds

  if (customEnrolledSessions.length > 0) {
    const customSessionIds = customEnrolledSessions.map(s => s.id)
    const { data: enrolledData, error: enrolledErr } = await supabase
      .from('session_enrolled_members')
      .select('session_id, member_id')
      .in('session_id', customSessionIds)

    if (enrolledErr) {
      throw new Error(`Failed to verify session enrollment: ${enrolledErr.message}`)
    }

    if (enrolledData) {
      for (const item of enrolledData) {
        if (!enrolledMap.has(item.session_id)) {
          enrolledMap.set(item.session_id, new Set())
        }
        enrolledMap.get(item.session_id)!.add(item.member_id)
      }
    }
  }

  // 5. Fetch Attendance Records for these sessions
  const sessionIds = filteredSessions.map(s => s.id)
  const attMap = new Map<string, 'present' | 'excused'>()

  if (sessionIds.length > 0) {
    const { data: attendanceData, error: attErr } = await supabase
      .from('attendance_records')
      .select('session_id, member_id, attendance_status')
      .in('session_id', sessionIds)

    if (attErr) {
      throw new Error(`Database error fetching attendance records: ${attErr.message}`)
    }

    if (attendanceData) {
      for (const rec of attendanceData) {
        attMap.set(`${rec.session_id}:${rec.member_id}`, (rec.attendance_status as 'present' | 'excused') || 'present')
      }
    }
  }

  // 6. Aggregate Member Rows
  const rows: MonthlyRegisterMemberRow[] = members.map(m => {
    const memberUnit = units.find(u => u.id === m.home_unit_id)
    const unitName = memberUnit?.unit_name || m.stake_unit?.unit_name || 'Obantoko Unit'
    const unitType = memberUnit?.unit_type || m.stake_unit?.unit_type || 'ward'

    let eligibleFinalizedCount = 0
    let attendedCount = 0
    let excusedCount = 0
    let confirmedAbsenceCount = 0
    const activityStatuses: Record<string, ActivityCellAttendanceStatus> = {}

    for (const sess of filteredSessions) {
      const isEligible = isMemberEligibleForSession(m, sess, enrolledMap.get(sess.id))
      if (!isEligible) {
        activityStatuses[sess.id] = 'ineligible'
        continue
      }

      const isFinalized = sess.status === 'closed'
      const recordStatus = attMap.get(`${sess.id}:${m.id}`)

      if (isFinalized) {
        eligibleFinalizedCount++
        if (recordStatus === 'present') {
          attendedCount++
          activityStatuses[sess.id] = 'present'
        } else if (recordStatus === 'excused') {
          excusedCount++
          activityStatuses[sess.id] = 'excused'
        } else {
          confirmedAbsenceCount++
          activityStatuses[sess.id] = 'absent'
        }
      } else {
        // Unfinalized session: Provisional status, never confirmed absence!
        if (recordStatus === 'present' || recordStatus === 'excused') {
          activityStatuses[sess.id] = 'unfinalized_recorded'
        } else {
          activityStatuses[sess.id] = 'unfinalized_unrecorded'
        }
      }
    }

    // Attendance percentage strictly calculated on finalized eligible sessions:
    // attended / eligible finalized * 100
    const attendancePercentage = eligibleFinalizedCount > 0 
      ? Math.round((attendedCount / eligibleFinalizedCount) * 1000) / 10 
      : null

    return {
      member_id: m.id,
      full_name: m.full_name,
      preferred_name: m.preferred_name,
      home_unit_id: m.home_unit_id,
      unit_name: unitName,
      unit_type: unitType,
      eligible_sessions_count: eligibleFinalizedCount,
      attended_count: attendedCount,
      excused_count: excusedCount,
      absent_count: confirmedAbsenceCount,
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
 * Fetch detailed Unit Monthly Report with accurate opportunity-based calculations.
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

  let prevRegister = null
  try {
    prevRegister = await fetchMonthlyAttendanceRegister({
      year: prevYear,
      month: prevMonth,
      unitId,
      statusFilter: 'closed'
    })
  } catch (err) {
    console.warn('Previous month register query notice:', err)
  }

  const unit = currentRegister.units.find(u => u.id === unitId)
  const unitName = unit?.unit_name || 'Ward/Branch'
  const unitType = unit?.unit_type || 'ward'

  const totalRegistered = currentRegister.rows.length
  // Total finalized sessions that actually applied to this unit
  const totalEligibleSessions = currentRegister.sessions.filter(s => {
    if (s.eligibility_rule === 'all_ysa') {
      return !s.participating_units || s.participating_units.length === 0 || s.participating_units.includes(unitId)
    }
    if (s.eligibility_rule === 'specific_units') {
      return !!s.participating_units && s.participating_units.includes(unitId)
    }
    if (s.eligibility_rule === 'custom_enrolled') {
      return currentRegister.rows.some(m => m.activity_statuses[s.id] !== 'ineligible')
    }
    return false
  }).length
  
  let totalAttended = 0
  let totalExcused = 0
  let totalAbsences = 0
  let totalEligibleOpportunitiesSum = 0

  for (const row of currentRegister.rows) {
    totalAttended += row.attended_count
    totalExcused += row.excused_count
    totalAbsences += row.absent_count
    totalEligibleOpportunitiesSum += row.eligible_sessions_count
  }

  // Overall attendance percentage: total attended / sum of actual eligible finalized opportunities
  const overallPercentage = totalEligibleOpportunitiesSum > 0
    ? Math.round((totalAttended / totalEligibleOpportunitiesSum) * 1000) / 10
    : null

  let prevPercentage: number | null = null
  let percentageChange: number | null = null

  if (prevRegister && prevRegister.rows.length > 0) {
    let pAttended = 0
    let pOppSum = 0
    for (const r of prevRegister.rows) {
      pAttended += r.attended_count
      pOppSum += r.eligible_sessions_count
    }
    if (pOppSum > 0) {
      prevPercentage = Math.round((pAttended / pOppSum) * 1000) / 10
      if (overallPercentage !== null) {
        percentageChange = Math.round((overallPercentage - prevPercentage) * 10) / 10
      }
    }
  }

  // Members with zero attendance among those who had eligible finalized sessions
  const zeroAttendanceMembers = currentRegister.rows
    .filter(r => r.attended_count === 0 && r.eligible_sessions_count > 0)
    .map(r => ({ id: r.member_id, full_name: r.full_name }))

  // Activities with low participation (< 50% of actually eligible members)
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
    if (sessElig > 0 && pct < 50) {
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
 * Fetch Stake-Wide Analytics Summary for Presidency & Admins.
 * Uses exact sum of eligible opportunities.
 */
export async function fetchStakeAnalytics(
  year: number,
  month: number
): Promise<StakeAnalyticsSummary> {
  const units = await fetchStakeUnits()

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
  let prevRegister = null
  try {
    prevRegister = await fetchMonthlyAttendanceRegister({
      year: prevYear,
      month: prevMonth,
      statusFilter: 'closed'
    })
  } catch (err) {
    console.warn('Previous month stake query notice:', err)
  }

  let totalAttended = 0
  let totalExcused = 0
  let totalEligibleOpportunitiesSum = 0

  for (const r of register.rows) {
    totalAttended += r.attended_count
    totalExcused += r.excused_count
    totalEligibleOpportunitiesSum += r.eligible_sessions_count
  }

  const overallPercentage = totalEligibleOpportunitiesSum > 0 
    ? Math.round((totalAttended / totalEligibleOpportunitiesSum) * 1000) / 10 
    : null

  let prevOverallPercentage: number | null = null
  if (prevRegister && prevRegister.rows.length > 0) {
    let pAtt = 0
    let pOpp = 0
    for (const r of prevRegister.rows) {
      pAtt += r.attended_count
      pOpp += r.eligible_sessions_count
    }
    if (pOpp > 0) {
      prevOverallPercentage = Math.round((pAtt / pOpp) * 1000) / 10
    }
  }

  // Unit breakdown with actual eligible opportunities sum per unit
  const unitBreakdown = units.map(u => {
    const unitMembers = register.rows.filter(r => r.home_unit_id === u.id)
    let uAtt = 0
    let uEligibleOpportunities = 0
    for (const m of unitMembers) {
      uAtt += m.attended_count
      uEligibleOpportunities += m.eligible_sessions_count
    }
    const uPct = uEligibleOpportunities > 0 ? Math.round((uAtt / uEligibleOpportunities) * 1000) / 10 : null
    const zeroCount = unitMembers.filter(m => m.attended_count === 0 && m.eligible_sessions_count > 0).length

    // Count finalized sessions that applied to this unit (all_ysa with no unit restriction or unit in participating_units, or specific_units containing u.id, or custom_enrolled with members from this unit)
    const unitFinalizedSessionsCount = finalizedSessions.filter(s => {
      if (s.eligibility_rule === 'all_ysa') {
        return !s.participating_units || s.participating_units.length === 0 || s.participating_units.includes(u.id)
      }
      if (s.eligibility_rule === 'specific_units') {
        return !!s.participating_units && s.participating_units.includes(u.id)
      }
      if (s.eligibility_rule === 'custom_enrolled') {
        return unitMembers.some(m => m.eligible_sessions_count > 0 && m.activity_statuses[s.id] !== 'ineligible')
      }
      return false
    }).length

    return {
      unit_id: u.id,
      unit_name: u.unit_name,
      unit_type: u.unit_type,
      registered_ysa_count: unitMembers.length,
      finalized_sessions_count: unitFinalizedSessionsCount,
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
  const { count: rCount, error: rErr } = await supabase
    .from('session_reopening_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (rErr) {
    throw new Error(`Database error fetching reopening requests: ${rErr.message}`)
  }
  pendingReopenings = rCount || 0

  const { count: cCount, error: cErr } = await supabase
    .from('attendance_corrections')
    .select('*', { count: 'exact', head: true })
  if (cErr) {
    throw new Error(`Database error fetching attendance corrections: ${cErr.message}`)
  }
  correctionsCount = cCount || 0

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
 * Fetch Individual Member Attendance Profile & Chronological History.
 */
export async function fetchMemberAttendanceProfile(memberId: string): Promise<MemberAttendanceProfile | null> {
  const members = await fetchMembers()
  const member = members.find(m => m.id === memberId)
  if (!member) return null

  const units = await fetchStakeUnits()
  const sessions = await fetchSessions()

  // Fetch custom enrollments for this member if needed
  const { data: enrollmentData } = await supabase
    .from('session_enrolled_members')
    .select('session_id')
    .eq('member_id', memberId)
  
  const memberEnrolledSessionIds = new Set((enrollmentData || []).map(e => e.session_id))

  // Get attendance records for this member
  const { data: records, error: recErr } = await supabase
    .from('attendance_records')
    .select('session_id, recorded_unit_id, check_in_time, attendance_status')
    .eq('member_id', memberId)

  if (recErr) {
    throw new Error(`Database error fetching member attendance: ${recErr.message}`)
  }

  const recMap = new Map((records || []).map(r => [r.session_id, r]))

  let totalEligibleFinalized = 0
  let totalAttended = 0
  let totalExcused = 0
  let totalConfirmedAbsent = 0

  const history = sessions
    .filter(s => {
      const enrolledSet = memberEnrolledSessionIds.has(s.id) ? new Set([memberId]) : new Set<string>()
      return isMemberEligibleForSession(member, s, enrolledSet)
    })
    .map(s => {
      const rec = recMap.get(s.id)
      const isFinalized = s.status === 'closed'
      let attStatus: 'present' | 'excused' | 'absent' | 'unfinalized_recorded' | 'unfinalized_unrecorded' = 'unfinalized_unrecorded'

      let recUnitName = member.stake_unit?.unit_name || 'Home Unit'
      let recUnitType = member.stake_unit?.unit_type || 'ward'

      if (isFinalized) {
        totalEligibleFinalized++
        if (rec) {
          if (rec.attendance_status === 'excused') {
            attStatus = 'excused'
            totalExcused++
          } else {
            attStatus = 'present'
            totalAttended++
          }
        } else {
          attStatus = 'absent'
          totalConfirmedAbsent++
        }
      } else {
        // Provisional session: not a finalized opportunity
        if (rec) {
          attStatus = 'unfinalized_recorded'
        } else {
          attStatus = 'unfinalized_unrecorded'
        }
      }

      if (rec) {
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

  const overallPercentage = totalEligibleFinalized > 0
    ? Math.round((totalAttended / totalEligibleFinalized) * 1000) / 10
    : null

  return {
    member,
    total_eligible_sessions: totalEligibleFinalized,
    total_attended: totalAttended,
    total_excused: totalExcused,
    total_absent: totalConfirmedAbsent,
    overall_percentage: overallPercentage,
    history
  }
}
