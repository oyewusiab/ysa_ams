import React, { useState, useEffect } from 'react'
import { 
  Users, 
  UserPlus, 
  Upload, 
  Search, 
  Building2, 
  Phone, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw 
} from 'lucide-react'
import { fetchMembers, createMember, updateMember, importMembersFromCsv } from '../services/memberService'
import { fetchUnits } from '../services/unitService'
import type { Member, StakeUnit } from '../types/database'

export const MemberManagementView: React.FC = () => {
  const [members, setMembers] = useState<Member[]>([])
  const [units, setUnits] = useState<StakeUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedUnit, setSelectedUnit] = useState<string>('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // New member form
  const [newFullName, setNewFullName] = useState('')
  const [newPreferredName, setNewPreferredName] = useState('')
  const [newGender, setNewGender] = useState<'male' | 'female'>('male')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newUnitId, setNewUnitId] = useState('')
  const [newMemberNumber, setNewMemberNumber] = useState('')

  // CSV Import state
  const [csvContent, setCsvContent] = useState('')
  const [importUnitId, setImportUnitId] = useState('')

  const loadData = async () => {
    setLoading(true)
    setActionError(null)
    try {
      const [membersData, unitsData] = await Promise.all([
        fetchMembers(selectedUnit || undefined, search),
        fetchUnits()
      ])
      setMembers(membersData)
      setUnits(unitsData)
      if (unitsData.length > 0 && !newUnitId) {
        setNewUnitId(unitsData[0].id)
        setImportUnitId(unitsData[0].id)
      }
    } catch (err: any) {
      setActionError(err.message || 'Error loading member registry')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedUnit, search])

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionError(null)
    try {
      await createMember({
        full_name: newFullName.trim(),
        preferred_name: newPreferredName.trim() || null,
        gender: newGender,
        phone_number: newPhone.trim() || null,
        email: newEmail.trim() || null,
        home_unit_id: newUnitId,
        member_number: newMemberNumber.trim() || null,
        is_active: true
      })
      setActionSuccess(`Added ${newFullName} to registry.`)
      setShowAddModal(false)
      setNewFullName('')
      setNewPreferredName('')
      setNewPhone('')
      setNewEmail('')
      setNewMemberNumber('')
      loadData()
    } catch (err: any) {
      setActionError(err.message || 'Failed to create member record')
    }
  }

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionError(null)
    try {
      const res = await importMembersFromCsv(csvContent, importUnitId)
      setActionSuccess(`Successfully imported ${res.imported} YSA members.`)
      setShowImportModal(false)
      setCsvContent('')
      loadData()
    } catch (err: any) {
      setActionError(err.message || 'CSV Import failed')
    }
  }

  const toggleStatus = async (member: Member) => {
    try {
      await updateMember(member.id, { is_active: !member.is_active })
      setActionSuccess(`Updated status for ${member.full_name}`)
      loadData()
    } catch (err: any) {
      setActionError(err.message || 'Failed to update member status')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-700" />
            YSA Member Register
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Maintain stake-wide Young Single Adults, ward/branch assignments, and attendance records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            Import CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            Add Member
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search member name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="w-full sm:w-56 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">All Wards & Branches</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unit_name} ({u.unit_type})
              </option>
            ))}
          </select>

          <button
            onClick={loadData}
            title="Refresh"
            className="p-2 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Member Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Member Details</th>
                <th className="px-6 py-3">Home Unit</th>
                <th className="px-6 py-3">Contact</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-700" />
                    Loading YSA register...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No members found matching your search.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{m.full_name}</div>
                      <div className="text-xs text-slate-500">
                        {m.member_number ? `#${m.member_number} • ` : ''}
                        {m.gender || 'Not specified'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                        <Building2 className="w-3 h-3 text-slate-500" />
                        {m.stake_unit?.unit_name || 'Assigned Unit'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs space-y-0.5">
                      {m.phone_number && (
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {m.phone_number}
                        </div>
                      )}
                      {m.email && (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Mail className="w-3 h-3 text-slate-400" />
                          {m.email}
                        </div>
                      )}
                      {!m.phone_number && !m.email && (
                        <span className="text-slate-400 italic">No contact provided</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          m.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => toggleStatus(m)}
                        className="text-xs text-slate-600 hover:text-emerald-700 font-medium cursor-pointer"
                      >
                        {m.is_active ? 'Set Inactive' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Add YSA Member</h3>
            <p className="text-xs text-slate-500 mb-4">
              Register a Young Single Adult in the Obantoko Stake registry.
            </p>

            <form onSubmit={handleCreateMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name (Surname First) *
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="e.g. Adeleke Babajide"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Preferred Name
                  </label>
                  <input
                    type="text"
                    value={newPreferredName}
                    onChange={(e) => setNewPreferredName(e.target.value)}
                    placeholder="e.g. Jide"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value as 'male' | 'female')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Home Ward / Branch *
                </label>
                <select
                  required
                  value={newUnitId}
                  onChange={(e) => setNewUnitId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_name} ({u.unit_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+234..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Member Number</label>
                  <input
                    type="text"
                    value={newMemberNumber}
                    onChange={(e) => setNewMemberNumber(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 cursor-pointer shadow-xs"
                >
                  Save Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Import YSA Register (CSV)</h3>
            <p className="text-xs text-slate-500 mb-3">
              Format: <code className="bg-slate-100 px-1 py-0.5 rounded text-emerald-800">full_name, gender, phone, email, member_number</code>
            </p>

            <form onSubmit={handleCsvImport} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default Target Unit *
                </label>
                <select
                  required
                  value={importUnitId}
                  onChange={(e) => setImportUnitId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_name} ({u.unit_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CSV Content
                </label>
                <textarea
                  required
                  rows={6}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  placeholder={`full_name,gender,phone,email,member_number\nAdeleke Babajide,male,+2348021234567,jide@example.test,YSA001\nNwachukwu Oluchi,female,+2348032345678,oluchi@example.test,YSA002`}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 cursor-pointer shadow-xs"
                >
                  Run Import
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
