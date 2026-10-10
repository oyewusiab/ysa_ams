import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchStakeUnits } from '../services/unitService'
import { fetchUnitMonthlyReport, fetchMemberAttendanceProfile } from '../services/reportService'
import { exportUnitReportToCsv, printOrDownloadPdfReport } from '../services/exportService'
import type { StakeUnit, UnitMonthlyReport, MemberAttendanceProfile } from '../types/database'
import { MemberAttendanceHistoryModal } from './MemberAttendanceHistoryModal'
import { 
  Building2, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Download, 
  Printer, 
  RefreshCw,
  Search,
  Eye
} from 'lucide-react'

export const UnitReportsView: React.FC = () => {
  const { profile, isAdmin, isStakePresidency, isYsaLeader, isBishop, isBranchPresident } = useAuth()

  // Period & Unit
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1)
  const [selectedUnitId, setSelectedUnitId] = useState<string>('')
  const [units, setUnits] = useState<StakeUnit[]>([])

  // State
  // State
  const [report, setReport] = useState<UnitMonthlyReport | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')

  // Member history drill-down modal
  const [selectedProfile, setSelectedProfile] = useState<MemberAttendanceProfile | null>(null)

  // Unit scoping resolution
  const userUnitAssignments = profile?.unit_assignments || []
  const isUnitScoped = (isBishop || isBranchPresident) && !isAdmin && !isStakePresidency && !isYsaLeader
  const defaultUnitId = isUnitScoped ? userUnitAssignments[0]?.unit_id : undefined

  useEffect(() => {
    async function loadUnits() {
      try {
        const uList = await fetchStakeUnits()
        setUnits(uList)
        if (defaultUnitId) {
          setSelectedUnitId(defaultUnitId)
        } else if (uList.length > 0 && !selectedUnitId) {
          setSelectedUnitId(uList[0].id)
        }
      } catch (err: any) {
        console.error('Error fetching units:', err)
        setErrorMsg(err.message || 'Failed to load stake units.')
      }
    }
    loadUnits()
  }, [defaultUnitId])

  useEffect(() => {
    if (!selectedUnitId) return

    async function loadReport() {
      setLoading(true)
      setErrorMsg(null)
      try {
        const data = await fetchUnitMonthlyReport(selectedUnitId, selectedYear, selectedMonth)
        setReport(data)
      } catch (err: any) {
        console.error('Error fetching unit report:', err)
        setErrorMsg(err.message || 'Database error generating unit monthly report.')
      } finally {
        setLoading(false)
      }
    }

    loadReport()
  }, [selectedUnitId, selectedYear, selectedMonth])

  const handleDrillDown = async (memberId: string) => {
    try {
      const p = await fetchMemberAttendanceProfile(memberId)
      if (p) setSelectedProfile(p)
    } catch (err: any) {
      console.error('Error fetching member profile:', err)
      alert(`Could not load member profile: ${err.message || 'Database error'}`)
    }
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const periodLabel = `${monthNames[selectedMonth - 1]} ${selectedYear}`

  const handleExportCsv = () => {
    if (!report) return
    exportUnitReportToCsv(report, `${report.unit_name}_YSA_Report_${selectedYear}_${selectedMonth}.csv`)
  }

  const handlePrintPdf = () => {
    if (!report) return
    printOrDownloadPdfReport({
      title: `${report.unit_name} — YSA Attendance Report`,
      subtitle: `Official Ward/Branch Performance • ${periodLabel}`,
      meta: {
        'Unit': `${report.unit_name} (${report.unit_type.toUpperCase()})`,
        'Period': periodLabel,
        'Registered YSA': report.registered_ysa_count,
        'Attendance Rate': report.overall_attendance_percentage !== null ? `${report.overall_attendance_percentage}%` : 'N/A'
      },
      headers: ['Member Name', 'Eligible Activities', 'Attended', 'Excused', 'Absent', 'Rate %'],
      rows: report.member_rows.map(r => [
        r.full_name,
        r.eligible_sessions_count,
        r.attended_count,
        r.excused_count,
        r.absent_count,
        r.attendance_percentage !== null ? `${r.attendance_percentage}%` : 'N/A'
      ]),
      summaryFooter: `Attended: ${report.total_attendance_instances} • Absences: ${report.total_absences} • Excused: ${report.total_excused} • Prev Month: ${report.previous_month_percentage !== null ? `${report.previous_month_percentage}%` : 'N/A'}`
    })
  }

  const filteredMembers = report?.member_rows.filter(m => {
    if (!searchTerm.trim()) return true
    return m.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  }) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-700" />
            Ward & Branch Attendance Reports
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Performance analysis, monthly trend comparisons, low-participation flags, and zero-attendance follow-up lists for assigned units.
          </p>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={!report}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            CSV Export
          </button>
          <button
            onClick={handlePrintPdf}
            disabled={!report}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Error banner with retry */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
          <div>
            <strong className="font-bold">Error loading unit report:</strong> {errorMsg}
          </div>
          <button
            onClick={() => {
              if (selectedUnitId) {
                setLoading(true)
                setErrorMsg(null)
                fetchUnitMonthlyReport(selectedUnitId, selectedYear, selectedMonth)
                  .then(setReport)
                  .catch(err => setErrorMsg(err.message))
                  .finally(() => setLoading(false))
              }
            }}
            className="px-3 py-1.5 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Selector Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Ward / Branch</label>
          <select
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            disabled={isUnitScoped}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-emerald-500 disabled:opacity-60"
          >
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.unit_name} ({u.unit_type})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Year</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-emerald-500"
          >
            {[2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-emerald-500"
          >
            {monthNames.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Unit Report Body */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-sm shadow-xs">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
          Loading unit attendance metrics...
        </div>
      ) : !report ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-sm shadow-xs">
          Select a unit and period to generate the unit performance report.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Unit KPI Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">YSA Members</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{report.registered_ysa_count}</div>
              <div className="text-[11px] text-slate-400 mt-1">In {report.unit_name}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Finalized Activities</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{report.eligible_sessions_count}</div>
              <div className="text-[11px] text-slate-400 mt-1">Closed sessions in period</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 shadow-xs">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">Overall Rate</span>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                {report.overall_attendance_percentage !== null ? `${report.overall_attendance_percentage}%` : 'N/A'}
              </div>
              <div className="text-[11px] text-emerald-600 mt-1">
                {report.overall_attendance_percentage !== null ? `${report.total_attendance_instances} check-ins` : 'No eligible activities'}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Month-on-Month Trend</span>
              <div className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-1.5">
                {report.percentage_change !== null ? (
                  <>
                    {report.percentage_change >= 0 ? (
                      <span className="text-emerald-700 flex items-center text-lg">
                        <TrendingUp className="w-5 h-5 mr-1" /> +{report.percentage_change}%
                      </span>
                    ) : (
                      <span className="text-rose-700 flex items-center text-lg">
                        <TrendingDown className="w-5 h-5 mr-1" /> {report.percentage_change}%
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-400 text-sm font-medium">No previous record</span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                vs. {report.previous_month_percentage !== null ? `${report.previous_month_percentage}%` : 'N/A'} last month
              </div>
            </div>
          </div>

          {/* Action Flags: Zero Attendance & Low Participation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Zero Attendance Follow-Up Card */}
            <div className="bg-white rounded-xl border border-rose-200 p-5 shadow-xs">
              <div className="flex items-center gap-2 text-rose-700 mb-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-sm uppercase tracking-wider">
                  Zero Attendance Follow-Up ({report.zero_attendance_members.length})
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Eligible members with no recorded attendance during this period requiring ministering contact:
              </p>
              {report.zero_attendance_members.length === 0 ? (
                <div className="text-xs text-emerald-700 font-semibold bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                  Excellent! Every registered YSA member attended at least one activity this month.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {report.zero_attendance_members.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-rose-50/50 border border-rose-100 text-xs"
                    >
                      <span className="font-semibold text-slate-800">{m.full_name}</span>
                      <button
                        onClick={() => handleDrillDown(m.id)}
                        className="text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer"
                      >
                        Inspect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Low Participation Activities */}
            <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-xs">
              <div className="flex items-center gap-2 text-amber-700 mb-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-sm uppercase tracking-wider">
                  Low Participation Activities ({report.low_participation_activities.length})
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Activities where attendance was below 50% of the unit's eligible YSA members:
              </p>
              {report.low_participation_activities.length === 0 ? (
                <div className="text-xs text-emerald-700 font-semibold bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                  Great engagement! All scheduled activities achieved 50% or higher attendance.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {report.low_participation_activities.map(act => (
                    <div
                      key={act.session_id}
                      className="flex items-center justify-between p-2 rounded-lg bg-amber-50/50 border border-amber-100 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">{act.title}</div>
                        <div className="text-[10px] text-slate-500">{act.session_date}</div>
                      </div>
                      <span className="font-bold text-amber-800">
                        {act.attendance_count} attended ({act.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Individual Member Roster for Unit */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">
                  Unit Member Attendance Roster
                </h3>
                <span className="text-xs text-slate-500">
                  Drill down to inspect full individual participation history
                </span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-emerald-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4 text-left">Member Name</th>
                    <th className="py-3 px-3 text-center">Eligible Activities</th>
                    <th className="py-3 px-3 text-center">Attended</th>
                    <th className="py-3 px-3 text-center">Excused</th>
                    <th className="py-3 px-3 text-center">Absent</th>
                    <th className="py-3 px-3 text-center">Attendance %</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredMembers.map(m => (
                    <tr key={m.member_id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{m.full_name}</td>
                      <td className="py-3 px-3 text-center font-semibold text-slate-700">{m.eligible_sessions_count}</td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-700 bg-emerald-50/20">{m.attended_count}</td>
                      <td className="py-3 px-3 text-center font-semibold text-blue-700">{m.excused_count}</td>
                      <td className="py-3 px-3 text-center font-semibold text-rose-700">{m.absent_count}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded font-black ${
                          m.attendance_percentage === null
                            ? 'bg-slate-100 text-slate-500'
                            : m.attendance_percentage >= 70
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.attendance_percentage >= 40
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {m.attendance_percentage !== null ? `${m.attendance_percentage}%` : 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDrillDown(m.member_id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Member drilldown modal */}
      {selectedProfile && (
        <MemberAttendanceHistoryModal
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </div>
  )
}
