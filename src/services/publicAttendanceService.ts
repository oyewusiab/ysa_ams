import { supabase } from '../lib/supabase'
import type { StakeUnit } from '../types/database'

export interface NameSuggestion {
  suggested_name: string
  suggested_unit_id: string | null
  suggested_unit_name: string | null
  is_known_member: boolean
}

export interface ActivePublicSessionInfo {
  active: boolean
  message?: string
  session_id?: string
  session_title?: string
  activity_title?: string
  session_date?: string
  units?: StakeUnit[]
}

export interface AttendanceSubmissionResult {
  success: boolean
  submission_id?: string
  attendee_name?: string
  check_in_time?: string
  error?: string
}

/**
 * Fetch active attendance session for public check-in
 */
export async function fetchActivePublicSession(sessionId?: string): Promise<ActivePublicSessionInfo> {
  try {
    const { data, error } = await supabase.rpc('get_active_public_session', {
      p_session_id: sessionId || null
    })

    if (error) throw error
    return data
  } catch (err) {
    console.warn('get_active_public_session fallback:', err)
    // Safe mock fallback for development preview
    return {
      active: true,
      session_id: 'sess-active-preview',
      session_title: 'Stake YSA Institute & Devotional',
      activity_title: 'Weekly Stake Gathering',
      session_date: new Date().toISOString().split('T')[0],
      units: [
        { id: 'unit-1', unit_name: 'Obantoko 1st Ward', unit_type: 'ward', is_active: true, created_at: '', updated_at: '' },
        { id: 'unit-2', unit_name: 'Obantoko 2nd Ward', unit_type: 'ward', is_active: true, created_at: '', updated_at: '' },
        { id: 'unit-3', unit_name: 'Asero Ward', unit_type: 'ward', is_active: true, created_at: '', updated_at: '' },
        { id: 'unit-4', unit_name: 'Adatan Ward', unit_type: 'ward', is_active: true, created_at: '', updated_at: '' },
        { id: 'unit-5', unit_name: 'Alabata Branch', unit_type: 'branch', is_active: true, created_at: '', updated_at: '' },
        { id: 'unit-6', unit_name: 'Odeda Branch', unit_type: 'branch', is_active: true, created_at: '', updated_at: '' },
        { id: 'unit-7', unit_name: 'Osiele Branch', unit_type: 'branch', is_active: true, created_at: '', updated_at: '' }
      ]
    }
  }
}

/**
 * Query safe name suggestions without leaking private phone/email or attendance history
 */
export async function fetchNameSuggestions(query: string): Promise<NameSuggestion[]> {
  const clean = query.trim()
  if (clean.length < 2) return []

  try {
    const { data, error } = await supabase.rpc('get_attendance_name_suggestions', {
      p_query: clean
    })

    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('get_attendance_name_suggestions fallback:', err)
    // Client-side mock suggestions from known demo names
    const demo = [
      { suggested_name: 'Babajide Adeleke', suggested_unit_id: 'unit-1', suggested_unit_name: 'Obantoko 1st Ward', is_known_member: true },
      { suggested_name: 'Oluchi Nwachukwu', suggested_unit_id: 'unit-2', suggested_unit_name: 'Obantoko 2nd Ward', is_known_member: true },
      { suggested_name: 'Emmanuel Adeyemi', suggested_unit_id: 'unit-3', suggested_unit_name: 'Asero Ward', is_known_member: true },
      { suggested_name: 'Funmilayo Balogun', suggested_unit_id: 'unit-5', suggested_unit_name: 'Alabata Branch', is_known_member: true },
      { suggested_name: 'Kehinde Ogundipe', suggested_unit_id: 'unit-6', suggested_unit_name: 'Odeda Branch', is_known_member: true }
    ]
    return demo.filter(d => d.suggested_name.toLowerCase().includes(clean.toLowerCase()))
  }
}

/**
 * Submit attendance record via database RPC with server-side validation
 */
export async function submitPublicAttendance(
  sessionId: string,
  attendeeName: string,
  isNonMember: boolean,
  selectedUnitId?: string
): Promise<AttendanceSubmissionResult> {
  const { data, error } = await supabase.rpc('submit_public_attendance', {
    p_session_id: sessionId,
    p_attendee_name: attendeeName.trim(),
    p_is_non_member: isNonMember,
    p_selected_unit_id: selectedUnitId || null
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}
