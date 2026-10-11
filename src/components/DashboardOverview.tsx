import React, { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { 
  Users, 
  Building2, 
  Calendar, 
  Clock, 
  Activity as ActivityIcon, 
  CheckCircle2, 
  PlusCircle, 
  Smartphone, 
  FileText, 
  BarChart3, 
  AlertCircle, 
  ArrowRight, 
  RefreshCw,
  FolderOpen
} from 'lucide-react'
import { fetchStakeUnits } from '../services/unitService'
import { fetchMembers } from '../services/memberService'
import { fetchActivities, fetchSessions } from '../services/activityService'
import { fetchMonthlyAttendanceRegister } from '../services/reportService'
import type { StakeUnit, Member, ActivitySession, Activity } from '../types/database'

interface DashboardOverviewProps {
  onNavigate?: (path: string) => void
  onRequestCreateActivity?: () => void
  onRequestCreateSession?: () => void
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  onNavigate,
  onRequestCreateActivity,
  onRequestCreateSession
}) => {
  const { profile, roles, isAdmin, isStakePresidency, isYsaLeader, isBishop, isBranchPresident } = useAuth()

  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [units, setUnits] = useState<StakeUnit[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [sessions, setSessions] = useState<ActivitySession[]>([])
  const [activities, setActivities] = useState<Activity[]>([])

  // Reporting period selector (default to current year & month in Africa/Lagos)
  const currentDate = new Date()
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [periodRegisterRows, setPeriodRegisterRows] = useState<any[]>([])
  const [periodSessions, setPeriodSessions] = useState<ActivitySession[]>([])

  // User primary assigned unit if restricted (Bishop or Branch President)
  const userAssignedUnitId = profile?.unit_assignments?.[0]?.unit_id

  const loadDashboardData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Parallel fetch through authorized services
      const [unitsData, membersData, sessionsData, activitiesData] = await Promise.all([
        fetchStakeUnits(),
        fetchMembers(userAssignedUnitId),
        fetchSessions(),
        fetchActivities()
      ])

      setUnits(unitsData)
      setMembers(membersData)
      setSessions(sessionsData)
      setActivities(activitiesData)
    } catch (err: any) {
      console.error('Error loading dashboard data:', err)
      setError(err.message || 'Unable to load dashboard records from database.')
    } finally {
      setLoading(false)
    }
  }

  // Load period attendance metrics
  const loadPeriodMetrics = async () => {
    setPeriodLoading(true)
    try {
      const reg = await fetchMonthlyAttendanceRegister({
        year: selectedYear,
        month: selectedMonth,
        unitId: userAssignedUnitId,
        statusFilter: 'all'
      })
      setPeriodRegisterRows(reg.rows)
      setPeriodSessions(reg.sessions)
    } catch (err: any) {
      console.warn('Period attendance query notice:', err)
      setPeriodRegisterRows([])
      setPeriodSessions([])
    } finally {
      setPeriodLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [userAssignedUnitId])

  useEffect(() => {
    loadPeriodMetrics()
  }, [selectedYear, selectedMonth, userAssignedUnitId])

  // Calculated metrics
  const activeMembersCount = useMemo(() => {
    return members.filter(m => m.is_active !== false).length
  }, [members])

  const activeUnitsCount = useMemo(() => {
    return units.filter(u => u.is_active !== false).length
  }, [units])

  // Sessions state counts
  const sessionStatusCounts = useMemo(() => {
    const counts = { draft: 0, active: 0, closed: 0 }
    sessions.forEach(s => {
      if (s.status === 'draft') counts.draft++
      else if (s.status === 'active') counts.active++
      else if (s.status === 'closed') counts.closed++
    })
    return counts
  }, [sessions])

  // Upcoming activities & scheduled sessions
  const upcomingSessions = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    return sessions
      .filter(s => s.session_date >= todayStr && s.status !== 'closed')
      .sort((a, b) => a.session_date.localeCompare(b.session_date))
      .slice(0, 5)
  }, [sessions])

  // Recent attendance activity (most recently completed or currently active sessions)
  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.session_date.localeCompare(a.session_date))
      .slice(0, 5)
  }, [sessions])

  // Attendance metrics for selected period
  const periodAttendanceStats = useMemo(() => {
    let totalAttended = 0
    let totalEligibleOpportunities = 0
    let totalExcused = 0

    periodRegisterRows.forEach(r => {
      totalAttended += r.attended_count || 0
      totalEligibleOpportunities += r.eligible_sessions_count || 0
      totalExcused += r.excused_count || 0
    })

    const attendanceRate = totalEligibleOpportunities > 0
      ? Math.round((totalAttended / totalEligibleOpportunities) * 1000) / 10
      : null

    return {
      totalAttended,
      totalEligibleOpportunities,
      totalExcused,
      attendanceRate,
      sessionsCount: periodSessions.length
    }
  }, [periodRegisterRows, periodSessions])

  // Unit-level breakdown where role permits access
  const unitLevelSummaries = useMemo(() => {
    if (!isAdmin && !isStakePresidency && !isYsaLeader && !isBishop && !isBranchPresident) {
      return []
    }

    return units.map(u => {
      const unitMembers = members.filter(m => m.home_unit_id === u.id)
      const unitActiveMembers = unitMembers.filter(m => m.is_active !== false).length

      // Calculate attendance in current period for this unit
      const unitRows = periodRegisterRows.filter(r => r.home_unit_id === u.id)
      let uAtt = 0
      let uOpp = 0
      unitRows.forEach(r => {
        uAtt += r.attended_count || 0
        uOpp += r.eligible_sessions_count || 0
      })
      const uRate = uOpp > 0 ? Math.round((uAtt / uOpp) * 1000) / 10 : null

      return {
        unitId: u.id,
        unitName: u.unit_name,
        unitType: u.unit_type,
        registeredYsa: unitActiveMembers,
        periodAttendance: uAtt,
        periodRate: uRate
      }
    }).filter(u => {
      if (userAssignedUnitId && (isBishop || isBranchPresident)) {
        return u.unitId === userAssignedUnitId
      }
      return true
    })
  }, [units, members, periodRegisterRows, isAdmin, isStakePresidency, isYsaLeader, isBishop, isBranchPresident, userAssignedUnitId])

  const canManageActivities = isAdmin || isStakePresidency || isYsaLeader
  const canViewMembers = isAdmin || isStakePresidency || isYsaLeader || isBishop || isBranchPresident

  const handleNav = (path: string) => {
    if (onNavigate) {
      onNavigate(path)
    } else {
      window.history.pushState({}, '', path)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
        <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center mx-auto mb-3 animate-spin">
          <RefreshCw className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Loading Operational Workspace...</h3>
        <p className="text-xs text-slate-500 mt-1">Retrieving live records and attendance statistics from Obantoko Stake database.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-800">
        <div className="flex items-center gap-3 mb-2">
          <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
          <h3 className="font-bold text-base">Error Loading Administrative Dashboard</h3>
        </div>
        <p className="text-xs text-rose-700 mb-4">{error}</p>
        <button
          onClick={loadDashboardData}
          className="px-4 py-2 bg-rose-700 text-white rounded-lg text-xs font-semibold hover:bg-rose-800 cursor-pointer flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 rounded-2xl p-6 sm:p-8 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-700/60 rounded-full text-xs font-semibold uppercase tracking-wider text-emerald-100 mb-2 border border-emerald-600/50">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Obantoko Stake YSA Administrative Workspace
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome, {profile?.full_name || 'Leader'}
            </h1>
            <p className="text-emerald-200 text-xs sm:text-sm mt-1 max-w-xl">
              Live attendance oversight, session scheduling, terminal monitoring, and unit participation for Abeokuta Nigeria Obantoko Stake.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <span
                key={r}
                className="px-3 py-1 bg-white/10 backdrop-blur-xs rounded-lg text-xs font-medium border border-white/20 capitalize"
              >
                {r.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions Panel */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Quick Actions</h2>
          <span className="text-xs text-slate-400">Administrative Shortcuts</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {canManageActivities && (
            <button
              onClick={() => {
                if (onRequestCreateActivity) onRequestCreateActivity()
                else handleNav('/la/activities')
              }}
              className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-xl text-left transition-all group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <PlusCircle className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-800 block">Activity Template</span>
              <span className="text-[11px] text-slate-500">Create new definition</span>
            </button>
          )}

          {canManageActivities && (
            <button
              onClick={() => {
                if (onRequestCreateSession) onRequestCreateSession()
                else handleNav('/la/activities')
              }}
              className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-xl text-left transition-all group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <Calendar className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-800 block">Schedule Session</span>
              <span className="text-[11px] text-slate-500">Set date & time</span>
            </button>
          )}

          {canViewMembers && (
            <button
              onClick={() => handleNav('/la/ysa-register')}
              className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-xl text-left transition-all group cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-800 block">Register YSA</span>
              <span className="text-[11px] text-slate-500">Add or manage member</span>
            </button>
          )}

          <button
            onClick={() => handleNav('/la/terminal')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-xl text-left transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Smartphone className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 block">Open Terminal</span>
            <span className="text-[11px] text-slate-500">Check-in interface</span>
          </button>

          <button
            onClick={() => handleNav('/la/reports')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-xl text-left transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 block">View Reports</span>
            <span className="text-[11px] text-slate-500">Monthly registers</span>
          </button>
        </div>
      </div>

      {/* Primary Operational Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Registered Active YSA */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Registered Active YSA</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {activeMembersCount.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>Total directory records</span>
            <button
              onClick={() => handleNav('/la/ysa-register')}
              className="text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer inline-flex items-center gap-0.5"
            >
              View register <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Metric 2: Active Stake Units */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Stake Units</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {activeUnitsCount}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>Wards & Branches</span>
            {isAdmin && (
              <button
                onClick={() => handleNav('/la/units')}
                className="text-blue-700 hover:text-blue-800 font-semibold cursor-pointer inline-flex items-center gap-0.5"
              >
                Manage units <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Metric 3: Active & Pending Sessions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Session Pipeline</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <ActivityIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-700">{sessionStatusCounts.active}</span>
            <span className="text-xs font-semibold text-slate-500">active now</span>
          </div>
          <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Templates: <strong className="text-slate-700">{activities.length}</strong></span>
            <span>Draft: <strong className="text-slate-700">{sessionStatusCounts.draft}</strong></span>
            <span>Closed: <strong className="text-slate-700">{sessionStatusCounts.closed}</strong></span>
          </div>
        </div>

        {/* Metric 4: Reporting Period Attendance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {monthNames[selectedMonth - 1]?.slice(0, 3)} Attendance Rate
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {periodAttendanceStats.attendanceRate !== null ? `${periodAttendanceStats.attendanceRate}%` : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>{periodAttendanceStats.totalAttended} check-ins ({periodAttendanceStats.sessionsCount} sessions)</span>
            <button
              onClick={() => handleNav('/la/reports')}
              className="text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer inline-flex items-center gap-0.5"
            >
              Reports <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Reporting Period Filter & Breakdown */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Attendance by Reporting Period</h2>
            <p className="text-xs text-slate-500">Live attendance totals based on real member attendance records</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white"
            >
              {monthNames.map((name, idx) => (
                <option key={name} value={idx + 1}>{name}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white"
            >
              {[2025, 2026, 2027].map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
            {periodLoading && <RefreshCw className="w-4 h-4 text-emerald-700 animate-spin" />}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Check-Ins</span>
            <span className="text-xl font-extrabold text-slate-800">{periodAttendanceStats.totalAttended}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase block">Eligible Opportunities</span>
            <span className="text-xl font-extrabold text-slate-800">{periodAttendanceStats.totalEligibleOpportunities}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase block">Excused Absences</span>
            <span className="text-xl font-extrabold text-slate-800">{periodAttendanceStats.totalExcused}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase block">Period Finalized Rate</span>
            <span className="text-xl font-extrabold text-emerald-700">
              {periodAttendanceStats.attendanceRate !== null ? `${periodAttendanceStats.attendanceRate}%` : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Upcoming Activities vs Recent Attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Upcoming Activities & Scheduled Sessions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">Upcoming & Scheduled Sessions</h3>
              </div>
              <button
                onClick={() => handleNav('/la/activities')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                All Activities
              </button>
            </div>

            {upcomingSessions.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <FolderOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No upcoming sessions scheduled</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Create an activity session to schedule future attendance events.</p>
                {canManageActivities && (
                  <button
                    onClick={() => {
                      if (onRequestCreateSession) onRequestCreateSession()
                      else handleNav('/la/activities')
                    }}
                    className="mt-3 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 cursor-pointer inline-flex items-center gap-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Schedule Now
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {upcomingSessions.map(s => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl border border-slate-200 hover:border-emerald-200 transition-colors bg-slate-50/50 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{s.session_title}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          s.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {s.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {s.session_date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {s.start_time.slice(0, 5)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleNav('/la/activities')}
                      className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer shrink-0"
                    >
                      Manage
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Recent Attendance Activity */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">Recent Attendance Activity</h3>
              </div>
              <button
                onClick={() => handleNav('/la/reports')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                Full Registers
              </button>
            </div>

            {recentSessions.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <FolderOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No attendance activity recorded yet</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Sessions will show attendance records once checked in via terminal.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentSessions.map(s => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{s.session_title}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          s.status === 'closed'
                            ? 'bg-slate-100 text-slate-600'
                            : s.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {s.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {s.session_date} • {s.activity?.category ? s.activity.category.toUpperCase() : 'GENERAL'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleNav('/la/reports')}
                      className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer shrink-0"
                    >
                      View Report
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unit-Level Summaries */}
      {unitLevelSummaries.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Unit-Level Participation Summaries</h3>
              <p className="text-xs text-slate-500">Breakdown of registered active YSA and attendance rates by ward/branch</p>
            </div>
            <button
              onClick={() => handleNav('/la/unit-reports')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              Detailed Unit Reports
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Unit Name</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Active YSA</th>
                  <th className="py-2.5 px-3 text-right">Period Check-ins</th>
                  <th className="py-2.5 px-3 text-right">Attendance Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unitLevelSummaries.map((u) => (
                  <tr key={u.unitId} className="hover:bg-slate-50/80">
                    <td className="py-2 px-3 font-semibold text-slate-800">{u.unitName}</td>
                    <td className="py-2 px-3 capitalize text-slate-500">{u.unitType}</td>
                    <td className="py-2 px-3 text-right font-medium text-slate-700">{u.registeredYsa}</td>
                    <td className="py-2 px-3 text-right font-medium text-slate-700">{u.periodAttendance}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">
                      {u.periodRate !== null ? `${u.periodRate}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
