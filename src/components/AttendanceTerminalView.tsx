import React, { useState, useEffect } from 'react'
import { 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  UserCheck, 
  UserPlus, 
  LogOut, 
  Building2, 
  ShieldCheck, 
  RefreshCw 
} from 'lucide-react'
import { 
  authorizeTerminalWithCode, 
  recordAttendanceFromTerminal, 
  recordVisitorFromTerminal, 
  getStoredTerminalAuth, 
  clearTerminalAuth, 
  type TerminalSessionInfo 
} from '../services/terminalService'
import { fetchMembers } from '../services/memberService'
import type { Member } from '../types/database'

export const AttendanceTerminalView: React.FC = () => {
  const [terminalSession, setTerminalSession] = useState<TerminalSessionInfo | null>(() => getStoredTerminalAuth())
  
  // Terminal login state
  const [inputCode, setInputCode] = useState('')
  const [terminalLabel, setTerminalLabel] = useState('Front Desk Terminal')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // Attendance recording state
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [submittingMemberId, setSubmittingMemberId] = useState<string | null>(null)
  const [lastCheckIn, setLastCheckIn] = useState<{ name: string; time: string } | null>(null)
  const [checkInError, setCheckInError] = useState<string | null>(null)

  // Visitor state
  const [showVisitorModal, setShowVisitorModal] = useState(false)
  const [visitorName, setVisitorName] = useState('')
  const [visitorPhone, setVisitorPhone] = useState('')
  const [visitorStake, setVisitorStake] = useState('')
  const [visitorIsMember, setVisitorIsMember] = useState(false)
  const [visitorSubmitting, setVisitorSubmitting] = useState(false)

  // Load members when terminal is authenticated
  useEffect(() => {
    if (terminalSession) {
      loadMembers()
    }
  }, [terminalSession, search])

  const loadMembers = async () => {
    setLoadingMembers(true)
    try {
      const data = await fetchMembers(undefined, search)
      setMembers(data)
    } catch (err) {
      console.warn('Could not load member search:', err)
    } finally {
      setLoadingMembers(false)
    }
  }

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError(null)
    try {
      const info = await authorizeTerminalWithCode(inputCode, terminalLabel)
      setTerminalSession(info)
    } catch (err: any) {
      setAuthError(err.message || 'Authorization failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleRecordAttendance = async (member: Member) => {
    if (!terminalSession) return
    setSubmittingMemberId(member.id)
    setCheckInError(null)
    try {
      const res = await recordAttendanceFromTerminal(
        terminalSession.session_id,
        member.id,
        terminalSession.terminal_token
      )
      setLastCheckIn({
        name: res.member_name,
        time: new Date(res.check_in_time).toLocaleTimeString('en-GB')
      })
      // Clear search to prepare for next person
      setSearch('')
    } catch (err: any) {
      setCheckInError(err.message || 'Failed to record attendance')
    } finally {
      setSubmittingMemberId(null)
    }
  }

  const handleRecordVisitor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!terminalSession) return
    setVisitorSubmitting(true)
    setCheckInError(null)
    try {
      const res = await recordVisitorFromTerminal(
        terminalSession.session_id,
        visitorName,
        visitorPhone,
        visitorStake,
        visitorIsMember,
        terminalSession.terminal_token
      )
      setLastCheckIn({
        name: `${res.full_name} (Visitor)`,
        time: new Date().toLocaleTimeString('en-GB')
      })
      setShowVisitorModal(false)
      setVisitorName('')
      setVisitorPhone('')
      setVisitorStake('')
    } catch (err: any) {
      setCheckInError(err.message || 'Failed to record visitor')
    } finally {
      setVisitorSubmitting(false)
    }
  }

  const handleDisconnect = () => {
    clearTerminalAuth()
    setTerminalSession(null)
    setLastCheckIn(null)
    setCheckInError(null)
  }

  // 1. Terminal authorization screen
  if (!terminalSession) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Attendance Terminal</h2>
          <p className="text-xs text-slate-500 mb-6">
            Abeokuta Nigeria Obantoko Stake • Dedicated Activity Check-in Desk
          </p>

          {authError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthorize} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Activity Session Code *
              </label>
              <input
                type="text"
                required
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="6-DIGIT CODE"
                className="w-full px-4 py-3 text-xl font-mono font-bold tracking-widest text-center text-emerald-900 bg-emerald-50/50 border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 uppercase"
              />
              <p className="text-[11px] text-slate-400 mt-1 text-center">
                Provided by the initiating YSA leader
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Terminal Label
              </label>
              <input
                type="text"
                value={terminalLabel}
                onChange={(e) => setTerminalLabel(e.target.value)}
                placeholder="e.g. Front Desk Laptop #1"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-emerald-700 text-white rounded-xl text-sm font-bold hover:bg-emerald-800 transition-colors cursor-pointer shadow-md disabled:opacity-50"
            >
              {authLoading ? 'Verifying Terminal...' : 'Connect Terminal'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 2. Authenticated Attendance Terminal screen
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full uppercase tracking-wider">
              Connected
            </span>
            <h1 className="text-xl font-bold text-slate-900">{terminalSession.session_title}</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
            <span>Date: <strong>{terminalSession.session_date}</strong></span>
            {terminalSession.visitor_enabled && (
              <span className="text-emerald-700 font-semibold">• Visitors Allowed</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          {terminalSession.visitor_enabled && (
            <button
              onClick={() => setShowVisitorModal(true)}
              className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold hover:bg-blue-100 flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Register Visitor
            </button>
          )}

          <button
            onClick={handleDisconnect}
            className="p-2 text-slate-400 hover:text-rose-600 rounded-xl border border-slate-200 hover:bg-rose-50 cursor-pointer"
            title="Disconnect Terminal"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Immediate Confirmation Feedback */}
      {lastCheckIn && (
        <div className="bg-emerald-500 text-white p-4 rounded-2xl shadow-md flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <div>
              <div className="font-bold text-base leading-tight">{lastCheckIn.name}</div>
              <div className="text-xs text-emerald-100">Attendance recorded at {lastCheckIn.time}</div>
            </div>
          </div>
          <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full uppercase">
            Confirmed
          </span>
        </div>
      )}

      {/* Duplicate / Error Banner */}
      {checkInError && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 p-4 rounded-2xl flex items-center gap-3 animate-in shake">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0" />
          <div className="text-xs font-semibold">{checkInError}</div>
        </div>
      )}

      {/* Participant Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Search Attendee Name
          </label>
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              autoFocus
              placeholder="Type member name or preferred name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>

        {/* Member Search Results */}
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {loadingMembers ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1" />
              Searching members...
            </div>
          ) : members.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No YSA members found matching "{search}".
            </div>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="py-3 px-2 flex items-center justify-between hover:bg-slate-50 rounded-xl transition-colors"
              >
                <div>
                  <div className="font-bold text-slate-900 text-sm">{m.full_name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    <span>{m.stake_unit?.unit_name || 'Obantoko Stake'}</span>
                    {m.preferred_name && <span className="text-slate-400">• "{m.preferred_name}"</span>}
                  </div>
                </div>

                <button
                  onClick={() => handleRecordAttendance(m)}
                  disabled={submittingMemberId === m.id}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <UserCheck className="w-4 h-4" />
                  {submittingMemberId === m.id ? 'Recording...' : 'Check In'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Visitor Modal */}
      {showVisitorModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Register Activity Visitor</h3>
            <p className="text-xs text-slate-500 mb-4">
              For visiting friends, non-resident members, and guests.
            </p>

            <form onSubmit={handleRecordVisitor} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Visitor Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  placeholder="e.g. Samuel Ogunlesi"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Home Stake / City / Location
                </label>
                <input
                  type="text"
                  value={visitorStake}
                  onChange={(e) => setVisitorStake(e.target.value)}
                  placeholder="e.g. Lagos Nigeria Stake"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={visitorPhone}
                  onChange={(e) => setVisitorPhone(e.target.value)}
                  placeholder="+234..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="visChurchMember"
                  checked={visitorIsMember}
                  onChange={(e) => setVisitorIsMember(e.target.checked)}
                  className="h-4 w-4 text-emerald-600 rounded border-slate-300"
                />
                <label htmlFor="visChurchMember" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Church Member (Visiting from another Stake/Mission)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowVisitorModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={visitorSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  {visitorSubmitting ? 'Recording...' : 'Record Visitor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
