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

    // User client to verify caller identity using caller's JWT
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

    // 3. Verify server-side that caller is an active system_admin
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

    if (['bishop', 'branch_president'].includes(roleName) && !assignedUnitId) {
      return new Response(
        JSON.stringify({ error: 'Assigned ward/branch is strictly required for Bishops and Branch Presidents.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Default or validated temporary password (minimum 8 chars)
    const tempPass = temporaryPassword && temporaryPassword.trim().length >= 8 
      ? temporaryPassword.trim() 
      : 'ObantokoYSA2026!'

    let authUserId: string
    let isExistingAuthUser = false

    // 5. Check if Auth user already exists (idempotent lookup & handling for existing submissions like bayoglds@gmail.com)
    const { data: existingUsersData } = await adminClient.auth.admin.listUsers()
    const foundAuthUser = existingUsersData?.users?.find(
      (u: any) => u.email?.toLowerCase() === cleanEmail
    )

    if (foundAuthUser) {
      authUserId = foundAuthUser.id
      isExistingAuthUser = true

      // Update password if a specific temporary password was supplied
      if (temporaryPassword && temporaryPassword.trim().length >= 8) {
        await adminClient.auth.admin.updateUserById(authUserId, {
          password: tempPass,
          email_confirm: true,
          user_metadata: { full_name: fullName.trim() }
        })
      }
    } else {
      // Create new Auth User
      const { data: createdAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: tempPass,
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
    }

    // 6. Link / Upsert public.user_profiles
    const { error: profileErr } = await adminClient
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

    if (profileErr) {
      console.error('Error linking user profile:', profileErr)
      return new Response(
        JSON.stringify({ error: `Database error setting profile: ${profileErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 7. Assign public.user_roles (Idempotent upsert)
    const { error: roleErr } = await adminClient
      .from('user_roles')
      .upsert({
        user_id: authUserId,
        role_name: roleName,
        assigned_by: callerUser.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,role_name' })

    if (roleErr) {
      console.error('Error assigning role:', roleErr)
      return new Response(
        JSON.stringify({ error: `Database error assigning role: ${roleErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 8. Assign unit if applicable
    if (assignedUnitId && ['bishop', 'branch_president', 'ysa_leader'].includes(roleName)) {
      await adminClient
        .from('user_unit_assignments')
        .upsert({
          user_id: authUserId,
          unit_id: assignedUnitId,
          assigned_role: roleName,
          assigned_by: callerUser.id,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,unit_id,assigned_role' })
    }

    // 9. Write audit record
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

    // Return success response with confirmed login identifier (Never return plaintext password)
    return new Response(
      JSON.stringify({
        success: true,
        message: isExistingAuthUser 
          ? `Leader account for ${fullName.trim()} successfully reconciled and activated.`
          : `Leader account for ${fullName.trim()} successfully created and activated.`,
        userId: authUserId,
        email: cleanEmail,
        username: cleanUsername,
        role: roleName,
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
