import React from 'react'
import { useAuth } from '../context/AuthContext'
import { Shield, Building2, Calendar, FileText, CheckCircle2 } from 'lucide-react'

export const DashboardOverview: React.FC = () => {
  const { profile, roles } = useAuth()

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 rounded-2xl p-6 sm:p-8 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-700/60 rounded-full text-xs font-semibold uppercase tracking-wider text-emerald-100 mb-3 border border-emerald-600/50">
              <Shield className="w-3.5 h-3.5" />
              Obantoko Stake YSA AMS • Phase 1
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome, {profile?.full_name || 'Leader'}
            </h1>
            <p className="text-emerald-200 text-sm mt-1 max-w-xl">
              A secure, role-governed platform establishing administrative hierarchy, stake units, and access controls for the Abeokuta Nigeria Obantoko Stake.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <span
                key={r}
                className="px-3 py-1 bg-white/10 backdrop-blur-xs rounded-lg text-xs font-medium border border-white/20 capitalize"
              >
                {r.replace('_', ' ')}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Foundational Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Security & RLS Enforced</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Row-Level Security (RLS) is active across all application tables. Role authorization is strictly verified in the database engine.
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Unit Scoping Active</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Wards and branches are isolated. Bishops are bound to wards, branch presidents to branches, and YSA leaders to assigned units.
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Append-Only Audit Trail</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            All role changes, status modifications, and unit assignments generate immutable audit entries protected by database triggers.
          </p>
        </div>
      </div>

      {/* Future Modules Road-Map Notice */}
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="w-5 h-5 text-slate-500" />
          <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">
            Upcoming Modules (Phase 2 & Phase 3)
          </h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Per Phase 1 execution directive, attendance gathering and statistical reporting modules will be connected to this verified foundation in subsequent phases.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
            <div className="font-semibold text-slate-700">YSA Sunday Attendance Capture</div>
            <div className="text-slate-400 mt-0.5">Phase 2 Planned</div>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
            <div className="font-semibold text-slate-700">Stake & Ward Activity Registration</div>
            <div className="text-slate-400 mt-0.5">Phase 2 Planned</div>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
            <div className="font-semibold text-slate-700">Executive Stake Analytics & Reports</div>
            <div className="text-slate-400 mt-0.5">Phase 3 Planned</div>
          </div>
        </div>
      </div>
    </div>
  )
}
