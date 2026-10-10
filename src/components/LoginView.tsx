import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { bootstrapInitialAdminRPC } from '../services/userService'
import { Shield, Lock, Mail, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'

export const LoginView: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [bootstrapLoading, setBootstrapLoading] = useState(false)
  const [bootstrapResult, setBootstrapResult] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        })
        if (error) throw error
        setSuccessMsg('Account created successfully. Check your email or sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication error')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    if (!email) {
      setErrorMsg('Please enter your email address to request a password reset.')
      return
    }
    setErrorMsg(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw error
      setSuccessMsg('Password reset link sent to your email address.')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send password reset email.')
    } finally {
      setLoading(false)
    }
  }

  const handleBootstrap = async () => {
    setBootstrapLoading(true)
    setBootstrapResult(null)
    setErrorMsg(null)
    try {
      const res = await bootstrapInitialAdminRPC()
      if (!res.success) {
        throw new Error(res.error || 'Bootstrap failed')
      }
      setBootstrapResult(res.message || 'System administrator initialized! Please reload.')
      window.location.reload()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to bootstrap initial administrator.')
    } finally {
      setBootstrapLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-emerald-700 rounded-2xl flex items-center justify-center shadow-lg text-white">
            <Shield className="w-10 h-10" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          Abeokuta Nigeria Obantoko Stake
        </h2>
        <p className="mt-2 text-center text-sm text-emerald-800 font-medium">
          YSA Attendance Management System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border border-slate-200">
          {errorMsg && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded text-sm text-emerald-700 flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>{successMsg}</div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Full Name</label>
                <div className="mt-1">
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Elder / Sister Full Name"
                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-emerald-600 focus:border-emerald-600 sm:text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">Email Address</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="leader@obantokostake.org"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-emerald-600 focus:border-emerald-600 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-emerald-600 focus:border-emerald-600 sm:text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                {isSignUp ? 'Already registered? Sign in' : 'First time? Create account'}
              </button>

              {!isSignUp && (
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Forgot password?
                </button>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-600 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : isSignUp ? (
                  'Register Account'
                ) : (
                  'Sign In to AMS'
                )}
              </button>
            </div>
          </form>

          {/* Secure One-time Administrator Bootstrap Tool */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="bg-emerald-50/60 p-4 rounded-lg border border-emerald-100">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-900 mb-1">
                First-Time System Initialization
              </h4>
              <p className="text-xs text-slate-600 mb-3">
                If the database has zero registered administrators, you may claim initial system administrator setup after signing in.
              </p>
              <button
                type="button"
                onClick={handleBootstrap}
                disabled={bootstrapLoading}
                className="w-full inline-flex items-center justify-center px-3 py-2 border border-emerald-600 text-xs font-medium rounded text-emerald-800 bg-white hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
              >
                {bootstrapLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
                ) : (
                  <Shield className="w-4 h-4 mr-1.5 text-emerald-700" />
                )}
                Bootstrap Initial System Admin (If Zero Admins)
              </button>
              {bootstrapResult && (
                <p className="mt-2 text-xs text-emerald-700 font-medium">{bootstrapResult}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
