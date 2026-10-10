-- Migration: 20261010000007_provision_leader_transactional_rpc.sql
-- Description: Phase 2.2.1 Transactional database provisioning procedure and strict validation
-- Author: Senior Systems Architect & Security Specialist

--------------------------------------------------------------------------------
-- 1. TRANSACTIONAL LEADER PROVISIONING / RECONCILIATION RPC
--------------------------------------------------------------------------------
-- Executes profile setup, role assignment, unit validation, unit assignment,
-- and audit logging in a single atomic database transaction.
-- Can be called securely by an active system administrator (or server Edge Function).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_leader_provisioning_transaction(
    p_auth_user_id UUID,
    p_full_name TEXT,
    p_email TEXT,
    p_username TEXT,
    p_role_name TEXT,
    p_assigned_unit_id UUID,
    p_is_reconciliation BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_clean_email TEXT;
    v_clean_username TEXT;
    v_unit_type TEXT;
    v_unit_active BOOLEAN;
BEGIN
    v_caller_id := auth.uid();

    -- 1. Strict Caller Verification: Active profile AND system_admin role
    IF NOT public.is_system_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only an active system administrator can execute leader provisioning.';
    END IF;

    -- 2. Input sanitization & checks
    v_clean_email := lower(trim(p_email));
    v_clean_username := lower(trim(NULLIF(p_username, '')));

    IF p_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'Target authentication user ID cannot be null.';
    END IF;

    IF length(trim(p_full_name)) < 2 THEN
        RAISE EXCEPTION 'Full name is required (minimum 2 characters).';
    END IF;

    IF v_clean_email IS NULL OR v_clean_email NOT LIKE '%@%' THEN
        RAISE EXCEPTION 'Valid email address is required.';
    END IF;

    IF p_role_name NOT IN ('system_admin', 'ysa_leader', 'stake_presidency', 'bishop', 'branch_president') THEN
        RAISE EXCEPTION 'Invalid role name: %', p_role_name;
    END IF;

    -- 3. Username uniqueness across other profiles
    IF v_clean_username IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE lower(username) = v_clean_username 
              AND id <> p_auth_user_id
        ) THEN
            RAISE EXCEPTION 'Username "%" is already taken by another account.', v_clean_username;
        END IF;
    END IF;

    -- 4. Unit existence, status, and role/type compatibility checks
    IF p_assigned_unit_id IS NOT NULL THEN
        SELECT unit_type, is_active INTO v_unit_type, v_unit_active
        FROM public.stake_units
        WHERE id = p_assigned_unit_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Assigned unit does not exist in stake_units registry.';
        END IF;

        IF NOT v_unit_active THEN
            RAISE EXCEPTION 'Assigned unit is marked inactive.';
        END IF;

        -- Validate unit type for Bishop (ward only) and Branch President (branch only)
        IF p_role_name = 'bishop' AND v_unit_type <> 'ward' THEN
            RAISE EXCEPTION 'A Bishop can only be assigned to a Ward, not a %.', v_unit_type;
        END IF;

        IF p_role_name = 'branch_president' AND v_unit_type <> 'branch' THEN
            RAISE EXCEPTION 'A Branch President can only be assigned to a Branch, not a %.', v_unit_type;
        END IF;
    ELSE
        -- Assigned unit is strictly required for bishop and branch_president
        IF p_role_name IN ('bishop', 'branch_president') THEN
            RAISE EXCEPTION 'Assigned unit is strictly required for %.', p_role_name;
        END IF;
    END IF;

    -- 5. Upsert user_profiles atomically
    INSERT INTO public.user_profiles (
        id,
        full_name,
        email,
        username,
        account_status,
        must_change_password,
        updated_at
    )
    VALUES (
        p_auth_user_id,
        trim(p_full_name),
        v_clean_email,
        v_clean_username,
        'active',
        TRUE,
        timezone('utc'::text, now())
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        username = COALESCE(EXCLUDED.username, public.user_profiles.username),
        account_status = 'active',
        updated_at = timezone('utc'::text, now());

    -- 6. Upsert user_roles atomically
    INSERT INTO public.user_roles (
        user_id,
        role_name,
        assigned_by,
        updated_at
    )
    VALUES (
        p_auth_user_id,
        p_role_name,
        v_caller_id,
        timezone('utc'::text, now())
    )
    ON CONFLICT (user_id, role_name) DO UPDATE SET
        assigned_by = EXCLUDED.assigned_by,
        updated_at = timezone('utc'::text, now());

    -- 7. Upsert user_unit_assignments if unit is assigned
    IF p_assigned_unit_id IS NOT NULL AND p_role_name IN ('bishop', 'branch_president', 'ysa_leader') THEN
        INSERT INTO public.user_unit_assignments (
            user_id,
            unit_id,
            assigned_role,
            assigned_by,
            updated_at
        )
        VALUES (
            p_auth_user_id,
            p_assigned_unit_id,
            p_role_name,
            v_caller_id,
            timezone('utc'::text, now())
        )
        ON CONFLICT (user_id, unit_id, assigned_role) DO UPDATE SET
            assigned_by = EXCLUDED.assigned_by,
            updated_at = timezone('utc'::text, now());
    END IF;

    -- 8. Write append-only audit trail
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        target_record_id,
        target_table,
        outcome,
        metadata
    )
    VALUES (
        v_caller_id,
        CASE WHEN p_is_reconciliation THEN 'RECONCILE_LEADER_PROVISION' ELSE 'PROVISION_LEADER_COMPLETE' END,
        p_auth_user_id::text,
        'user_profiles',
        'success',
        jsonb_build_object(
            'email', v_clean_email,
            'username', v_clean_username,
            'role', p_role_name,
            'unit_id', p_assigned_unit_id,
            'unit_type', v_unit_type,
            'is_reconciliation', p_is_reconciliation
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_auth_user_id,
        'is_reconciliation', p_is_reconciliation
    );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_leader_provisioning_transaction(UUID, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_leader_provisioning_transaction(UUID, TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;
