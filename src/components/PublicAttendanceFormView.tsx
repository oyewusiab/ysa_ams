import React, { useState, useEffect, useRef } from 'react'
import { 
  fetchActivePublicSession, 
  fetchNameSuggestions, 
  submitPublicAttendance, 
  type ActivePublicSessionInfo,
  type NameSuggestion 
} from '../services/publicAttendanceService'
import { 
  CheckCircle2, 
  AlertCircle, 
  Building2, 
  User, 
  RefreshCw, 
  ShieldCheck, 
  Lock 
} from 'lucide-react'

export const PublicAttendanceFormView: React.FC = () => {
  const [sessionInfo, setSessionInfo] = useState<ActivePublicSessionInfo | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)

  // Form fields
  const [name, setName] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [isNonMember, setIsNonMember] = useState(false)

  // Autocomplete suggestions
  const [suggestions, setSuggestions] = useState<NameSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const suggestionBoxRef = useRef<HTMLDivElement>(null)

  // Submission feedback
  const [submitting, setSubmitting] = useState(false)
  const [submittedAttendee, setSubmittedAttendee] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // 1. Load active public session
  const loadSession = async () => {
    setLoadingSession(true)
    try {
      const data = await fetchActivePublicSession()
      setSessionInfo(data)
    } catch (err: any) {
      setErrorMessage('Could not connect to attendance service.')
    } finally {
      setLoadingSession(false)
    }
  }

  useEffect(() => {
    loadSession()
  }, [])

  // 2. Fetch name suggestions with debounce
  useEffect(() => {
    if (name.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const timer = setTimeout(async () => {
      setLoadingSuggestions(true)
      try {
        const results = await fetchNameSuggestions(name)
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
      } catch (err) {
        console.warn('Autocomplete fetch failed:', err)
      } finally {
        setLoadingSuggestions(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [name])

  // Handle suggestion selection
  const handleSelectSuggestion = (s: NameSuggestion) => {
    setName(s.suggested_name)
    if (s.suggested_unit_id && !isNonMember) {
      setSelectedUnitId(s.suggested_unit_id)
    }
    setShowSuggestions(false)
  }

  // Handle click outside suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 3. Submit Attendance
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!sessionInfo?.session_id) {
      setErrorMessage('No active session is currently open for attendance.')
      return
    }

    if (!name || name.trim().length < 2) {
      setErrorMessage('Please enter your full name (at least 2 characters).')
      return
    }

    // Conditionally require unit when NOT non-member
    if (!isNonMember && !selectedUnitId) {
      setErrorMessage('Please select your ward or branch, or check "Non-Member?".')
      return
    }

    setSubmitting(true)
    try {
      const res = await submitPublicAttendance(
        sessionInfo.session_id,
        name.trim(),
        isNonMember,
        isNonMember ? undefined : selectedUnitId
      )

      if (!res.success) {
        throw new Error(res.error || 'Submission failed.')
      }

      setSubmittedAttendee(res.attendee_name || name.trim())
      // Reset form
      setName('')
      setSelectedUnitId('')
      setIsNonMember(false)
      setShowSuggestions(false)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record attendance.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-emerald-700 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Loading Abeokuta Obantoko Stake YSA AMS...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-900 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <header className="max-w-md w-full mx-auto text-center pt-4 sm:pt-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-800/40 border border-emerald-600/30 rounded-full text-emerald-300 text-xs font-semibold mb-3">
          <ShieldCheck className="w-3.5 h-3.5" />
          Abeokuta Nigeria Obantoko Stake
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          {sessionInfo?.active ? `Welcome to ${sessionInfo.session_title}` : 'YSA Attendance Check-In'}
        </h1>
        <p className="text-xs sm:text-sm text-emerald-200/80 mt-1">
          {sessionInfo?.active 
            ? `Active Gathering • ${sessionInfo.session_date}`
            : 'No active gathering session at this time'}
        </p>
      </header>

      {/* Main Form Container */}
      <main className="max-w-md w-full mx-auto my-6">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-slate-100">
          {/* Success Banner */}
          {submittedAttendee && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 flex items-start gap-3 animate-in fade-in zoom-in-95">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">Attendance Recorded!</div>
                <div className="text-xs text-emerald-800 mt-0.5">
                  Thank you, <strong>{submittedAttendee}</strong>! Your attendance has been confirmed.
                </div>
                <button
                  type="button"
                  onClick={() => setSubmittedAttendee(null)}
                  className="mt-2 text-xs text-emerald-700 font-semibold hover:underline cursor-pointer"
                >
                  Mark Another Attendee →
                </button>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-300 rounded-2xl text-rose-900 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <div className="text-xs font-semibold">{errorMessage}</div>
            </div>
          )}

          {!sessionInfo?.active ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-base">Check-In Closed</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Attendance recording is not currently active. An authorized YSA leader will initiate the session shortly.
              </p>
              <button
                onClick={loadSession}
                className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 cursor-pointer"
              >
                Refresh Status
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name Field with Auto-Suggestions */}
              <div className="relative" ref={suggestionBoxRef}>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Enter your name..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    className="w-full pl-10 pr-4 py-3 text-base border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent font-medium text-slate-900 placeholder:text-slate-400"
                  />
                  {loadingSuggestions && (
                    <RefreshCw className="w-4 h-4 text-slate-400 animate-spin absolute right-3.5 top-3.5" />
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Matching Names (Click to select)
                    </div>
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(s)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50/60 transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <span className="text-xs font-bold text-slate-800">{s.suggested_name}</span>
                        {s.suggested_unit_name && (
                          <span className="text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            {s.suggested_unit_name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Unit Dropdown (Conditionally Required) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Unit {isNonMember ? <span className="text-slate-400 font-normal">(Optional)</span> : <span className="text-rose-500">*</span>}</span>
                  <span className="text-[11px] text-slate-400 font-normal">Ward or Branch</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    disabled={isNonMember}
                    className={`w-full pl-10 pr-4 py-3 text-sm border rounded-2xl appearance-none bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600 ${
                      isNonMember
                        ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                        : 'border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="">Select your ward or branch...</option>
                    {(sessionInfo.units || []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_name} ({u.unit_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Non-Member Checkbox */}
              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="nonMemberToggle"
                  checked={isNonMember}
                  onChange={(e) => {
                    setIsNonMember(e.target.checked)
                    if (e.target.checked) setSelectedUnitId('')
                  }}
                  className="h-4 w-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="nonMemberToggle" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                  Non-Member? (Guest or Friend of the Church)
                </label>
              </div>

              {/* Mark Attendance Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl text-sm font-bold tracking-wide transition-all shadow-lg hover:shadow-emerald-900/20 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Recording Attendance...
                  </>
                ) : (
                  'Mark Attendance'
                )}
              </button>
            </form>
          )}
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
            Leadership & Admin Portal (/la) →
          </a>
        </div>
      </footer>
    </div>
  )
}
