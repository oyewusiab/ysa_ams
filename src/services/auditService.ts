import { supabase } from '../lib/supabase'
import type { AuditLog } from '../types/database'

/**
 * Fetch audit logs (restricted to system_admin and stake_presidency via RLS)
 */
export async function fetchAuditLogs(limit = 50): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select(`
      *,
      actor_profile:user_profiles (
        full_name,
        email
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to load audit logs: ${error.message}`)
  }

  return data || []
}
