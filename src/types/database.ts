// Application Database and Entity Types

export type StakeUnitType = 'ward' | 'branch'
export type AccountStatus = 'active' | 'deactivated' | 'pending'
export type RoleName = 
  | 'system_admin'
  | 'ysa_leader'
  | 'stake_presidency'
  | 'bishop'
  | 'branch_president'

export const ROLE_LABELS: Record<RoleName, string> = {
  system_admin: 'System Administrator',
  ysa_leader: 'YSA Leader',
  stake_presidency: 'Stake Presidency',
  bishop: 'Bishop',
  branch_president: 'Branch President',
}

export function formatRoleName(role: RoleName | string): string {
  if (role in ROLE_LABELS) {
    return ROLE_LABELS[role as RoleName]
  }
  return role.replace(/_/g, ' ')
}

export function formatUserRoles(roles: (RoleName | string)[]): string {
  if (!roles || roles.length === 0) return 'Member'
  return roles.map(r => formatRoleName(r)).join(', ')
}

export interface StakeUnit {
  id: string
  unit_name: string
  unit_type: StakeUnitType
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  full_name: string
  email: string | null
  username?: string | null
  must_change_password?: boolean
  account_status: AccountStatus
  created_at: string
  updated_at: string
  roles?: UserRole[]
  unit_assignments?: UserUnitAssignment[]
}

export interface UserRole {
  id: string
  user_id: string
  role_name: RoleName
  assigned_by: string | null
  created_at: string
  updated_at: string
}

export interface UserUnitAssignment {
  id: string
  user_id: string
  unit_id: string
  assigned_role: 'bishop' | 'branch_president' | 'ysa_leader'
  assigned_by: string | null
  created_at: string
  updated_at: string
  stake_unit?: StakeUnit
}

export interface AuditLog {
  id: string
  actor_id: string | null
  action: string
  target_record_id: string | null
  target_table: string | null
  outcome: 'success' | 'failure'
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
  actor_profile?: {
    full_name: string
    email: string | null
  }
}

// -----------------------------------------------------------------------------
// Phase 2 Types: Member Registry, Activities & Attendance Engine
// -----------------------------------------------------------------------------

export interface Member {
  id: string
  member_number: string | null
  full_name: string
  preferred_name: string | null
  gender: 'male' | 'female' | null
  phone_number: string | null
  email: string | null
  home_unit_id: string
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  stake_unit?: StakeUnit
}

export type ActivityCategory = 
  | 'spiritual'
  | 'social'
  | 'service'
  | 'sports'
  | 'temple'
  | 'educational'
  | 'other'

export type EligibilityRule = 'all_ysa' | 'specific_units' | 'custom_enrolled'

export interface Activity {
  id: string
  title: string
  description: string | null
  category: ActivityCategory
  default_participating_units: string[] | null
  eligibility_rule: EligibilityRule
  visitor_registration_default: boolean
  created_by: string
  created_at: string
  updated_at: string
  creator_profile?: {
    full_name: string
  }
}

export type SessionStatus = 'draft' | 'active' | 'closed'

export interface ActivitySession {
  id: string
  activity_id: string
  session_title: string
  session_date: string
  start_time: string
  scheduled_end_time: string | null
  timezone: string
  status: SessionStatus
  participating_units: string[] | null
  eligibility_rule: EligibilityRule
  visitor_registration_enabled: boolean
  max_terminals: number
  code_hash?: string | null
  code_expires_at: string | null
  initiated_by: string | null
  initiated_at: string | null
  closed_by: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  activity?: Activity
  initiator_profile?: { full_name: string }
  closer_profile?: { full_name: string }
}

export interface TerminalAuthorization {
  id: string
  session_id: string
  terminal_token_hash: string
  terminal_label: string
  authorized_ip: string | null
  user_agent: string | null
  is_revoked: boolean
  revoked_at: string | null
  revoked_by: string | null
  last_seen_at: string
  created_at: string
}

export type AttendanceStatus = 'present' | 'excused'

export interface AttendanceRecord {
  id: string
  session_id: string
  member_id: string
  recorded_unit_id: string
  attendance_status?: AttendanceStatus
  recorded_by_terminal_id: string | null
  marked_by_user: string | null
  check_in_time: string
  created_at: string
  updated_at: string
  member?: Member
  recorded_unit?: StakeUnit
}

// -----------------------------------------------------------------------------
// Phase 3 Types: Reporting, Registers, Unit Summaries & Analytics
// -----------------------------------------------------------------------------

export interface MonthlyRegisterMemberRow {
  member_id: string
  full_name: string
  preferred_name: string | null
  home_unit_id: string
  unit_name: string
  unit_type: StakeUnitType
  eligible_sessions_count: number
  attended_count: number
  excused_count: number
  absent_count: number
  attendance_percentage: number
  activity_statuses: Record<string, 'present' | 'excused' | 'absent' | 'ineligible'>
}

export interface UnitMonthlyReport {
  unit_id: string
  unit_name: string
  unit_type: StakeUnitType
  registered_ysa_count: number
  eligible_sessions_count: number
  total_attendance_instances: number
  total_absences: number
  total_excused: number
  overall_attendance_percentage: number
  previous_month_percentage: number | null
  percentage_change: number | null
  zero_attendance_members: { id: string; full_name: string }[]
  low_participation_activities: { session_id: string; title: string; session_date: string; attendance_count: number; percentage: number }[]
  member_rows: MonthlyRegisterMemberRow[]
}

export interface StakeAnalyticsSummary {
  reporting_year: number
  reporting_month: number
  total_registered_ysa: number
  active_units_count: number
  finalized_sessions_count: number
  pending_sessions_count: number
  total_attendance_instances: number
  total_excused_instances: number
  overall_attendance_percentage: number
  previous_month_overall_percentage: number | null
  pending_reopening_requests: number
  attendance_corrections_count: number
  unit_breakdown: {
    unit_id: string
    unit_name: string
    unit_type: StakeUnitType
    registered_ysa_count: number
    finalized_sessions_count: number
    attendance_count: number
    attendance_percentage: number
    zero_attendance_count: number
  }[]
  monthly_trends: {
    month_name: string
    year: number
    month: number
    attendance_count: number
    finalized_sessions_count: number
    attendance_percentage: number
  }[]
  category_breakdown: {
    category: ActivityCategory
    sessions_count: number
    attendance_count: number
  }[]
}

export interface MemberAttendanceHistoryItem {
  session_id: string
  session_title: string
  session_date: string
  category: ActivityCategory
  status: SessionStatus // 'draft' | 'active' | 'closed'
  attendance_status: 'present' | 'excused' | 'absent'
  recorded_unit_name: string
  recorded_unit_type: string
  check_in_time: string | null
}

export interface MemberAttendanceProfile {
  member: Member
  total_eligible_sessions: number
  total_attended: number
  total_excused: number
  total_absent: number
  overall_percentage: number
  history: MemberAttendanceHistoryItem[]
}

export interface SessionVisitor {
  id: string
  session_id: string
  full_name: string
  contact_phone: string | null
  home_location_or_stake: string | null
  is_church_member: boolean
  recorded_by_terminal_id: string | null
  created_at: string
}

export interface SessionReopeningRequest {
  id: string
  session_id: string
  requested_by: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  decision_by: string | null
  decision_reason: string | null
  decision_at: string | null
  reopen_until: string | null
  created_at: string
  requester_profile?: { full_name: string }
  decision_maker_profile?: { full_name: string }
  session?: ActivitySession
}

export interface AttendanceCorrection {
  id: string
  attendance_id: string | null
  session_id: string
  correction_type: 'remove_attendance' | 'unit_reassignment' | 'manual_add'
  previous_value: Record<string, unknown> | null
  corrected_value: Record<string, unknown> | null
  reason: string
  corrected_by: string
  created_at: string
  corrector_profile?: { full_name: string }
}
