import React from 'react'
import { useAuth } from '../context/AuthContext'
import { Shield, Calendar, FileText, CheckCircle2, Smartphone } from 'lucide-react'
import { formatRoleName } from '../types/database'

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
              Obantoko Stake YSA AMS • Core Attendance Active
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome, {profile?.full_name || 'Leader'}
            </h1>
            <p className="text-emerald-200 text-sm mt-1 max-w-xl">
              A secure, role-governed platform establishing administrative hierarchy, stake units, activity scheduling, attendance terminals, and access controls for the Abeokuta Nigeria Obantoko Stake.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <span
                key={r}
                className="px-3 py-1 bg-white/10 backdrop-blur-xs rounded-lg text-xs font-medium border border-white/20 capitalize"
              >
                {formatRoleName(r)}
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
            PostgreSQL Row-Level Security (RLS) is active across all tables. Role authorization is strictly verified in the database engine, preventing direct API privilege escalations.
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Attendance Engine Active</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Attendance sessions support terminal authorization, rate-limited cryptographic codes, fast attendee check-ins, visitor capture, and duplicate submission guards.
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Audited Reopening & Logs</h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Closed sessions require formal Stake Presidency or Administrator reopening authorization. Attendance adjustments preserve immutable audit trails.
          </p>
        </div>
      </div>

      {/* Module Implementation Status & Next Phase Roadmap */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="w-5 h-5 text-emerald-700" />
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
            System Modules & Readiness Status
          </h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Status overview of core architectural components, attendance capture engines, and forthcoming reporting modules:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Phase 1 Modules */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Authentication & Roles</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">VERIFIED</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Supabase Auth, initial admin bootstrap, role assignments, unit isolation.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Stake Unit Management</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">VERIFIED</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Wards and branches configured with role assignment constraints.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Append-Only Audit Trail</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">VERIFIED</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Database trigger protection against updates/deletions on audit logs.
            </p>
          </div>

          {/* Phase 2 Modules */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">YSA Member Register</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">IMPLEMENTED</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Member registry, ward/branch scoping, safe CSV import.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Activity & Session Engine</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">IMPLEMENTED</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Activity templates, session scheduling, Africa/Lagos timezone.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Terminal Authorization</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">IMPLEMENTED</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Session codes, server-side terminal limits (1–10), token reconnects.
            </p>
          </div>

          {/* Phase 2.1 Modules */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Zero-Account Public Form</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">IMPLEMENTED</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Public mobile attendance, name autocomplete, unit & non-member rules.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Controlled Provisioning</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">IMPLEMENTED</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              No public leader signups, `/la` portal, username authentication.
            </p>
          </div>

          {/* Phase 3 Complete Reporting & Analytics */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Stake Analytics & Registers</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">IMPLEMENTED</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              Monthly attendance registers, ward/branch performance, CSV/XLSX/PDF exports.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
