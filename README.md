# SchoolSphere 3.1 — Multi-Tenant School Management System

SchoolSphere 3.1 is a multi-tenant school management platform powered by **Supabase PostgreSQL** (`niavmonyfwqlryppgksy`), **Supabase Auth**, **Express**, and **React + Vite + Tailwind CSS**.

---

## Architecture & Security Model

### 1. Single-Source Authentication (Supabase Auth)
- **Canonical Identity & Token Store**: All user authentication and session management are handled exclusively through **Supabase Auth (`auth.users`)** via `signInWithPassword`, `refreshSession`, and verified Supabase Auth JWTs (`iss: https://niavmonyfwqlryppgksy.supabase.co/auth/v1`). Custom HMAC JWTs, `bcryptjs`, and `public.users.password_hash` have been completely removed.
- **Username Handle Resolution**: Users may sign in using either their canonical email address (e.g., `admin@joyce.edu.gh`, `eamoako@joyce.edu.gh`) or their tenant-scoped username handle (e.g., `admin@joyce`, `eamoako`, `creator`). The backend resolves the handle to the user's canonical `auth.users.email` and authenticates credentials strictly against Supabase Auth.
- **Email & Profile Synchronization**: `auth.users.email` is the canonical email source of truth. Database triggers (`on_auth_user_created` and `on_auth_user_email_updated`) and server-side verification routes keep `public.users.email` and `public.users.auth_user_id` strictly synchronized and require exact email verification before linking an unlinked profile.
- **First-Login Password Rotation**: When a tenant administrator activates a school using an initial license key or temporary credential, `mustChangePassword` is enforced on first login.
- **Onboarding & Credentials**: No default admin usernames or passwords are stored in source code or documentation. **See [`SUPABASE_AUTH_ONBOARDING_GUIDE.md`](./SUPABASE_AUTH_ONBOARDING_GUIDE.md)** for tenant onboarding, user provisioning, and password recovery procedures.

### 2. Authoritative 32-Table Schema (`niavmonyfwqlryppgksy`) & Row-Level Security (RLS)
The live Supabase database (`niavmonyfwqlryppgksy`) is the authoritative schema source of truth with 32 public tables:
- **Core Platform & Identity**: `schools`, `school_licenses`, `school_settings`, `users`, `two_factor_settings`, `audit_logs`, `support_tickets`
- **Academic & People**: `students`, `teachers`, `classes`, `subjects`, `parent_students`, `attendance`, `results`, `term_reports`, `exam_analyses`, `promotion_history`, `lesson_notes`
- **Timetable & Communications**: `timetable_periods`, `timetable_entries`, `broadcasts`, `sms_logs`, `sms_credits`, `sms_templates`
- **Finance, Payroll & Operations**: `fee_structures`, `fee_transactions`, `invoices`, `school_expenses`, `staff_payroll`, `inventory_items`, `stock_movements`, `polls`, `candidates`, `votes`

- **`public.lesson_notes` Table & RLS**:
  - Stores weekly teacher lesson plans, GES/NaCCA curriculum indicator mappings, uploaded PDF/DOCX attachment URLs (`lesson-notes` Supabase Storage bucket), and headteacher/HOD vetting feedback (`pending`, `approved`, `rejected`) used by `src/components/LessonNotes.tsx`.
  - Enforces Row-Level Security via policy `"Verified tenant access for lesson_notes"` requiring `public.is_email_verified() AND (school_id = public.get_auth_school_id() OR public.is_super_admin())`, with `anon` access revoked.
- **Locked-Down `SECURITY DEFINER` RPCs**:
  - Platform administration functions (`get_schools_directory`, `set_school_tenant_status`, `sync_school_license`, `create_school_with_license`) enforce `IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN RAISE EXCEPTION 'Access denied: platform administrators only.'; END IF;` as their first statement and have `EXECUTE` revoked from `anon`.
- **Fail-Fast Admin Client**: `getSupabaseAdmin()` in `lib/supabase/server.ts` requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) at startup and throws immediately with no fallback to the `anon` key.

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
- `SUPABASE_JWT_SECRET`: Optional Supabase JWT secret for local signature verification alongside `auth.getUser()`
- `ALLOWED_ORIGINS`: Comma-separated list of allowed frontend origins for CORS

### Install, Check Drift & Run
```bash
npm install
npm run db:check
npm run dev
```

---

## Database Migrations (`supabase/migrations/`)
All migration filenames use 14-digit timestamps (`YYYYMMDDHHMMSS_name.sql`) and target `project_id = "niavmonyfwqlryppgksy"` in `supabase/config.toml`:
- `20260816000100_multi_tenant_schema_and_rls.sql` — Core multi-tenant RLS policies and helper functions
- `20260816000200_create_school_licenses_and_schools.sql` — Schools and licenses base tables
- `20260816000300_grants_creator_and_school_creation.sql` — Platform creator and school provisioning RPC
- `20260816000400_sync_school_and_license_procedure.sql` — Atomic school & license synchronization RPC
- `20260816000500_tenant_user_provisioning_rpc.sql` — Tenant user management RPCs
- `20260926000100_canonical_license_deduplication.sql` — Canonical 1-to-1 school-license deduplication
- `20260928000100_lesson_notes_and_storage.sql` — `lesson_notes` table and storage policies
- `20261001000200_security_hardening_rpc_and_auth.sql` — RPC access control and auth triggers
- `20261001220000_live_schema_and_security_reconciliation.sql` — Consolidated live remediation for `niavmonyfwqlryppgksy` (RPC lockdown, `lesson_notes` verified-email RLS, `on_auth_user_email_updated` trigger, and `DROP COLUMN password_hash`)
