-- Migration: 20261011000009_enable_time_in_feature.sql
-- Description: Add enable_time_in configuration to activity_sessions and preserve server-side check-in timestamping
-- Abeokuta Nigeria Obantoko Stake YSA Attendance Management System

-- 1. ADD enable_time_in TO activity_sessions
-- Backward compatible: Defaults to FALSE
ALTER TABLE public.activity_sessions
ADD COLUMN IF NOT EXISTS enable_time_in BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.activity_sessions.enable_time_in IS 
'When TRUE, server-side check-in time is officially highlighted and recorded with WAT time formatting.';

-- 2. ENSURE record_member_attendance PRESERVES SERVER-SIDE TIMESTAMP AND DUPLICATE PROTECTION
CREATE OR REPLACE FUNCTION public.record_member_attendance(
    p_session_id UUID,
    p_member_id UUID,
    p_terminal_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_token_hash TEXT;
    v_terminal RECORD;
    v_session RECORD;
    v_member RECORD;
    v_attendance_id UUID;
    v_check_in_time TIMESTAMPTZ;
BEGIN
    v_token_hash := encode(digest(p_terminal_token, 'sha256'), 'hex');

    -- Verify terminal authorization
    SELECT * INTO v_terminal
    FROM public.terminal_authorizations
    WHERE terminal_token_hash = v_token_hash
      AND session_id = p_session_id
      AND is_revoked = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized terminal token or terminal revoked.';
    END IF;

    -- Verify session is active
    SELECT * INTO v_session
    FROM public.activity_sessions
    WHERE id = p_session_id;

    IF NOT FOUND OR v_session.status != 'active' THEN
        RAISE EXCEPTION 'Session is not active. Cannot record attendance.';
    END IF;

    -- Verify member exists & fetch unit
    SELECT * INTO v_member
    FROM public.members
    WHERE id = p_member_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member record not found.';
    END IF;

    -- Atomic check & insert for duplicate prevention: prevent overwriting original check_in_time
    IF EXISTS (
        SELECT 1 FROM public.attendance_records
        WHERE session_id = p_session_id AND member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'Duplicate attendance: Member % has already checked in.', v_member.full_name;
    END IF;

    -- Trusted server timestamp
    v_check_in_time := timezone('utc'::text, now());

    INSERT INTO public.attendance_records (
        session_id,
        member_id,
        recorded_unit_id,
        recorded_by_terminal_id,
        check_in_time
    )
    VALUES (
        p_session_id,
        p_member_id,
        v_member.home_unit_id,
        v_terminal.id,
        v_check_in_time
    )
    RETURNING id INTO v_attendance_id;

    -- Update terminal last seen
    UPDATE public.terminal_authorizations
    SET last_seen_at = timezone('utc'::text, now())
    WHERE id = v_terminal.id;

    RETURN jsonb_build_object(
        'success', true,
        'attendance_id', v_attendance_id,
        'member_name', v_member.full_name,
        'check_in_time', v_check_in_time
    );
END;
$$;

-- 3. ENSURE submit_public_attendance ALSO RESPECTS TRUSTED SERVER TIMESTAMP & DUPLICATE PROTECTION
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
    v_check_in_time TIMESTAMPTZ;
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

    -- 2. Validate unit requirement rule
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

    -- 4. Check if attendee matches an existing member
    SELECT id INTO v_matched_member_id
    FROM public.members
    WHERE lower(trim(full_name)) = v_norm_name
    LIMIT 1;

    -- Trusted server timestamp
    v_check_in_time := timezone('utc'::text, now());

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
        v_check_in_time
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
            v_check_in_time
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
            v_check_in_time
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'submission_id', v_sub_id,
        'matched_member', v_matched_member_id IS NOT NULL,
        'check_in_time', v_check_in_time
    );
END;
$$;
