import React from 'react'
import { useAuth } from '../context/AuthContext'
import { Shield, Settings, Key, User, CheckCircle2 } from 'lucide-react'
import { formatRoleName, formatUserRoles } from '../types/database'

export const SettingsView: React.FC = () => {
  const { profile, roles, user } = useAuth()

  return (
    <div className="space-y-6">
      {/* Settings Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">System & Account Settings</h1>
            <p className="text-xs text-slate-500">
              Manage your profile preferences, security posture, and configuration for Obantoko Stake AMS.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-800">Account Profile</h2>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 font-medium block">Full Name</span>
              <span className="font-semibold text-slate-800">{profile?.full_name || 'Authorized Leader'}</span>
            </div>

            <div>
              <span className="text-xs text-slate-500 font-medium block">Email Address</span>
              <span className="font-semibold text-slate-800">{profile?.email || user?.email || 'N/A'}</span>
            </div>

            <div>
              <span className="text-xs text-slate-500 font-medium block">Account Status</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 capitalize">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {profile?.account_status || 'Active'}
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-500 font-medium block">Assigned Roles</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {roles.length > 0 ? (
                  roles.map((r) => (
                    <span
                      key={r}
                      className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium border border-slate-200"
                    >
                      {formatRoleName(r)}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">{formatUserRoles(roles)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* System Environment & Security Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Shield className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-800">Environment & Security</h2>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 font-medium block">Stake Jurisdiction</span>
              <span className="font-semibold text-slate-800">Abeokuta Nigeria Obantoko Stake</span>
            </div>

            <div>
              <span className="text-xs text-slate-500 font-medium block">Official System Timezone</span>
              <span className="font-semibold text-slate-800">Africa/Lagos (UTC+1 / West Africa Time)</span>
            </div>

            <div>
              <span className="text-xs text-slate-500 font-medium block">Row-Level Security (RLS)</span>
              <span className="font-semibold text-emerald-700">Enforced on all tables & functions</span>
            </div>

            <div>
              <span className="text-xs text-slate-500 font-medium block">Security Architecture</span>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                Cryptographic session code hash verification with active terminal limits (1–10).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
