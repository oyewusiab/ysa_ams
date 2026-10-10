import { supabase } from '../lib/supabase'

export interface TerminalSessionInfo {
  session_id: string
  session_title: string
  session_date: string
  terminal_id: string
  terminal_token: string
  visitor_enabled: boolean
  reconnected: boolean
}

const TERMINAL_AUTH_KEY = 'ysa_ams_terminal_credentials'

export async function authorizeTerminalWithCode(
  sessionCode: string,
  terminalLabel: string
): Promise<TerminalSessionInfo> {
  // Check if we have an existing cached token for reconnect
  const cached = getStoredTerminalAuth()
  const existingToken = cached?.terminal_token || null

  const { data, error } = await supabase.rpc('authorize_terminal', {
    p_session_code: sessionCode.trim().toUpperCase(),
    p_terminal_label: terminalLabel.trim() || 'Attendance Terminal',
    p_existing_terminal_token: existingToken
  })

  if (error) {
    throw new Error(error.message)
  }

  const result: TerminalSessionInfo = data
  // Persist locally for seamless reconnects
  saveTerminalAuth(result)
  return result
}

export async function recordAttendanceFromTerminal(
  sessionId: string,
  memberId: string,
  terminalToken: string
): Promise<{ success: boolean; attendance_id: string; member_name: string; check_in_time: string }> {
  const { data, error } = await supabase.rpc('record_member_attendance', {
    p_session_id: sessionId,
    p_member_id: memberId,
    p_terminal_token: terminalToken
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function recordVisitorFromTerminal(
  sessionId: string,
  fullName: string,
  phone: string | null,
  homeLocation: string | null,
  isChurchMember: boolean,
  terminalToken: string
): Promise<{ success: boolean; visitor_id: string; full_name: string }> {
  const { data, error } = await supabase.rpc('record_visitor_attendance', {
    p_session_id: sessionId,
    p_full_name: fullName.trim(),
    p_contact_phone: phone?.trim() || null,
    p_home_location: homeLocation?.trim() || null,
    p_is_church_member: isChurchMember,
    p_terminal_token: terminalToken
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export function saveTerminalAuth(info: TerminalSessionInfo): void {
  try {
    sessionStorage.setItem(TERMINAL_AUTH_KEY, JSON.stringify(info))
  } catch (e) {
    console.warn('Could not save terminal credentials in sessionStorage:', e)
  }
}

export function getStoredTerminalAuth(): TerminalSessionInfo | null {
  try {
    const raw = sessionStorage.getItem(TERMINAL_AUTH_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TerminalSessionInfo
  } catch (e) {
    return null
  }
}

export function clearTerminalAuth(): void {
  try {
    sessionStorage.removeItem(TERMINAL_AUTH_KEY)
  } catch (e) {
    // Ignore
  }
}
