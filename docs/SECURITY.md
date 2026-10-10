# Security Architecture & Hardening Document — YSA AMS

## 1. Threat Model & Security Principles

1. **Defense-in-Depth**: Frontend controls are purely navigational. Even if an attacker modifies client-side JavaScript, calls REST endpoints directly, or crafts arbitrary GraphQL/RPC payloads, the database engine enforces all authorization constraints.
2. **Strict Credential Isolation**:
   - Zero exposure of `service_role` keys, database connection strings, or master credentials in client bundles, Git histories, or build logs.
   - The application functions securely using solely `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. **No Self-Privilege Escalation**:
   - Ordinary authenticated users have zero `INSERT` or `UPDATE` privileges on `user_roles`.
   - Modifying `user_profiles` is restricted: regular users can only update their `full_name`. They cannot alter their own `account_status`.

---

## 2. PostgreSQL Row-Level Security (RLS) Matrix

| Table | SELECT Policy | INSERT Policy | UPDATE Policy | DELETE Policy |
| :--- | :--- | :--- | :--- | :--- |
| `stake_units` | Active authenticated users | `is_system_admin()` | `is_system_admin()` | `is_system_admin()` |
| `user_profiles` | Self OR `is_system_admin()` | Handled via signup trigger / admin | Self (restricted fields) OR admin | Blocked (cascade on auth.users deletion) |
| `user_roles` | Self OR `is_system_admin()` | `is_system_admin()` | `is_system_admin()` | `is_system_admin()` (last admin protected) |
| `user_unit_assignments` | Self OR `is_system_admin()` OR `stake_presidency` | `is_system_admin()` | `is_system_admin()` | `is_system_admin()` |
| `audit_logs` | `is_system_admin()` OR `stake_presidency` | Active authenticated users | **BLOCKED** (Trigger prevents UPDATE) | **BLOCKED** (Trigger prevents DELETE) |

---

## 3. Function & Trigger Security

### Safe Search Path
All `SECURITY DEFINER` functions explicitly declare:
```sql
SECURITY DEFINER
SET search_path = public, pg_temp
```
This protects against search_path hijacking vulnerabilities in PostgreSQL.

### Immutability of Audit Logs
A trigger `trg_protect_audit_logs` raises an unhandled exception if any `UPDATE` or `DELETE` is executed against `public.audit_logs`:
```sql
CREATE OR REPLACE FUNCTION public.fn_prevent_audit_log_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are strictly append-only and cannot be modified or deleted.';
END;
$$;
```

### Last Administrator Protection
Trigger `trg_prevent_last_admin_removal` verifies the remaining administrator count before allowing any `DELETE` on a `system_admin` role record:
```sql
IF v_admin_count <= 1 THEN
    RAISE EXCEPTION 'Operation rejected: Cannot remove or revoke the last remaining system administrator.';
END IF;
```
