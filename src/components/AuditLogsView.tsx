import React, { useEffect, useState } from 'react'
import { fetchAuditLogs } from '../services/auditService'
import type { AuditLog } from '../types/database'
import { ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react'

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const loadLogs = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const data = await fetchAuditLogs(50)
      setLogs(data)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to retrieve audit log trail')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-700" />
            Security Audit Trail
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Immutable, append-only record of security-critical administrative actions and role updates.
          </p>
        </div>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-300 text-red-800 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm font-medium">{errorMsg}</div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3.5 text-left font-semibold text-slate-700">Timestamp (UTC)</th>
                <th className="px-6 py-3.5 text-left font-semibold text-slate-700">Action</th>
                <th className="px-6 py-3.5 text-left font-semibold text-slate-700">Actor</th>
                <th className="px-6 py-3.5 text-left font-semibold text-slate-700">Target</th>
                <th className="px-6 py-3.5 text-left font-semibold text-slate-700">Outcome</th>
                <th className="px-6 py-3.5 text-left font-semibold text-slate-700">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-700" />
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No audit records registered yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3.5 whitespace-nowrap text-xs text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs font-semibold text-emerald-900">
                      {log.action}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-700">
                      {log.actor_profile?.full_name || (log.actor_id ? log.actor_id.slice(0, 8) + '...' : 'System')}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-600 font-mono">
                      {log.target_table ? `${log.target_table}:` : ''}{log.target_record_id ? log.target_record_id.slice(0, 8) + '...' : 'N/A'}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          log.outcome === 'success'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {log.outcome}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-500 max-w-xs truncate font-mono">
                      {JSON.stringify(log.metadata || {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
