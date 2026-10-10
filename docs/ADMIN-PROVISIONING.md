# First-Administrator Provisioning Guide — YSA AMS

## 1. Controlled Bootstrap Mechanism

To prevent vulnerability windows and eliminate arbitrary privilege escalation, the Abeokuta Nigeria Obantoko Stake YSA AMS employs a **strict, single-entry bootstrap procedure**.

### Core Requirements & Guarantees:
- Public registration does **not** grant administrator privileges.
- Ordinary users updating their profiles cannot self-assign `system_admin`.
- Browser-supplied claims are ignored; authorization requires verified database records.
- The bootstrap procedure is idempotent and fails closed once the first administrator exists.

---

## 2. Provisioning Steps

### Method A: Initial UI Bootstrap (Controlled Single-Use Endpoint)

1. Navigate to the login page of the application.
2. Sign up or sign in with the designated stake administrator account.
3. Once authenticated, locate the **"First-Time System Initialization"** panel at the base of the login card.
4. Click **"Bootstrap Initial System Admin (If Zero Admins)"**.
5. The frontend calls the database function `public.bootstrap_initial_admin()`.
6. The function checks:
   ```sql
   SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role_name = 'system_admin';
   IF v_admin_count > 0 THEN
       RAISE EXCEPTION 'Access Denied: The system administrator has already been initialized. Bootstrap endpoint is closed.';
   END IF;
   ```
7. If zero administrators exist:
   - Sets the authenticated user's role to `system_admin`.
   - Sets account status to `active`.
   - Writes an immutable record to `audit_logs` (`BOOTSTRAP_INITIAL_ADMIN`).
   - From that moment forward, any subsequent execution of `bootstrap_initial_admin()` permanently fails.

---

### Method B: Supabase Dashboard SQL Editor (Direct Trusted Operator)

If the operator prefers running the provisioning directly inside the Supabase Console:

1. Open the Supabase Project Dashboard (`https://pueehzvrdlaybrnnzakg.supabase.co`).
2. Navigate to **Authentication > Users** and copy the `UID` of the registered administrator.
3. Navigate to **SQL Editor**, and run:
   ```sql
   -- Provision designated administrator
   INSERT INTO public.user_roles (user_id, role_name)
   VALUES ('YOUR_COPIED_USER_UID', 'system_admin')
   ON CONFLICT (user_id, role_name) DO NOTHING;

   -- Ensure profile is active
   UPDATE public.user_profiles
   SET account_status = 'active'
   WHERE id = 'YOUR_COPIED_USER_UID';

   -- Log audit entry
   INSERT INTO public.audit_logs (actor_id, action, target_record_id, target_table, outcome, metadata)
   VALUES (
     'YOUR_COPIED_USER_UID',
     'MANUAL_SQL_BOOTSTRAP_ADMIN',
     'YOUR_COPIED_USER_UID',
     'user_roles',
     'success',
     '{"notes": "Provisioned directly via Supabase SQL Editor"}'::jsonb
   );
   ```

---

## 3. Subsequent Administrator Provisioning
After the initial administrator is created, all future administrators **must** be created through:
- The **Users & Roles** administrative interface inside the application by an active `system_admin`.
- The procedure calls `manage_user_role(target_user_id, 'system_admin', 'assign')`, which strictly validates caller permissions and writes audit entries.
