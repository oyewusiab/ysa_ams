-- Migration: 20261011000011_terminal_access_and_attendance_persistence.sql
-- Description: Migration 11: 6-char alphanumeric code generation, atomic concurrent terminal limit with lease heartbeats, release terminal RPC, visitor unit association, and attendance persistence alignment.
-- Abeokuta Nigeria Obantoko Stake YSA Attendance Management System

-- 1. ADD inviting_unit_id TO session_visitors TABLE
-- Supports optional unit association when a non-member/guest was invited by a specific ward/branch
ALTER TABLE public.session_visitors
ADD COLUMN IF NOT EXISTS inviting_unit_id UUID REFERENCES public.stake_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_visitors_inviting_unit ON public.session_visitors(inviting_unit_id);

COMMENT ON COLUMN public.session_visitors.inviting_unit_id IS 
'Optional ward or branch through which a visitor or non-member was invited.';

-- 2. ADD lease_expires_at TO terminal_authorizations TABLE
-- Supports server-side heartbeat leases so abandoned browser tabs release capacity
ALTER TABLE public.terminal_authorizations
ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '10 minutes');

CREATE INDEX IF NOT EXISTS idx_terminal_auth_lease ON public.terminal_authorizations(lease_expires_at);

-- 3. FUNCTION TO GENERATE UNAMBIGUOUS 6-CHAR ALPHANUMERIC SESSION ATTENDANCE CODE
-- Uses unambiguous alphabet (no 0/O, 1/I/L)
CREATE OR REPLACE FUNCTION public.generate_session_attendance_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_alphabet TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    v_len INT := length(v_alphabet);
    v_code TEXT := '';
    v_i INT;
    v_rand_byte INT;
    v_bytes BYTEA;
BEGIN
    v_bytes := extensions.gen_random_bytes(6);
    FOR v_i IN 0..5 LOOP
        v_rand_byte := get_byte(v_bytes, v_i);
        v_code := v_code || substr(v_alphabet, (v_rand_byte % v_len) + 1, 1);
    END LOOP;
    RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_session_attendance_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_session_attendance_code() TO authenticated;

-- 4. UPDATE initiate_attendance_session TO SECURELY HANDLE 6-CHAR CODE & REVOKE PREVIOUS TERMINALS ON REGENERATION
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
    v_clean_code TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.can_manage_activities(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only authorized YSA leaders or admins can initiate attendance.';
    END IF;

    IF p_max_terminals < 1 OR p_max_terminals > 10 THEN
        RAISE EXCEPTION 'Invalid terminal limit: Must be between 1 and 10.';
    END IF;

    v_clean_code := upper(trim(p_code));
    IF length(v_clean_code) < 4 THEN
        RAISE EXCEPTION 'Invalid session code: Must be at least 4 characters.';
    END IF;

    SELECT * INTO v_session FROM public.activity_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found.';
    END IF;

    IF v_session.status = 'closed' THEN
        RAISE EXCEPTION 'Cannot initiate a closed session.';
    END IF;

    -- Compute SHA-256 hash of the uppercase cleaned code
    v_code_hash := encode(sha256(convert_to(v_clean_code, 'UTF8')), 'hex');
    v_expires_at := timezone('utc'::text, now()) + (p_expiry_minutes || ' minutes')::interval;

    -- Invalidate existing terminal authorizations if code is being regenerated or session re-initiated
    IF v_session.status = 'active' AND (v_session.code_hash IS DISTINCT FROM v_code_hash) THEN
        UPDATE public.terminal_authorizations
        SET is_revoked = TRUE,
            revoked_at = timezone('utc'::text, now()),
            revoked_by = v_caller_id
        WHERE session_id = p_session_id
          AND is_revoked = FALSE;
    END IF;

    UPDATE public.activity_sessions
    SET status = 'active',
        max_terminals = p_max_terminals,
        code_hash = v_code_hash,
        code_expires_at = v_expires_at,
        initiated_by = v_caller_id,
        initiated_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_session_id;

    -- Audit trail (without exposing raw session code!)
    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        v_caller_id,
        'INITIATE_ATTENDANCE_SESSION',
        p_session_id::text,
        'activity_sessions',
        'success',
        jsonb_build_object(
            'session_id', p_session_id,
            'max_terminals', p_max_terminals,
            'expiry_minutes', p_expiry_minutes,
            'regenerated', (v_session.status = 'active')
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'status', 'active',
        'expires_at', v_expires_at
    );
END;
$$;

-- 5. ATOMIC AUTHORIZE TERMINAL WITH LEASE EXPIRATION & SAFE CONCURRENCY LOCK
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
    v_clean_code TEXT;
    v_code_hash TEXT;
    v_session RECORD;
    v_active_terminal_count INT;
    v_new_token TEXT;
    v_new_token_hash TEXT;
    v_existing_token_hash TEXT;
    v_existing_terminal RECORD;
    v_now TIMESTAMPTZ;
    v_lease_duration INTERVAL := interval '10 minutes';
BEGIN
    v_now := timezone('utc'::text, now());
    v_clean_code := upper(trim(p_session_code));
    v_code_hash := encode(sha256(convert_to(v_clean_code, 'UTF8')), 'hex');

    -- Find matching active session using row-level locking to serialize concurrent authorization attempts
    SELECT * INTO v_session
    FROM public.activity_sessions
    WHERE code_hash = v_code_hash
      AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Record failed authorization attempt (never log raw code)
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

    -- Check session expiration
    IF v_session.code_expires_at IS NOT NULL AND v_session.code_expires_at < v_now THEN
        RAISE EXCEPTION 'Attendance session code has expired.';
    END IF;

    -- Reconnection with existing valid token on the same session
    IF p_existing_terminal_token IS NOT NULL AND length(trim(p_existing_terminal_token)) > 0 THEN
        v_existing_token_hash := encode(sha256(convert_to(trim(p_existing_terminal_token), 'UTF8')), 'hex');
        SELECT * INTO v_existing_terminal
        FROM public.terminal_authorizations
        WHERE terminal_token_hash = v_existing_token_hash
          AND session_id = v_session.id
          AND is_revoked = FALSE;

        IF FOUND THEN
            -- Renew lease and update last seen
            UPDATE public.terminal_authorizations
            SET last_seen_at = v_now,
                lease_expires_at = v_now + v_lease_duration
            WHERE id = v_existing_terminal.id;

            RETURN jsonb_build_object(
                'success', true,
                'session_id', v_session.id,
                'session_title', v_session.session_title,
                'session_date', v_session.session_date,
                'terminal_id', v_existing_terminal.id,
                'terminal_token', trim(p_existing_terminal_token),
                'visitor_enabled', v_session.visitor_registration_enabled,
                'enable_time_in', COALESCE(v_session.enable_time_in, false),
                'reconnected', true
            );
        END IF;
    END IF;

    -- Clean up stale terminal leases that have expired so abandoned browser tabs do not permanently consume capacity
    UPDATE public.terminal_authorizations
    SET is_revoked = TRUE,
        revoked_at = v_now
    WHERE session_id = v_session.id
      AND is_revoked = FALSE
      AND lease_expires_at < v_now;

    -- Count active non-expired terminals
    SELECT count(*) INTO v_active_terminal_count
    FROM public.terminal_authorizations
    WHERE session_id = v_session.id
      AND is_revoked = FALSE
      AND lease_expires_at >= v_now;

    IF v_active_terminal_count >= v_session.max_terminals THEN
        RAISE EXCEPTION 'Terminal limit reached (% of % active). Please contact the session administrator.',
            v_active_terminal_count, v_session.max_terminals;
    END IF;

    -- Generate unpredictable bearer token
    v_new_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_new_token_hash := encode(sha256(convert_to(v_new_token, 'UTF8')), 'hex');

    INSERT INTO public.terminal_authorizations (
        session_id,
        terminal_token_hash,
        terminal_label,
        last_seen_at,
        lease_expires_at
    )
    VALUES (
        v_session.id,
        v_new_token_hash,
        COALESCE(NULLIF(trim(p_terminal_label), ''), 'Attendance Terminal'),
        v_now,
        v_now + v_lease_duration
    )
    RETURNING id INTO v_existing_terminal.id;

    -- Audit registration (without storing raw access code)
    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        auth.uid(),
        'TERMINAL_AUTHORIZED',
        v_existing_terminal.id::text,
        'terminal_authorizations',
        'success',
        jsonb_build_object(
            'session_id', v_session.id,
            'label', p_terminal_label,
            'active_terminals_now', v_active_terminal_count + 1,
            'limit', v_session.max_terminals
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session.id,
        'session_title', v_session.session_title,
        'session_date', v_session.session_date,
        'terminal_id', v_existing_terminal.id,
        'terminal_token', v_new_token,
        'visitor_enabled', v_session.visitor_registration_enabled,
        'enable_time_in', COALESCE(v_session.enable_time_in, false),
        'reconnected', false
    );
END;
$$;

-- 6. RPC: TERMINAL HEARTBEAT LEASE RENEWAL
CREATE OR REPLACE FUNCTION public.heartbeat_terminal_lease(p_terminal_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_token_hash TEXT;
    v_terminal RECORD;
    v_now TIMESTAMPTZ;
BEGIN
    v_now := timezone('utc'::text, now());
    v_token_hash := encode(sha256(convert_to(trim(p_terminal_token), 'UTF8')), 'hex');

    SELECT t.*, s.status AS session_status INTO v_terminal
    FROM public.terminal_authorizations t
    JOIN public.activity_sessions s ON s.id = t.session_id
    WHERE t.terminal_token_hash = v_token_hash
      AND t.is_revoked = FALSE;

    IF NOT FOUND OR v_terminal.session_status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Terminal lease revoked or session not active');
    END IF;

    UPDATE public.terminal_authorizations
    SET last_seen_at = v_now,
        lease_expires_at = v_now + interval '10 minutes'
    WHERE id = v_terminal.id;

    RETURN jsonb_build_object('success', true, 'lease_expires_at', v_now + interval '10 minutes');
END;
$$;

REVOKE ALL ON FUNCTION public.heartbeat_terminal_lease(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_terminal_lease(TEXT) TO anon, authenticated;

-- 7. RPC: EXPLICIT RELEASE TERMINAL REGISTRATION
CREATE OR REPLACE FUNCTION public.release_terminal(p_terminal_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_token_hash TEXT;
    v_terminal RECORD;
BEGIN
    v_token_hash := encode(sha256(convert_to(trim(p_terminal_token), 'UTF8')), 'hex');

    SELECT * INTO v_terminal
    FROM public.terminal_authorizations
    WHERE terminal_token_hash = v_token_hash
      AND is_revoked = FALSE;

    IF FOUND THEN
        UPDATE public.terminal_authorizations
        SET is_revoked = TRUE,
            revoked_at = timezone('utc'::text, now())
        WHERE id = v_terminal.id;

        INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
        VALUES (
            auth.uid(),
            'TERMINAL_RELEASED',
            v_terminal.id::text,
            'terminal_authorizations',
            'success',
            jsonb_build_object('session_id', v_terminal.session_id)
        );
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.release_terminal(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_terminal(TEXT) TO anon, authenticated;

-- 8. UPDATE record_member_attendance TO RENEW TERMINAL LEASE ON ATTENDANCE AND VERIFY ELIGIBILITY
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
    v_now TIMESTAMPTZ;
BEGIN
    v_now := timezone('utc'::text, now());
    v_token_hash := encode(sha256(convert_to(trim(p_terminal_token), 'UTF8')), 'hex');

    -- Verify terminal authorization & active lease
    SELECT * INTO v_terminal
    FROM public.terminal_authorizations
    WHERE terminal_token_hash = v_token_hash
      AND session_id = p_session_id
      AND is_revoked = FALSE
      AND lease_expires_at >= v_now;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized terminal token, terminal revoked, or terminal lease expired.';
    END IF;

    -- Verify session is active
    SELECT * INTO v_session
    FROM public.activity_sessions
    WHERE id = p_session_id;

    IF NOT FOUND OR v_session.status != 'active' THEN
        RAISE EXCEPTION 'Session is not active. Attendance writes are closed.';
    END IF;

    -- Verify member exists & fetch unit
    SELECT * INTO v_member
    FROM public.members
    WHERE id = p_member_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member record not found.';
    END IF;

    -- Verify session eligibility rule
    IF v_session.eligibility_rule = 'specific_units' THEN
        IF v_session.participating_units IS NULL OR NOT (v_member.home_unit_id = ANY(v_session.participating_units)) THEN
            RAISE EXCEPTION 'Member % is not in a participating unit for this activity.', v_member.full_name;
        END IF;
    ELSIF v_session.eligibility_rule = 'custom_enrolled' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.session_enrolled_members
            WHERE session_id = p_session_id AND member_id = p_member_id
        ) THEN
            RAISE EXCEPTION 'Member % is not enrolled for this session.', v_member.full_name;
        END IF;
    END IF;

    -- Atomic check & insert for duplicate prevention: prevent overwriting original check_in_time
    IF EXISTS (
        SELECT 1 FROM public.attendance_records
        WHERE session_id = p_session_id AND member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'Duplicate check-in: % has already been marked present for this session.', v_member.full_name;
    END IF;

    -- Trusted server clock
    v_check_in_time := v_now;

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

    -- Update terminal last seen and extend lease
    UPDATE public.terminal_authorizations
    SET last_seen_at = v_now,
        lease_expires_at = v_now + interval '10 minutes'
    WHERE id = v_terminal.id;

    RETURN jsonb_build_object(
        'success', true,
        'attendance_id', v_attendance_id,
        'member_name', v_member.full_name,
        'check_in_time', v_check_in_time
    );
END;
$$;

-- 9. UPDATE record_visitor_attendance TO SUPPORT OPTIONAL INVITING UNIT ID
CREATE OR REPLACE FUNCTION public.record_visitor_attendance(
    p_session_id UUID,
    p_full_name TEXT,
    p_contact_phone TEXT,
    p_home_location TEXT,
    p_is_church_member BOOLEAN,
    p_terminal_token TEXT,
    p_inviting_unit_id UUID DEFAULT NULL
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
    v_now TIMESTAMPTZ;
BEGIN
    v_now := timezone('utc'::text, now());
    v_token_hash := encode(sha256(convert_to(trim(p_terminal_token), 'UTF8')), 'hex');

    -- Verify terminal authorization & active lease
    SELECT * INTO v_terminal
    FROM public.terminal_authorizations
    WHERE terminal_token_hash = v_token_hash
      AND session_id = p_session_id
      AND is_revoked = FALSE
      AND lease_expires_at >= v_now;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized terminal token, terminal revoked, or terminal lease expired.';
    END IF;

    -- Verify session
    SELECT * INTO v_session
    FROM public.activity_sessions
    WHERE id = p_session_id;

    IF NOT FOUND OR v_session.status != 'active' THEN
        RAISE EXCEPTION 'Session is not active.';
    END IF;

    IF trim(p_full_name) IS NULL OR length(trim(p_full_name)) < 2 THEN
        RAISE EXCEPTION 'Visitor full name is required (at least 2 characters).';
    END IF;

    -- Validate inviting unit if provided
    IF p_inviting_unit_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.stake_units WHERE id = p_inviting_unit_id AND is_active = TRUE) THEN
            RAISE EXCEPTION 'Selected inviting unit is invalid or inactive.';
        END IF;
    END IF;

    v_check_in_time := v_now;

    INSERT INTO public.session_visitors (
        session_id,
        full_name,
        contact_phone,
        home_location_or_stake,
        is_church_member,
        recorded_by_terminal_id,
        inviting_unit_id,
        created_at
    )
    VALUES (
        p_session_id,
        trim(p_full_name),
        p_contact_phone,
        p_home_location,
        COALESCE(p_is_church_member, FALSE),
        v_terminal.id,
        p_inviting_unit_id,
        v_check_in_time
    )
    RETURNING id INTO v_visitor_id;

    -- Update terminal last seen & extend lease
    UPDATE public.terminal_authorizations
    SET last_seen_at = v_now,
        lease_expires_at = v_now + interval '10 minutes'
    WHERE id = v_terminal.id;

    RETURN jsonb_build_object(
        'success', true,
        'visitor_id', v_visitor_id,
        'full_name', trim(p_full_name),
        'check_in_time', v_check_in_time
    );
END;
$$;

-- 10. UPDATE submit_public_attendance TO SAVE INVITING UNIT FOR NON-MEMBERS
CREATE OR REPLACE FUNCTION public.submit_public_attendance(
    p_session_id UUID,
    p_attendee_name TEXT,
    p_is_non_member BOOLEAN,
    p_selected_unit_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
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

    -- 2. Validate unit requirement rule:
    -- For registered members: selected_unit_id is REQUIRED.
    -- For non-members: selected_unit_id is OPTIONAL (inviting unit).
    IF (p_is_non_member IS FALSE OR p_is_non_member IS NULL) THEN
        IF p_selected_unit_id IS NULL THEN
            RAISE EXCEPTION 'Unit is required for Church members. Please select your ward or branch.';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.stake_units WHERE id = p_selected_unit_id AND is_active = TRUE) THEN
            RAISE EXCEPTION 'Selected unit is invalid or inactive.';
        END IF;
    ELSE
        -- If non-member specified an inviting unit, validate it
        IF p_selected_unit_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.stake_units WHERE id = p_selected_unit_id AND is_active = TRUE) THEN
                RAISE EXCEPTION 'Selected unit is invalid or inactive.';
            END IF;
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

    -- 4. Check if attendee matches an existing member (only if not explicit non-member)
    IF p_is_non_member IS NOT TRUE THEN
        SELECT id INTO v_matched_member_id
        FROM public.members
        WHERE lower(trim(full_name)) = v_norm_name
        LIMIT 1;
    END IF;

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

    -- Also mirror into attendance_records if matched to a known registered member
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

    -- If marked as non-member, mirror into session_visitors with optional inviting unit
    IF p_is_non_member IS TRUE THEN
        INSERT INTO public.session_visitors (
            session_id,
            full_name,
            is_church_member,
            inviting_unit_id,
            created_at
        )
        VALUES (
            p_session_id,
            v_clean_name,
            FALSE,
            p_selected_unit_id,
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
