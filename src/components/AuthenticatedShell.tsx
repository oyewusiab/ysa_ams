import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { DashboardOverview } from './DashboardOverview'
import { UserManagement } from './UserManagement'
import { StakeUnitsView } from './StakeUnitsView'
import { AuditLogsView } from './AuditLogsView'
import { MemberManagementView } from './MemberManagementView'
import { ActivityManagementView } from './ActivityManagementView'
import { AttendanceTerminalView } from './AttendanceTerminalView'
import { ReopeningApprovalsView } from './ReopeningApprovalsView'
import { AttendanceReportsView } from './AttendanceReportsView'
import { UnitReportsView } from './UnitReportsView'
import { StakeAnalyticsDashboard } from './StakeAnalyticsDashboard'
import { SettingsView } from './SettingsView'
import { 
  Shield, 
  Users, 
  Building2, 
  FileText, 
  LayoutDashboard, 
  LogOut, 
  Menu, 
  X,
  AlertOctagon,
  Calendar,
  UserCheck,
  RotateCcw,
  BarChart3,
  ClipboardList,
  Settings,
  AlertCircle
} from 'lucide-react'
import { formatUserRoles } from '../types/database'

export type LeadershipRoute = 
  | 'dashboard' 
  | 'activities' 
  | 'terminal' 
  | 'ysa-register' 
  | 'reports'
  | 'unit-reports'
  | 'analytics'
  | 'reopening' 
  | 'users' 
  | 'units' 
  | 'audit-logs'
  | 'settings'

interface AuthenticatedShellProps {
  currentSubpath?: string
  onNavigate?: (path: string) => void
}

export const AuthenticatedShell: React.FC<AuthenticatedShellProps> = ({
  currentSubpath = 'dashboard',
  onNavigate
}) => {
  const { profile, roles, isAdmin, isStakePresidency, isYsaLeader, isBishop, isBranchPresident, isDeactivated, signOut } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Map incoming URL subpath to route
  const normalizeRoute = (subpath: string): { route: LeadershipRoute; isKnown: boolean } => {
    const clean = subpath.replace(/^\/+|\/+$/g, '').toLowerCase() || 'dashboard'
    
    // Legacy support / alias mappings
    if (clean === 'dashboard') return { route: 'dashboard', isKnown: true }
    if (clean === 'activities') return { route: 'activities', isKnown: true }
    if (clean === 'terminal') return { route: 'terminal', isKnown: true }
    if (clean === 'ysa-register' || clean === 'members') return { route: 'ysa-register', isKnown: true }
    if (clean === 'reports') return { route: 'reports', isKnown: true }
    if (clean === 'unit-reports') return { route: 'unit-reports', isKnown: true }
    if (clean === 'analytics') return { route: 'analytics', isKnown: true }
    if (clean === 'reopening') return { route: 'reopening', isKnown: true }
    if (clean === 'users') return { route: 'users', isKnown: true }
    if (clean === 'units') return { route: 'units', isKnown: true }
    if (clean === 'audit-logs' || clean === 'audit') return { route: 'audit-logs', isKnown: true }
    if (clean === 'settings') return { route: 'settings', isKnown: true }

    return { route: 'dashboard', isKnown: false }
  }

  const { route: activeRoute, isKnown: isKnownRoute } = normalizeRoute(currentSubpath)

  const navigateTo = (path: string) => {
    setMobileMenuOpen(false)
    if (onNavigate) {
      onNavigate(path)
    } else {
      window.history.pushState({}, '', path)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }

  if (isDeactivated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-8 text-center border border-rose-200">
          <div className="w-16 h-16 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertOctagon className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Account Deactivated</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Your account in the Abeokuta Nigeria Obantoko Stake YSA AMS has been deactivated by a system administrator.
          </p>
          <button
            onClick={signOut}
            className="w-full py-2.5 px-4 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // Permission capabilities
  const canManageActivities = isAdmin || isStakePresidency || isYsaLeader
  const canViewMembers = isAdmin || isStakePresidency || isYsaLeader || isBishop || isBranchPresident
  const canApproveReopen = isAdmin || isStakePresidency
  const canViewAudit = isAdmin || isStakePresidency
  const canViewAnalytics = isAdmin || isStakePresidency
  const canManageUsers = isAdmin
  const canManageUnits = isAdmin

  // Verify access for active route
  const checkAccess = (): { allowed: boolean; message?: string } => {
    if (!isKnownRoute) {
      return { allowed: false, message: `The requested path "/la/${currentSubpath}" was not found.` }
    }
    if (activeRoute === 'activities' && !canManageActivities) {
      return { allowed: false, message: 'You do not have permission to manage activity definitions.' }
    }
    if (activeRoute === 'ysa-register' && !canViewMembers) {
      return { allowed: false, message: 'You do not have permission to view the YSA member register.' }
    }
    if (activeRoute === 'unit-reports' && !canViewMembers) {
      return { allowed: false, message: 'You do not have permission to view unit reports.' }
    }
    if (activeRoute === 'analytics' && !canViewAnalytics) {
      return { allowed: false, message: 'Stake analytics is restricted to Stake Presidency and Administrators.' }
    }
    if (activeRoute === 'reopening' && !canApproveReopen) {
      return { allowed: false, message: 'Session reopening approval is restricted to Stake Presidency and Administrators.' }
    }
    if (activeRoute === 'users' && !canManageUsers) {
      return { allowed: false, message: 'User and role provisioning is restricted to System Administrators.' }
    }
    if (activeRoute === 'units' && !canManageUnits) {
      return { allowed: false, message: 'Stake unit management is restricted to System Administrators.' }
    }
    if (activeRoute === 'audit-logs' && !canViewAudit) {
      return { allowed: false, message: 'Audit trail inspection is restricted to Stake Presidency and Administrators.' }
    }
    return { allowed: true }
  }

  const access = checkAccess()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div 
              onClick={() => navigateTo('/la/dashboard')}
              className="flex items-center gap-3 cursor-pointer"
            >
              <div className="w-9 h-9 bg-emerald-700 rounded-lg flex items-center justify-center text-white shadow-xs">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-base leading-tight block">
                  Obantoko Stake
                </span>
                <span className="text-xs text-emerald-800 font-semibold block">
                  YSA Attendance Management
                </span>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center space-x-1">
              <a
                href="/la/dashboard"
                onClick={(e) => { e.preventDefault(); navigateTo('/la/dashboard') }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeRoute === 'dashboard'
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </a>

              {canManageActivities && (
                <a
                  href="/la/activities"
                  onClick={(e) => { e.preventDefault(); navigateTo('/la/activities') }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    activeRoute === 'activities'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  Activities
                </a>
              )}

              {canViewMembers && (
                <a
                  href="/la/ysa-register"
                  onClick={(e) => { e.preventDefault(); navigateTo('/la/ysa-register') }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    activeRoute === 'ysa-register'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  YSA Register
                </a>
              )}

              <a
                href="/la/reports"
                onClick={(e) => { e.preventDefault(); navigateTo('/la/reports') }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeRoute === 'reports'
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <ClipboardList className="w-4 h-4 text-emerald-700" />
                Reports
              </a>

              {canViewMembers && (
                <a
                  href="/la/unit-reports"
                  onClick={(e) => { e.preventDefault(); navigateTo('/la/unit-reports') }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    activeRoute === 'unit-reports'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-emerald-700" />
                  Unit Reports
                </a>
              )}

              {canViewAnalytics && (
                <a
                  href="/la/analytics"
                  onClick={(e) => { e.preventDefault(); navigateTo('/la/analytics') }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    activeRoute === 'analytics'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 text-emerald-700" />
                  Stake Analytics
                </a>
              )}

              {canApproveReopen && (
                <a
                  href="/la/reopening"
                  onClick={(e) => { e.preventDefault(); navigateTo('/la/reopening') }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    activeRoute === 'reopening'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                  Reopening
                </a>
              )}

              {canManageUsers && (
                <a
                  href="/la/users"
                  onClick={(e) => { e.preventDefault(); navigateTo('/la/users') }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    activeRoute === 'users'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Users
                </a>
              )}

              {canManageUnits && (
                <a
                  href="/la/units"
                  onClick={(e) => { e.preventDefault(); navigateTo('/la/units') }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    activeRoute === 'units'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Units
                </a>
              )}

              {canViewAudit && (
                <a
                  href="/la/audit-logs"
                  onClick={(e) => { e.preventDefault(); navigateTo('/la/audit-logs') }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    activeRoute === 'audit-logs'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Audit
                </a>
              )}

              <a
                href="/la/settings"
                onClick={(e) => { e.preventDefault(); navigateTo('/la/settings') }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeRoute === 'settings'
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Settings className="w-4 h-4" />
                Settings
              </a>
            </nav>

            {/* User Profile Info & Sign Out */}
            <div className="hidden lg:flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-bold text-slate-800 leading-tight">
                  {profile?.full_name || 'Authorized Member'}
                </div>
                <div className="text-xs text-emerald-700 capitalize font-medium">
                  {formatUserRoles(roles)}
                </div>
              </div>
              <button
                onClick={signOut}
                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile menu trigger */}
            <div className="flex lg:hidden items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-slate-600 hover:text-slate-900 rounded-md"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu panel */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1">
            <button
              onClick={() => navigateTo('/la/dashboard')}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
            {canManageActivities && (
              <button
                onClick={() => navigateTo('/la/activities')}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Activities
              </button>
            )}
            {canViewMembers && (
              <button
                onClick={() => navigateTo('/la/ysa-register')}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <UserCheck className="w-4 h-4" />
                YSA Register
              </button>
            )}
            <button
              onClick={() => navigateTo('/la/reports')}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
            >
              <ClipboardList className="w-4 h-4 text-emerald-700" />
              Attendance Reports
            </button>
            {canViewMembers && (
              <button
                onClick={() => navigateTo('/la/unit-reports')}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <Building2 className="w-4 h-4 text-emerald-700" />
                Unit Reports
              </button>
            )}
            {canViewAnalytics && (
              <button
                onClick={() => navigateTo('/la/analytics')}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4 text-emerald-700" />
                Stake Analytics
              </button>
            )}
            {canApproveReopen && (
              <button
                onClick={() => navigateTo('/la/reopening')}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-amber-600" />
                Reopening & Corrections
              </button>
            )}
            {canManageUsers && (
              <button
                onClick={() => navigateTo('/la/users')}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Users & Roles
              </button>
            )}
            {canManageUnits && (
              <button
                onClick={() => navigateTo('/la/units')}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                Stake Units
              </button>
            )}
            {canViewAudit && (
              <button
                onClick={() => navigateTo('/la/audit-logs')}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Audit Trail
              </button>
            )}
            <button
              onClick={() => navigateTo('/la/settings')}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-800">{profile?.full_name}</div>
                <div className="text-xs text-emerald-700">{formatUserRoles(roles)}</div>
              </div>
              <button
                onClick={signOut}
                className="px-3 py-1.5 bg-rose-50 text-rose-700 rounded text-xs font-semibold"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!access.allowed ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-lg mx-auto shadow-xs">
            <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              {!isKnownRoute ? 'Page Not Found' : 'Access Restricted'}
            </h2>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              {access.message}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => navigateTo('/la/dashboard')}
                className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeRoute === 'dashboard' && <DashboardOverview onNavigate={navigateTo} />}
            {activeRoute === 'activities' && <ActivityManagementView />}
            {activeRoute === 'terminal' && <AttendanceTerminalView />}
            {activeRoute === 'ysa-register' && <MemberManagementView />}
            {activeRoute === 'reports' && <AttendanceReportsView />}
            {activeRoute === 'unit-reports' && <UnitReportsView />}
            {activeRoute === 'analytics' && <StakeAnalyticsDashboard />}
            {activeRoute === 'reopening' && <ReopeningApprovalsView />}
            {activeRoute === 'users' && <UserManagement />}
            {activeRoute === 'units' && <StakeUnitsView />}
            {activeRoute === 'audit-logs' && <AuditLogsView />}
            {activeRoute === 'settings' && <SettingsView />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        Abeokuta Nigeria Obantoko Stake — Young Single Adult Attendance Management System
      </footer>
    </div>
  )
}
