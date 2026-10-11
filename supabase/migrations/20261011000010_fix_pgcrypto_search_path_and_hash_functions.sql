-- Migration: 20261011000010_fix_pgcrypto_search_path_and_hash_functions.sql
-- Description: Fix "function digest(text, unknown) does not exist" by ensuring extensions schema is in search_path or using sha256
-- Abeokuta Nigeria Obantoko Stake YSA Attendance Management System

-- 1. Ensure pgcrypto extension is installed
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;

-- 2. Grant usage on extensions schema to all roles
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- 3. RECREATE initiate_attendance_session WITH extensions IN search_path AND ROBUST SHA256 HASHING
CREATE OR REPLACE FUNCTION public.initiate_attendance_session(
    p_session_id UUID,
    p_code TEXT,
    p_max_terminals INT,
    p_expiry_minutes INT DEFAULT 240
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_session RECORD;
    v_code_hash TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.can_manage_activities(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only authorized YSA leaders or admins can initiate attendance.';
    END IF;

    IF p_max_terminals < 1 OR p_max_terminals > 10 THEN
        RAISE EXCEPTION 'Invalid terminal limit: Must be between 1 and 10.';
    END IF;

    IF length(p_code) < 4 THEN
        RAISE EXCEPTION 'Invalid session code: Must be at least 4 characters.';
    END IF;

    SELECT * INTO v_session FROM public.activity_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found.';
    END IF;

    IF v_session.status = 'closed' THEN
        RAISE EXCEPTION 'Cannot initiate a closed session.';
    END IF;

    -- Compute SHA-256 hash robustly across PostgreSQL/Supabase installations
    -- Uses sha256(p_code::bytea) native in Postgres 13+ or extensions.digest(p_code::bytea, 'sha256'::text)
    v_code_hash := encode(sha256(convert_to(p_code, 'UTF8')), 'hex');
    v_expires_at := timezone('utc'::text, now()) + (p_expiry_minutes || ' minutes')::interval;

    UPDATE public.activity_sessions
    SET status = 'active',
        max_terminals = p_max_terminals,
        code_hash = v_code_hash,
        code_expires_at = v_expires_at,
        initiated_by = v_caller_id,
        initiated_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_session_id;

    -- Audit trail
    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        v_caller_id,
        'INITIATE_ATTENDANCE_SESSION',
        p_session_id::text,
        'activity_sessions',
        'success',
        jsonb_build_object('max_terminals', p_max_terminals, 'expiry_minutes', p_expiry_minutes)
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'status', 'active',
        'expires_at', v_expires_at
    );
END;
$$;

-- 4. RECREATE authorize_terminal WITH ROBUST SHA256 AND TOKEN GENERATION
CREATE OR REPLACE FUNCTION public.authorize_terminal(
    p_session_code TEXT,
    p_terminal_label TEXT,
    p_existing_terminal_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_code_hash TEXT;
    v_session RECORD;
    v_active_terminal_count INT;
    v_new_token TEXT;
    v_new_token_hash TEXT;
    v_existing_token_hash TEXT;
    v_existing_terminal RECORD;
BEGIN
    v_code_hash := encode(sha256(convert_to(p_session_code, 'UTF8')), 'hex');

    -- Find matching active session
    SELECT * INTO v_session
    FROM public.activity_sessions
    WHERE code_hash = v_code_hash
      AND status = 'active';

    IF NOT FOUND THEN
        -- Record failed authorization attempt
        INSERT INTO public.audit_logs (actor_id, action, target_table, outcome, metadata)
        VALUES (
            auth.uid(),
            'TERMINAL_AUTH_FAILED',
            'terminal_authorizations',
            'failure',
            jsonb_build_object('reason', 'Invalid code or inactive session', 'label', p_terminal_label)
        );
        RAISE EXCEPTION 'Invalid attendance code or session is not active.';
    END IF;

    -- Check expiration
    IF v_session.code_expires_at IS NOT NULL AND v_session.code_expires_at < timezone('utc'::text, now()) THEN
        RAISE EXCEPTION 'Attendance session code has expired.';
    END IF;

    -- Check reconnection with existing valid token
    IF p_existing_terminal_token IS NOT NULL AND length(p_existing_terminal_token) > 0 THEN
        v_existing_token_hash := encode(sha256(convert_to(p_existing_terminal_token, 'UTF8')), 'hex');
        SELECT * INTO v_existing_terminal
        FROM public.terminal_authorizations
        WHERE terminal_token_hash = v_existing_token_hash
          AND session_id = v_session.id
          AND is_revoked = FALSE;

        IF FOUND THEN
            -- Update last seen
            UPDATE public.terminal_authorizations
            SET last_seen_at = timezone('utc'::text, now())
            WHERE id = v_existing_terminal.id;

            RETURN jsonb_build_object(
                'success', true,
                'session_id', v_session.id,
                'session_title', v_session.session_title,
                'session_date', v_session.session_date,
                'terminal_id', v_existing_terminal.id,
                'terminal_token', p_existing_terminal_token,
                'visitor_enabled', v_session.visitor_registration_enabled,
                'reconnected', true
            );
        END IF;
    END IF;

    -- Strict terminal limit check: count unrevoked terminals
    SELECT count(*) INTO v_active_terminal_count
    FROM public.terminal_authorizations
    WHERE session_id = v_session.id
      AND is_revoked = FALSE;

    IF v_active_terminal_count >= v_session.max_terminals THEN
        RAISE EXCEPTION 'Terminal limit reached (% of % active). Cannot authorize additional terminal.',
            v_active_terminal_count, v_session.max_terminals;
    END IF;

    -- Issue unpredictable token (using extensions.gen_random_bytes or gen_random_uuid)
    v_new_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_new_token_hash := encode(sha256(convert_to(v_new_token, 'UTF8')), 'hex');

    INSERT INTO public.terminal_authorizations (
        session_id,
        terminal_token_hash,
        terminal_label,
        last_seen_at
    )
    VALUES (
        v_session.id,
        v_new_token_hash,
        p_terminal_label,
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_existing_terminal.id;

    -- Audit trail
    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        auth.uid(),
        'TERMINAL_AUTHORIZED',
        v_existing_terminal.id::text,
        'terminal_authorizations',
        'success',
        jsonb_build_object('session_id', v_session.id, 'label', p_terminal_label)
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session.id,
        'session_title', v_session.session_title,
        'session_date', v_session.session_date,
        'terminal_id', v_existing_terminal.id,
        'terminal_token', v_new_token,
        'visitor_enabled', v_session.visitor_registration_enabled,
        'reconnected', false
    );
END;
$$;

-- 5. RECREATE record_member_attendance WITH ROBUST SHA256
CREATE OR REPLACE FUNCTION public.record_member_attendance(
    p_session_id UUID,
    p_member_id UUID,
    p_terminal_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_token_hash TEXT;
    v_terminal RECORD;
    v_session RECORD;
    v_member RECORD;
    v_attendance_id UUID;
    v_check_in_time TIMESTAMPTZ;
BEGIN
    v_token_hash := encode(sha256(convert_to(p_terminal_token, 'UTF8')), 'hex');

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

    -- Atomic check & insert for duplicate prevention
    IF EXISTS (
        SELECT 1 FROM public.attendance_records
        WHERE session_id = p_session_id AND member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'Duplicate attendance: Member % has already checked in.', v_member.full_name;
    END IF;

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

-- 6. RECREATE record_visitor_attendance WITH ROBUST SHA256
CREATE OR REPLACE FUNCTION public.record_visitor_attendance(
    p_session_id UUID,
    p_full_name TEXT,
    p_contact_phone TEXT,
    p_home_location TEXT,
    p_is_church_member BOOLEAN,
    p_terminal_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_token_hash TEXT;
    v_terminal RECORD;
    v_session RECORD;
    v_visitor_id UUID;
    v_check_in_time TIMESTAMPTZ;
BEGIN
    v_token_hash := encode(sha256(convert_to(p_terminal_token, 'UTF8')), 'hex');

    -- Verify terminal
    SELECT * INTO v_terminal
    FROM public.terminal_authorizations
    WHERE terminal_token_hash = v_token_hash
      AND session_id = p_session_id
      AND is_revoked = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized terminal.';
    END IF;

    -- Verify session
    SELECT * INTO v_session
    FROM public.activity_sessions
    WHERE id = p_session_id;

    IF NOT FOUND OR v_session.status != 'active' THEN
        RAISE EXCEPTION 'Session is not active.';
    END IF;

    v_check_in_time := timezone('utc'::text, now());

    INSERT INTO public.session_visitors (
        session_id,
        full_name,
        contact_phone,
        home_location_or_stake,
        is_church_member,
        recorded_by_terminal_id,
        created_at
    )
    VALUES (
        p_session_id,
        trim(p_full_name),
        p_contact_phone,
        p_home_location,
        p_is_church_member,
        v_terminal.id,
        v_check_in_time
    )
    RETURNING id INTO v_visitor_id;

    -- Update terminal last seen
    UPDATE public.terminal_authorizations
    SET last_seen_at = timezone('utc'::text, now())
    WHERE id = v_terminal.id;

    RETURN jsonb_build_object(
        'success', true,
        'visitor_id', v_visitor_id,
        'full_name', p_full_name,
        'check_in_time', v_check_in_time
    );
END;
$$;
