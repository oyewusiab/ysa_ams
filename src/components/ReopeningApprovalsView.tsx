import React, { useState, useEffect } from 'react'
import { 
  RotateCcw, 
  CheckCircle, 
  ShieldAlert, 
  RefreshCw 
} from 'lucide-react'
import { fetchReopeningRequests, decideReopening, fetchCorrections } from '../services/activityService'
import type { SessionReopeningRequest, AttendanceCorrection } from '../types/database'

export const ReopeningApprovalsView: React.FC = () => {
  const [requests, setRequests] = useState<SessionReopeningRequest[]>([])
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'corrections'>('requests')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [reqData, corrData] = await Promise.all([
        fetchReopeningRequests(),
        fetchCorrections()
      ])
      setRequests(reqData)
      setCorrections(corrData)
    } catch (err: any) {
      setActionError(err.message || 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleDecision = async (requestId: string, decision: 'approved' | 'rejected') => {
    setActionError(null)
    try {
      await decideReopening(requestId, decision, 60)
      setActionSuccess(`Request ${decision} successfully.`)
      loadData()
    } catch (err: any) {
      setActionError(err.message || 'Decision failed')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-amber-600" />
            Session Reopening & Corrections Governance
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Stake Presidency & Admin oversight for session reopening approvals and audited corrections.
          </p>
        </div>

        <button
          onClick={loadData}
          className="p-2 border border-slate-200 bg-white rounded-lg text-slate-600 hover:bg-slate-50 self-start sm:self-center cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex border-b border-slate-200 space-x-4">
        <button
          onClick={() => setActiveSubTab('requests')}
          className={`pb-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
            activeSubTab === 'requests'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Reopening Requests ({requests.filter(r => r.status === 'pending').length} Pending)
        </button>
        <button
          onClick={() => setActiveSubTab('corrections')}
          className={`pb-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
            activeSubTab === 'corrections'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Attendance Corrections Log ({corrections.length})
        </button>
      </div>

      {/* Requests Tab */}
      {activeSubTab === 'requests' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="px-6 py-3">Session & Requester</th>
                  <th className="px-6 py-3">Justification</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                      No session reopening requests recorded.
                    </td>
                  </tr>
                ) : (
                  requests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{r.session?.session_title || 'Session'}</div>
                        <div className="text-xs text-slate-500">
                          Requested by {r.requester_profile?.full_name || 'Leader'} •{' '}
                          {new Date(r.created_at).toLocaleDateString('en-GB')}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-700 max-w-xs">{r.reason}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                            r.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : r.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {r.status === 'pending' ? (
                          <>
                            <button
                              onClick={() => handleDecision(r.id, 'approved')}
                              className="px-3 py-1 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 cursor-pointer shadow-xs"
                            >
                              Approve (1 hr)
                            </button>
                            <button
                              onClick={() => handleDecision(r.id, 'rejected')}
                              className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100 cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">Decided</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Corrections Tab */}
      {activeSubTab === 'corrections' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="px-6 py-3">Correction Type</th>
                  <th className="px-6 py-3">Reason</th>
                  <th className="px-6 py-3">Corrected By</th>
                  <th className="px-6 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {corrections.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                      No attendance corrections logged yet.
                    </td>
                  </tr>
                ) : (
                  corrections.map((c) => (
                    <tr key={c.id}>
                      <td className="px-6 py-4 font-medium text-slate-900 capitalize">
                        {c.correction_type.replace(/_/g, ' ')}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-700 max-w-xs">{c.reason}</td>
                      <td className="px-6 py-4 text-xs text-slate-600">
                        {c.corrector_profile?.full_name || 'Leader'}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(c.created_at).toLocaleString('en-GB')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
