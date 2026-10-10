# Abeokuta Nigeria Obantoko Stake YSA Attendance Management System (YSA AMS)

An enterprise-grade, secure, role-governed Attendance Management System built for the **Abeokuta Nigeria Obantoko Stake** of The Church of Jesus Christ of Latter-day Saints.

This system is completely decoupled from any commercial CRM, financial records, client portals, or external business infrastructure.

---

## 🛠 Technology Stack

- **Frontend Framework**: React 19 with TypeScript (Strict mode)
- **Tooling & Bundler**: Vite 8 with `@vitejs/plugin-react`
- **Styling**: Tailwind CSS v4 with `@tailwindcss/vite`
- **Iconography**: Lucide React
- **Backend & Database**: Supabase PostgreSQL (Managed instance)
- **Authentication**: Supabase Auth
- **Security & Authorization**: PostgreSQL Row-Level Security (RLS) + SECURITY DEFINER RPCs + Database Triggers
- **Testing**: Vitest with `@testing-library/react` and `jsdom`
- **Hosting Target**: Vercel (Single Page App with security headers)

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js `v20+` or `v24+`
- npm `v10+` or `v11+`

### 2. Environment Setup
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Fill in your public Supabase credentials:
```env
VITE_SUPABASE_URL=https://pueehzvrdlaybrnnzakg.supabase.co
VITE_SUPABASE_ANON_KEY=your-actual-publishable-anon-key
```
> ⚠️ **CRITICAL SECURITY RULE**: Never put `service_role` keys, database passwords, or secret tokens into `.env` or frontend files. The frontend only accepts the public URL and anon/publishable key.

### 3. Install & Run
```bash
# Install dependencies
npm install

# Run automated tests
npm test

# Run build verification
npm run build

# Start local development server
npm run dev
```

---

## 📁 Project Structure

```
├── .env.example                 # Public environment template
├── docs/                        # Complete technical documentation suite
│   ├── ARCHITECTURE.md          # System architecture & component flows
│   ├── SECURITY.md              # Security model & RLS enforcement
│   ├── ROLE-PERMISSIONS.md      # Detailed role authorization matrix
│   ├── ADMIN-PROVISIONING.md    # Initial bootstrap procedure & safeguards
│   ├── DATABASE-MIGRATIONS.md   # SQL migrations order & rollback procedures
│   ├── VERCEL-DEPLOYMENT.md     # Vercel setup & post-deployment checklist
│   └── PHASE-1-VERIFICATION.md  # Acceptance verification results
├── supabase/
│   ├── migrations/              # Version-controlled SQL migrations
│   │   ├── 20261010000001_initial_schema.sql
│   │   ├── 20261010000002_rls_and_security_policies.sql
│   │   └── 20261010000003_secure_bootstrap_and_rpc.sql
│   └── functions/               # Reserved for Supabase Edge Functions
├── src/
│   ├── components/              # Feature-oriented UI components
│   │   ├── AuthenticatedShell.tsx
│   │   ├── DashboardOverview.tsx
│   │   ├── UserManagement.tsx
│   │   ├── StakeUnitsView.tsx
│   │   ├── AuditLogsView.tsx
│   │   └── LoginView.tsx
│   ├── context/                 # Auth & session state provider
│   │   └── AuthContext.tsx
│   ├── lib/                     # Client & config
│   │   ├── env.ts
│   │   └── supabase.ts
│   ├── services/                # Typed database & RPC communication layer
│   │   ├── userService.ts
│   │   ├── unitService.ts
│   │   └── auditService.ts
│   ├── test/                    # Automated test suites
│   │   ├── authorization.test.ts
│   │   └── env.test.ts
│   ├── types/                   # Database & entity TypeScript definitions
│   │   └── database.ts
│   ├── App.tsx                  # Application root routing
│   └── main.tsx                 # Entrypoint
└── vercel.json                  # SPA rewrite rules and HTTP security headers
```

---

## 🛡️ Role-Based Access Summary

1. **`system_admin`**: Full administration of user profiles, role assignments, unit assignments, and audit inspection. Cannot revoke the last active administrator.
2. **`stake_presidency`**: Stake-wide access to future attendance and reporting analytics; read-only access to audit logs.
3. **`bishop`**: Scoped exclusively to their assigned Ward. Trigger validates ward association.
4. **`branch_president`**: Scoped exclusively to their assigned Branch. Trigger validates branch association.
5. **`ysa_leader`**: Scoped to assigned wards/branches or stake activities. Cannot manage users or assign roles.
