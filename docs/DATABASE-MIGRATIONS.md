# Database Migrations Discipline — YSA AMS

## 1. Migration Overview

All schema definitions, constraints, triggers, and Row-Level Security policies are strictly version-controlled inside `supabase/migrations/`.

### Execution Order:
1. `20261010000001_initial_schema.sql`
   - Extensions (`pgcrypto`).
   - Tables: `stake_units`, `user_profiles`, `user_roles`, `user_unit_assignments`, `audit_logs`.
   - Audit protection trigger (`fn_prevent_audit_log_modification`).
   - Unit validation trigger (`fn_validate_unit_assignment`).
   - Auto-profile trigger on `auth.users` (`handle_new_user`).
   - Last admin deletion prevention trigger (`fn_prevent_last_admin_removal`).
2. `20261010000002_rls_and_security_policies.sql`
   - Authorization helper functions: `is_system_admin()`, `is_account_active()`, `has_any_role()`, `has_unit_assignment()`.
   - Enables RLS on all 5 application tables.
   - Declares explicit SELECT, INSERT, UPDATE, and DELETE policies.
3. `20261010000003_secure_bootstrap_and_rpc.sql`
   - `bootstrap_initial_admin()` function.
   - `manage_user_role()` RPC function.
   - `update_user_account_status()` RPC function.
   - Seeds initial Abeokuta Nigeria Obantoko Stake units (`Obantoko 1st Ward`, `Obantoko 2nd Ward`, `Asero Ward`, `Adatan Ward`, `Alabata Branch`, `Odeda Branch`, `Osiele Branch`).
...
11. `20261011000011_terminal_access_and_attendance_persistence.sql`
   - Session-code-based terminal authorization, heartbeat lease, and release RPCs.
   - Hardened atomic attendance recording and visitor tracking.
12. `20261011000012_fix_authorize_terminal_record_variable.sql`
   - Resolves unassigned RECORD variable bug in `public.authorize_terminal()` using strongly-typed scalar `v_terminal_id UUID`.

---

## 2. Applying Migrations to Remote Supabase

Because local execution is in an environment without direct Supabase database credentials, apply the migrations using the Supabase Web Console:

1. Open the project dashboard at:
   `https://pueehzvrdlaybrnnzakg.supabase.co`
2. In the left navigation, select **SQL Editor**.
3. Create a new query, copy the full contents of `supabase/migrations/20261010000001_initial_schema.sql`, and click **Run**.
4. Repeat in order for `20261010000002_rls_and_security_policies.sql`.
5. Repeat in order for `20261010000003_secure_bootstrap_and_rpc.sql`.
6. Inspect the **Table Editor** to verify that tables are populated, RLS is active (green shield icons), and default stake units are present.

---

## 3. Safe Rollback Guidance
- Rollback of policies:
  ```sql
  ALTER TABLE public.stake_units DISABLE ROW LEVEL SECURITY;
  -- or drop specific policies
  DROP POLICY IF EXISTS "stake_units_select_authenticated" ON public.stake_units;
  ```
- Dropping triggers:
  ```sql
  DROP TRIGGER IF EXISTS trg_validate_unit_assignment ON public.user_unit_assignments;
  DROP TRIGGER IF EXISTS trg_protect_audit_logs ON public.audit_logs;
  ```
- Destructive resets (`DROP SCHEMA public CASCADE`) must **never** be run in a production environment.
