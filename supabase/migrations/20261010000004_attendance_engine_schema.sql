-- Migration: 20261010000004_attendance_engine_schema.sql
-- Description: Phase 2 Core Activity & Attendance Engine Data Model
-- Abeokuta Nigeria Obantoko Stake YSA Attendance Management System

-- 1. YSA MEMBERS REGISTER (Module 1)
-- Stable internal member register. Unit-scoped, preserves historical attendance on transfer.
CREATE TABLE IF NOT EXISTS public.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_number TEXT UNIQUE, -- Optional internal stable church/stake identifier
    full_name TEXT NOT NULL,
    preferred_name TEXT,
    gender TEXT CHECK (gender IN ('male', 'female')),
    phone_number TEXT,
    email TEXT,
    home_unit_id UUID NOT NULL REFERENCES public.stake_units(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_members_home_unit_id ON public.members(home_unit_id);
CREATE INDEX IF NOT EXISTS idx_members_is_active ON public.members(is_active);
CREATE INDEX IF NOT EXISTS idx_members_full_name ON public.members(full_name);

COMMENT ON TABLE public.members IS 'YSA members registry within the Obantoko Stake.';

-- 2. ACTIVITIES (Templates / Definitions) (Module 2)
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (
        category IN ('spiritual', 'social', 'service', 'sports', 'temple', 'educational', 'other')
    ),
    default_participating_units UUID[] DEFAULT NULL, -- Array of stake_units IDs or NULL for all
    eligibility_rule TEXT NOT NULL DEFAULT 'all_ysa' CHECK (
        eligibility_rule IN ('all_ysa', 'specific_units', 'custom_enrolled')
    ),
    visitor_registration_default BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_activities_category ON public.activities(category);
CREATE INDEX IF NOT EXISTS idx_activities_created_by ON public.activities(created_by);

COMMENT ON TABLE public.activities IS 'Reusable activity templates and definitions.';

-- 3. ACTIVITY SESSIONS (Actual Attendance Instances) (Module 2 & 3)
CREATE TABLE IF NOT EXISTS public.activity_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE RESTRICT,
    session_title TEXT NOT NULL,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    scheduled_end_time TIME,
    timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'active', 'closed')
    ),
    participating_units UUID[] DEFAULT NULL,
    eligibility_rule TEXT NOT NULL DEFAULT 'all_ysa' CHECK (
        eligibility_rule IN ('all_ysa', 'specific_units', 'custom_enrolled')
    ),
    visitor_registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    max_terminals INT NOT NULL DEFAULT 1 CHECK (max_terminals >= 1 AND max_terminals <= 10),
    
    -- Cryptographic session authorization code storage
    -- We store the argon2 / sha256 hash of the 6-digit session code, never plaintext!
    code_hash TEXT,
    code_expires_at TIMESTAMPTZ,
    
    -- Life cycle tracking
    initiated_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    initiated_at TIMESTAMPTZ,
    closed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_activity_sessions_activity_id ON public.activity_sessions(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_sessions_status ON public.activity_sessions(status);
CREATE INDEX IF NOT EXISTS idx_activity_sessions_date ON public.activity_sessions(session_date);

COMMENT ON TABLE public.activity_sessions IS 'Attendance session instances for activities.';

-- 4. SESSION ENROLLED MEMBERS (For custom_enrolled rules)
CREATE TABLE IF NOT EXISTS public.session_enrolled_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_session_enrolled_member UNIQUE (session_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_session_enrolled_session ON public.session_enrolled_members(session_id);

-- 5. ATTENDANCE TERMINAL AUTHORIZATIONS (Module 4)
-- Cryptographically issued terminal tokens per session
CREATE TABLE IF NOT EXISTS public.terminal_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
    terminal_token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the bearer terminal token
    terminal_label TEXT NOT NULL, -- e.g. "Terminal #1 (Front Desk Tablet)"
    authorized_ip TEXT,
    user_agent TEXT,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_terminal_auth_session_id ON public.terminal_authorizations(session_id);
CREATE INDEX IF NOT EXISTS idx_terminal_auth_token_hash ON public.terminal_authorizations(terminal_token_hash);

COMMENT ON TABLE public.terminal_authorizations IS 'Authorized attendance recording terminals bound to active sessions.';

-- 6. ATTENDANCE RECORDS (Module 3 & 5)
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.activity_sessions(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
    recorded_unit_id UUID NOT NULL REFERENCES public.stake_units(id) ON DELETE RESTRICT, -- Preserves home unit at time of attendance
    recorded_by_terminal_id UUID REFERENCES public.terminal_authorizations(id) ON DELETE SET NULL,
    marked_by_user UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_session_member_attendance UNIQUE (session_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_session_id ON public.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_member_id ON public.attendance_records(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_recorded_unit ON public.attendance_records(recorded_unit_id);

COMMENT ON TABLE public.attendance_records IS 'Official recorded check-ins for YSA members.';

-- 7. VISITOR RECORDS (Module 5)
CREATE TABLE IF NOT EXISTS public.session_visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.activity_sessions(id) ON DELETE RESTRICT,
    full_name TEXT NOT NULL,
    contact_phone TEXT,
    home_location_or_stake TEXT,
    is_church_member BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_by_terminal_id UUID REFERENCES public.terminal_authorizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_session_visitors_session_id ON public.session_visitors(session_id);

COMMENT ON TABLE public.session_visitors IS 'Visitor attendance records when visitor registration is enabled.';

-- 8. SESSION REOPENING REQUESTS (Module 8)
CREATE TABLE IF NOT EXISTS public.session_reopening_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    decision_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    decision_reason TEXT,
    decision_at TIMESTAMPTZ,
    reopen_until TIMESTAMPTZ, -- Time-limited window if approved
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_reopening_requests_session_id ON public.session_reopening_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_reopening_requests_status ON public.session_reopening_requests(status);

COMMENT ON TABLE public.session_reopening_requests IS 'Audited requests to temporarily reopen a closed attendance session.';

-- 9. ATTENDANCE CORRECTIONS AUDIT (Module 8)
CREATE TABLE IF NOT EXISTS public.attendance_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID REFERENCES public.attendance_records(id) ON DELETE SET NULL,
    session_id UUID NOT NULL REFERENCES public.activity_sessions(id) ON DELETE RESTRICT,
    correction_type TEXT NOT NULL CHECK (correction_type IN ('remove_attendance', 'unit_reassignment', 'manual_add')),
    previous_value JSONB,
    corrected_value JSONB,
    reason TEXT NOT NULL,
    corrected_by UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_session_id ON public.attendance_corrections(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_attendance_id ON public.attendance_corrections(attendance_id);

COMMENT ON TABLE public.attendance_corrections IS 'Immutable audit log of historical attendance corrections.';
