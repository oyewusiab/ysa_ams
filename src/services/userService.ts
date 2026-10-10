import { supabase } from '../lib/supabase'
import type { UserProfile, UserRole, UserUnitAssignment, RoleName } from '../types/database'

export interface UserWithDetails extends UserProfile {
  roles: UserRole[]
  unit_assignments: (UserUnitAssignment & { stake_unit?: { unit_name: string; unit_type: string } })[]
}

/**
 * Fetch full profile, roles, and unit assignments for a user.
 */
export async function fetchUserProfileWithRoles(userId: string): Promise<UserWithDetails | null> {
  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (profileErr || !profile) {
    return null
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userId)

  const { data: assignments } = await supabase
    .from('user_unit_assignments')
    .select(`
      *,
      stake_unit:stake_units (
        unit_name,
        unit_type
      )
    `)
    .eq('user_id', userId)

  return {
    ...profile,
    roles: roles || [],
    unit_assignments: assignments || [],
  }
}

/**
 * Assign or revoke a user role via secure database RPC.
 */
export async function manageUserRoleRPC(
  targetUserId: string,
  roleName: RoleName,
  operation: 'assign' | 'revoke'
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('manage_user_role', {
    p_target_user_id: targetUserId,
    p_role_name: roleName,
    p_operation: operation,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, ...data }
}

/**
 * Update user account status (active / deactivated) via secure database RPC.
 */
export async function updateUserAccountStatusRPC(
  targetUserId: string,
  newStatus: 'active' | 'deactivated'
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('update_user_account_status', {
    p_target_user_id: targetUserId,
    p_new_status: newStatus,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, ...data }
}

/**
 * Call bootstrap RPC for the initial system administrator.
 */
export async function bootstrapInitialAdminRPC(): Promise<{ success: boolean; message?: string; error?: string }> {
  const { data, error } = await supabase.rpc('bootstrap_initial_admin')

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, ...data }
}

/**
 * Resolve username or email securely for authentication
 */
export async function resolveAuthIdentifierRPC(identifier: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('resolve_auth_identifier', {
      p_identifier: identifier
    })
    if (error) throw error
    return data
  } catch (err) {
    // If identifier contains @, fallback to it directly
    if (identifier.includes('@')) return identifier.toLowerCase().trim()
    return null
  }
}

/**
 * Admin provisioning for leadership accounts
 */
export async function adminProvisionUserRPC(params: {
  fullName: string
  email: string
  username?: string
  roleName: RoleName
  assignedUnitId?: string
  mustChangePassword?: boolean
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const { data, error } = await supabase.rpc('admin_provision_user', {
    p_full_name: params.fullName,
    p_email: params.email,
    p_username: params.username || null,
    p_role_name: params.roleName,
    p_assigned_unit_id: params.assignedUnitId || null,
    p_initial_must_change_password: params.mustChangePassword ?? true
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, ...data }
}

/**
 * Mark first-login password change completed
 */
export async function completeFirstLoginPasswordChangeRPC(): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('complete_first_login_password_change')
  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true, ...data }
}
