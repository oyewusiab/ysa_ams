import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  manageUserRoleRPC,
  updateUserAccountStatusRPC,
  adminProvisionUserRPC,
  provisionLeaderEdgeFunction,
  type UserWithDetails,
} from '../services/userService'
import { fetchStakeUnits, assignUserToUnit, revokeUserUnitAssignment } from '../services/unitService'
import type { StakeUnit, RoleName } from '../types/database'
import { Users, Building2, CheckCircle2, AlertCircle, RefreshCw, X, UserPlus, Eye, EyeOff, Key } from 'lucide-react'

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserWithDetails[]>([])
  const [units, setUnits] = useState<StakeUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Provisioning modal state
  const [showProvisionModal, setShowProvisionModal] = useState(false)
  const [provFullName, setProvFullName] = useState('')
  const [provEmail, setProvEmail] = useState('')
  const [provUsername, setProvUsername] = useState('')
  const [provRole, setProvRole] = useState<RoleName>('ysa_leader')
  const [provUnitId, setProvUnitId] = useState('')
  const [provMustChangePassword, setProvMustChangePassword] = useState(true)
  const [provTempPassword, setProvTempPassword] = useState('ObantokoYSA2026!')
  const [showTempPassword, setShowTempPassword] = useState(false)

  // Unit assignment modal state
  const [assignmentModalUser, setAssignmentModalUser] = useState<UserWithDetails | null>(null)
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [selectedRoleForUnit, setSelectedRoleForUnit] = useState<'bishop' | 'branch_president' | 'ysa_leader'>('ysa_leader')

  const loadData = async () => {
    setLoading(true)
    try {
      const [unitsData, { data: profiles, error: pErr }, { data: rolesData }, { data: assignmentsData }] = await Promise.all([
        fetchStakeUnits(),
        supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('*'),
        supabase.from('user_unit_assignments').select('*, stake_unit:stake_units(unit_name, unit_type)'),
      ])

      if (pErr) throw pErr

      setUnits(unitsData)

      const usersCombined: UserWithDetails[] = (profiles || []).map((p: any) => ({
        ...p,
        roles: (rolesData || []).filter((r: any) => r.user_id === p.id),
        unit_assignments: (assignmentsData || []).filter((a: any) => a.user_id === p.id),
      }))

      setUsers(usersCombined)
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to fetch user directory', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleToggleRole = async (targetUser: UserWithDetails, role: RoleName) => {
    const hasRole = targetUser.roles.some((r) => r.role_name === role)
    const op = hasRole ? 'revoke' : 'assign'

    if (op === 'revoke' && role === 'system_admin') {
      const confirmed = window.confirm(
        'Warning: Are you sure you want to revoke system administrator rights from this account?'
      )
      if (!confirmed) return
    }

    setActionLoading(`${targetUser.id}-${role}`)
    setActionMessage(null)

    try {
      const res = await manageUserRoleRPC(targetUser.id, role, op)
      if (!res.success) {
        throw new Error(res.error || 'Failed to update role')
      }
      setActionMessage({
        text: `Successfully ${op === 'assign' ? 'assigned' : 'revoked'} role "${role}" for ${targetUser.full_name}`,
        type: 'success',
      })
      await loadData()
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Role modification failed', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleToggleStatus = async (targetUser: UserWithDetails) => {
    const newStatus = targetUser.account_status === 'active' ? 'deactivated' : 'active'
    if (newStatus === 'deactivated') {
      const confirmed = window.confirm(
        `Are you sure you want to deactivate the account for ${targetUser.full_name}? They will lose application access immediately.`
      )
      if (!confirmed) return
    }

    setActionLoading(`${targetUser.id}-status`)
    setActionMessage(null)

    try {
      const res = await updateUserAccountStatusRPC(targetUser.id, newStatus)
      if (!res.success) {
        throw new Error(res.error || 'Failed to update status')
      }
      setActionMessage({
        text: `Account for ${targetUser.full_name} is now ${newStatus}.`,
        type: 'success',
      })
      await loadData()
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to update status', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleAssignUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignmentModalUser || !selectedUnitId) return

    setActionLoading('unit-assign')
    setActionMessage(null)

    try {
      const res = await assignUserToUnit(assignmentModalUser.id, selectedUnitId, selectedRoleForUnit)
      if (!res.success) {
        throw new Error(res.error || 'Unit assignment failed')
      }
      setActionMessage({
        text: `Assigned ${assignmentModalUser.full_name} to unit successfully.`,
        type: 'success',
      })
      setAssignmentModalUser(null)
      setSelectedUnitId('')
      await loadData()
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to assign unit', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleRevokeUnitAssignment = async (assignmentId: string, user: UserWithDetails, unitId: string) => {
    if (!window.confirm('Revoke this unit assignment?')) return

    setActionLoading(`revoke-unit-${assignmentId}`)
    setActionMessage(null)

    try {
      const res = await revokeUserUnitAssignment(assignmentId, user.id, unitId)
      if (!res.success) {
        throw new Error(res.error || 'Failed to revoke unit assignment')
      }
      setActionMessage({
        text: `Revoked unit assignment for ${user.full_name}.`,
        type: 'success',
      })
      await loadData()
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to revoke unit', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase()
    return (
      u.full_name.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q))
    )
  })

  const handleProvisionUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionMessage(null)
    setActionLoading('provision')

    try {
      const trimmedEmail = provEmail.trim().toLowerCase()
      const trimmedFullName = provFullName.trim()
      const trimmedUsername = provUsername.trim() || undefined
      const tempPass = provTempPassword.trim()

      if (!tempPass || tempPass.length < 8) {
        throw new Error('Temporary password must be at least 8 characters.')
      }

      // 1. Try invoking the secure provision-leader Edge Function
      const edgeRes = await provisionLeaderEdgeFunction({
        fullName: trimmedFullName,
        email: trimmedEmail,
        username: trimmedUsername,
        roleName: provRole,
        assignedUnitId: provUnitId || undefined,
        temporaryPassword: tempPass,
      })

      if (edgeRes.success) {
        const identifier = edgeRes.loginIdentifier || trimmedUsername || trimmedEmail
        setActionMessage({
          text: `Account for ${trimmedFullName} successfully provisioned and ready for login! User can log in immediately at /la using identifier "${identifier}".`,
          type: 'success',
        })
      } else {
        // If Edge function fails due to network/deployment, fall back to registering specification via RPC
        console.warn('Edge Function returned error, trying fallback to RPC specification:', edgeRes.error)
        const rpcRes = await adminProvisionUserRPC({
          fullName: trimmedFullName,
          email: trimmedEmail,
          username: trimmedUsername,
          roleName: provRole,
          assignedUnitId: provUnitId || undefined,
          mustChangePassword: provMustChangePassword,
        })

        if (!rpcRes.success) {
          throw new Error(edgeRes.error || rpcRes.error || 'Failed to provision leader account')
        }

        setActionMessage({
          text: `Specification registered for ${trimmedFullName} (${provRole}). Note: ${edgeRes.error || 'Edge function provision completed fallback'}.`,
          type: 'success',
        })
      }

      setShowProvisionModal(false)
      setProvFullName('')
      setProvEmail('')
      setProvUsername('')
      setProvUnitId('')
      setProvTempPassword('ObantokoYSA2026!')
      await loadData()
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Provisioning failed', type: 'error' })
    } finally {
      setActionLoading(null)
    }
  }

  const ALL_ROLES: RoleName[] = [
    'system_admin',
    'ysa_leader',
    'stake_presidency',
    'bishop',
    'branch_president',
  ]

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-700" />
            User & Role Management
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Centrally control role privileges, stake unit assignments, and account access.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowProvisionModal(true)}
            className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            Provision Leader
          </button>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-red-50 border-red-300 text-red-800'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-sm font-medium">{actionMessage.text}</div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3.5 text-left font-semibold text-slate-700">Member / Account</th>
                <th className="px-6 py-3.5 text-left font-semibold text-slate-700">Status</th>
                <th className="px-6 py-3.5 text-left font-semibold text-slate-700">Assigned Roles</th>
                <th className="px-6 py-3.5 text-left font-semibold text-slate-700">Unit Assignments</th>
                <th className="px-6 py-3.5 text-right font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-700" />
                    Loading user directory...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const userRoles = u.roles.map((r) => r.role_name)
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{u.full_name}</div>
                        <div className="text-xs text-slate-500">{u.email || 'No email registered'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            u.account_status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {u.account_status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {ALL_ROLES.map((role) => {
                            const isAssigned = userRoles.includes(role)
                            const isPendingAction = actionLoading === `${u.id}-${role}`
                            return (
                              <button
                                key={role}
                                onClick={() => handleToggleRole(u, role)}
                                disabled={Boolean(actionLoading)}
                                className={`text-xs px-2.5 py-1 rounded-md border font-medium cursor-pointer transition-colors ${
                                  isAssigned
                                    ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs'
                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                                } disabled:opacity-50`}
                                title={isAssigned ? `Revoke ${role}` : `Assign ${role}`}
                              >
                                {isPendingAction ? '...' : role.replace('_', ' ')}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {u.unit_assignments.map((ua) => (
                            <div
                              key={ua.id}
                              className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded border border-slate-200 mr-1 mb-1"
                            >
                              <Building2 className="w-3.5 h-3.5 text-emerald-700" />
                              <span>{ua.stake_unit?.unit_name || 'Unit'}</span>
                              <span className="text-slate-400">({ua.assigned_role})</span>
                              <button
                                onClick={() => handleRevokeUnitAssignment(ua.id, u, ua.unit_id)}
                                className="text-slate-400 hover:text-red-600 ml-1 cursor-pointer"
                                title="Revoke Unit Assignment"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => {
                              setAssignmentModalUser(u)
                              // Default unit role based on current user roles
                              if (userRoles.includes('bishop')) setSelectedRoleForUnit('bishop')
                              else if (userRoles.includes('branch_president')) setSelectedRoleForUnit('branch_president')
                              else setSelectedRoleForUnit('ysa_leader')
                            }}
                            className="block text-xs text-emerald-700 hover:underline mt-1 cursor-pointer"
                          >
                            + Assign Unit
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleToggleStatus(u)}
                          disabled={Boolean(actionLoading)}
                          className={`text-xs px-3 py-1.5 rounded font-medium border cursor-pointer ${
                            u.account_status === 'active'
                              ? 'text-rose-700 border-rose-300 hover:bg-rose-50'
                              : 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                          }`}
                        >
                          {u.account_status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unit Assignment Modal */}
      {assignmentModalUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-700" />
                Assign Ward or Branch
              </h3>
              <button
                onClick={() => setAssignmentModalUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Assigning <strong className="text-slate-700">{assignmentModalUser.full_name}</strong> to a stake unit. The database trigger will enforce that bishops must be assigned to wards and branch presidents to branches.
            </p>

            <form onSubmit={handleAssignUnit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Stake Unit
                </label>
                <select
                  required
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-emerald-600 focus:border-emerald-600"
                >
                  <option value="">Select Ward or Branch...</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.unit_name} ({unit.unit_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Role Capacity
                </label>
                <select
                  value={selectedRoleForUnit}
                  onChange={(e: any) => setSelectedRoleForUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-emerald-600 focus:border-emerald-600"
                >
                  <option value="ysa_leader">YSA Leader</option>
                  <option value="bishop">Bishop (Wards Only)</option>
                  <option value="branch_president">Branch President (Branches Only)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAssignmentModalUser(null)}
                  className="px-4 py-2 border border-slate-300 rounded-md text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'unit-assign'}
                  className="px-4 py-2 bg-emerald-700 text-white rounded-md text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading === 'unit-assign' ? 'Assigning...' : 'Save Unit Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Provisioning Modal */}
      {showProvisionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-700" />
                Provision Leader or Administrator Account
              </h3>
              <button
                onClick={() => setShowProvisionModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Securely provisions an authentication account, roles, and unit assignments entirely from this portal. No public registration is permitted.
            </p>

            <form onSubmit={handleProvisionUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Samuel Olaniyan"
                  value={provFullName}
                  onChange={(e) => setProvFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="user@domain.com"
                    value={provEmail}
                    onChange={(e) => setProvEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Username (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. solaniyan"
                    value={provUsername}
                    onChange={(e) => setProvUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Leadership Role *
                  </label>
                  <select
                    value={provRole}
                    onChange={(e: any) => setProvRole(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="ysa_leader">YSA Leader</option>
                    <option value="system_admin">System Administrator</option>
                    <option value="stake_presidency">Stake Presidency</option>
                    <option value="bishop">Bishop (Ward)</option>
                    <option value="branch_president">Branch President (Branch)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Assigned Unit
                  </label>
                  <select
                    value={provUnitId}
                    onChange={(e) => setProvUnitId(e.target.value)}
                    disabled={!['bishop', 'branch_president', 'ysa_leader'].includes(provRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">None / Stake-Wide</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_name} ({u.unit_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Temporary Password Field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-emerald-700" />
                    Initial Temporary Password *
                  </span>
                  <span className="text-[11px] text-slate-400 lowercase font-normal">(min 8 characters)</span>
                </label>
                <div className="relative">
                  <input
                    type={showTempPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={provTempPassword}
                    onChange={(e) => setProvTempPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder="Enter secure temporary password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTempPassword(!showTempPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showTempPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="mustChangeToggle"
                  checked={provMustChangePassword}
                  onChange={(e) => setProvMustChangePassword(e.target.checked)}
                  className="h-4 w-4 text-emerald-600 rounded border-slate-300 cursor-pointer"
                />
                <label htmlFor="mustChangeToggle" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Require password change on first successful login
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'provision'}
                  className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer shadow-xs flex items-center gap-2"
                >
                  {actionLoading === 'provision' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Provisioning...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Complete Provisioning
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
