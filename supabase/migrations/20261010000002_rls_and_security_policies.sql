-- Migration: 20261010000002_rls_and_security_policies.sql
-- Description: Phase 1 Row-Level Security Policies & Authorization Helpers
-- Author: Senior Systems Architect & Security Specialist

--------------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS FOR AUTHORIZATION (SECURITY DEFINER with safe search_path)
--------------------------------------------------------------------------------

-- Checks if the calling authenticated user is an active system administrator
CREATE OR REPLACE FUNCTION public.is_system_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Also verify that the profile is active
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles r
        JOIN public.user_profiles p ON p.id = r.user_id
        WHERE r.user_id = p_user_id 
          AND r.role_name = 'system_admin'
          AND p.account_status = 'active'
    );
END;
$$;

-- Checks if the user has an active account status
CREATE OR REPLACE FUNCTION public.is_account_active(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 
        FROM public.user_profiles
        WHERE id = p_user_id AND account_status = 'active'
    );
END;
$$;

-- Checks if the calling user has any of the specified roles
CREATE OR REPLACE FUNCTION public.has_any_role(p_roles TEXT[], p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles r
        JOIN public.user_profiles p ON p.id = r.user_id
        WHERE r.user_id = p_user_id 
          AND r.role_name = ANY(p_roles)
          AND p.account_status = 'active'
    );
END;
$$;

-- Checks if a user is assigned to a specific stake unit
CREATE OR REPLACE FUNCTION public.has_unit_assignment(p_unit_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 
        FROM public.user_unit_assignments a
        JOIN public.user_profiles p ON p.id = a.user_id
        WHERE a.user_id = p_user_id 
          AND a.unit_id = p_unit_id
          AND p.account_status = 'active'
    );
END;
$$;

--------------------------------------------------------------------------------
-- 2. ENABLE ROW-LEVEL SECURITY ON ALL TABLES
--------------------------------------------------------------------------------
ALTER TABLE public.stake_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_unit_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 3. POLICIES: stake_units
--------------------------------------------------------------------------------
-- Authenticated active users can view stake units (wards and branches)
DROP POLICY IF EXISTS "stake_units_select_authenticated" ON public.stake_units;
CREATE POLICY "stake_units_select_authenticated" ON public.stake_units
    FOR SELECT
    TO authenticated
    USING (public.is_account_active());

-- Only system_admin can insert, update, or delete stake units
DROP POLICY IF EXISTS "stake_units_insert_admin" ON public.stake_units;
CREATE POLICY "stake_units_insert_admin" ON public.stake_units
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_system_admin());

DROP POLICY IF EXISTS "stake_units_update_admin" ON public.stake_units;
CREATE POLICY "stake_units_update_admin" ON public.stake_units
    FOR UPDATE
    TO authenticated
    USING (public.is_system_admin())
    WITH CHECK (public.is_system_admin());

DROP POLICY IF EXISTS "stake_units_delete_admin" ON public.stake_units;
CREATE POLICY "stake_units_delete_admin" ON public.stake_units
    FOR DELETE
    TO authenticated
    USING (public.is_system_admin());

--------------------------------------------------------------------------------
-- 4. POLICIES: user_profiles
--------------------------------------------------------------------------------
-- Active users can view their own profile; system_admin can view all profiles
DROP POLICY IF EXISTS "user_profiles_select" ON public.user_profiles;
CREATE POLICY "user_profiles_select" ON public.user_profiles
    FOR SELECT
    TO authenticated
    USING (
        (id = auth.uid() AND public.is_account_active())
        OR public.is_system_admin()
    );

-- Users can update only their own non-privileged profile info (full_name); 
-- system_admin can update profiles (e.g. status)
DROP POLICY IF EXISTS "user_profiles_update_self" ON public.user_profiles;
CREATE POLICY "user_profiles_update_self" ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid() AND public.is_account_active())
    WITH CHECK (
        id = auth.uid()
        -- Ensure non-admins cannot change their own account_status
        AND (
            public.is_system_admin() 
            OR account_status = (SELECT account_status FROM public.user_profiles WHERE id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "user_profiles_update_admin" ON public.user_profiles;
CREATE POLICY "user_profiles_update_admin" ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING (public.is_system_admin())
    WITH CHECK (public.is_system_admin());

-- Creation is handled via signup trigger; admin can also insert
DROP POLICY IF EXISTS "user_profiles_insert" ON public.user_profiles;
CREATE POLICY "user_profiles_insert" ON public.user_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid() OR public.is_system_admin());

--------------------------------------------------------------------------------
-- 5. POLICIES: user_roles
--------------------------------------------------------------------------------
-- Users can view their own roles; system_admin can view all roles
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
CREATE POLICY "user_roles_select" ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (
        (user_id = auth.uid() AND public.is_account_active())
        OR public.is_system_admin()
    );

-- Only system_admin can insert user roles (Strict privilege escalation prevention)
DROP POLICY IF EXISTS "user_roles_insert_admin" ON public.user_roles;
CREATE POLICY "user_roles_insert_admin" ON public.user_roles
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_system_admin());

-- Only system_admin can update user roles
DROP POLICY IF EXISTS "user_roles_update_admin" ON public.user_roles;
CREATE POLICY "user_roles_update_admin" ON public.user_roles
    FOR UPDATE
    TO authenticated
    USING (public.is_system_admin())
    WITH CHECK (public.is_system_admin());

-- Only system_admin can delete/revoke user roles
DROP POLICY IF EXISTS "user_roles_delete_admin" ON public.user_roles;
CREATE POLICY "user_roles_delete_admin" ON public.user_roles
    FOR DELETE
    TO authenticated
    USING (public.is_system_admin());

--------------------------------------------------------------------------------
-- 6. POLICIES: user_unit_assignments
--------------------------------------------------------------------------------
-- Users can view their own unit assignments; system_admin, stake presidency can view all
DROP POLICY IF EXISTS "user_unit_assignments_select" ON public.user_unit_assignments;
CREATE POLICY "user_unit_assignments_select" ON public.user_unit_assignments
    FOR SELECT
    TO authenticated
    USING (
        (user_id = auth.uid() AND public.is_account_active())
        OR public.is_system_admin()
        OR public.has_any_role(ARRAY['stake_presidency'])
    );

-- Only system_admin can insert unit assignments
DROP POLICY IF EXISTS "user_unit_assignments_insert_admin" ON public.user_unit_assignments;
CREATE POLICY "user_unit_assignments_insert_admin" ON public.user_unit_assignments
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_system_admin());

-- Only system_admin can update unit assignments
DROP POLICY IF EXISTS "user_unit_assignments_update_admin" ON public.user_unit_assignments;
CREATE POLICY "user_unit_assignments_update_admin" ON public.user_unit_assignments
    FOR UPDATE
    TO authenticated
    USING (public.is_system_admin())
    WITH CHECK (public.is_system_admin());

-- Only system_admin can delete unit assignments
DROP POLICY IF EXISTS "user_unit_assignments_delete_admin" ON public.user_unit_assignments;
CREATE POLICY "user_unit_assignments_delete_admin" ON public.user_unit_assignments
    FOR DELETE
    TO authenticated
    USING (public.is_system_admin());

--------------------------------------------------------------------------------
-- 7. POLICIES: audit_logs
--------------------------------------------------------------------------------
-- Only system_admin and authorized stake_presidency can view audit logs
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        public.is_system_admin() 
        OR public.has_any_role(ARRAY['stake_presidency'])
    );

-- Any authenticated active user can append an audit record for their actions
DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_account_active() 
        AND (actor_id = auth.uid() OR actor_id IS NULL)
    );

-- NO UPDATE OR DELETE POLICIES EXIST (strictly blocked by trigger and omission)
