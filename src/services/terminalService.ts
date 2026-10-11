import { supabase } from '../lib/supabase'

export interface TerminalSessionInfo {
  session_id: string
  session_title: string
  session_date: string
  terminal_id: string
  terminal_token: string
  visitor_enabled: boolean
  enable_time_in?: boolean
  reconnected: boolean
}

const TERMINAL_AUTH_KEY = 'ysa_ams_terminal_credentials'

/**
 * Authorize or re-authenticate an attendance terminal using the 6-character session attendance code.
 * Tied to the validated session and subject to atomic concurrent terminal limit.
 */
export async function authorizeTerminalWithCode(
  sessionCode: string,
  terminalLabel: string = 'Attendance Terminal'
): Promise<TerminalSessionInfo> {
  const cleanCode = sessionCode.trim().toUpperCase()
  if (!cleanCode || cleanCode.length < 4) {
    throw new Error('Please enter a valid session attendance code.')
  }

  // Check if we have an existing cached token for reconnect
  const cached = getStoredTerminalAuth()
  const existingToken = cached?.terminal_token || null

  const { data, error } = await supabase.rpc('authorize_terminal', {
    p_session_code: cleanCode,
    p_terminal_label: terminalLabel.trim() || 'Attendance Terminal',
    p_existing_terminal_token: existingToken
  })

  if (error) {
    throw new Error(error.message)
  }

  const result: TerminalSessionInfo = data
  saveTerminalAuth(result)
  return result
}

/**
 * Send heartbeat to maintain server-side terminal lease.
 * Prevents active tabs from expiring while releasing abandoned tabs.
 */
export async function sendTerminalHeartbeat(terminalToken: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('heartbeat_terminal_lease', {
      p_terminal_token: terminalToken
    })
    if (error || !data?.success) {
      return false
    }
    return true
  } catch (err) {
    return false
  }
}

/**
 * Explicitly release the terminal authorization on logout or tab exit.
 */
export async function releaseTerminal(terminalToken: string): Promise<void> {
  try {
    await supabase.rpc('release_terminal', {
      p_terminal_token: terminalToken
    })
  } catch (e) {
    // Ignore network drop on unload
  } finally {
    clearTerminalAuth()
  }
}

/**
 * Record attendance for a registered YSA member using authorized terminal token.
 */
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

/**
 * Record attendance for a visitor or non-member guest using authorized terminal token,
 * with optional inviting unit association.
 */
export async function recordVisitorFromTerminal(
  sessionId: string,
  fullName: string,
  phone: string | null,
  homeLocation: string | null,
  isChurchMember: boolean,
  terminalToken: string,
  invitingUnitId?: string | null
): Promise<{ success: boolean; visitor_id: string; full_name: string; check_in_time: string }> {
  const { data, error } = await supabase.rpc('record_visitor_attendance', {
    p_session_id: sessionId,
    p_full_name: fullName.trim(),
    p_contact_phone: phone?.trim() || null,
    p_home_location: homeLocation?.trim() || null,
    p_is_church_member: isChurchMember,
    p_terminal_token: terminalToken,
    p_inviting_unit_id: invitingUnitId || null
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
