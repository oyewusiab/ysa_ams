import { supabase } from '../lib/supabase'
import type { Member } from '../types/database'

export async function fetchMembers(unitId?: string, search?: string): Promise<Member[]> {
  try {
    let query = supabase
      .from('members')
      .select('*, stake_unit:stake_units(*)')
      .order('full_name', { ascending: true })

    if (unitId) {
      query = query.eq('home_unit_id', unitId)
    }

    if (search && search.trim().length > 0) {
      query = query.ilike('full_name', `%${search.trim()}%`)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('fetchMembers falling back to mock test register:', err)
    return getMockMembers(unitId, search)
  }
}

export async function createMember(memberData: Partial<Member>): Promise<Member> {
  const { data, error } = await supabase
    .from('members')
    .insert([memberData])
    .select('*, stake_unit:stake_units(*)')
    .single()

  if (error) throw error
  return data
}

export async function updateMember(id: string, updates: Partial<Member>): Promise<Member> {
  const { data, error } = await supabase
    .from('members')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, stake_unit:stake_units(*)')
    .single()

  if (error) throw error
  return data
}

export async function importMembersFromCsv(csvText: string, defaultUnitId: string): Promise<{ imported: number; errors: string[] }> {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) {
    throw new Error('CSV file must have a header row and at least one member row.')
  }

  const errors: string[] = []
  const newMembers: Partial<Member>[] = []

  // Simple CSV parser supporting: full_name, gender, phone, email, member_number
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
    if (!row[0] || row[0].length < 2) continue

    const fullName = row[0]
    const gender = (row[1]?.toLowerCase() === 'female' ? 'female' : row[1]?.toLowerCase() === 'male' ? 'male' : null) as 'male' | 'female' | null
    const phone = row[2] || null
    const email = row[3] || null
    const memberNumber = row[4] || null

    newMembers.push({
      full_name: fullName,
      gender,
      phone_number: phone,
      email,
      member_number: memberNumber,
      home_unit_id: defaultUnitId,
      is_active: true
    })
  }

  if (newMembers.length === 0) {
    return { imported: 0, errors: ['No valid member records found in CSV.'] }
  }

  const { data, error } = await supabase.from('members').insert(newMembers).select()
  if (error) {
    throw new Error(error.message)
  }

  return { imported: data?.length || 0, errors }
}

// Fictional test members representing the Abeokuta Obantoko Stake
export function getMockMembers(unitId?: string, search?: string): Member[] {
  const mock: Member[] = [
    {
      id: 'mem-101',
      member_number: 'YSA-001',
      full_name: 'Babajide Adeleke',
      preferred_name: 'Jide',
      gender: 'male',
      phone_number: '+234 802 123 4567',
      email: 'jide.adeleke@example.test',
      home_unit_id: 'unit-1',
      is_active: true,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stake_unit: { id: 'unit-1', unit_name: 'Obantoko 1st Ward', unit_type: 'ward', is_active: true, created_at: '', updated_at: '' }
    },
    {
      id: 'mem-102',
      member_number: 'YSA-002',
      full_name: 'Oluchi Nwachukwu',
      preferred_name: 'Oluchi',
      gender: 'female',
      phone_number: '+234 803 234 5678',
      email: 'oluchi.n@example.test',
      home_unit_id: 'unit-2',
      is_active: true,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stake_unit: { id: 'unit-2', unit_name: 'Obantoko 2nd Ward', unit_type: 'ward', is_active: true, created_at: '', updated_at: '' }
    },
    {
      id: 'mem-103',
      member_number: 'YSA-003',
      full_name: 'Emmanuel Adeyemi',
      preferred_name: 'Emma',
      gender: 'male',
      phone_number: '+234 805 345 6789',
      email: 'emma.adeyemi@example.test',
      home_unit_id: 'unit-3',
      is_active: true,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stake_unit: { id: 'unit-3', unit_name: 'Asero Ward', unit_type: 'ward', is_active: true, created_at: '', updated_at: '' }
    },
    {
      id: 'mem-104',
      member_number: 'YSA-004',
      full_name: 'Funmilayo Balogun',
      preferred_name: 'Funmi',
      gender: 'female',
      phone_number: '+234 807 456 7890',
      email: 'funmi.balogun@example.test',
      home_unit_id: 'unit-5',
      is_active: true,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stake_unit: { id: 'unit-5', unit_name: 'Alabata Branch', unit_type: 'branch', is_active: true, created_at: '', updated_at: '' }
    },
    {
      id: 'mem-105',
      member_number: 'YSA-005',
      full_name: 'Kehinde Ogundipe',
      preferred_name: 'Kenny',
      gender: 'male',
      phone_number: '+234 810 567 8901',
      email: 'kenny.o@example.test',
      home_unit_id: 'unit-6',
      is_active: true,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stake_unit: { id: 'unit-6', unit_name: 'Odeda Branch', unit_type: 'branch', is_active: true, created_at: '', updated_at: '' }
    }
  ]

  let filtered = mock
  if (unitId) {
    filtered = filtered.filter(m => m.home_unit_id === unitId)
  }
  if (search && search.trim().length > 0) {
    const s = search.toLowerCase()
    filtered = filtered.filter(m => m.full_name.toLowerCase().includes(s) || m.preferred_name?.toLowerCase().includes(s))
  }
  return filtered
}
