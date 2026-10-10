import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { DashboardOverview } from './DashboardOverview'
import { UserManagement } from './UserManagement'
import { StakeUnitsView } from './StakeUnitsView'
import { AuditLogsView } from './AuditLogsView'
import { 
  Shield, 
  Users, 
  Building2, 
  FileText, 
  LayoutDashboard, 
  LogOut, 
  Menu, 
  X,
  AlertOctagon
} from 'lucide-react'

export const AuthenticatedShell: React.FC = () => {
  const { profile, roles, isAdmin, isStakePresidency, isDeactivated, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'units' | 'audit'>('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-3">
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
            <nav className="hidden md:flex items-center space-x-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-2 ${
                  activeTab === 'dashboard'
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>

              {isAdmin && (
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-2 ${
                    activeTab === 'users'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Users & Roles
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => setActiveTab('units')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-2 ${
                    activeTab === 'units'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Stake Units
                </button>
              )}

              {(isAdmin || isStakePresidency) && (
                <button
                  onClick={() => setActiveTab('audit')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-2 ${
                    activeTab === 'audit'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Audit Trail
                </button>
              )}
            </nav>

            {/* User Profile Info & Sign Out */}
            <div className="hidden md:flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-bold text-slate-800 leading-tight">
                  {profile?.full_name || 'Authorized Member'}
                </div>
                <div className="text-xs text-emerald-700 capitalize font-medium">
                  {roles.length > 0 ? roles.join(', ').replace(/_/g, ' ') : 'Member'}
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
            <div className="flex md:hidden items-center">
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
          <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1">
            <button
              onClick={() => {
                setActiveTab('dashboard')
                setMobileMenuOpen(false)
              }}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
            {isAdmin && (
              <button
                onClick={() => {
                  setActiveTab('users')
                  setMobileMenuOpen(false)
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Users & Roles
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => {
                  setActiveTab('units')
                  setMobileMenuOpen(false)
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                Stake Units
              </button>
            )}
            {(isAdmin || isStakePresidency) && (
              <button
                onClick={() => {
                  setActiveTab('audit')
                  setMobileMenuOpen(false)
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Audit Trail
              </button>
            )}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-800">{profile?.full_name}</div>
                <div className="text-xs text-emerald-700">{roles.join(', ')}</div>
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
        {activeTab === 'dashboard' && <DashboardOverview />}
        {activeTab === 'users' && isAdmin && <UserManagement />}
        {activeTab === 'units' && isAdmin && <StakeUnitsView />}
        {activeTab === 'audit' && (isAdmin || isStakePresidency) && <AuditLogsView />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        Abeokuta Nigeria Obantoko Stake — Young Single Adult Attendance Management System • Phase 1 Core
      </footer>
    </div>
  )
}
