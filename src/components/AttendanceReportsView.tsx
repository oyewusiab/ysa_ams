import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { 
  fetchMonthlyAttendanceRegister, 
  fetchMemberAttendanceProfile 
} from '../services/reportService'
import { 
  exportRegisterToCsv, 
  exportRegisterToXlsx, 
  printOrDownloadPdfReport 
} from '../services/exportService'
import type { 
  MonthlyRegisterMemberRow, 
  ActivitySession, 
  StakeUnit, 
  MemberAttendanceProfile 
} from '../types/database'
import { MemberAttendanceHistoryModal } from './MemberAttendanceHistoryModal'
import { 
  Users, 
  CheckCircle2, 
  XCircle, 
  FileSpreadsheet, 
  Download, 
  Printer, 
  Search, 
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Percent
} from 'lucide-react'

export const AttendanceReportsView: React.FC = () => {
  const { profile, isAdmin, isStakePresidency, isYsaLeader, isBishop, isBranchPresident } = useAuth()

  // Reporting Filters
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1)
  const [selectedUnitId, setSelectedUnitId] = useState<string>('')
  const [selectedActivityId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'closed' | 'provisional'>('closed')
  const [searchTerm, setSearchTerm] = useState<string>('')

  // State
  const [loading, setLoading] = useState<boolean>(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [registerRows, setRegisterRows] = useState<MonthlyRegisterMemberRow[]>([])
  const [sessions, setSessions] = useState<ActivitySession[]>([])
  const [units, setUnits] = useState<StakeUnit[]>([])

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1)
  const pageSize = 15

  // Individual profile modal
  const [selectedProfile, setSelectedProfile] = useState<MemberAttendanceProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false)

  // Determine authorized units for user
  const userUnitAssignments = profile?.unit_assignments || []
  const isUnitScopedLeader = (isBishop || isBranchPresident) && !isAdmin && !isStakePresidency && !isYsaLeader
  const authorizedUnitId = isUnitScopedLeader ? userUnitAssignments[0]?.unit_id : undefined

  useEffect(() => {
    if (authorizedUnitId && !selectedUnitId) {
      setSelectedUnitId(authorizedUnitId)
    }
  }, [authorizedUnitId, selectedUnitId])

  const loadRegister = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const data = await fetchMonthlyAttendanceRegister({
        year: selectedYear,
        month: selectedMonth,
        unitId: selectedUnitId || authorizedUnitId || undefined,
        activityId: selectedActivityId || undefined,
        statusFilter
      })
      setRegisterRows(data.rows)
      setSessions(data.sessions)
      setUnits(data.units)
      setCurrentPage(1)
    } catch (err: any) {
      console.error('Failed to load register:', err)
      setErrorMsg(err.message || 'Unable to compile attendance register from database.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRegister()
  }, [selectedYear, selectedMonth, selectedUnitId, selectedActivityId, statusFilter])

  // Drill-down to individual history
  const handleViewProfile = async (memberId: string) => {
    setLoadingProfile(true)
    try {
      const p = await fetchMemberAttendanceProfile(memberId)
      if (p) setSelectedProfile(p)
    } catch (err: any) {
      console.error('Error fetching member history:', err)
      alert(`Could not load individual attendance history: ${err.message || 'Database error'}`)
    } finally {
      setLoadingProfile(false)
    }
  }

  // Filtered rows by search term
  const filteredRows = registerRows.filter(r => {
    if (!searchTerm.trim()) return true
    return r.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           r.unit_name.toLowerCase().includes(searchTerm.toLowerCase())
  })

  // Pagination calculation
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1
  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Aggregated Summary Cards
  const totalMembersIncluded = filteredRows.length
  let totalEligibleOpps = 0
  let totalAttendedInstances = 0
  let totalAbsenceInstances = 0
  let totalExcusedInstances = 0

  for (const r of filteredRows) {
    totalEligibleOpps += r.eligible_sessions_count
    totalAttendedInstances += r.attended_count
    totalAbsenceInstances += r.absent_count
    totalExcusedInstances += r.excused_count
  }

  const overallPercentage = totalEligibleOpps > 0
    ? Math.round((totalAttendedInstances / totalEligibleOpps) * 1000) / 10
    : null

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const periodLabel = `${monthNames[selectedMonth - 1]} ${selectedYear}`

  // Export handlers
  const handleExportCsv = () => {
    exportRegisterToCsv({
      title: 'Monthly Attendance Register',
      periodLabel,
      sessions,
      rows: filteredRows
    }, `YSA_Register_${selectedYear}_${selectedMonth}.csv`)
  }

  const handleExportXlsx = () => {
    exportRegisterToXlsx({
      title: 'Monthly Attendance Register',
      periodLabel,
      sessions,
      rows: filteredRows
    }, `YSA_Register_${selectedYear}_${selectedMonth}.xlsx`)
  }

  const handlePrintPdf = () => {
    printOrDownloadPdfReport({
      title: 'Monthly YSA Attendance Register',
      subtitle: `Official Unit & Stake Register • ${periodLabel}`,
      meta: {
        'Period': periodLabel,
        'YSA Members': totalMembersIncluded,
        'Activities': sessions.length,
        'Attendance Rate': overallPercentage !== null ? `${overallPercentage}%` : 'N/A'
      },
      headers: ['Full Name', 'Unit', 'Eligible', 'Attended', 'Excused', 'Absent', 'Rate %'],
      rows: filteredRows.map(r => [
        r.full_name,
        r.unit_name,
        r.eligible_sessions_count,
        r.attended_count,
        r.excused_count,
        r.absent_count,
        r.attendance_percentage !== null ? `${r.attendance_percentage}%` : 'N/A'
      ]),
      summaryFooter: `Total eligible finalized opportunities: ${totalEligibleOpps} • Total check-ins: ${totalAttendedInstances} (${overallPercentage !== null ? `${overallPercentage}%` : 'No eligible finalized sessions'})`
    })
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-700" />
            Monthly Attendance Registers
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Official monthly attendance register, individual YSA participation records, and aggregated reports for the Abeokuta Nigeria Obantoko Stake.
          </p>
        </div>

        {/* Action / Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={registerRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 shadow-xs cursor-pointer disabled:opacity-50"
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            CSV Export
          </button>
          <button
            onClick={handleExportXlsx}
            disabled={registerRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold hover:bg-emerald-100 shadow-xs cursor-pointer disabled:opacity-50"
            title="Download Excel Workbook"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Excel XLSX
          </button>
          <button
            onClick={handlePrintPdf}
            disabled={registerRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 shadow-xs cursor-pointer disabled:opacity-50"
            title="Print or Save PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Error Banner with Retry */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
          <div>
            <strong className="font-bold">Error loading reporting data:</strong> {errorMsg}
          </div>
          <button
            onClick={loadRegister}
            className="px-3 py-1.5 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Aggregate KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Registered YSA</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalMembersIncluded}</div>
          <div className="text-[11px] text-slate-400 mt-1">In active reporting scope</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Opportunities</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalEligibleOpps}</div>
          <div className="text-[11px] text-slate-400 mt-1">{sessions.filter(s => s.status === 'closed').length} finalized activities</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 shadow-xs">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Attended</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{totalAttendedInstances}</div>
          <div className="text-[11px] text-emerald-600 mt-1">Confirmed check-ins</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-100 bg-rose-50/20 shadow-xs">
          <div className="flex items-center justify-between text-rose-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Absences</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700">{totalAbsenceInstances}</div>
          <div className="text-[11px] text-rose-600 mt-1">{totalExcusedInstances} excused</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-indigo-100 bg-indigo-50/20 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-indigo-700 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Overall Rate</span>
            <Percent className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-700">
            {overallPercentage !== null ? `${overallPercentage}%` : 'N/A'}
          </div>
          <div className="text-[11px] text-indigo-600 mt-1">
            {overallPercentage !== null ? 'Aggregate finalized attendance' : 'No eligible activities'}
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Year */}
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

          {/* Month */}
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

          {/* Unit Scope */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Ward / Branch</label>
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              disabled={isUnitScopedLeader}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-emerald-500 disabled:opacity-60"
            >
              {!isUnitScopedLeader && <option value="">All Stake Units</option>}
              {units.map(u => (
                <option key={u.id} value={u.id}>{u.unit_name} ({u.unit_type})</option>
              ))}
            </select>
          </div>

          {/* Session Status */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Session Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-emerald-500"
            >
              <option value="closed">Finalized (Closed) Only</option>
              <option value="all">All Sessions (Finalized & Active)</option>
              <option value="provisional">Provisional (Active/Draft)</option>
            </select>
          </div>

          {/* Search Box */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Search YSA</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search member name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-800 focus:outline-emerald-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Register Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
            Compiling monthly attendance register...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No YSA members found matching current reporting criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 text-left">Member Name</th>
                  <th className="py-3.5 px-4 text-left">Ward / Branch</th>
                  <th className="py-3.5 px-3 text-center">Eligible</th>
                  <th className="py-3.5 px-3 text-center">Attended</th>
                  <th className="py-3.5 px-3 text-center">Excused</th>
                  <th className="py-3.5 px-3 text-center">Absent</th>
                  <th className="py-3.5 px-3 text-center">Attendance %</th>

                  {/* Activity Columns */}
                  {sessions.map(s => (
                    <th key={s.id} className="py-3.5 px-3 text-center min-w-[120px]" title={s.session_title}>
                      <div className="truncate max-w-[110px] font-semibold text-slate-900">{s.session_title}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {s.session_date} {s.status !== 'closed' && <span className="text-amber-600 font-bold">(Provisional)</span>}
                      </div>
                    </th>
                  ))}

                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {paginatedRows.map((row) => (
                  <tr key={row.member_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {row.full_name}
                      {row.preferred_name && (
                        <span className="text-[11px] text-slate-400 font-normal ml-1">({row.preferred_name})</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-100 font-medium">
                        {row.unit_name}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-slate-700">{row.eligible_sessions_count}</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-700 bg-emerald-50/30">{row.attended_count}</td>
                    <td className="py-3 px-3 text-center font-semibold text-blue-700">{row.excused_count}</td>
                    <td className="py-3 px-3 text-center font-semibold text-rose-700">{row.absent_count}</td>
                    <td className="py-3 px-3 text-center">
                      {row.attendance_percentage !== null ? (
                        <span className={`inline-block px-2 py-0.5 rounded font-black ${
                          row.attendance_percentage >= 70
                            ? 'bg-emerald-100 text-emerald-800'
                            : row.attendance_percentage >= 40
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {row.attendance_percentage}%
                        </span>
                      ) : (
                        <span className="text-slate-400 font-semibold">N/A</span>
                      )}
                    </td>

                    {/* Activity Cell Status */}
                    {sessions.map(s => {
                      const st = row.activity_statuses[s.id] || 'ineligible'
                      return (
                        <td key={s.id} className="py-3 px-3 text-center">
                          {st === 'present' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Present
                            </span>
                          )}
                          {st === 'excused' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                              Excused
                            </span>
                          )}
                          {st === 'absent' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600">
                              Absent
                            </span>
                          )}
                          {st === 'unfinalized_recorded' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              Recorded (Prov)
                            </span>
                          )}
                          {st === 'unfinalized_unrecorded' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-normal text-slate-500 bg-slate-100">
                              Pending (Prov)
                            </span>
                          )}
                          {st === 'ineligible' && (
                            <span className="text-[10px] text-slate-300 font-normal">—</span>
                          )}
                        </td>
                      )
                    })}

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleViewProfile(row.member_id)}
                        disabled={loadingProfile}
                        className="px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
                      >
                        History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination bar */}
        {!loading && filteredRows.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing <span className="font-bold text-slate-800">{((currentPage - 1) * pageSize) + 1}</span> to{' '}
              <span className="font-bold text-slate-800">{Math.min(currentPage * pageSize, filteredRows.length)}</span> of{' '}
              <span className="font-bold text-slate-800">{filteredRows.length}</span> YSA members
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded bg-white border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-slate-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-white border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drill-down modal */}
      {selectedProfile && (
        <MemberAttendanceHistoryModal
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </div>
  )
}
