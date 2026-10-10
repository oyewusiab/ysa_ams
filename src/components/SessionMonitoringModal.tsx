import React, { useState, useEffect } from 'react'
import { 
  X, 
  UserCheck, 
  ShieldAlert, 
  RefreshCw, 
  Trash2, 
  Edit3 
} from 'lucide-react'
import { fetchSessionAttendance, correctAttendance } from '../services/activityService'
import { fetchUnits } from '../services/unitService'
import type { ActivitySession, AttendanceRecord, SessionVisitor, StakeUnit } from '../types/database'

interface Props {
  session: ActivitySession
  onClose: () => void
}

export const SessionMonitoringModal: React.FC<Props> = ({ session, onClose }) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [visitors, setVisitors] = useState<SessionVisitor[]>([])
  const [units, setUnits] = useState<StakeUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Correction state
  const [correctingRecord, setCorrectingRecord] = useState<AttendanceRecord | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [reassignUnitId, setReassignUnitId] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const [attData, unitsData] = await Promise.all([
        fetchSessionAttendance(session.id),
        fetchUnits()
      ])
      setRecords(attData.records)
      setVisitors(attData.visitors)
      setUnits(unitsData)
    } catch (err: any) {
      setActionError(err.message || 'Failed to load monitoring data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // Poll every 10 seconds if session is active
    if (session.status === 'active') {
      const interval = setInterval(loadData, 10000)
      return () => clearInterval(interval)
    }
  }, [session.id, session.status])

  const handleRemoveAttendance = async (record: AttendanceRecord) => {
    const reason = prompt(`Enter reason for removing attendance for ${record.member?.full_name}:`)
    if (!reason || reason.trim().length < 5) {
      alert('A valid reason (at least 5 characters) is required for audit.')
      return
    }

    try {
      await correctAttendance(record.id, 'remove_attendance', reason.trim())
      setActionSuccess(`Removed attendance for ${record.member?.full_name}`)
      loadData()
    } catch (err: any) {
      setActionError(err.message || 'Failed to correct attendance')
    }
  }

  const handleReassignUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!correctingRecord) return
    try {
      await correctAttendance(
        correctingRecord.id,
        'unit_reassignment',
        correctionReason.trim(),
        reassignUnitId
      )
      setActionSuccess(`Unit reassigned successfully.`)
      setCorrectingRecord(null)
      setCorrectionReason('')
      loadData()
    } catch (err: any) {
      setActionError(err.message || 'Failed to reassign unit')
    }
  }

  // Aggregate unit attendance
  const unitCounts: Record<string, number> = {}
  records.forEach((r) => {
    const unitName = r.recorded_unit?.unit_name || 'Unknown Unit'
    unitCounts[unitName] = (unitCounts[unitName] || 0) + 1
  })

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                  session.status === 'active'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {session.status}
              </span>
              <h2 className="text-lg font-bold text-slate-900">{session.session_title}</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live attendance console • {session.session_date} • {session.start_time} WAT
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              title="Refresh attendance"
              className="p-2 text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 bg-white border-b border-slate-100">
          <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl p-3">
            <span className="text-[11px] font-medium text-emerald-800">Total Check-Ins</span>
            <div className="text-2xl font-black text-emerald-900 mt-1">{records.length}</div>
          </div>
          <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-3">
            <span className="text-[11px] font-medium text-blue-800">Visitors Recorded</span>
            <div className="text-2xl font-black text-blue-900 mt-1">{visitors.length}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[11px] font-medium text-slate-600">Terminal Limit</span>
            <div className="text-2xl font-black text-slate-800 mt-1">{session.max_terminals}</div>
          </div>
          <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-3">
            <span className="text-[11px] font-medium text-amber-800">Total Participating</span>
            <div className="text-2xl font-black text-amber-900 mt-1">
              {records.length + visitors.length}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {actionError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {actionSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Unit Breakdown */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Attendance by Unit
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(unitCounts).map(([unitName, count]) => (
                <div
                  key={unitName}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between text-xs"
                >
                  <span className="font-medium text-slate-700 truncate">{unitName}</span>
                  <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full ml-2">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Attendance Records Table */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Recorded YSA Attendees ({records.length})
            </h3>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Attendee Name</th>
                      <th className="px-4 py-2 font-semibold">Home Unit</th>
                      <th className="px-4 py-2 font-semibold">Check-in Time</th>
                      <th className="px-4 py-2 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                          No attendance recorded yet.
                        </td>
                      </tr>
                    ) : (
                      records.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            {r.member?.full_name || 'YSA Member'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {r.recorded_unit?.unit_name || 'Unit'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">
                            {new Date(r.check_in_time).toLocaleTimeString('en-GB')}
                          </td>
                          <td className="px-4 py-2.5 text-right space-x-2">
                            <button
                              onClick={() => {
                                setCorrectingRecord(r)
                                setReassignUnitId(r.recorded_unit_id)
                              }}
                              className="text-slate-500 hover:text-emerald-700 cursor-pointer"
                              title="Reassign Unit"
                            >
                              <Edit3 className="w-3.5 h-3.5 inline" />
                            </button>
                            <button
                              onClick={() => handleRemoveAttendance(r)}
                              className="text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Remove Attendance"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Visitors Table */}
          {visitors.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Visitors ({visitors.length})
              </h3>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-40">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Visitor Name</th>
                        <th className="px-4 py-2 font-semibold">Location / Stake</th>
                        <th className="px-4 py-2 font-semibold">Contact</th>
                        <th className="px-4 py-2 font-semibold">Member</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visitors.map((v) => (
                        <tr key={v.id}>
                          <td className="px-4 py-2 font-medium text-slate-900">{v.full_name}</td>
                          <td className="px-4 py-2 text-slate-600">{v.home_location_or_stake || '—'}</td>
                          <td className="px-4 py-2 text-slate-500">{v.contact_phone || '—'}</td>
                          <td className="px-4 py-2">
                            {v.is_church_member ? 'Church Member' : 'Guest'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 cursor-pointer"
          >
            Close Console
          </button>
        </div>
      </div>

      {/* Unit Reassignment Modal */}
      {correctingRecord && (
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 mb-1">Reassign Attendee Unit</h4>
            <p className="text-xs text-slate-500 mb-3">
              {correctingRecord.member?.full_name}
            </p>

            <form onSubmit={handleReassignUnit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Correct Unit
                </label>
                <select
                  required
                  value={reassignUnitId}
                  onChange={(e) => setReassignUnitId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Correction Reason *
                </label>
                <textarea
                  required
                  rows={2}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g. Member recently transferred to Obantoko 2nd"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCorrectingRecord(null)}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                >
                  Save Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
