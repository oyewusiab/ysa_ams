import React, { useState, useEffect } from 'react'
import { 
  Calendar, 
  PlusCircle, 
  Play, 
  CheckCircle, 
  Clock, 
  Users, 
  Key, 
  Eye, 
  Lock, 
  RotateCcw, 
  ShieldCheck, 
  AlertTriangle 
} from 'lucide-react'
import { 
  fetchActivities, 
  fetchSessions, 
  createActivity, 
  createSession, 
  initiateSession, 
  closeSession,
  requestReopening
} from '../services/activityService'
import { SessionMonitoringModal } from './SessionMonitoringModal'
import { useAuth } from '../context/AuthContext'
import type { Activity, ActivitySession, ActivityCategory } from '../types/database'

export const ActivityManagementView: React.FC = () => {
  const { user } = useAuth()
  const [activities, setActivities] = useState<Activity[]>([])
  const [sessions, setSessions] = useState<ActivitySession[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Modals
  const [showCreateActModal, setShowCreateActModal] = useState(false)
  const [showCreateSessModal, setShowCreateSessModal] = useState(false)
  const [showInitiateModal, setShowInitiateModal] = useState<ActivitySession | null>(null)
  const [monitoringSession, setMonitoringSession] = useState<ActivitySession | null>(null)
  const [reopenPromptSession, setReopenPromptSession] = useState<ActivitySession | null>(null)
  const [reopenReason, setReopenReason] = useState('')

  // Create Activity form
  const [actTitle, setActTitle] = useState('')
  const [actDesc, setActDesc] = useState('')
  const [actCategory, setActCategory] = useState<ActivityCategory>('spiritual')

  // Create Session form
  const [selectedActId, setSelectedActId] = useState('')
  const [sessTitle, setSessTitle] = useState('')
  const [sessDate, setSessDate] = useState(() => new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('17:00')
  const [endTime, setEndTime] = useState('19:30')
  const [visitorEnabled, setVisitorEnabled] = useState(true)

  // Initiate Session form
  const [maxTerminals, setMaxTerminals] = useState<number>(2)
  const [customCode, setCustomCode] = useState(() => Math.floor(100000 + Math.random() * 900000).toString())

  const loadAll = async () => {
    setError(null)
    try {
      const [acts, sessList] = await Promise.all([
        fetchActivities(),
        fetchSessions()
      ])
      setActivities(acts)
      setSessions(sessList)
      if (acts.length > 0 && !selectedActId) {
        setSelectedActId(acts[0].id)
      }
    } catch (err: any) {
      setError(err.message || 'Error loading activities')
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await createActivity({
        title: actTitle.trim(),
        description: actDesc.trim() || null,
        category: actCategory,
        eligibility_rule: 'all_ysa',
        visitor_registration_default: true,
        created_by: user?.id || 'current-user'
      })
      setSuccess(`Activity "${actTitle}" created.`)
      setShowCreateActModal(false)
      setActTitle('')
      setActDesc('')
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to create activity')
    }
  }

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await createSession({
        activity_id: selectedActId,
        session_title: sessTitle.trim(),
        session_date: sessDate,
        start_time: `${startTime}:00`,
        scheduled_end_time: endTime ? `${endTime}:00` : null,
        visitor_registration_enabled: visitorEnabled,
        eligibility_rule: 'all_ysa',
        max_terminals: 2
      })
      setSuccess(`Attendance session "${sessTitle}" scheduled.`)
      setShowCreateSessModal(false)
      setSessTitle('')
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to schedule session')
    }
  }

  const handleInitiateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!showInitiateModal) return
    setError(null)
    try {
      await initiateSession(
        showInitiateModal.id,
        customCode,
        maxTerminals,
        240 // 4 hours expiry
      )
      setSuccess(`Session activated! Attendance Code: ${customCode} (Max Terminals: ${maxTerminals})`)
      setShowInitiateModal(null)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to initiate attendance session')
    }
  }

  const handleCloseSession = async (session: ActivitySession) => {
    if (!confirm(`Are you sure you want to close "${session.session_title}"? All terminals will be invalidated immediately.`)) {
      return
    }
    setError(null)
    try {
      await closeSession(session.id)
      setSuccess(`Session closed successfully. Subsequent writes blocked.`)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to close session')
    }
  }

  const handleRequestReopen = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reopenPromptSession) return
    setError(null)
    try {
      await requestReopening(reopenPromptSession.id, reopenReason.trim())
      setSuccess('Reopening request submitted for Stake Presidency / Admin authorization.')
      setReopenPromptSession(null)
      setReopenReason('')
    } catch (err: any) {
      setError(err.message || 'Failed to submit reopening request')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-emerald-700" />
            Activity & Session Management
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Design activity definitions, launch attendance sessions, configure terminal limits and codes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateActModal(true)}
            className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <PlusCircle className="w-4 h-4 text-slate-500" />
            New Activity Template
          </button>
          <button
            onClick={() => setShowCreateSessModal(true)}
            className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Play className="w-4 h-4" />
            Schedule Session
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 gap-4">
        <h2 className="text-base font-bold text-slate-900">Attendance Sessions</h2>

        {sessions.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
            No activity sessions scheduled yet. Click "Schedule Session" to begin.
          </div>
        ) : (
          sessions.map((sess) => (
            <div
              key={sess.id}
              className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                      sess.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse'
                        : sess.status === 'closed'
                        ? 'bg-slate-100 text-slate-600 border border-slate-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {sess.status}
                  </span>
                  <h3 className="font-bold text-slate-900 text-base">{sess.session_title}</h3>
                </div>

                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {sess.session_date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {sess.start_time.substring(0, 5)} {sess.scheduled_end_time ? `– ${sess.scheduled_end_time.substring(0, 5)}` : ''} (WAT)
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    Max Terminals: <strong className="text-slate-700">{sess.max_terminals}</strong>
                  </span>
                  {sess.visitor_registration_enabled && (
                    <span className="text-emerald-700 font-medium">Visitors Allowed</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-start md:self-center">
                {sess.status === 'draft' && (
                  <button
                    onClick={() => {
                      setShowInitiateModal(sess)
                      setCustomCode(Math.floor(100000 + Math.random() * 900000).toString())
                    }}
                    className="px-3.5 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Key className="w-3.5 h-3.5" />
                    Initiate Attendance
                  </button>
                )}

                {sess.status === 'active' && (
                  <>
                    <button
                      onClick={() => setMonitoringSession(sess)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Live Monitor
                    </button>
                    <button
                      onClick={() => handleCloseSession(sess)}
                      className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Close Session
                    </button>
                  </>
                )}

                {sess.status === 'closed' && (
                  <>
                    <button
                      onClick={() => setMonitoringSession(sess)}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Final Report
                    </button>
                    <button
                      onClick={() => setReopenPromptSession(sess)}
                      className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold hover:bg-amber-100 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Request Reopening
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Initiate Session Modal */}
      {showInitiateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
              Initiate Attendance Session
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Configure unpredictable attendance code and maximum concurrent device limit.
            </p>

            <form onSubmit={handleInitiateSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Session Title
                </label>
                <input
                  type="text"
                  disabled
                  value={showInitiateModal.session_title}
                  className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-lg text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  6-Digit Session Attendance Code *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-base font-mono font-bold tracking-widest text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomCode(Math.floor(100000 + Math.random() * 900000).toString())}
                    className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                  >
                    Randomize
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Volunteers will enter this code on the attendance terminal to register.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Max Terminal Limit (Concurrent Devices) *
                </label>
                <select
                  value={maxTerminals}
                  onChange={(e) => setMaxTerminals(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value={1}>1 Terminal (Single Check-in Desk)</option>
                  <option value={2}>2 Terminals (Split Desks)</option>
                  <option value={3}>3 Terminals (Three Devices)</option>
                  <option value={5}>5 Terminals (Large Event)</option>
                  <option value={10}>10 Terminals (Max)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Strictly enforced in backend logic to prevent unauthorized token expansion.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInitiateModal(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 cursor-pointer shadow-xs"
                >
                  Activate Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Session Modal */}
      {showCreateSessModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Schedule Attendance Session</h3>
            <p className="text-xs text-slate-500 mb-4">
              Instantiate an actual attendance date from an activity definition.
            </p>

            <form onSubmit={handleCreateSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Activity Definition *
                </label>
                <select
                  required
                  value={selectedActId}
                  onChange={(e) => {
                    setSelectedActId(e.target.value)
                    const a = activities.find(x => x.id === e.target.value)
                    if (a) setSessTitle(`${a.title} — ${new Date().toLocaleDateString('en-GB')}`)
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>{a.title} ({a.category})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Session Title *
                </label>
                <input
                  type="text"
                  required
                  value={sessTitle}
                  onChange={(e) => setSessTitle(e.target.value)}
                  placeholder="e.g. Stake Institute - May 2026"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={sessDate}
                    onChange={(e) => setSessDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start *</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="visToggle"
                  checked={visitorEnabled}
                  onChange={(e) => setVisitorEnabled(e.target.checked)}
                  className="h-4 w-4 text-emerald-600 rounded border-slate-300"
                />
                <label htmlFor="visToggle" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Enable Visitor Registration (Non-members & Guests)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateSessModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 cursor-pointer shadow-xs"
                >
                  Save Draft Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Activity Template Modal */}
      {showCreateActModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Create Activity Template</h3>
            <p className="text-xs text-slate-500 mb-4">
              Templates can be reused across recurring sessions without inheriting previous attendees.
            </p>

            <form onSubmit={handleCreateActivity} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Activity Title *</label>
                <input
                  type="text"
                  required
                  value={actTitle}
                  onChange={(e) => setActTitle(e.target.value)}
                  placeholder="e.g. Stake YSA Conference"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                <select
                  value={actCategory}
                  onChange={(e) => setActCategory(e.target.value as ActivityCategory)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="spiritual">Spiritual (Institute / Fireside / Devotional)</option>
                  <option value="social">Social & Fellowship</option>
                  <option value="service">Service & Community</option>
                  <option value="sports">Sports & Recreation</option>
                  <option value="temple">Temple & Family History</option>
                  <option value="educational">Educational & Career</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={actDesc}
                  onChange={(e) => setActDesc(e.target.value)}
                  placeholder="Purpose, agenda, or guidelines..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateActModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 cursor-pointer shadow-xs"
                >
                  Create Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Reopening Modal */}
      {reopenPromptSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              Request Session Reopening
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Reopening requires formal approval from Stake Presidency or System Administrator.
            </p>

            <form onSubmit={handleRequestReopen} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Session</label>
                <input
                  type="text"
                  disabled
                  value={reopenPromptSession.session_title}
                  className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-lg text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Justification / Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Explain why attendance must be updated after closure..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReopenPromptSession(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 cursor-pointer shadow-xs"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Monitoring Modal */}
      {monitoringSession && (
        <SessionMonitoringModal
          session={monitoringSession}
          onClose={() => {
            setMonitoringSession(null)
            loadAll()
          }}
        />
      )}
    </div>
  )
}
