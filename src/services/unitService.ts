import { supabase } from '../lib/supabase'
import type { StakeUnit, UserUnitAssignment } from '../types/database'

/**
 * Fetch all active stake units (wards and branches)
 */
export async function fetchStakeUnits(): Promise<StakeUnit[]> {
  const { data, error } = await supabase
    .from('stake_units')
    .select('*')
    .order('unit_name', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch stake units: ${error.message}`)
  }

  return data || []
}

export const fetchUnits = fetchStakeUnits

/**
 * Assign an authorized user to a stake unit.
 * Validated by database trigger trg_validate_unit_assignment
 */
export async function assignUserToUnit(
  userId: string,
  unitId: string,
  assignedRole: 'bishop' | 'branch_president' | 'ysa_leader'
): Promise<{ success: boolean; data?: UserUnitAssignment; error?: string }> {
  const { data, error } = await supabase
    .from('user_unit_assignments')
    .insert([
      {
        user_id: userId,
        unit_id: unitId,
        assigned_role: assignedRole,
      },
    ])
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  // Audit log entry
  await supabase.from('audit_logs').insert([
    {
      action: 'ASSIGN_USER_UNIT',
      target_record_id: data.id,
      target_table: 'user_unit_assignments',
      outcome: 'success',
      metadata: { userId, unitId, assignedRole },
    },
  ])

  return { success: true, data }
}

/**
 * Revoke a user's unit assignment
 */
export async function revokeUserUnitAssignment(
  assignmentId: string,
  userId: string,
  unitId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('user_unit_assignments')
    .delete()
    .eq('id', assignmentId)

  if (error) {
    return { success: false, error: error.message }
  }

  // Audit log entry
  await supabase.from('audit_logs').insert([
    {
      action: 'REVOKE_USER_UNIT',
      target_record_id: assignmentId,
      target_table: 'user_unit_assignments',
      outcome: 'success',
      metadata: { userId, unitId },
    },
  ])

  return { success: true }
}
