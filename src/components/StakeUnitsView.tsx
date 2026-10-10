import React, { useEffect, useState } from 'react'
import { fetchStakeUnits } from '../services/unitService'
import { supabase } from '../lib/supabase'
import type { StakeUnit } from '../types/database'
import { Building2, Plus, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'

export const StakeUnitsView: React.FC = () => {
  const [units, setUnits] = useState<StakeUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [unitName, setUnitName] = useState('')
  const [unitType, setUnitType] = useState<'ward' | 'branch'>('ward')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadUnits = async () => {
    setLoading(true)
    try {
      const data = await fetchStakeUnits()
      setUnits(data)
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load units', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUnits()
  }, [])

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      const { error } = await supabase.from('stake_units').insert([
        {
          unit_name: unitName.trim(),
          unit_type: unitType,
          is_active: true,
        },
      ])

      if (error) throw error

      setMessage({ text: `Successfully added ${unitName} (${unitType})`, type: 'success' })
      setUnitName('')
      setShowAddForm(false)
      await loadUnits()
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create unit', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-700" />
            Stake Units (Wards & Branches)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure wards and branches of Abeokuta Nigeria Obantoko Stake.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {showAddForm ? 'Close Form' : 'Add Unit'}
          </button>
          <button
            onClick={loadUnits}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            title="Refresh Units"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 border ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-red-50 border-red-300 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-sm font-medium">{message.text}</div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4">
            Create Stake Unit
          </h3>
          <form onSubmit={handleAddUnit} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Obantoko 3rd Ward"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-emerald-600 focus:border-emerald-600 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Type</label>
              <select
                value={unitType}
                onChange={(e: any) => setUnitType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-emerald-600 focus:border-emerald-600 bg-white"
              >
                <option value="ward">Ward</option>
                <option value="branch">Branch</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {submitting ? 'Creating...' : 'Save Unit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Units Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-700" />
            Loading stake units...
          </div>
        ) : units.length === 0 ? (
          <div className="col-span-full py-8 text-center text-slate-500">
            No stake units recorded yet.
          </div>
        ) : (
          units.map((u) => (
            <div
              key={u.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-colors flex items-center justify-between"
            >
              <div>
                <h4 className="font-bold text-slate-900 text-base">{u.unit_name}</h4>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${
                      u.unit_type === 'ward'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {u.unit_type}
                  </span>
                  <span className="text-xs text-slate-400">
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <Building2 className="w-8 h-8 text-emerald-600/40" />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
