import React, { useState, useEffect, useCallback } from 'react'
import { 
  CheckCircle2, 
  AlertCircle, 
  Building2, 
  RefreshCw, 
  ShieldCheck, 
  Search, 
  UserCheck, 
  UserPlus, 
  LogOut, 
  Clock, 
  Radio,
  X
} from 'lucide-react'
import { 
  authorizeTerminalWithCode, 
  recordAttendanceFromTerminal, 
  recordVisitorFromTerminal, 
  sendTerminalHeartbeat,
  releaseTerminal,
  getStoredTerminalAuth, 
  clearTerminalAuth, 
  type TerminalSessionInfo 
} from '../services/terminalService'
import { fetchMembers } from '../services/memberService'
import { fetchStakeUnits } from '../services/unitService'
import type { Member, StakeUnit } from '../types/database'

interface PublicAttendanceFormViewProps {
  initialCode?: string
}

export const PublicAttendanceFormView: React.FC<PublicAttendanceFormViewProps> = ({ initialCode }) => {
  // Terminal session state: preserved per device in sessionStorage
  const [terminalSession, setTerminalSession] = useState<TerminalSessionInfo | null>(() => getStoredTerminalAuth())
  
  // Terminal authorization form state
  const [sessionCode, setSessionCode] = useState(initialCode || '')
  const [terminalLabel, setTerminalLabel] = useState('Front Desk Terminal')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // Registered member search & check-in state
  const [searchTerm, setSearchTerm] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [submittingMemberId, setSubmittingMemberId] = useState<string | null>(null)
  const [lastCheckIn, setLastCheckIn] = useState<{ name: string; time: string; type: 'member' | 'visitor' } | null>(null)
  const [checkInError, setCheckInError] = useState<string | null>(null)

  // Visitor & Stake Units state
  const [stakeUnits, setStakeUnits] = useState<StakeUnit[]>([])
  const [showVisitorModal, setShowVisitorModal] = useState(false)
  const [visitorName, setVisitorName] = useState('')
  const [visitorPhone, setVisitorPhone] = useState('')
  const [visitorLocation, setVisitorLocation] = useState('')
  const [visitorIsNonMember, setVisitorIsNonMember] = useState(true)
  const [visitorInvitingUnitId, setVisitorInvitingUnitId] = useState<string>('')
  const [visitorSubmitting, setVisitorSubmitting] = useState(false)

  // 1. Load Stake Units for visitor inviting ward/branch selection
  useEffect(() => {
    fetchStakeUnits()
      .then(setStakeUnits)
      .catch((err) => console.warn('Could not load stake units for visitor selection:', err))
  }, [])

  // 2. Direct Session Link handling (Method A: /:code e.g. /5BV21F)
  useEffect(() => {
    if (initialCode && !terminalSession) {
      handleDirectCodeAuthorization(initialCode)
    }
  }, [initialCode])

  const handleDirectCodeAuthorization = async (code: string) => {
    setAuthLoading(true)
    setAuthError(null)
    try {
      const session = await authorizeTerminalWithCode(code, 'Direct Link Device')
      setTerminalSession(session)
      // Hide the code from the browser URL bar & history immediately
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '/')
      }
    } catch (err: any) {
      setAuthError(err.message || 'Failed to authorize terminal using direct link.')
      // Also sanitize URL if invalid code was supplied
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '/')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  // 3. Heartbeat maintenance & cleanup for concurrent terminal lease
  useEffect(() => {
    if (!terminalSession?.terminal_token) return

    // Send heartbeat every 4 minutes (lease expires at 10 minutes)
    const intervalId = setInterval(async () => {
      const alive = await sendTerminalHeartbeat(terminalSession.terminal_token)
      if (!alive) {
        console.warn('Terminal lease expired or session closed.')
      }
    }, 4 * 60 * 1000)

    // Release terminal registration on tab close / reload
    const handleBeforeUnload = () => {
      if (terminalSession?.terminal_token) {
        releaseTerminal(terminalSession.terminal_token)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [terminalSession?.terminal_token])

  // 4. Search and fetch members for rapid check-in
  const searchMembers = useCallback(async (query: string) => {
    setLoadingMembers(true)
    try {
      const data = await fetchMembers(undefined, query)
      setMembers(data)
    } catch (err) {
      console.warn('Failed to search members:', err)
    } finally {
      setLoadingMembers(false)
    }
  }, [])

  useEffect(() => {
    if (!terminalSession) return

    const timer = setTimeout(() => {
      searchMembers(searchTerm)
    }, 250)

    return () => clearTimeout(timer)
  }, [terminalSession, searchTerm, searchMembers])

  // 5. Authorize terminal manually via Session Attendance Code (Method B)
  const handleAuthorizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionCode || sessionCode.trim().length < 4) {
      setAuthError('Please enter a valid 6-character session code.')
      return
    }

    setAuthLoading(true)
    setAuthError(null)
    try {
      const session = await authorizeTerminalWithCode(sessionCode, terminalLabel)
      setTerminalSession(session)
      // Ensure the URL is clean and code is never kept in the address bar
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '/')
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authorization failed. Please verify code or contact session administrator.')
    } finally {
      setAuthLoading(false)
    }
  }

  // 6. Explicitly disconnect / release terminal
  const handleDisconnect = async () => {
    if (terminalSession?.terminal_token) {
      await releaseTerminal(terminalSession.terminal_token)
    } else {
      clearTerminalAuth()
    }
    setTerminalSession(null)
    setLastCheckIn(null)
    setCheckInError(null)
    setSearchTerm('')
  }

  // 7. Record Member Check-In
  const handleRecordMember = async (member: Member) => {
    if (!terminalSession) return
    setSubmittingMemberId(member.id)
    setCheckInError(null)
    try {
      const res = await recordAttendanceFromTerminal(
        terminalSession.session_id,
        member.id,
        terminalSession.terminal_token
      )

      const timeStr = res.check_in_time
        ? new Date(res.check_in_time).toLocaleTimeString('en-GB', {
            timeZone: 'Africa/Lagos',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        : new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos' })

      setLastCheckIn({
        name: res.member_name || member.full_name,
        time: `${timeStr} WAT`,
        type: 'member'
      })
      // Clear search to prepare for next attendee
      setSearchTerm('')
    } catch (err: any) {
      setCheckInError(err.message || 'Failed to record attendance.')
    } finally {
      setSubmittingMemberId(null)
    }
  }

  // 8. Record Visitor Check-In
  const handleRecordVisitor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!terminalSession) return
    if (!visitorName.trim()) {
      setCheckInError('Please enter the visitor\'s full name.')
      return
    }

    setVisitorSubmitting(true)
    setCheckInError(null)
    try {
      const isChurchMember = !visitorIsNonMember
      const res = await recordVisitorFromTerminal(
        terminalSession.session_id,
        visitorName,
        visitorPhone,
        visitorLocation,
        isChurchMember,
        terminalSession.terminal_token,
        visitorInvitingUnitId || null
      )

      const timeStr = res.check_in_time
        ? new Date(res.check_in_time).toLocaleTimeString('en-GB', {
            timeZone: 'Africa/Lagos',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        : new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos' })

      setLastCheckIn({
        name: `${res.full_name || visitorName.trim()} (${isChurchMember ? 'Visiting Member' : 'Guest'})`,
        time: `${timeStr} WAT`,
        type: 'visitor'
      })

      setShowVisitorModal(false)
      setVisitorName('')
      setVisitorPhone('')
      setVisitorLocation('')
      setVisitorInvitingUnitId('')
      setVisitorIsNonMember(true)
    } catch (err: any) {
      setCheckInError(err.message || 'Failed to record visitor attendance.')
    } finally {
      setVisitorSubmitting(false)
    }
  }

  // ==========================================
  // VIEW A: SESSION CODE WELCOME / ENTRY SCREEN
  // ==========================================
  if (!terminalSession) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-900 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
        {/* Stake Header */}
        <header className="max-w-md w-full mx-auto text-center pt-6 sm:pt-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-800/40 border border-emerald-600/30 rounded-full text-emerald-300 text-xs font-semibold mb-3 shadow-inner">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Abeokuta Nigeria Obantoko Stake</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            YSA Attendance Terminal
          </h1>
          <p className="text-xs sm:text-sm text-emerald-200/80 mt-1 max-w-sm mx-auto">
            Enter the 6-character session attendance code generated by your YSA leadership to authorize this device.
          </p>
        </header>

        {/* Code Entry Card */}
        <main className="max-w-md w-full mx-auto my-8">
          <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-slate-100">
            {/* Error Message */}
            {authError && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-300 rounded-2xl text-rose-900 flex items-start gap-3 animate-in fade-in">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs font-semibold leading-relaxed">
                  {authError}
                </div>
              </div>
            )}

            <form onSubmit={handleAuthorizeSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Session Attendance Code <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    placeholder="e.g. 5BV21F"
                    value={sessionCode}
                    onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3.5 text-2xl font-mono font-black tracking-widest text-center text-emerald-900 bg-emerald-50/60 border-2 border-emerald-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-600 uppercase placeholder:text-slate-300 placeholder:font-sans placeholder:tracking-normal placeholder:text-base placeholder:font-normal"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-2 text-center">
                  6-character alphanumeric code provided by the session leader.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Terminal Device Label <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={terminalLabel}
                  onChange={(e) => setTerminalLabel(e.target.value)}
                  placeholder="e.g. Front Desk Desk 1"
                  className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-slate-800"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full mt-3 py-3.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl text-base font-bold tracking-wide transition-all shadow-lg hover:shadow-emerald-900/30 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {authLoading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Verifying Code & Authorizing...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    <span>Access Attendance Terminal</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </main>

        {/* Footer Navigation */}
        <footer className="max-w-md w-full mx-auto text-center pb-4 text-xs text-slate-500">
          <div>Abeokuta Nigeria Obantoko Stake YSA AMS</div>
          <div className="mt-2">
            <a
              href="/la"
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold underline decoration-emerald-500/50"
            >
              Leadership & Admin Portal →
            </a>
          </div>
        </footer>
      </div>
    )
  }

  // ==========================================
  // VIEW B: AUTHORIZED ATTENDANCE TERMINAL
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="bg-emerald-950 text-white border-b border-emerald-900 sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 uppercase tracking-wider">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                Active Terminal
              </span>
              {terminalSession.enable_time_in && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  <Clock className="w-2.5 h-2.5" />
                  Time In
                </span>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-bold truncate text-white mt-0.5">
              {terminalSession.session_title}
            </h1>
            <p className="text-xs text-emerald-200/80 truncate">
              {terminalSession.session_date} • Obantoko Stake
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {terminalSession.visitor_enabled && (
              <button
                type="button"
                onClick={() => setShowVisitorModal(true)}
                className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold border border-emerald-600/50 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <UserPlus className="w-4 h-4 text-emerald-300" />
                <span className="hidden sm:inline">Register</span> Visitor
              </button>
            )}

            <button
              type="button"
              onClick={handleDisconnect}
              title="Release terminal and disconnect"
              className="p-2 text-emerald-300 hover:text-rose-300 hover:bg-rose-950/40 rounded-xl border border-emerald-800/80 cursor-pointer transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Terminal Body */}
      <main className="max-w-4xl w-full mx-auto p-4 sm:p-6 flex-1 space-y-4">
        {/* Instant Feedback Confirmation Banner */}
        {lastCheckIn && (
          <div className="p-4 bg-emerald-600 text-white rounded-2xl shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-bold text-base leading-tight">
                  {lastCheckIn.name}
                </div>
                <div className="text-xs text-emerald-100 mt-0.5">
                  Attendance recorded at <strong>{lastCheckIn.time}</strong>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLastCheckIn(null)}
              className="p-1 hover:bg-white/20 rounded-lg text-emerald-100 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error / Duplicate Warning Banner */}
        {checkInError && (
          <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl flex items-start justify-between gap-3 animate-in shake">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs font-semibold leading-relaxed">
                {checkInError}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCheckInError(null)}
              className="p-1 hover:bg-amber-100 rounded-lg text-amber-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Member Search & Rapid Check-In Section */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Search Registered YSA Member
            </label>
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5 pointer-events-none" />
              <input
                type="text"
                autoFocus
                placeholder="Type member's first or last name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-10 py-3.5 text-base border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium text-slate-900 placeholder:text-slate-400"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Select an attendee to mark them present immediately. Device remains ready for next attendee.
            </p>
          </div>

          {/* Members List */}
          <div className="divide-y divide-slate-100 max-h-[50vh] overflow-y-auto rounded-2xl border border-slate-100">
            {loadingMembers ? (
              <div className="py-10 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                <span>Searching member register...</span>
              </div>
            ) : members.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                {searchTerm.trim().length > 0 ? (
                  <>
                    <p className="font-semibold text-slate-600">No registered YSA member found matching "{searchTerm}".</p>
                    {terminalSession.visitor_enabled && (
                      <button
                        type="button"
                        onClick={() => {
                          setVisitorName(searchTerm)
                          setShowVisitorModal(true)
                        }}
                        className="mt-3 px-3.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-xs hover:bg-emerald-100 cursor-pointer"
                      >
                        Register "{searchTerm}" as Visitor →
                      </button>
                    )}
                  </>
                ) : (
                  <p>Type a name above to find attendees, or register a visitor.</p>
                )}
              </div>
            ) : (
              members.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 sm:px-4 flex items-center justify-between gap-3 hover:bg-emerald-50/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm sm:text-base truncate">
                      {m.full_name}
                      {m.preferred_name && (
                        <span className="text-slate-500 font-normal ml-1.5 text-xs">
                          ({m.preferred_name})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{m.stake_unit?.unit_name || 'Obantoko Stake'}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRecordMember(m)}
                    disabled={submittingMemberId === m.id}
                    className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>{submittingMemberId === m.id ? 'Recording...' : 'Check In'}</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Visitor Registration Modal */}
      {showVisitorModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-7 border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Register Activity Visitor</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record attendance for guests, friends, or visiting members.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVisitorModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordVisitor} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Visitor Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  placeholder="e.g. Samuel Ogunlesi"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Contact Phone Number <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="tel"
                  value={visitorPhone}
                  onChange={(e) => setVisitorPhone(e.target.value)}
                  placeholder="+234..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Home Stake / City / Location <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={visitorLocation}
                  onChange={(e) => setVisitorLocation(e.target.value)}
                  placeholder="e.g. Lagos Nigeria Stake or Abeokuta"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-slate-900"
                />
              </div>

              {/* Non-Member Checkbox: leaves unit field optional, never disabled */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="visNonMemberToggle"
                    checked={visitorIsNonMember}
                    onChange={(e) => setVisitorIsNonMember(e.target.checked)}
                    className="h-4 w-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="visNonMemberToggle" className="text-xs font-bold text-slate-800 cursor-pointer select-none">
                    Non-Member? (Guest or Friend of the Church)
                  </label>
                </div>

                {/* Inviting Unit Dropdown: Optional for non-members and visiting members */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Inviting Ward or Branch <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <select
                    value={visitorInvitingUnitId}
                    onChange={(e) => setVisitorInvitingUnitId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white text-slate-800"
                  >
                    <option value="">None / General Stake Visitor</option>
                    {stakeUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_name} ({u.unit_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowVisitorModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={visitorSubmitting}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {visitorSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <span>Record Visitor Check-In</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminal Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-4 text-center text-xs text-slate-500">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span>Abeokuta Nigeria Obantoko Stake YSA AMS</span>
          <span>•</span>
          <span>Device: <strong>{terminalSession.session_title} Desk</strong></span>
        </div>
      </footer>
    </div>
  )
}
