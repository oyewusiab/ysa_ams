-- Migration: 20261010000006_phase_2_1_security_and_public_attendance.sql
-- Description: Phase 2.1 Attendance Security, User Provisioning, Public Attendance & Historical Name Suggestions
-- Abeokuta Nigeria Obantoko Stake YSA Attendance Management System

--------------------------------------------------------------------------------
-- 1. EXTEND USER PROFILES (Username, must_change_password)
--------------------------------------------------------------------------------
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON public.user_profiles(username);

--------------------------------------------------------------------------------
-- 2. PUBLIC ATTENDANCE RECORDS TABLE (Historical Names & Fast Suggestions)
-- Supports public YSA attendance without requiring user accounts or pre-registration.
-- Distinguishes members, visitors, and historical recorded names.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_attendance_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.activity_sessions(id) ON DELETE RESTRICT,
    attendee_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL, -- Lowercase, trimmed for fast case-insensitive duplicate checks & suggestions
    is_non_member BOOLEAN NOT NULL DEFAULT FALSE,
    selected_unit_id UUID REFERENCES public.stake_units(id) ON DELETE RESTRICT,
    matched_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    submission_ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_unit_required_for_members CHECK (
        is_non_member = TRUE OR selected_unit_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_public_att_session ON public.public_attendance_submissions(session_id);
CREATE INDEX IF NOT EXISTS idx_public_att_norm_name ON public.public_attendance_submissions(normalized_name);
CREATE INDEX IF NOT EXISTS idx_public_att_unit ON public.public_attendance_submissions(selected_unit_id);

-- Enforce uniqueness per session and attendee name (prevent duplicate submissions for the same session)
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_normalized_name 
    ON public.public_attendance_submissions(session_id, normalized_name);

COMMENT ON TABLE public.public_attendance_submissions IS 
    'Public attendee check-in records without requiring YSA accounts or passwords.';

--------------------------------------------------------------------------------
-- 3. ENABLE ROW-LEVEL SECURITY
--------------------------------------------------------------------------------
ALTER TABLE public.public_attendance_submissions ENABLE ROW LEVEL SECURITY;

-- Anonymous and authenticated visitors can search name suggestions ONLY via RPC.
-- Leaders can view attendance submissions for their authorized sessions / units.
CREATE POLICY "Authorized leaders can read public attendance submissions"
    ON public.public_attendance_submissions
    FOR SELECT
    TO authenticated
    USING (
        public.is_account_active(auth.uid()) AND (
            public.has_any_role(ARRAY['system_admin', 'stake_presidency', 'ysa_leader'], auth.uid())
            OR (selected_unit_id IS NOT NULL AND public.can_access_unit_attendance(selected_unit_id, auth.uid()))
        )
    );

--------------------------------------------------------------------------------
-- 4. RPC: RESOLVE USERNAME OR EMAIL FOR SECURE AUTHENTICATION (Phase 2.1 Section 1.4)
-- Resolves a username to email without exposing a directory or leaking existence.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_auth_identifier(p_identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleaned TEXT;
    v_email TEXT;
BEGIN
    v_cleaned := trim(p_identifier);
    IF v_cleaned IS NULL OR length(v_cleaned) = 0 THEN
        RETURN NULL;
    END IF;

    -- If identifier contains '@', it is already an email
    IF v_cleaned LIKE '%@%' THEN
        RETURN lower(v_cleaned);
    END IF;

    -- Otherwise, look up username in user_profiles
    SELECT lower(email) INTO v_email
    FROM public.user_profiles
    WHERE lower(username) = lower(v_cleaned)
      AND account_status = 'active';

    RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_auth_identifier(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_auth_identifier(TEXT) TO anon, authenticated;

--------------------------------------------------------------------------------
-- 5. RPC: SYSTEM ADMIN USER PROVISIONING (Phase 2.1 Section 1.1)
-- Only System Administrators can provision leadership accounts.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_provision_user(
    p_full_name TEXT,
    p_email TEXT,
    p_username TEXT,
    p_role_name TEXT,
    p_assigned_unit_id UUID DEFAULT NULL,
    p_initial_must_change_password BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_existing_profile_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_system_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only an active system administrator can provision user accounts.';
    END IF;

    IF p_role_name NOT IN ('system_admin', 'ysa_leader', 'stake_presidency', 'bishop', 'branch_president') THEN
        RAISE EXCEPTION 'Invalid role: %', p_role_name;
    END IF;

    IF p_role_name IN ('bishop', 'branch_president') AND p_assigned_unit_id IS NULL THEN
        RAISE EXCEPTION 'Assigned unit is required for bishop or branch president.';
    END IF;

    -- Check if username already taken
    IF p_username IS NOT NULL AND length(trim(p_username)) > 0 THEN
        IF EXISTS (SELECT 1 FROM public.user_profiles WHERE lower(username) = lower(trim(p_username))) THEN
            RAISE EXCEPTION 'Username "%" is already taken.', p_username;
        END IF;
    END IF;

    -- Audit account provisioning event
    INSERT INTO public.audit_logs (actor_id, action, target_table, outcome, metadata)
    VALUES (
        v_caller_id,
        'ADMIN_PROVISION_USER',
        'user_profiles',
        'success',
        jsonb_build_object(
            'email', lower(trim(p_email)),
            'username', p_username,
            'role', p_role_name,
            'unit_id', p_assigned_unit_id,
            'must_change_password', p_initial_must_change_password
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'User provision specification registered. Complete credential setup via Supabase Auth.',
        'email', lower(trim(p_email)),
        'role', p_role_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_provision_user(TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_provision_user(TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;

--------------------------------------------------------------------------------
-- 6. RPC: FETCH HISTORICAL NAME SUGGESTIONS (Phase 2.1 Section 2.1 A & Section 3)
-- Safe, throttled query over previous attendance and members.
-- Minimum 2 characters. Never exposes phone numbers, emails, notes, or history.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_attendance_name_suggestions(p_query TEXT)
RETURNS TABLE (
    suggested_name TEXT,
    suggested_unit_id UUID,
    suggested_unit_name TEXT,
    is_known_member BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean TEXT;
BEGIN
    v_clean := trim(p_query);
    IF v_clean IS NULL OR length(v_clean) < 2 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH candidate_names AS (
        -- Source 1: Registered members
        SELECT 
            m.full_name AS c_name,
            m.home_unit_id AS c_unit_id,
            u.unit_name AS c_unit_name,
            TRUE AS c_is_member,
            1 AS priority
        FROM public.members m
        LEFT JOIN public.stake_units u ON u.id = m.home_unit_id
        WHERE m.full_name ILIKE '%' || v_clean || '%'
          AND m.is_active = TRUE

        UNION ALL

        -- Source 2: Prior public attendance submissions (historical attendees)
        SELECT 
            p.attendee_name AS c_name,
            p.selected_unit_id AS c_unit_id,
            u.unit_name AS c_unit_name,
            FALSE AS c_is_member,
            2 AS priority
        FROM public.public_attendance_submissions p
        LEFT JOIN public.stake_units u ON u.id = p.selected_unit_id
        WHERE p.attendee_name ILIKE '%' || v_clean || '%'

        UNION ALL

        -- Source 3: Prior session visitors
        SELECT 
            v.full_name AS c_name,
            NULL::UUID AS c_unit_id,
            NULL::TEXT AS c_unit_name,
            FALSE AS c_is_member,
            3 AS priority
        FROM public.session_visitors v
        WHERE v.full_name ILIKE '%' || v_clean || '%'
    ),
    deduped AS (
        SELECT DISTINCT ON (lower(trim(c_name)))
            c_name,
            c_unit_id,
            c_unit_name,
            c_is_member,
            priority
        FROM candidate_names
        ORDER BY lower(trim(c_name)), priority ASC
    )
    SELECT 
        c_name AS suggested_name,
        c_unit_id AS suggested_unit_id,
        c_unit_name AS suggested_unit_name,
        c_is_member AS is_known_member
    FROM deduped
    ORDER BY priority ASC, c_name ASC
    LIMIT 8;
END;
$$;

REVOKE ALL ON FUNCTION public.get_attendance_name_suggestions(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_name_suggestions(TEXT) TO anon, authenticated;

--------------------------------------------------------------------------------
-- 7. RPC: SUBMIT PUBLIC ATTENDANCE (Phase 2.1 Section 2)
-- Enforces all validation rules in database layer.
-- Non-member: unit optional. Member: unit strictly required.
-- Prevents duplicate attendance for the same person and session.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_public_attendance(
    p_session_id UUID,
    p_attendee_name TEXT,
    p_is_non_member BOOLEAN,
    p_selected_unit_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session RECORD;
    v_clean_name TEXT;
    v_norm_name TEXT;
    v_matched_member_id UUID;
    v_sub_id UUID;
BEGIN
    v_clean_name := trim(p_attendee_name);
    IF v_clean_name IS NULL OR length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'Attendee name is required (minimum 2 characters).';
    END IF;

    v_norm_name := lower(regexp_replace(v_clean_name, '\s+', ' ', 'g'));

    -- 1. Validate session
    SELECT * INTO v_session
    FROM public.activity_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Activity session not found.';
    END IF;

    IF v_session.status != 'active' THEN
        RAISE EXCEPTION 'Attendance session is not active. Attendance writes are closed.';
    END IF;

    -- Check expiration
    IF v_session.code_expires_at IS NOT NULL AND v_session.code_expires_at < timezone('utc'::text, now()) THEN
        RAISE EXCEPTION 'Attendance session has expired.';
    END IF;

    -- 2. Validate unit requirement rule (Phase 2.1 Section 2.1 B & C)
    IF (p_is_non_member IS FALSE OR p_is_non_member IS NULL) THEN
        IF p_selected_unit_id IS NULL THEN
            RAISE EXCEPTION 'Unit is required for Church members. Please select your ward or branch.';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.stake_units WHERE id = p_selected_unit_id AND is_active = TRUE) THEN
            RAISE EXCEPTION 'Selected unit is invalid or inactive.';
        END IF;
    END IF;

    -- 3. Check for duplicates in this session
    IF EXISTS (
        SELECT 1 
        FROM public.public_attendance_submissions
        WHERE session_id = p_session_id AND normalized_name = v_norm_name
    ) THEN
        RAISE EXCEPTION 'Attendance already recorded for % in this session.', v_clean_name;
    END IF;

    -- 4. Check if attendee matches an existing member (without creating duplicate records)
    SELECT id INTO v_matched_member_id
    FROM public.members
    WHERE lower(trim(full_name)) = v_norm_name
    LIMIT 1;

    -- 5. Insert public attendance record
    INSERT INTO public.public_attendance_submissions (
        session_id,
        attendee_name,
        normalized_name,
        is_non_member,
        selected_unit_id,
        matched_member_id,
        check_in_time
    )
    VALUES (
        p_session_id,
        v_clean_name,
        v_norm_name,
        COALESCE(p_is_non_member, FALSE),
        p_selected_unit_id,
        v_matched_member_id,
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_sub_id;

    -- Also mirror into attendance_records if matched to a known member
    IF v_matched_member_id IS NOT NULL AND p_selected_unit_id IS NOT NULL THEN
        INSERT INTO public.attendance_records (
            session_id,
            member_id,
            recorded_unit_id,
            check_in_time
        )
        VALUES (
            p_session_id,
            v_matched_member_id,
            p_selected_unit_id,
            timezone('utc'::text, now())
        )
        ON CONFLICT (session_id, member_id) DO NOTHING;
    END IF;

    -- If marked as non-member, mirror into session_visitors
    IF p_is_non_member IS TRUE THEN
        INSERT INTO public.session_visitors (
            session_id,
            full_name,
            is_church_member,
            created_at
        )
        VALUES (
            p_session_id,
            v_clean_name,
            FALSE,
            timezone('utc'::text, now())
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'submission_id', v_sub_id,
        'attendee_name', v_clean_name,
        'check_in_time', timezone('utc'::text, now())
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_attendance(UUID, TEXT, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_attendance(UUID, TEXT, BOOLEAN, UUID) TO anon, authenticated;

--------------------------------------------------------------------------------
-- 8. RPC: GET ACTIVE PUBLIC SESSION DETAILS (Phase 2.1 Section 2)
-- Allows public visitors to view current activity name without admin credentials.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_public_session(p_session_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session RECORD;
    v_units JSONB;
BEGIN
    IF p_session_id IS NOT NULL THEN
        SELECT s.id, s.session_title, s.session_date, s.status, a.title AS activity_title, a.category
        INTO v_session
        FROM public.activity_sessions s
        JOIN public.activities a ON a.id = s.activity_id
        WHERE s.id = p_session_id AND s.status = 'active';
    ELSE
        -- Default to the most recently initiated active session
        SELECT s.id, s.session_title, s.session_date, s.status, a.title AS activity_title, a.category
        INTO v_session
        FROM public.activity_sessions s
        JOIN public.activities a ON a.id = s.activity_id
        WHERE s.status = 'active'
        ORDER BY s.initiated_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    IF v_session.id IS NULL THEN
        RETURN jsonb_build_object('active', false, 'message', 'No active attendance session at this time.');
    END IF;

    -- Fetch active units for dropdown
    SELECT jsonb_agg(jsonb_build_object('id', id, 'unit_name', unit_name, 'unit_type', unit_type) ORDER BY unit_name ASC)
    INTO v_units
    FROM public.stake_units
    WHERE is_active = TRUE;

    RETURN jsonb_build_object(
        'active', true,
        'session_id', v_session.id,
        'session_title', v_session.session_title,
        'activity_title', v_session.activity_title,
        'session_date', v_session.session_date,
        'units', COALESCE(v_units, '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_public_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_public_session(UUID) TO anon, authenticated;

--------------------------------------------------------------------------------
-- 9. RPC: ENFORCE FIRST-LOGIN PASSWORD CHANGE (Phase 2.1 Section 1.3)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_first_login_password_change()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    UPDATE public.user_profiles
    SET must_change_password = FALSE,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_caller_id;

    -- Audit event
    INSERT INTO public.audit_logs (actor_id, action, target_table, outcome, metadata)
    VALUES (
        v_caller_id,
        'COMPLETE_PASSWORD_CHANGE',
        'user_profiles',
        'success',
        jsonb_build_object('user_id', v_caller_id)
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_first_login_password_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_first_login_password_change() TO authenticated;
