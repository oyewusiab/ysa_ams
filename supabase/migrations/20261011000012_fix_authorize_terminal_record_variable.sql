-- Migration: 20261011000012_fix_authorize_terminal_record_variable.sql
-- Description: Fix PostgreSQL runtime error "record \"v_existing_terminal\" is not assigned yet" (55000)
-- in public.authorize_terminal() by using a strongly-typed scalar UUID variable (v_terminal_id) instead of
-- assigning into an unassigned composite RECORD variable.

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
    v_terminal_id UUID;
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
        SELECT id INTO v_terminal_id
        FROM public.terminal_authorizations
        WHERE terminal_token_hash = v_existing_token_hash
          AND session_id = v_session.id
          AND is_revoked = FALSE;

        IF FOUND THEN
            -- Renew lease and update last seen
            UPDATE public.terminal_authorizations
            SET last_seen_at = v_now,
                lease_expires_at = v_now + v_lease_duration
            WHERE id = v_terminal_id;

            RETURN jsonb_build_object(
                'success', true,
                'session_id', v_session.id,
                'session_title', v_session.session_title,
                'session_date', v_session.session_date,
                'terminal_id', v_terminal_id,
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
    RETURNING id INTO v_terminal_id;

    -- Audit registration (without storing raw access code)
    INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
    VALUES (
        auth.uid(),
        'TERMINAL_AUTHORIZED',
        v_terminal_id::text,
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
        'terminal_id', v_terminal_id,
        'terminal_token', v_new_token,
        'visitor_enabled', v_session.visitor_registration_enabled,
        'enable_time_in', COALESCE(v_session.enable_time_in, false),
        'reconnected', false
    );
END;
$$;

-- Grant execution to public / anon and authenticated
GRANT EXECUTE ON FUNCTION public.authorize_terminal(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.authorize_terminal(TEXT, TEXT, TEXT) TO authenticated;
