import { supabase } from '../lib/supabase'
import type { 
  Activity, 
  ActivitySession, 
  AttendanceRecord, 
  SessionVisitor,
  SessionReopeningRequest,
  AttendanceCorrection 
} from '../types/database'

// 1. ACTIVITIES (TEMPLATES)
export async function fetchActivities(): Promise<Activity[]> {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*, creator_profile:user_profiles!created_by(full_name)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('fetchActivities fallback to mock data:', err)
    return getMockActivities()
  }
}

export async function createActivity(activity: Partial<Activity>): Promise<Activity> {
  let createdBy = activity.created_by

  // If created_by is missing or is the placeholder string 'current-user', resolve authenticated user
  if (!createdBy || createdBy === 'current-user') {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      throw new Error('Authentication required: Unable to resolve authenticated user session.')
    }

    // Verify user profile exists and is active in public.user_profiles
    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('id, account_status')
      .eq('id', authData.user.id)
      .single()

    if (profileErr || !profile) {
      throw new Error('Authorization error: Authenticated staff user profile not found.')
    }

    if (profile.account_status !== 'active') {
      throw new Error('Authorization error: Account is deactivated.')
    }

    createdBy = authData.user.id
  }

  // Validate that createdBy is a valid UUID (RFC 4122 v1-v5 or general 36-char hex UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(createdBy)) {
    throw new Error(`Invalid identity syntax: "${createdBy}" is not a valid user UUID.`)
  }

  const { data, error } = await supabase
    .from('activities')
    .insert([{
      ...activity,
      created_by: createdBy
    }])
    .select('*, creator_profile:user_profiles!created_by(full_name)')
    .single()

  if (error) throw error
  return data
}

// 2. ACTIVITY SESSIONS
export async function fetchSessions(activityId?: string): Promise<ActivitySession[]> {
  try {
    let query = supabase
      .from('activity_sessions')
      .select('*, activity:activities(*), initiator_profile:user_profiles!initiated_by(full_name), closer_profile:user_profiles!closed_by(full_name)')
      .order('session_date', { ascending: false })

    if (activityId) {
      query = query.eq('activity_id', activityId)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('fetchSessions fallback to mock data:', err)
    return getMockSessions()
  }
}

export async function createSession(sessionData: Partial<ActivitySession>): Promise<ActivitySession> {
  const { data, error } = await supabase
    .from('activity_sessions')
    .insert([{
      ...sessionData,
      enable_time_in: sessionData.enable_time_in ?? false,
      status: 'draft',
      timezone: 'Africa/Lagos'
    }])
    .select('*, activity:activities(*)')
    .single()

  if (error) throw error
  return data
}

// 3. SESSION LIFE CYCLE RPCs

// Generate unambiguous 6-character random alphanumeric attendance code (e.g. 5BV21F)
export function generateSessionAttendanceCode(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  let code = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < 6; i++) {
      code += alphabet[bytes[i] % alphabet.length]
    }
  } else {
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
  }
  return code
}

// Initiate attendance session with cryptographic code & terminal limit
export async function initiateSession(
  sessionId: string,
  code: string,
  maxTerminals: number,
  expiryMinutes: number = 240
): Promise<{ success: boolean; session_id: string; status: string; expires_at: string }> {
  const cleanCode = code.trim().toUpperCase()
  const { data, error } = await supabase.rpc('initiate_attendance_session', {
    p_session_id: sessionId,
    p_code: cleanCode,
    p_max_terminals: maxTerminals,
    p_expiry_minutes: expiryMinutes
  })

  if (error) throw new Error(error.message)
  return data
}

// Close session
export async function closeSession(sessionId: string): Promise<{ success: boolean; session_id: string }> {
  const { data, error } = await supabase.rpc('close_attendance_session', {
    p_session_id: sessionId
  })

  if (error) throw new Error(error.message)
  return data
}

// 4. ATTENDANCE MONITORING
export async function fetchSessionAttendance(sessionId: string): Promise<{
  records: AttendanceRecord[]
  visitors: SessionVisitor[]
}> {
  try {
    const [attRes, visRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('*, member:members(*), recorded_unit:stake_units(*)')
        .eq('session_id', sessionId)
        .order('check_in_time', { ascending: false }),
      supabase
        .from('session_visitors')
        .select('*, inviting_unit:stake_units!inviting_unit_id(*)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
    ])

    if (attRes.error) throw attRes.error
    if (visRes.error) throw visRes.error

    return {
      records: attRes.data || [],
      visitors: visRes.data || []
    }
  } catch (err) {
    console.warn('fetchSessionAttendance fallback:', err)
    return { records: [], visitors: [] }
  }
}

/**
 * Fetch lightweight attendance count totals for session card summary.
 */
export async function fetchSessionAttendanceTotals(sessionId: string): Promise<{
  memberCount: number
  visitorCount: number
  totalCount: number
}> {
  try {
    const [attRes, visRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId),
      supabase
        .from('session_visitors')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
    ])

    const memberCount = attRes.count || 0
    const visitorCount = visRes.count || 0
    return {
      memberCount,
      visitorCount,
      totalCount: memberCount + visitorCount
    }
  } catch (err) {
    return { memberCount: 0, visitorCount: 0, totalCount: 0 }
  }
}

// 5. REOPENING & CORRECTIONS
export async function requestReopening(sessionId: string, reason: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_session_reopening', {
    p_session_id: sessionId,
    p_reason: reason
  })

  if (error) throw new Error(error.message)
  return data?.request_id
}

export async function fetchReopeningRequests(): Promise<SessionReopeningRequest[]> {
  try {
    const { data, error } = await supabase
      .from('session_reopening_requests')
      .select('*, session:activity_sessions(*), requester_profile:user_profiles!requested_by(full_name), decision_maker_profile:user_profiles!decision_by(full_name)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (err) {
    return []
  }
}

export async function decideReopening(
  requestId: string,
  decision: 'approved' | 'rejected',
  reopenMinutes: number = 60
): Promise<{ success: boolean; status: string }> {
  const { data, error } = await supabase.rpc('decide_session_reopening', {
    p_request_id: requestId,
    p_decision: decision,
    p_reopen_minutes: reopenMinutes
  })

  if (error) throw new Error(error.message)
  return data
}

export async function correctAttendance(
  attendanceId: string,
  correctionType: 'remove_attendance' | 'unit_reassignment',
  reason: string,
  newUnitId?: string
): Promise<{ success: boolean; action: string }> {
  const { data, error } = await supabase.rpc('correct_attendance_record', {
    p_attendance_id: attendanceId,
    p_correction_type: correctionType,
    p_reason: reason,
    p_new_unit_id: newUnitId || null
  })

  if (error) throw new Error(error.message)
  return data
}

export async function fetchCorrections(sessionId?: string): Promise<AttendanceCorrection[]> {
  try {
    let query = supabase
      .from('attendance_corrections')
      .select('*, corrector_profile:user_profiles(full_name)')
      .order('created_at', { ascending: false })

    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    return []
  }
}

// Mock fallback activities
export function getMockActivities(): Activity[] {
  return [
    {
      id: 'act-1',
      title: 'Stake YSA Institute & Devotional',
      description: 'Weekly Stake Young Single Adult Scripture Study & Fellowship Devotional.',
      category: 'spiritual',
      default_participating_units: null,
      eligibility_rule: 'all_ysa',
      visitor_registration_default: true,
      created_by: 'admin-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      creator_profile: { full_name: 'Stake YSA Presidency' }
    },
    {
      id: 'act-2',
      title: 'Obantoko Stake YSA Sports Fest',
      description: 'Stake-wide volleyball, football, and fellowship games at Abeokuta Sports Complex.',
      category: 'sports',
      default_participating_units: null,
      eligibility_rule: 'all_ysa',
      visitor_registration_default: true,
      created_by: 'admin-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      creator_profile: { full_name: 'Stake YSA Committee' }
    }
  ]
}

export function getMockSessions(): ActivitySession[] {
  return [
    {
      id: 'sess-1',
      activity_id: 'act-1',
      session_title: 'Stake YSA Institute — Doctrine & Covenants',
      session_date: new Date().toISOString().split('T')[0],
      start_time: '17:00:00',
      scheduled_end_time: '19:30:00',
      timezone: 'Africa/Lagos',
      status: 'draft',
      participating_units: null,
      eligibility_rule: 'all_ysa',
      visitor_registration_enabled: true,
      max_terminals: 2,
      code_expires_at: null,
      initiated_by: null,
      initiated_at: null,
      closed_by: null,
      closed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      activity: getMockActivities()[0]
    }
  ]
}
