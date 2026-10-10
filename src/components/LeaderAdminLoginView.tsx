import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { resolveAuthIdentifierRPC, completeFirstLoginPasswordChangeRPC } from '../services/userService'
import { Shield, Lock, User, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react'

interface Props {
  onSuccess?: () => void
}

export const LeaderAdminLoginView: React.FC<Props> = ({ onSuccess }) => {
  const [identifier, setIdentifier] = useState('') // Username or email
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // First-time password change prompt
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      // 1. Resolve username or email via secure RPC (no leaking whether account exists)
      const resolvedEmail = await resolveAuthIdentifierRPC(identifier)
      const loginEmail = resolvedEmail || identifier.trim().toLowerCase()

      // 2. Sign in with password
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      })

      if (error) {
        throw new Error('Invalid login credentials or account inactive.')
      }

      // 3. Check if user is required to change their temporary password
      if (data.user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('must_change_password')
          .eq('id', data.user.id)
          .single()

        if (profile?.must_change_password) {
          setMustChangePassword(true)
          setLoading(false)
          return
        }
      }

      if (onSuccess) onSuccess()
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setChangingPassword(true)
    try {
      // Update password via Supabase Auth
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (error) throw error

      // Update must_change_password flag
      await completeFirstLoginPasswordChangeRPC()

      setSuccessMsg('Password updated successfully. Accessing dashboard...')
      setMustChangePassword(false)
      if (onSuccess) onSuccess()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update password.')
    } finally {
      setChangingPassword(false)
    }
  }

  // Force Password Change Screen
  if (mustChangePassword) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-700">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-amber-100 text-amber-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Change Temporary Password</h2>
              <p className="text-xs text-slate-500 mt-1">
                You must update your temporary password before accessing the administrative portal.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password (min 8 characters)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <button
                type="submit"
                disabled={changingPassword}
                className="w-full py-2.5 bg-emerald-700 text-white rounded-xl text-sm font-bold hover:bg-emerald-800 transition-colors cursor-pointer shadow-md disabled:opacity-50"
              >
                {changingPassword ? 'Updating...' : 'Set Password & Continue'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-14 w-14 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg text-white">
            <Shield className="w-8 h-8" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold text-white tracking-tight">
          Leadership & Administration
        </h2>
        <p className="mt-1 text-center text-xs text-emerald-400 font-medium">
          Abeokuta Nigeria Obantoko Stake • Authorized Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username or Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="username or user@domain.com"
                  className="block w-full pl-10 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-600 cursor-pointer disabled:opacity-50 transition-colors"
            >
              {loading ? 'Authenticating...' : 'Sign In to Portal'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">
              Accounts are provisioned by the Stake System Administrator. Public leader registration is restricted.
            </p>
            <div className="mt-3">
              <a
                href="/"
                className="text-xs text-emerald-700 font-semibold hover:underline"
              >
                ← Return to Public Attendance Check-In
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
