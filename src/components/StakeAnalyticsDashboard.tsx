import React, { useState, useEffect } from 'react'
import { fetchStakeAnalytics } from '../services/reportService'
import { exportStakeAnalyticsToXlsx, printOrDownloadPdfReport } from '../services/exportService'
import type { StakeAnalyticsSummary } from '../types/database'
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Calendar, 
  FileCheck2, 
  Download, 
  Printer, 
  RefreshCw, 
  RotateCcw
} from 'lucide-react'

export const StakeAnalyticsDashboard: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1)
  const [analytics, setAnalytics] = useState<StakeAnalyticsSummary | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const periodLabel = `${monthNames[selectedMonth - 1]} ${selectedYear}`

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const data = await fetchStakeAnalytics(selectedYear, selectedMonth)
        setAnalytics(data)
      } catch (err) {
        console.error('Failed to load stake analytics:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [selectedYear, selectedMonth])

  const handleExportXlsx = () => {
    if (!analytics) return
    exportStakeAnalyticsToXlsx(analytics, `Stake_YSA_Analytics_${selectedYear}_${selectedMonth}.xlsx`)
  }

  const handlePrintPdf = () => {
    if (!analytics) return
    printOrDownloadPdfReport({
      title: 'Obantoko Stake — YSA Attendance & Stake Analytics',
      subtitle: `Official Stake Presidency Report • ${periodLabel}`,
      meta: {
        'Period': periodLabel,
        'Registered YSA': analytics.total_registered_ysa,
        'Active Units': analytics.active_units_count,
        'Finalized Activities': analytics.finalized_sessions_count,
        'Stake Attendance Rate': `${analytics.overall_attendance_percentage}%`
      },
      headers: ['Ward / Branch', 'Unit Type', 'Registered YSA', 'Finalized Activities', 'Attendance Count', 'Rate %', 'Zero Attended'],
      rows: analytics.unit_breakdown.map(u => [
        u.unit_name,
        u.unit_type.toUpperCase(),
        u.registered_ysa_count,
        u.finalized_sessions_count,
        u.attendance_count,
        `${u.attendance_percentage}%`,
        u.zero_attendance_count
      ]),
      summaryFooter: `Total Attendance: ${analytics.total_attendance_instances} • Pending Sessions: ${analytics.pending_sessions_count} • Reopenings: ${analytics.pending_reopening_requests} • Audit Corrections: ${analytics.attendance_corrections_count}`
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-700" />
            Stake Presidency Analytics & Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Executive-level attendance intelligence, multi-ward comparisons, activity participation distributions, and audit health.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportXlsx}
            disabled={!analytics}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold hover:bg-emerald-100 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Excel Analytics
          </button>
          <button
            onClick={handlePrintPdf}
            disabled={!analytics}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </button>
        </div>
      </div>

      {/* Period Selector Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="font-bold text-slate-700">Reporting Period:</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="font-semibold text-slate-500">Year:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 font-semibold focus:outline-emerald-500"
          >
            {[2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="font-semibold text-slate-500">Month:</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 font-semibold focus:outline-emerald-500"
          >
            {monthNames.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-sm shadow-xs">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
          Calculating stake-wide analytics and cross-ward distributions...
        </div>
      ) : !analytics ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-sm shadow-xs">
          No analytics data available for selected period.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Stake Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">Stake YSA Census</span>
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{analytics.total_registered_ysa}</div>
              <div className="text-[11px] text-slate-400 mt-1">Across {analytics.active_units_count} active units</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 shadow-xs">
              <div className="flex items-center justify-between text-emerald-700 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">Stake Attendance Rate</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-700">{analytics.overall_attendance_percentage}%</div>
              <div className="text-[11px] text-emerald-600 mt-1">
                {analytics.total_attendance_instances} check-ins • {analytics.total_excused_instances} excused
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">Finalized Activities</span>
                <FileCheck2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{analytics.finalized_sessions_count}</div>
              <div className="text-[11px] text-slate-400 mt-1">{analytics.pending_sessions_count} awaiting finalization</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-100 bg-amber-50/20 shadow-xs">
              <div className="flex items-center justify-between text-amber-700 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">Audit & Reopenings</span>
                <RotateCcw className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-black text-amber-800">
                {analytics.pending_reopening_requests}
              </div>
              <div className="text-[11px] text-amber-700 mt-1">
                Pending requests • {analytics.attendance_corrections_count} corrections audited
              </div>
            </div>
          </div>

          {/* Unit Comparison Grid & Chart-Equivalent Accessible Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">
                  Stake Units Performance Comparison
                </h3>
                <span className="text-xs text-slate-500">
                  Fair rate calculation based on eligible finalized activities per unit
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4 text-left">Unit Name</th>
                    <th className="py-3.5 px-3 text-center">Type</th>
                    <th className="py-3.5 px-3 text-center">Registered YSA</th>
                    <th className="py-3.5 px-3 text-center">Finalized Activities</th>
                    <th className="py-3.5 px-3 text-center">Total Attendance</th>
                    <th className="py-3.5 px-4 text-center">Attendance % Bar</th>
                    <th className="py-3.5 px-3 text-center">Rate %</th>
                    <th className="py-3.5 px-3 text-center">0-Attended YSA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {analytics.unit_breakdown.map(u => (
                    <tr key={u.unit_id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{u.unit_name}</td>
                      <td className="py-3 px-3 text-center uppercase font-semibold text-slate-500">{u.unit_type}</td>
                      <td className="py-3 px-3 text-center font-semibold text-slate-700">{u.registered_ysa_count}</td>
                      <td className="py-3 px-3 text-center font-semibold text-slate-700">{u.finalized_sessions_count}</td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-700">{u.attendance_count}</td>
                      <td className="py-3 px-4 min-w-[140px]">
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-2.5 rounded-full ${
                              u.attendance_percentage >= 70
                                ? 'bg-emerald-600'
                                : u.attendance_percentage >= 40
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, u.attendance_percentage)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded font-black ${
                          u.attendance_percentage >= 70
                            ? 'bg-emerald-100 text-emerald-800'
                            : u.attendance_percentage >= 40
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {u.attendance_percentage}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {u.zero_attendance_count > 0 ? (
                          <span className="font-bold text-rose-600">{u.zero_attendance_count}</span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Category Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider mb-3">
                Attendance by Activity Category
              </h3>
              {analytics.category_breakdown.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No categorized finalized sessions in this period.
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.category_breakdown.map(cat => (
                    <div key={cat.category} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold uppercase tracking-wider text-slate-700">{cat.category}</span>
                        <span className="font-semibold text-slate-600">
                          {cat.sessions_count} {cat.sessions_count === 1 ? 'session' : 'sessions'} • {cat.attendance_count} check-ins
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-600 h-2 rounded-full"
                          style={{
                            width: `${analytics.total_attendance_instances > 0 ? (cat.attendance_count / analytics.total_attendance_instances) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Governance & Audit Health Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider mb-3">
                  Stake Integrity & Governance Health
                </h3>
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">Sessions Awaiting Finalization</div>
                      <div className="text-[11px] text-slate-500">Draft or active sessions needing closing</div>
                    </div>
                    <span className={`font-bold px-2.5 py-1 rounded text-xs ${
                      analytics.pending_sessions_count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {analytics.pending_sessions_count}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">Pending Reopening Requests</div>
                      <div className="text-[11px] text-slate-500">Awaiting Stake Presidency authorization</div>
                    </div>
                    <span className={`font-bold px-2.5 py-1 rounded text-xs ${
                      analytics.pending_reopening_requests > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {analytics.pending_reopening_requests}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">Audited Attendance Corrections</div>
                      <div className="text-[11px] text-slate-500">Strictly tracked historical corrections</div>
                    </div>
                    <span className="font-bold px-2.5 py-1 rounded text-xs bg-slate-100 text-slate-700">
                      {analytics.attendance_corrections_count}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] text-slate-400">
                Row-Level Security enforces strict stake boundaries: Ward/Branch leaders cannot view other units.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
