-- Migration: 20261010000008_phase_3_reporting_and_analytics.sql
-- Description: Phase 3 Reporting, Registers, Analytics and Aggregation Schema
-- Author: Senior Systems Architect, Database Engineer & Security Specialist

--------------------------------------------------------------------------------
-- 1. EXTEND ATTENDANCE RECORDS FOR APPROVED EXCUSED ABSENCES (Backward Compatible)
--------------------------------------------------------------------------------
-- Supports recording an official excused absence if recognized by leadership.
-- Defaults to 'present' for normal check-ins.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'attendance_records' 
          AND column_name = 'attendance_status'
    ) THEN
        ALTER TABLE public.attendance_records 
        ADD COLUMN attendance_status TEXT NOT NULL DEFAULT 'present' 
        CHECK (attendance_status IN ('present', 'excused'));
    END IF;
END $$;

--------------------------------------------------------------------------------
-- 2. REPORTING PERFORMANCE INDEXES
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_activity_sessions_month_year 
    ON public.activity_sessions(EXTRACT(YEAR FROM session_date), EXTRACT(MONTH FROM session_date));

CREATE INDEX IF NOT EXISTS idx_activity_sessions_status_date
    ON public.activity_sessions(status, session_date);

CREATE INDEX IF NOT EXISTS idx_attendance_records_composite_reporting 
    ON public.attendance_records(recorded_unit_id, session_id, member_id);

CREATE INDEX IF NOT EXISTS idx_members_home_unit_active 
    ON public.members(home_unit_id, is_active);

--------------------------------------------------------------------------------
-- 3. FUNCTION: get_monthly_attendance_register
-- Aggregates eligible finalized sessions for a given year, month, and unit scope.
-- Strict rules:
--   - Only 'closed' sessions are finalized attendance opportunities.
--   - 'all_ysa': if participating_units is NULL or empty, all units; otherwise home_unit_id must be in participating_units.
--   - 'specific_units': home_unit_id must be in participating_units.
--   - 'custom_enrolled': member_id must exist in session_enrolled_members.
--   - Percentage is NULL if total_eligible is 0 (prevents division by zero or misleading 0%).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monthly_attendance_register(
    p_year INT,
    p_month INT,
    p_unit_id UUID DEFAULT NULL
)
RETURNS TABLE (
    member_id UUID,
    full_name TEXT,
    home_unit_id UUID,
    unit_name TEXT,
    unit_type TEXT,
    eligible_sessions_count BIGINT,
    attended_count BIGINT,
    excused_count BIGINT,
    absent_count BIGINT,
    attendance_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();

    -- Permission check
    IF NOT public.is_account_active(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller account is not active.';
    END IF;

    -- Unit-scoping verification
    IF p_unit_id IS NOT NULL AND NOT public.can_access_unit_attendance(p_unit_id, v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You are not authorized to view attendance reports for this unit.';
    END IF;

    RETURN QUERY
    WITH eligible_sessions AS (
        SELECT s.id, s.session_date, s.status, s.participating_units, s.eligibility_rule
        FROM public.activity_sessions s
        WHERE EXTRACT(YEAR FROM s.session_date) = p_year
          AND EXTRACT(MONTH FROM s.session_date) = p_month
          AND s.status = 'closed'
    ),
    unit_members AS (
        SELECT m.id AS m_id, m.full_name AS m_name, m.home_unit_id AS m_unit_id, u.unit_name AS u_name, u.unit_type AS u_type
        FROM public.members m
        JOIN public.stake_units u ON u.id = m.home_unit_id
        WHERE m.is_active = TRUE
          AND (p_unit_id IS NULL OR m.home_unit_id = p_unit_id)
          AND (p_unit_id IS NOT NULL OR public.can_access_unit_attendance(m.home_unit_id, v_caller_id))
    ),
    member_eligibility AS (
        SELECT 
            um.m_id,
            um.m_name,
            um.m_unit_id,
            um.u_name,
            um.u_type,
            es.id AS session_id
        FROM unit_members um
        CROSS JOIN eligible_sessions es
        WHERE 
            -- Rule 1: all_ysa
            (es.eligibility_rule = 'all_ysa' AND (es.participating_units IS NULL OR cardinality(es.participating_units) = 0 OR um.m_unit_id = ANY(es.participating_units)))
            -- Rule 2: specific_units
            OR (es.eligibility_rule = 'specific_units' AND (es.participating_units IS NOT NULL AND um.m_unit_id = ANY(es.participating_units)))
            -- Rule 3: custom_enrolled
            OR (es.eligibility_rule = 'custom_enrolled' AND EXISTS (
                SELECT 1 FROM public.session_enrolled_members sem WHERE sem.session_id = es.id AND sem.member_id = um.m_id
            ))
    ),
    member_stats AS (
        SELECT 
            um.m_id,
            um.m_name,
            um.m_unit_id,
            um.u_name,
            um.u_type,
            COUNT(DISTINCT me.session_id) AS total_eligible,
            COUNT(DISTINCT CASE WHEN ar.attendance_status = 'present' THEN me.session_id END) AS total_attended,
            COUNT(DISTINCT CASE WHEN ar.attendance_status = 'excused' THEN me.session_id END) AS total_excused
        FROM unit_members um
        LEFT JOIN member_eligibility me ON me.m_id = um.m_id
        LEFT JOIN public.attendance_records ar 
            ON ar.session_id = me.session_id 
           AND ar.member_id = me.m_id
        GROUP BY um.m_id, um.m_name, um.m_unit_id, um.u_name, um.u_type
    )
    SELECT 
        ms.m_id,
        ms.m_name,
        ms.m_unit_id,
        ms.u_name,
        ms.u_type,
        ms.total_eligible,
        ms.total_attended,
        ms.total_excused,
        GREATEST(0, ms.total_eligible - (ms.total_attended + ms.total_excused)) AS absent_count,
        CASE 
            WHEN ms.total_eligible > 0 THEN 
                ROUND(((ms.total_attended::NUMERIC / ms.total_eligible::NUMERIC) * 100.0), 1)
            ELSE NULL 
        END AS attendance_percentage
    FROM member_stats ms
    ORDER BY ms.u_name ASC, ms.m_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_attendance_register(INT, INT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_attendance_register(INT, INT, UUID) TO authenticated;

--------------------------------------------------------------------------------
-- 4. FUNCTION: get_stake_analytics_summary
-- Stake presidency and Admin high-level metrics with fair sum of eligible opportunities
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_stake_analytics_summary(
    p_year INT,
    p_month INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_result JSONB;
BEGIN
    v_caller_id := auth.uid();

    -- Only Stake Presidency and Admin can call this overview
    IF NOT (public.is_system_admin(v_caller_id) OR public.has_any_role(ARRAY['stake_presidency'], v_caller_id)) THEN
        RAISE EXCEPTION 'Unauthorized: Stake Analytics is restricted to Stake Presidency and Administrators.';
    END IF;

    WITH period_sessions AS (
        SELECT s.id, s.status, s.session_date, s.participating_units, s.eligibility_rule
        FROM public.activity_sessions s
        WHERE EXTRACT(YEAR FROM s.session_date) = p_year
          AND EXTRACT(MONTH FROM s.session_date) = p_month
    ),
    closed_sessions AS (
        SELECT id, participating_units, eligibility_rule FROM period_sessions WHERE status = 'closed'
    ),
    pending_sessions AS (
        SELECT id FROM period_sessions WHERE status IN ('active', 'draft')
    ),
    period_attendance AS (
        SELECT ar.id, ar.session_id, ar.member_id, ar.recorded_unit_id, ar.attendance_status
        FROM public.attendance_records ar
        JOIN closed_sessions cs ON cs.id = ar.session_id
    ),
    active_units AS (
        SELECT id, unit_name, unit_type FROM public.stake_units WHERE is_active = TRUE
    ),
    active_members AS (
        SELECT id, home_unit_id FROM public.members WHERE is_active = TRUE
    ),
    -- Calculate exact eligible member opportunities for closed sessions
    eligible_pairs AS (
        SELECT m.id AS member_id, cs.id AS session_id
        FROM active_members m
        CROSS JOIN closed_sessions cs
        WHERE 
            (cs.eligibility_rule = 'all_ysa' AND (cs.participating_units IS NULL OR cardinality(cs.participating_units) = 0 OR m.home_unit_id = ANY(cs.participating_units)))
            OR (cs.eligibility_rule = 'specific_units' AND (cs.participating_units IS NOT NULL AND m.home_unit_id = ANY(cs.participating_units)))
            OR (cs.eligibility_rule = 'custom_enrolled' AND EXISTS (
                SELECT 1 FROM public.session_enrolled_members sem WHERE sem.session_id = cs.id AND sem.member_id = m.id
            ))
    ),
    total_eligible_count AS (
        SELECT COUNT(*) AS count FROM eligible_pairs
    ),
    reopening_requests_count AS (
        SELECT COUNT(*) AS count
        FROM public.session_reopening_requests r
        JOIN period_sessions ps ON ps.id = r.session_id
        WHERE r.status = 'pending'
    ),
    corrections_count AS (
        SELECT COUNT(*) AS count
        FROM public.attendance_corrections c
        JOIN period_sessions ps ON ps.id = c.session_id
    )
    SELECT jsonb_build_object(
        'reporting_year', p_year,
        'reporting_month', p_month,
        'total_registered_ysa', (SELECT COUNT(*) FROM active_members),
        'active_units_count', (SELECT COUNT(*) FROM active_units),
        'finalized_sessions_count', (SELECT COUNT(*) FROM closed_sessions),
        'pending_sessions_count', (SELECT COUNT(*) FROM pending_sessions),
        'total_eligible_opportunities', (SELECT count FROM total_eligible_count),
        'total_attendance_instances', (SELECT COUNT(*) FROM period_attendance WHERE attendance_status = 'present'),
        'total_excused_instances', (SELECT COUNT(*) FROM period_attendance WHERE attendance_status = 'excused'),
        'overall_attendance_percentage', (
            SELECT CASE 
                WHEN tec.count > 0 THEN 
                    ROUND(((COUNT(pa.id)::NUMERIC / tec.count::NUMERIC) * 100.0), 1)
                ELSE NULL 
            END
            FROM total_eligible_count tec
            LEFT JOIN period_attendance pa ON pa.attendance_status = 'present'
            GROUP BY tec.count
        ),
        'pending_reopening_requests', (SELECT count FROM reopening_requests_count),
        'attendance_corrections_count', (SELECT count FROM corrections_count)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stake_analytics_summary(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stake_analytics_summary(INT, INT) TO authenticated;
