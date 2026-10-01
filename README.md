# SchoolSphere 3.1 — Multi-Tenant School Management System

SchoolSphere 3.1 is a multi-tenant school management platform powered by **Supabase PostgreSQL** (`niavmonyfwqlryppgksy`), **Supabase Auth**, **Express**, and **React + Vite + Tailwind CSS**.

---

## Architecture & Security Model

### 1. Single-Source Authentication (Supabase Auth)
- **Canonical Identity Store**: All user authentication is verified exclusively through **Supabase Auth (`auth.users`)** via `signInWithPassword` and verified session tokens (`adminClient.auth.getUser(accessToken)`).
- **Username Handle Resolution**: Users may sign in using either their canonical email address (e.g., `admin@joyce.edu.gh`, `eamoako@joyce.edu.gh`) or their tenant-scoped username handle (e.g., `admin@joyce`, `eamoako`, `creator`). The backend resolves the handle to the user's canonical `auth.users.email` and authenticates credentials strictly against Supabase Auth.
- **Email & Profile Synchronization**: `auth.users.email` is the canonical email source of truth. Database triggers (`on_auth_user_created` and `on_auth_user_email_updated`) and server-side verification routes keep `public.users.email` and `public.users.auth_user_id` strictly synchronized and require exact email verification before linking an unlinked profile.
- **First-Login Password Rotation**: When a tenant administrator activates a school using an initial license key or temporary credential, `mustChangePassword` is enforced on first login.
- **Onboarding & Credentials**: No default admin usernames or passwords are stored in source code or documentation. **See [`SUPABASE_AUTH_ONBOARDING_GUIDE.md`](./SUPABASE_AUTH_ONBOARDING_GUIDE.md)** for tenant onboarding, user provisioning, and password recovery procedures.

### 2. Multi-Tenant Row-Level Security (RLS) & RPC Access Control
- **Tenant Isolation**: Every tenant-scoped table (`students`, `teachers`, `classes`, `subjects`, `results`, `attendance`, `fee_structures`, `fee_payments`, `timetables`, `academic_calendar`, `events`, `siren_schedules`, etc.) enforces Row-Level Security using `school_id = public.get_auth_school_id()` or `public.is_super_admin()`.
- **Locked-Down `SECURITY DEFINER` RPCs**:
  - Platform administration functions (`get_schools_directory`, `set_school_tenant_status`, `sync_school_license`, `create_school_with_license`) enforce `IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN RAISE EXCEPTION 'Access denied: platform administrators only.'; END IF;` and have `EXECUTE` revoked from `anon`.
  - Tenant user management RPCs (`get_tenant_users`, `provision_tenant_user`, `upsert_tenant_user`, `update_tenant_user`, `delete_tenant_user`) enforce tenant/admin authorization guards and have `EXECUTE` revoked from `anon`.
- **Fail-Fast Admin Client**: `getSupabaseAdmin()` in `lib/supabase/server.ts` requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) at startup and refuses to downgrade to an `anon` key.

### 3. Leaked-Password Protection (HaveIBeenPwned)
- Enable **Leaked Password Protection** in the Supabase Dashboard under **Authentication → Providers → Email** (or **Authentication → Security / Policies**) for project `niavmonyfwqlryppgksy` so Supabase Auth automatically rejects passwords found in HaveIBeenPwned breach corpuses.

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- Active Supabase project (`niavmonyfwqlryppgksy`)

### Environment Variables
Copy `.env.example` to `.env` and configure the required keys (never commit `.env` or secret keys to version control):

```bash
cp .env.example .env
```

Required variables:
- `SUPABASE_URL` / `VITE_SUPABASE_URL`: Your live Supabase project URL (`https://niavmonyfwqlryppgksy.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY`: Server-side `service_role` secret key (used only in backend routes)
- `VITE_SUPABASE_ANON_KEY`: Public `anon` key for browser Supabase Auth client
- `JWT_SECRET`: Secret key for signing application session tokens
- `ALLOWED_ORIGINS`: Comma-separated list of allowed frontend origins for CORS

### Install & Run
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

---

## Database Migrations
SQL migrations are located in [`supabase/migrations/`](./supabase/migrations/):
- `001_multi_tenant_rls_and_auth.sql` — Core multi-tenant RLS policies and helper functions
- `002_fix_auth_triggers_and_rls.sql` — Auth triggers and RLS refinements
- `003_grants_creator_and_school_creation.sql` — Platform creator and school provisioning RPC
- `004_sync_school_and_license_procedure.sql` — Atomic school & license synchronization RPC
- `005_tenant_user_provisioning_rpc.sql` — Tenant user management RPCs with admin guards
- `20260926_canonical_license_deduplication.sql` — Canonical 1-to-1 school-license deduplication
- `20261001_security_hardening_rpc_and_auth.sql` — Production RPC access control lockdown & `auth.users` ↔ `public.users` email parity triggers

For complete onboarding instructions, see **[`SUPABASE_AUTH_ONBOARDING_GUIDE.md`](./SUPABASE_AUTH_ONBOARDING_GUIDE.md)**.
