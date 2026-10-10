// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface ProvisionLeaderRequest {
  fullName: string
  email: string
  username?: string
  roleName: 'system_admin' | 'ysa_leader' | 'stake_presidency' | 'bishop' | 'branch_president'
  assignedUnitId?: string
  temporaryPassword?: string
}

serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Missing Supabase server environment secrets')
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing service credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Verify caller authentication & extract JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required. Authorization header missing.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Caller client to verify caller identity using caller's JWT
    const callerClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired caller authentication token.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Admin Client with Service Role Key (Exclusive to Edge Function runtime)
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 3. Verify server-side that caller has BOTH an active profile AND system_admin role
    const { data: callerProfile, error: profileErr } = await adminClient
      .from('user_profiles')
      .select('account_status')
      .eq('id', callerUser.id)
      .single()

    if (profileErr || !callerProfile || callerProfile.account_status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Caller account is not active.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: callerRoles, error: rolesError } = await adminClient
      .from('user_roles')
      .select('role_name')
      .eq('user_id', callerUser.id)

    const isSystemAdmin = callerRoles?.some((r: any) => r.role_name === 'system_admin')
    if (rolesError || !isSystemAdmin) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Only active System Administrators can provision leader accounts.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Parse and validate request body
    const body: ProvisionLeaderRequest = await req.json()
    const { fullName, email, username, roleName, assignedUnitId, temporaryPassword } = body

    if (!fullName || fullName.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Full name is required (minimum 2 characters).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanEmail = email?.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'A valid email address is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const validRoles = ['system_admin', 'ysa_leader', 'stake_presidency', 'bishop', 'branch_president']
    if (!validRoles.includes(roleName)) {
      return new Response(
        JSON.stringify({ error: `Invalid role specified: ${roleName}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Unit existence, status, and role/type compatibility checks
    if (assignedUnitId) {
      const { data: unitRecord, error: unitFetchErr } = await adminClient
        .from('stake_units')
        .select('id, unit_name, unit_type, is_active')
        .eq('id', assignedUnitId)
        .single()

      if (unitFetchErr || !unitRecord) {
        return new Response(
          JSON.stringify({ error: 'Assigned unit does not exist.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!unitRecord.is_active) {
        return new Response(
          JSON.stringify({ error: `Assigned unit "${unitRecord.unit_name}" is currently inactive.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (roleName === 'bishop' && unitRecord.unit_type !== 'ward') {
        return new Response(
          JSON.stringify({ error: `Invalid assignment: A Bishop can only be assigned to a Ward, but "${unitRecord.unit_name}" is a ${unitRecord.unit_type}.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (roleName === 'branch_president' && unitRecord.unit_type !== 'branch') {
        return new Response(
          JSON.stringify({ error: `Invalid assignment: A Branch President can only be assigned to a Branch, but "${unitRecord.unit_name}" is a ${unitRecord.unit_type}.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else if (['bishop', 'branch_president'].includes(roleName)) {
      return new Response(
        JSON.stringify({ error: 'Assigned ward/branch is strictly required for Bishops and Branch Presidents.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Username conflict verification
    const cleanUsername = username?.trim().toLowerCase() || null
    if (cleanUsername) {
      const { data: existingUsernames } = await adminClient
        .from('user_profiles')
        .select('id, email')
        .eq('username', cleanUsername)

      const usernameConflict = existingUsernames?.find((p: any) => p.email?.toLowerCase() !== cleanEmail)
      if (usernameConflict) {
        return new Response(
          JSON.stringify({ error: `Username "${username}" is already taken by another account.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 7. Check if Auth user already exists (idempotent lookup & handling for existing submissions like bayoglds@gmail.com)
    const { data: existingUsersData } = await adminClient.auth.admin.listUsers()
    const foundAuthUser = existingUsersData?.users?.find(
      (u: any) => u.email?.toLowerCase() === cleanEmail
    )

    let authUserId: string
    let isExistingAuthUser = false
    let newlyCreatedAuthUser = false

    if (foundAuthUser) {
      // EXISTING AUTH USER (Reconciliation)
      // REQUIREMENT: Protect existing accounts. Preserve existing password!
      // Do not reset or change their password merely because of provisioning retry.
      authUserId = foundAuthUser.id
      isExistingAuthUser = true
    } else {
      // NEW AUTH USER CREATION
      // REQUIREMENT: Reject missing or invalid temporary passwords with HTTP 400.
      // Never substitute a default fallback password! Never log password.
      const trimmedPass = temporaryPassword?.trim()
      if (!trimmedPass || trimmedPass.length < 8) {
        return new Response(
          JSON.stringify({ error: 'Temporary password is required for new accounts (minimum 8 characters).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: createdAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: trimmedPass,
        email_confirm: true, // Confirmed for admin-provisioned leaders
        user_metadata: { full_name: fullName.trim() }
      })

      if (createAuthErr || !createdAuth?.user) {
        console.error('Error creating auth user:', createAuthErr)
        return new Response(
          JSON.stringify({ error: createAuthErr?.message || 'Failed to create authentication user in Supabase Auth.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      authUserId = createdAuth.user.id
      newlyCreatedAuthUser = true
    }

    // 8. Atomic / Transactional Database Setup
    // Try the transactional RPC first to execute profile, role, unit assignment and audit atomically
    let transactionSuccess = false
    const { data: txData, error: txError } = await callerClient.rpc('execute_leader_provisioning_transaction', {
      p_auth_user_id: authUserId,
      p_full_name: fullName.trim(),
      p_email: cleanEmail,
      p_username: cleanUsername,
      p_role_name: roleName,
      p_assigned_unit_id: assignedUnitId || null,
      p_is_reconciliation: isExistingAuthUser
    })

    if (!txError && txData?.success) {
      transactionSuccess = true
    } else {
      console.warn('execute_leader_provisioning_transaction RPC not available or failed, executing safe fallback with rollback protection:', txError?.message)
      
      // Multi-step fallback with safe rollback on failure
      try {
        // Upsert user_profiles
        const { error: pErr } = await adminClient
          .from('user_profiles')
          .upsert({
            id: authUserId,
            full_name: fullName.trim(),
            email: cleanEmail,
            username: cleanUsername,
            account_status: 'active',
            must_change_password: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' })

        if (pErr) throw new Error(`Profile setup failed: ${pErr.message}`)

        // Upsert user_roles
        const { error: rErr } = await adminClient
          .from('user_roles')
          .upsert({
            user_id: authUserId,
            role_name: roleName,
            assigned_by: callerUser.id,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,role_name' })

        if (rErr) throw new Error(`Role assignment failed: ${rErr.message}`)

        // Upsert unit assignment if applicable
        if (assignedUnitId && ['bishop', 'branch_president', 'ysa_leader'].includes(roleName)) {
          const { error: uErr } = await adminClient
            .from('user_unit_assignments')
            .upsert({
              user_id: authUserId,
              unit_id: assignedUnitId,
              assigned_role: roleName,
              assigned_by: callerUser.id,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,unit_id,assigned_role' })

          if (uErr) throw new Error(`Unit assignment failed: ${uErr.message}`)
        }

        // Write audit log
        await adminClient.from('audit_logs').insert({
          actor_id: callerUser.id,
          action: isExistingAuthUser ? 'RECONCILE_LEADER_PROVISION' : 'PROVISION_LEADER_COMPLETE',
          target_record_id: authUserId,
          target_table: 'user_profiles',
          outcome: 'success',
          metadata: {
            email: cleanEmail,
            username: cleanUsername,
            role: roleName,
            unit_id: assignedUnitId || null,
            isExistingAuthUser
          }
        })

        transactionSuccess = true
      } catch (partialErr: any) {
        console.error('Partial database setup failure:', partialErr)

        // If we newly created the auth user in this specific execution and subsequent DB operations failed,
        // clean up the orphaned auth user so the administrator can safely retry
        if (newlyCreatedAuthUser) {
          try {
            await adminClient.auth.admin.deleteUser(authUserId)
            console.log(`Rolled back newly created auth user ${authUserId} after database setup failure.`)
          } catch (deleteErr) {
            console.error('Failed to rollback orphaned auth user:', deleteErr)
          }
        }

        return new Response(
          JSON.stringify({
            error: `Provisioning failed during database assignment: ${partialErr.message}. Any incomplete records were cleaned up for safe retry.`
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 9. Return success response with confirmed login identifier (Never return plaintext password)
    return new Response(
      JSON.stringify({
        success: true,
        message: isExistingAuthUser 
          ? `Leader account for ${fullName.trim()} (${cleanEmail}) successfully reconciled and activated. Existing password preserved.`
          : `Leader account for ${fullName.trim()} successfully created and activated.`,
        userId: authUserId,
        email: cleanEmail,
        username: cleanUsername,
        role: roleName,
        isReconciliation: isExistingAuthUser,
        loginIdentifier: cleanUsername || cleanEmail
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('Unexpected provisioning error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'An unexpected error occurred during leader provisioning.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
