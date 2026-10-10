-- Migration: 20261010000001_initial_schema.sql
-- Description: Phase 1 Core Schema for Abeokuta Nigeria Obantoko Stake YSA AMS
-- Author: Senior Systems Architect & Security Specialist

-- Enable pgcrypto for secure UUID generation if not already active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- 1. STAKE UNITS TABLE
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stake_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_name TEXT NOT NULL UNIQUE,
    unit_type TEXT NOT NULL CHECK (unit_type IN ('ward', 'branch')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_stake_units_unit_type ON public.stake_units(unit_type);
CREATE INDEX IF NOT EXISTS idx_stake_units_is_active ON public.stake_units(is_active);

COMMENT ON TABLE public.stake_units IS 'Wards and branches within the Abeokuta Nigeria Obantoko Stake.';

--------------------------------------------------------------------------------
-- 2. USER PROFILES TABLE
--------------------------------------------------------------------------------
-- Links 1-to-1 with auth.users. Never stores passwords or plaintext credentials.
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'deactivated', 'pending')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_account_status ON public.user_profiles(account_status);

COMMENT ON TABLE public.user_profiles IS 'Application user profile metadata linked to Supabase Auth.';

--------------------------------------------------------------------------------
-- 3. USER ROLES TABLE
--------------------------------------------------------------------------------
-- Valid application roles:
-- 'system_admin'
-- 'ysa_leader'
-- 'stake_presidency'
-- 'bishop'
-- 'branch_president'
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role_name TEXT NOT NULL CHECK (
        role_name IN ('system_admin', 'ysa_leader', 'stake_presidency', 'bishop', 'branch_president')
    ),
    assigned_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_role UNIQUE (user_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_name ON public.user_roles(role_name);

COMMENT ON TABLE public.user_roles IS 'Centrally controlled user-to-role assignments.';

--------------------------------------------------------------------------------
-- 4. USER UNIT ASSIGNMENTS TABLE
--------------------------------------------------------------------------------
-- Associates unit-dependent roles (bishop, branch_president, ysa_leader) with wards/branches.
CREATE TABLE IF NOT EXISTS public.user_unit_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES public.stake_units(id) ON DELETE CASCADE,
    assigned_role TEXT NOT NULL CHECK (
        assigned_role IN ('bishop', 'branch_president', 'ysa_leader')
    ),
    assigned_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_user_unit_role UNIQUE (user_id, unit_id, assigned_role)
);

CREATE INDEX IF NOT EXISTS idx_user_unit_assignments_user_id ON public.user_unit_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_unit_assignments_unit_id ON public.user_unit_assignments(unit_id);

COMMENT ON TABLE public.user_unit_assignments IS 'Unit-level scoping for bishops, branch presidents, and unit YSA leaders.';

--------------------------------------------------------------------------------
-- 5. AUDIT LOGS TABLE (Append-Only)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_record_id TEXT,
    target_table TEXT,
    outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failure')),
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

COMMENT ON TABLE public.audit_logs IS 'Append-only audit trail for sensitive administrative and security events.';

--------------------------------------------------------------------------------
-- 6. AUDIT TRIGGER & PREVENT MODIFICATION TRIGGER
--------------------------------------------------------------------------------
-- Prevent any UPDATE or DELETE operations on audit_logs
CREATE OR REPLACE FUNCTION public.fn_prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are strictly append-only and cannot be modified or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_protect_audit_logs
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_audit_log_modification();

--------------------------------------------------------------------------------
-- 7. UNIT ASSIGNMENT VALIDATION TRIGGER
--------------------------------------------------------------------------------
-- Validates:
-- 1. A bishop can ONLY be assigned to a unit with unit_type = 'ward'
-- 2. A branch president can ONLY be assigned to a unit with unit_type = 'branch'
-- 3. The user MUST actually possess the corresponding role in public.user_roles
CREATE OR REPLACE FUNCTION public.fn_validate_unit_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_unit_type TEXT;
    v_has_role BOOLEAN;
BEGIN
    -- Check target unit type
    SELECT unit_type INTO v_unit_type FROM public.stake_units WHERE id = NEW.unit_id;
    IF v_unit_type IS NULL THEN
        RAISE EXCEPTION 'Referenced stake unit % does not exist.', NEW.unit_id;
    END IF;

    IF NEW.assigned_role = 'bishop' AND v_unit_type <> 'ward' THEN
        RAISE EXCEPTION 'Role bishop can only be assigned to a ward (unit % is a %)', NEW.unit_id, v_unit_type;
    END IF;

    IF NEW.assigned_role = 'branch_president' AND v_unit_type <> 'branch' THEN
        RAISE EXCEPTION 'Role branch_president can only be assigned to a branch (unit % is a %)', NEW.unit_id, v_unit_type;
    END IF;

    -- Verify user holds this role
    SELECT EXISTS(
        SELECT 1 FROM public.user_roles
        WHERE user_id = NEW.user_id AND role_name = NEW.assigned_role
    ) INTO v_has_role;

    IF NOT v_has_role THEN
        RAISE EXCEPTION 'User % does not have the % role assigned. Cannot create unit assignment.', NEW.user_id, NEW.assigned_role;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_unit_assignment ON public.user_unit_assignments;
CREATE TRIGGER trg_validate_unit_assignment
BEFORE INSERT OR UPDATE ON public.user_unit_assignments
FOR EACH ROW
EXECUTE FUNCTION public.fn_validate_unit_assignment();

--------------------------------------------------------------------------------
-- 8. AUTO-PROFILE CREATION ON AUTH SIGNUP TRIGGER
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, full_name, email, account_status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Stake Member'),
        NEW.email,
        'active'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- Trigger fired after an auth user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

--------------------------------------------------------------------------------
-- 9. PREVENT LAST SYSTEM ADMIN REMOVAL TRIGGER
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_count INT;
BEGIN
    IF OLD.role_name = 'system_admin' THEN
        SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role_name = 'system_admin';
        IF v_admin_count <= 1 THEN
            RAISE EXCEPTION 'Operation rejected: Cannot remove or revoke the last remaining system administrator.';
        END IF;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_removal ON public.user_roles;
CREATE TRIGGER trg_prevent_last_admin_removal
BEFORE DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_last_admin_removal();
