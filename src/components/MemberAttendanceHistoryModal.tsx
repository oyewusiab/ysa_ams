import React, { useState } from 'react'
import type { MemberAttendanceProfile } from '../types/database'
import { X, Calendar, User, CheckCircle2, XCircle, Clock } from 'lucide-react'

interface Props {
  profile: MemberAttendanceProfile
  onClose: () => void
}

export const MemberAttendanceHistoryModal: React.FC<Props> = ({ profile, onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredHistory = profile.history.filter(h => {
    if (selectedCategory !== 'all' && h.category !== selectedCategory) return false
    if (statusFilter !== 'all' && h.attendance_status !== statusFilter) return false
    return true
  })

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-inner">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{profile.member.full_name}</h2>
              <p className="text-xs text-slate-400">
                {profile.member.stake_unit?.unit_name || 'Obantoko Stake'} • YSA Attendance Profile & History
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Aggregate KPI summary cards */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Opportunities</span>
            <span className="text-xl font-extrabold text-slate-800">{profile.total_eligible_sessions}</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-emerald-200">
            <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block">Attended</span>
            <span className="text-xl font-extrabold text-emerald-700">{profile.total_attended}</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-blue-200">
            <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">Excused</span>
            <span className="text-xl font-extrabold text-blue-700">{profile.total_excused}</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-rose-200">
            <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider block">Absences</span>
            <span className="text-xl font-extrabold text-rose-700">{profile.total_absent}</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-indigo-200 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider block">Rate</span>
            <span className="text-xl font-extrabold text-indigo-700">
              {profile.overall_percentage !== null ? `${profile.overall_percentage}%` : 'N/A'}
            </span>
          </div>
        </div>

        {/* Filter row */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-emerald-500"
            >
              <option value="all">All Statuses</option>
              <option value="present">Present (Finalized)</option>
              <option value="excused">Excused (Finalized)</option>
              <option value="absent">Confirmed Absent</option>
              <option value="unfinalized_recorded">Provisional Recorded</option>
              <option value="unfinalized_unrecorded">Provisional Pending</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-emerald-500"
            >
              <option value="all">All Categories</option>
              <option value="spiritual">Spiritual</option>
              <option value="social">Social</option>
              <option value="service">Service</option>
              <option value="sports">Sports</option>
              <option value="temple">Temple</option>
              <option value="educational">Educational</option>
            </select>
          </div>
        </div>

        {/* History table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No matching activity records found for this member.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((item, idx) => {
                const isPresent = item.attendance_status === 'present'
                const isExcused = item.attendance_status === 'excused'
                const isAbsent = item.attendance_status === 'absent'
                const isProvRecorded = item.attendance_status === 'unfinalized_recorded'
                const isProvPending = item.attendance_status === 'unfinalized_unrecorded'

                return (
                  <div
                    key={`${item.session_id}-${idx}`}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                      isPresent
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : isExcused
                        ? 'bg-blue-50/40 border-blue-200'
                        : isProvRecorded
                        ? 'bg-amber-50/40 border-amber-200'
                        : isAbsent
                        ? 'bg-rose-50/30 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-slate-900">{item.session_title}</span>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                          {item.category}
                        </span>
                        {item.status !== 'closed' && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            Provisional ({item.status})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {item.session_date}
                        </span>
                        <span>Recorded Unit: <strong className="text-slate-700">{item.recorded_unit_name}</strong></span>
                        {item.check_in_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(item.check_in_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="sm:text-right">
                      {isPresent && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-4 h-4" /> Present
                        </span>
                      )}
                      {isExcused && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                          <CheckCircle2 className="w-4 h-4" /> Excused
                        </span>
                      )}
                      {isAbsent && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                          <XCircle className="w-4 h-4" /> Confirmed Absent
                        </span>
                      )}
                      {isProvRecorded && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                          <CheckCircle2 className="w-4 h-4" /> Checked In (Pending Finalization)
                        </span>
                      )}
                      {isProvPending && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                          Pending Session Closure
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 cursor-pointer"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  )
}
