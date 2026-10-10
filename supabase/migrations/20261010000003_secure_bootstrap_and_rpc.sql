-- Migration: 20261010000003_secure_bootstrap_and_rpc.sql
-- Description: Phase 1 Controlled First-Admin Bootstrap Function and RPC procedures
-- Author: Senior Systems Architect & Security Specialist

--------------------------------------------------------------------------------
-- 1. SECURE FIRST-ADMINISTRATOR BOOTSTRAP FUNCTION
--------------------------------------------------------------------------------
-- Rules:
-- 1. Can ONLY be run when there are ZERO system_admin roles in the entire database.
-- 2. Once at least one system_admin exists, this function PERMANENTLY raises an exception.
-- 3. Sets the caller's role to 'system_admin' and writes an immediate audit record.
-- 4. Prevents arbitrary public exploitation or privilege escalation once bootstrapped.
CREATE OR REPLACE FUNCTION public.bootstrap_initial_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_count INT;
    v_caller_id UUID;
    v_user_email TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: You must be signed in to perform initial administrator bootstrap.';
    END IF;

    -- Strict check: Any system admin already registered?
    SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role_name = 'system_admin';
    IF v_admin_count > 0 THEN
        RAISE EXCEPTION 'Access Denied: The system administrator has already been initialized. Bootstrap endpoint is closed.';
    END IF;

    -- Ensure profile exists
    INSERT INTO public.user_profiles (id, full_name, email, account_status)
    VALUES (
        v_caller_id, 
        'Initial System Administrator', 
        (SELECT email FROM auth.users WHERE id = v_caller_id),
        'active'
    )
    ON CONFLICT (id) DO UPDATE SET account_status = 'active';

    -- Assign system_admin role
    INSERT INTO public.user_roles (user_id, role_name, assigned_by)
    VALUES (v_caller_id, 'system_admin', v_caller_id)
    ON CONFLICT (user_id, role_name) DO NOTHING;

    -- Write audit trail
    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        v_caller_id,
        'BOOTSTRAP_INITIAL_ADMIN',
        v_caller_id::text,
        'user_roles',
        'success',
        jsonb_build_object('reason', 'First-time setup bootstrap initialized by verified auth user')
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Initial system administrator successfully bootstrapped.',
        'user_id', v_caller_id
    );
END;
$$;

--------------------------------------------------------------------------------
-- 2. SECURE ROLE MANAGEMENT PROCEDURE (RPC)
--------------------------------------------------------------------------------
-- Allows an active system_admin to assign or revoke roles safely with auditing
CREATE OR REPLACE FUNCTION public.manage_user_role(
    p_target_user_id UUID,
    p_role_name TEXT,
    p_operation TEXT -- 'assign' or 'revoke'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_admin_count INT;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_system_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only an active system administrator can manage user roles.';
    END IF;

    IF p_role_name NOT IN ('system_admin', 'ysa_leader', 'stake_presidency', 'bishop', 'branch_president') THEN
        RAISE EXCEPTION 'Invalid role name: %', p_role_name;
    END IF;

    IF p_operation = 'assign' THEN
        -- Check role conflicts: bishop and branch_president cannot be held simultaneously
        IF p_role_name = 'bishop' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_target_user_id AND role_name = 'branch_president') THEN
            RAISE EXCEPTION 'Incompatible role assignment: User cannot be both bishop and branch president.';
        END IF;

        IF p_role_name = 'branch_president' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_target_user_id AND role_name = 'bishop') THEN
            RAISE EXCEPTION 'Incompatible role assignment: User cannot be both branch president and bishop.';
        END IF;

        INSERT INTO public.user_roles (user_id, role_name, assigned_by)
        VALUES (p_target_user_id, p_role_name, v_caller_id)
        ON CONFLICT (user_id, role_name) DO NOTHING;

        -- Record audit
        INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
        VALUES (
            v_caller_id,
            'ASSIGN_ROLE',
            p_target_user_id::text,
            'user_roles',
            'success',
            jsonb_build_object('role', p_role_name, 'target_user_id', p_target_user_id)
        );

        RETURN jsonb_build_object('success', true, 'action', 'assigned', 'role', p_role_name);

    ELSIF p_operation = 'revoke' THEN
        -- Safeguard: Cannot revoke last system admin
        IF p_role_name = 'system_admin' THEN
            SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role_name = 'system_admin';
            IF v_admin_count <= 1 THEN
                RAISE EXCEPTION 'Forbidden: Cannot revoke the last remaining system administrator.';
            END IF;
        END IF;

        DELETE FROM public.user_roles 
        WHERE user_id = p_target_user_id AND role_name = p_role_name;

        -- Remove any unit assignments tied to this role
        DELETE FROM public.user_unit_assignments
        WHERE user_id = p_target_user_id AND assigned_role = p_role_name;

        -- Record audit
        INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
        VALUES (
            v_caller_id,
            'REVOKE_ROLE',
            p_target_user_id::text,
            'user_roles',
            'success',
            jsonb_build_object('role', p_role_name, 'target_user_id', p_target_user_id)
        );

        RETURN jsonb_build_object('success', true, 'action', 'revoked', 'role', p_role_name);
    ELSE
        RAISE EXCEPTION 'Invalid operation: Must be "assign" or "revoke"';
    END IF;
END;
$$;

--------------------------------------------------------------------------------
-- 3. SECURE ACCOUNT STATUS MANAGEMENT PROCEDURE (RPC)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_account_status(
    p_target_user_id UUID,
    p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_system_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only system administrators can update user account status.';
    END IF;

    IF p_new_status NOT IN ('active', 'deactivated') THEN
        RAISE EXCEPTION 'Invalid status. Permitted values: active, deactivated';
    END IF;

    -- Prevent self-deactivation if caller is the last active admin
    IF v_caller_id = p_target_user_id AND p_new_status = 'deactivated' THEN
        IF (SELECT count(*) FROM public.user_roles r JOIN public.user_profiles p ON p.id = r.user_id WHERE r.role_name = 'system_admin' AND p.account_status = 'active') <= 1 THEN
            RAISE EXCEPTION 'Forbidden: You cannot deactivate your account as the last active system administrator.';
        END IF;
    END IF;

    UPDATE public.user_profiles
    SET account_status = p_new_status, updated_at = timezone('utc'::text, now())
    WHERE id = p_target_user_id;

    -- Record audit
    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        v_caller_id,
        'UPDATE_ACCOUNT_STATUS',
        p_target_user_id::text,
        'user_profiles',
        'success',
        jsonb_build_object('new_status', p_new_status)
    );

    RETURN jsonb_build_object('success', true, 'target_user_id', p_target_user_id, 'account_status', p_new_status);
END;
$$;

--------------------------------------------------------------------------------
-- 4. SEED KNOWN ABEOCUTA OBANTOKO STAKE UNITS
--------------------------------------------------------------------------------
-- Idempotent initial seed of Abeokuta Nigeria Obantoko Stake units
INSERT INTO public.stake_units (unit_name, unit_type, is_active)
VALUES
    ('Obantoko 1st Ward', 'ward', true),
    ('Obantoko 2nd Ward', 'ward', true),
    ('Asero Ward', 'ward', true),
    ('Adatan Ward', 'ward', true),
    ('Alabata Branch', 'branch', true),
    ('Odeda Branch', 'branch', true),
    ('Osiele Branch', 'branch', true)
ON CONFLICT (unit_name) DO NOTHING;
