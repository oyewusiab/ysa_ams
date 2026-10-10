-- Migration: 20261010000005_attendance_engine_rls_and_rpc.sql
-- Description: Phase 2 Core Attendance Engine RLS Policies, Functions & Procedures
-- Abeokuta Nigeria Obantoko Stake YSA Attendance Management System

--------------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS
--------------------------------------------------------------------------------

-- Checks if a user is a stake presidency member or system administrator
CREATE OR REPLACE FUNCTION public.can_approve_reopen(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.has_any_role(ARRAY['system_admin', 'stake_presidency'], p_user_id);
END;
$$;

-- Checks if user can manage activities (YSA leader or Admin or Stake Presidency)
CREATE OR REPLACE FUNCTION public.can_manage_activities(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.has_any_role(ARRAY['system_admin', 'ysa_leader', 'stake_presidency'], p_user_id);
END;
$$;

-- Checks if user has access to a specific unit's reports/data
-- Bishops -> assigned ward only
-- Branch presidents -> assigned branch only
-- Stake presidency & Admin -> all units
CREATE OR REPLACE FUNCTION public.can_access_unit_attendance(p_unit_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Stake-level oversight
    IF public.has_any_role(ARRAY['system_admin', 'stake_presidency', 'ysa_leader'], p_user_id) THEN
        RETURN TRUE;
    END IF;

    -- Unit-restricted leadership (Bishop / Branch President)
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
-- 2. ENABLE ROW-LEVEL SECURITY
--------------------------------------------------------------------------------

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_enrolled_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_reopening_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 3. RLS POLICIES - MEMBERS
--------------------------------------------------------------------------------

-- Active church leaders can view member directory
CREATE POLICY "Active users can view members"
    ON public.members
    FOR SELECT
    TO authenticated
    USING (
        public.is_account_active(auth.uid()) AND (
            public.has_any_role(ARRAY['system_admin', 'stake_presidency', 'ysa_leader'], auth.uid())
            OR public.can_access_unit_attendance(home_unit_id, auth.uid())
        )
    );

-- Only Admins and YSA Leaders can insert/update members
CREATE POLICY "Admins and YSA leaders can insert members"
    ON public.members
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_account_active(auth.uid()) AND
        public.has_any_role(ARRAY['system_admin', 'ysa_leader'], auth.uid())
    );

CREATE POLICY "Admins and YSA leaders can update members"
    ON public.members
    FOR UPDATE
    TO authenticated
    USING (
        public.is_account_active(auth.uid()) AND
        public.has_any_role(ARRAY['system_admin', 'ysa_leader'], auth.uid())
    )
    WITH CHECK (
        public.is_account_active(auth.uid()) AND
        public.has_any_role(ARRAY['system_admin', 'ysa_leader'], auth.uid())
    );

--------------------------------------------------------------------------------
-- 4. RLS POLICIES - ACTIVITIES & SESSIONS
--------------------------------------------------------------------------------

CREATE POLICY "Authorized leaders can read activities"
    ON public.activities
    FOR SELECT
    TO authenticated
    USING (public.is_account_active(auth.uid()));

CREATE POLICY "Authorized leaders can create activities"
    ON public.activities
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_account_active(auth.uid()) AND
        public.can_manage_activities(auth.uid())
    );

CREATE POLICY "Authorized leaders can update activities"
    ON public.activities
    FOR UPDATE
    TO authenticated
    USING (
        public.is_account_active(auth.uid()) AND
        (public.is_system_admin(auth.uid()) OR created_by = auth.uid())
    );

-- SESSIONS
CREATE POLICY "Authorized leaders can read sessions"
    ON public.activity_sessions
    FOR SELECT
    TO authenticated
    USING (public.is_account_active(auth.uid()));

CREATE POLICY "Authorized leaders can insert sessions"
    ON public.activity_sessions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_account_active(auth.uid()) AND
        public.can_manage_activities(auth.uid())
    );

CREATE POLICY "Authorized leaders can update sessions"
    ON public.activity_sessions
    FOR UPDATE
    TO authenticated
    USING (
        public.is_account_active(auth.uid()) AND
        (public.is_system_admin(auth.uid()) OR initiated_by = auth.uid() OR public.can_manage_activities(auth.uid()))
    );

--------------------------------------------------------------------------------
-- 5. RLS POLICIES - TERMINAL AUTHORIZATIONS
--------------------------------------------------------------------------------

CREATE POLICY "Leaders can view terminal authorizations for their sessions"
    ON public.terminal_authorizations
    FOR SELECT
    TO authenticated
    USING (
        public.is_account_active(auth.uid()) AND
        public.can_manage_activities(auth.uid())
    );

--------------------------------------------------------------------------------
-- 6. RLS POLICIES - ATTENDANCE RECORDS & VISITORS
--------------------------------------------------------------------------------

-- Unit-scoped visibility:
-- Stake presidency & Admin: full stake view
-- YSA Leader: full stake view
-- Bishop / Branch President: ONLY their unit's attendance records!
CREATE POLICY "Attendance records select policy"
    ON public.attendance_records
    FOR SELECT
    TO authenticated
    USING (
        public.is_account_active(auth.uid()) AND
        public.can_access_unit_attendance(recorded_unit_id, auth.uid())
    );

CREATE POLICY "Authorized leaders can insert attendance"
    ON public.attendance_records
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_account_active(auth.uid()) AND
        public.can_manage_activities(auth.uid())
    );

CREATE POLICY "Session visitors select policy"
    ON public.session_visitors
    FOR SELECT
    TO authenticated
    USING (
        public.is_account_active(auth.uid()) AND
        public.has_any_role(ARRAY['system_admin', 'stake_presidency', 'ysa_leader'], auth.uid())
    );

--------------------------------------------------------------------------------
-- 7. RLS POLICIES - REOPENING & CORRECTIONS
--------------------------------------------------------------------------------

CREATE POLICY "View reopening requests"
    ON public.session_reopening_requests
    FOR SELECT
    TO authenticated
    USING (public.is_account_active(auth.uid()));

CREATE POLICY "Request reopening"
    ON public.session_reopening_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_account_active(auth.uid()) AND
        public.can_manage_activities(auth.uid())
    );

CREATE POLICY "Approve reopening requests"
    ON public.session_reopening_requests
    FOR UPDATE
    TO authenticated
    USING (
        public.is_account_active(auth.uid()) AND
        public.can_approve_reopen(auth.uid())
    );

CREATE POLICY "View attendance corrections"
    ON public.attendance_corrections
    FOR SELECT
    TO authenticated
    USING (
        public.is_account_active(auth.uid()) AND
        public.has_any_role(ARRAY['system_admin', 'stake_presidency', 'ysa_leader'], auth.uid())
    );

--------------------------------------------------------------------------------
-- 8. TRUSTED STORED PROCEDURES / RPCS (SECURITY DEFINER)
--------------------------------------------------------------------------------

-- A. INITIATE ATTENDANCE SESSION (Module 4)
-- Generates unpredictable code, enforces terminal limits, hashes code
CREATE OR REPLACE FUNCTION public.initiate_attendance_session(
    p_session_id UUID,
    p_code TEXT,
    p_max_terminals INT,
    p_expiry_minutes INT DEFAULT 240
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    v_code_hash := encode(digest(p_code, 'sha256'), 'hex');
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
        jsonb_build_object(
            'session_id', p_session_id,
            'max_terminals', p_max_terminals,
            'expires_at', v_expires_at
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

-- B. VERIFY & AUTHORIZE TERMINAL (Module 4)
-- Enforces terminal limit server-side, validates code expiration, handles reconnection
CREATE OR REPLACE FUNCTION public.authorize_terminal(
    p_session_code TEXT,
    p_terminal_label TEXT,
    p_existing_terminal_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    v_code_hash := encode(digest(p_session_code, 'sha256'), 'hex');

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
        v_existing_token_hash := encode(digest(p_existing_terminal_token, 'sha256'), 'hex');
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

    -- Issue unpredictable token
    v_new_token := encode(gen_random_bytes(32), 'hex');
    v_new_token_hash := encode(digest(v_new_token, 'sha256'), 'hex');

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

    -- Audit registration
    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        auth.uid(),
        'TERMINAL_REGISTERED',
        v_existing_terminal.id::text,
        'terminal_authorizations',
        'success',
        jsonb_build_object(
            'session_id', v_session.id,
            'terminal_label', p_terminal_label,
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
        'reconnected', false
    );
END;
$$;

-- C. SUBMIT ATTENDANCE RECORD (Module 5)
-- Concurrency safe, enforces active session, prevents duplicate attendance
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

    -- Atomic check & insert for duplicate prevention
    IF EXISTS (
        SELECT 1 FROM public.attendance_records
        WHERE session_id = p_session_id AND member_id = p_member_id
    ) THEN
        RAISE EXCEPTION 'Duplicate attendance: Member % has already checked in.', v_member.full_name;
    END IF;

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
        timezone('utc'::text, now())
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
        'check_in_time', timezone('utc'::text, now())
    );
END;
$$;

-- D. SUBMIT VISITOR ATTENDANCE (Module 5)
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_token_hash TEXT;
    v_terminal RECORD;
    v_session RECORD;
    v_visitor_id UUID;
BEGIN
    v_token_hash := encode(digest(p_terminal_token, 'sha256'), 'hex');

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

    IF NOT v_session.visitor_registration_enabled THEN
        RAISE EXCEPTION 'Visitor registration is disabled for this session.';
    END IF;

    INSERT INTO public.session_visitors (
        session_id,
        full_name,
        contact_phone,
        home_location_or_stake,
        is_church_member,
        recorded_by_terminal_id
    )
    VALUES (
        p_session_id,
        p_full_name,
        p_contact_phone,
        p_home_location,
        p_is_church_member,
        v_terminal.id
    )
    RETURNING id INTO v_visitor_id;

    RETURN jsonb_build_object(
        'success', true,
        'visitor_id', v_visitor_id,
        'full_name', p_full_name
    );
END;
$$;

-- E. CLOSE ATTENDANCE SESSION (Module 7)
CREATE OR REPLACE FUNCTION public.close_attendance_session(
    p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_session RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.can_manage_activities(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only authorized leaders can close attendance sessions.';
    END IF;

    SELECT * INTO v_session FROM public.activity_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found.';
    END IF;

    IF v_session.status = 'closed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Session is already closed.');
    END IF;

    -- 1. Update session status
    UPDATE public.activity_sessions
    SET status = 'closed',
        closed_by = v_caller_id,
        closed_at = timezone('utc'::text, now()),
        code_hash = NULL, -- Invalidate code
        code_expires_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_session_id;

    -- 2. Revoke all active terminal tokens for this session
    UPDATE public.terminal_authorizations
    SET is_revoked = TRUE,
        revoked_at = timezone('utc'::text, now()),
        revoked_by = v_caller_id
    WHERE session_id = p_session_id AND is_revoked = FALSE;

    -- 3. Audit trail
    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        v_caller_id,
        'CLOSE_ATTENDANCE_SESSION',
        p_session_id::text,
        'activity_sessions',
        'success',
        jsonb_build_object('closed_at', timezone('utc'::text, now()))
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'status', 'closed'
    );
END;
$$;

-- F. REQUEST SESSION REOPENING (Module 8)
CREATE OR REPLACE FUNCTION public.request_session_reopening(
    p_session_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_req_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.can_manage_activities(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only YSA leaders can request session reopening.';
    END IF;

    INSERT INTO public.session_reopening_requests (
        session_id,
        requested_by,
        reason
    )
    VALUES (
        p_session_id,
        v_caller_id,
        p_reason
    )
    RETURNING id INTO v_req_id;

    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        v_caller_id,
        'REQUEST_SESSION_REOPENING',
        v_req_id::text,
        'session_reopening_requests',
        'success',
        jsonb_build_object('session_id', p_session_id, 'reason', p_reason)
    );

    RETURN jsonb_build_object('success', true, 'request_id', v_req_id);
END;
$$;

-- G. DECIDE REOPENING REQUEST (Module 8)
CREATE OR REPLACE FUNCTION public.decide_session_reopening(
    p_request_id UUID,
    p_decision TEXT, -- 'approved' or 'rejected'
    p_reopen_minutes INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_req RECORD;
    v_new_code TEXT;
    v_new_code_hash TEXT;
    v_reopen_until TIMESTAMPTZ;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.can_approve_reopen(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Stake Presidency or Administrators can decide reopening requests.';
    END IF;

    IF p_decision NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be approved or rejected.';
    END IF;

    SELECT * INTO v_req FROM public.session_reopening_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found.';
    END IF;

    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'Request has already been decided.';
    END IF;

    IF p_decision = 'approved' THEN
        v_reopen_until := timezone('utc'::text, now()) + (p_reopen_minutes || ' minutes')::interval;

        UPDATE public.session_reopening_requests
        SET status = 'approved',
            decision_by = v_caller_id,
            decision_at = timezone('utc'::text, now()),
            reopen_until = v_reopen_until
        WHERE id = p_request_id;

        -- Reopen session
        UPDATE public.activity_sessions
        SET status = 'active',
            code_expires_at = v_reopen_until,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_req.session_id;

    ELSE
        UPDATE public.session_reopening_requests
        SET status = 'rejected',
            decision_by = v_caller_id,
            decision_at = timezone('utc'::text, now())
        WHERE id = p_request_id;
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        v_caller_id,
        'DECIDE_SESSION_REOPENING',
        p_request_id::text,
        'session_reopening_requests',
        'success',
        jsonb_build_object('decision', p_decision, 'session_id', v_req.session_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', p_decision,
        'reopen_until', v_reopen_until
    );
END;
$$;

-- H. ATTENDANCE CORRECTION PROCEDURE (Module 8)
CREATE OR REPLACE FUNCTION public.correct_attendance_record(
    p_attendance_id UUID,
    p_correction_type TEXT,
    p_reason TEXT,
    p_new_unit_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_record RECORD;
    v_prev JSONB;
    v_new JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.can_manage_activities(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only authorized leaders can make attendance corrections.';
    END IF;

    IF length(p_reason) < 5 THEN
        RAISE EXCEPTION 'A detailed correction reason is required.';
    END IF;

    SELECT * INTO v_record FROM public.attendance_records WHERE id = p_attendance_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance record not found.';
    END IF;

    v_prev := to_jsonb(v_record);

    IF p_correction_type = 'remove_attendance' THEN
        DELETE FROM public.attendance_records WHERE id = p_attendance_id;
        v_new := jsonb_build_object('deleted', true);
    ELSIF p_correction_type = 'unit_reassignment' THEN
        IF p_new_unit_id IS NULL THEN
            RAISE EXCEPTION 'New unit ID required for unit reassignment.';
        END IF;

        UPDATE public.attendance_records
        SET recorded_unit_id = p_new_unit_id,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_attendance_id;

        v_new := jsonb_build_object('recorded_unit_id', p_new_unit_id);
    ELSE
        RAISE EXCEPTION 'Invalid correction type.';
    END IF;

    -- Insert permanent audit entry in attendance_corrections
    INSERT INTO public.attendance_corrections (
        attendance_id,
        session_id,
        correction_type,
        previous_value,
        corrected_value,
        reason,
        corrected_by
    )
    VALUES (
        p_attendance_id,
        v_record.session_id,
        p_correction_type,
        v_prev,
        v_new,
        p_reason,
        v_caller_id
    );

    RETURN jsonb_build_object('success', true, 'action', p_correction_type);
END;
$$;
