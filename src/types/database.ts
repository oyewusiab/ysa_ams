// Application Database and Entity Types

export type StakeUnitType = 'ward' | 'branch'
export type AccountStatus = 'active' | 'deactivated' | 'pending'
export type RoleName = 
  | 'system_admin'
  | 'ysa_leader'
  | 'stake_presidency'
  | 'bishop'
  | 'branch_president'

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
