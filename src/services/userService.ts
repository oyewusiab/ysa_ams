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

  if (profileErr) {
    console.error(`fetchUserProfileWithRoles: profile lookup failed for user ${userId}:`, profileErr)
    return null
  }

  if (!profile) {
    console.warn(`fetchUserProfileWithRoles: no profile found for user ${userId}`)
    return null
  }

  const { data: roles, error: rolesErr } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userId)

  if (rolesErr) {
    console.error(`fetchUserProfileWithRoles: roles query error for user ${userId}:`, rolesErr)
  }

  const { data: assignments, error: assignmentsErr } = await supabase
    .from('user_unit_assignments')
    .select(`
      *,
      stake_unit:stake_units (
        unit_name,
        unit_type
      )
    `)
    .eq('user_id', userId)

  if (assignmentsErr) {
    console.error(`fetchUserProfileWithRoles: unit assignments query error for user ${userId}:`, assignmentsErr)
  }

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

/**
 * Phase 2.2: Complete Frontend Leader Provisioning via Supabase Edge Function
 * Invokes the secure 'provision-leader' Edge Function which uses Auth Admin API.
 * Caller JWT is verified server-side; service-role key is never exposed to the client.
 */
export async function provisionLeaderEdgeFunction(params: {
  fullName: string
  email: string
  username?: string
  roleName: RoleName
  assignedUnitId?: string
  temporaryPassword?: string
}): Promise<{
  success: boolean
  message?: string
  userId?: string
  email?: string
  username?: string
  loginIdentifier?: string
  error?: string
}> {
  try {
    const { data, error } = await supabase.functions.invoke('provision-leader', {
      body: {
        fullName: params.fullName,
        email: params.email,
        username: params.username || undefined,
        roleName: params.roleName,
        assignedUnitId: params.assignedUnitId || undefined,
        temporaryPassword: params.temporaryPassword || undefined,
      },
    })

    if (error) {
      console.warn('Edge function invoke error, inspecting response:', error)
      let detailedError = error.message

      // supabase-js FunctionsHttpError often attaches the response JSON in error.context
      if ((error as any).context && typeof (error as any).context.json === 'function') {
        try {
          const errBody = await (error as any).context.json()
          if (errBody && errBody.error) {
            detailedError = errBody.error
          }
        } catch (_) {
          // ignore json parse errors
        }
      }

      if (data && data.error) {
        return { success: false, error: data.error }
      }
      return { success: false, error: detailedError || 'Failed to invoke provision-leader function' }
    }

    if (data?.error) {
      return { success: false, error: data.error }
    }

    return {
      success: true,
      message: data?.message,
      userId: data?.userId,
      email: data?.email,
      username: data?.username,
      loginIdentifier: data?.loginIdentifier || data?.username || data?.email,
    }
  } catch (err: any) {
    console.error('provisionLeaderEdgeFunction exception:', err)
    return { success: false, error: err.message || 'Unexpected network error invoking provision-leader' }
  }
}
