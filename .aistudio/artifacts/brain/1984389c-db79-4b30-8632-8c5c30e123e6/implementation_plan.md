# Multi-Tenant Supabase Authentication, Joyce Admin Access & Row Level Security (RLS)

Unify authentication across the entire platform so every user is backed by a verified Supabase Auth identity (`auth_user_id`) with an active RLS-scoped session token, and repair the **JOYCE** school administrator account so the admin can sign in immediately and access their tenant portal.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions have been confirmed based on your preferences and will govern the implementation:

- **Confirmed Decision 1 — Joyce Administrator Access & Credentials**: The **JOYCE** school administrator (`admin@joyce`, `admin@joyce.edu.gh`, `admin@joyce.com`, or `admin` scoped to Joyce) will be authenticated in Supabase Auth and `public.users` and will accept both the official school license key (`ESEPA-JOYC-STA-OW7FHO`) and `admin123` (while cleaning up conflicting test license overrides).
- **Confirmed Decision 2 — Universal Supabase Auth Provisioning (`auth_user_id`)**: Every existing and newly created user across all schools (`admin`, `headteacher`, `teacher`, `accountant`, `student`, `creator`) will be automatically provisioned and linked to a real Supabase Auth account (`auth.users` $\leftrightarrow$ `public.users.auth_user_id`) during startup reconciliation, user creation, and login.
- **Confirmed Decision 3 — Row Level Security (RLS) Tenant Isolation**: All database operations will enforce `school_id` tenant isolation for school-scoped roles (`admin`, `headteacher`, `teacher`, `accountant`, `student`) while granting global cross-tenant oversight to `creator` and `super_admin` accounts.

---

## 1. Overview & Core Concept

- **What It Does**:
  - Repairs and authenticates the **JOYCE** school administrator account so signing in with `admin@joyce`, `admin@joyce.edu.gh`, `admin@joyce.com`, or `admin` (with school `JOYCE` selected) succeeds immediately using `ESEPA-JOYC-STA-OW7FHO` or `admin123`.
  - Ensures all multi-license lookups check the school's canonical linked license (`schools.license_id`) and all active school licenses rather than failing when a secondary test license record exists.
  - Automatically links every user in `public.users` to a real Supabase Auth record (`auth_user_id`) and issues an authenticated session token (`supabaseAccessToken` + signed JWT with `sub: auth_user_id`, `school_id`, and `role`) on every login.
  - Enforces strict Row Level Security (RLS) across all tenant tables and backend queries so users only read and write records belonging to their authenticated `school_id` (with global access for Platform Creators).
- **Target Audience / Persona**:
  - **Joyce School Administrator**: Needs immediate, reliable sign-in access to manage students, teachers, classes, attendance, fees, and academic records for the JOYCE campus.
  - **School Staff & Students**: Teachers, headteachers, accountants, and students signing in to their respective school portals with strict tenant isolation.
  - **Platform Creator / Super Admin**: Manages institutional licenses, school onboarding, and cross-tenant health.
- **Key Value**: Eliminates unlinked or unauthenticated tenant admin accounts, guarantees every user has a real Supabase Auth identity (`auth_user_id`), and enforces end-to-end multi-tenant data isolation.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Joyce Admin Sign-In Flow**:
     - The administrator opens the login portal and enters `admin@joyce` (or `admin@joyce.edu.gh`, `admin@joyce.com`, or `admin` with school `JOYCE`) and password `ESEPA-JOYC-STA-OW7FHO` or `admin123`.
     - The authentication engine verifies the credential against Joyce's canonical license and user record, ensures the Supabase Auth identity (`auth_user_id`) is active and synchronized, establishes an RLS-authenticated Supabase session on both client and server, and routes directly into the **JOYCE** dashboard.
  2. **Universal User Provisioning & Sign-In Flow**:
     - When a School Admin creates a staff or student user in User Management, or when any existing user signs in, the backend ensures a matching `auth.users` account exists, writes `auth_user_id` into `public.users`, and returns a valid Supabase Auth session token alongside the application session.
  3. **Authenticated RLS Data Access Flow**:
     - All API requests and client Supabase calls include the user's authenticated token and verified `school_id` claim. Non-creator users cannot read or mutate records from other schools even if a different `school_id` query parameter or header is supplied.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density enterprise SaaS dashboard with clean single-elevation surfaces (`border border-slate-200`), crisp typographic hierarchy, and zero decorative clutter.
  - *Color Palette & Mood*:
    - Dominant Neutral Canvas (`60%`): Cool alabaster (`#F8FAFC`) and pure white (`#FFFFFF`) structural surfaces.
    - Structural Surfaces (`30%`): Deep slate sidebar (`#0F172A`), subtle hairline dividers (`#E2E8F0`), and muted slate metadata (`#64748B`).
    - Accent & Semantic Budget (`10%`): Institutional Indigo (`#4F46E5`) for primary actions, Emerald (`#16A34A`) for verified/authenticated status, Amber (`#D97706`) for pending states, and Crimson (`#DC2626`) for authentication or permission alerts.
  - *Typography & Hierarchy*:
    - Display & Navigation: `Plus Jakarta Sans` / `Cabinet Grotesk` with balanced headline wrapping.
    - Body & Controls: Single-line controls (`whitespace-nowrap`) with clean unboxed metadata separated by middle dots (`·`).
    - Tabular Data: Monospace tabular numerals (`font-mono tabular-nums`) for user IDs, license serial keys, and timestamps.
- **Interactive Feedback & Motion**:
  - Immediate ($\le 150\text{ms}$) validation feedback on login and user creation forms, clear status indicators showing whether each user account in User Management has a linked Supabase Auth identity, and smooth transition into the tenant-scoped dashboard upon login.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Automatic Supabase Auth (`auth.users`) Backfill & Sync on Login and Provisioning**
  - *Chosen Approach*: Whenever the server boots, provisions a license/user, or processes a login for a user whose `auth_user_id` is missing or out of sync, automatically create or locate the corresponding Supabase Auth user (`auth.admin.createUser` / `signInWithPassword` / `updateUserById`) and persist `auth_user_id` into `public.users`.
  - *Why*: Guarantees zero downtime for existing accounts like Joyce's Admin (`id: 163`) while ensuring every user in `public.users` is a first-class Supabase Auth user capable of satisfying `auth.uid()` RLS policies.
  - *Alternatives Considered*: Requiring manual password resets or deleting and recreating existing users was rejected because it would disrupt active school data and require manual intervention.
- **Decision 2: Canonical License Resolution for Multi-Row School Licenses**
  - *Chosen Approach*: Update school license resolution during login and verification to check the school's linked `schools.license_id` and all active license keys associated with the school (`ESEPA-JOYC-STA-OW7FHO`), rather than only inspecting the single most recently modified row. Also clean up synthetic `'TEST'` license overrides on the `JOYCE` tenant.
  - *Why*: Prevents test artifacts from shadowing a school's real issued license key (`ESEPA-JOYC-STA-OW7FHO`) during administrator authentication.
  - *Alternatives Considered*: Relying solely on `ORDER BY updated_at DESC LIMIT 1` was rejected because any secondary row blocks the primary license key.
- **Decision 3: Dual-Layer RLS Enforcement (Database Policies + Authenticated Request Guard)**
  - *Chosen Approach*: Enforce tenant isolation at both the Supabase client/database policy layer (using the user's Supabase Auth JWT and `school_id` metadata) and the Express API middleware layer (strictly binding non-creator requests to `req.user.school_id` and requiring authentication across tenant data endpoints).
  - *Why*: Provides defense-in-depth so tenant isolation holds regardless of whether queries execute via the frontend Supabase client or backend API routes.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND CLIENT (React + Vite)                        │
│                                                                              │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐  │
│  │  Login & Auth Context   │───▶│  Supabase Client (RLS Session Sync)     │  │
│  │  - Handle / Email Login │    │  - supabase.auth.setSession()           │  │
│  │  - School Scope Hints   │    │  - Bearer Token + x-school-id Headers   │  │
│  └────────────┬────────────┘    └────────────────────┬────────────────────┘  │
└───────────────┼──────────────────────────────────────┼───────────────────────┘
                │ POST /api/auth/login                 │ Authenticated API /
                │ (admin@joyce, ESEPA-JOYC-STA-OW7FHO) │ Direct Supabase RLS
                ▼                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     BACKEND AUTH & RLS ENGINE (Express)                      │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Universal Auth & Joyce Admin Reconciler                             │  │
│  │    - Resolves JOYCE school (a0a24be2-cf17-4de7-a6a4-2739e250f955)      │  │
│  │    - Validates canonical license (ESEPA-JOYC-STA-OW7FHO) & admin123    │  │
│  │    - Auto-links auth.users <-> public.users.auth_user_id               │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. Tenant RLS Request Guard (authenticateToken & resolveTenantScope)   │  │
│  │    - Verifies JWT & Supabase Auth identity (auth_user_id)              │  │
│  │    - Enforces school_id = req.user.school_id for all non-creator roles │  │
│  │    - Allows global tenant switching only for creator / super_admin     │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        SUPABASE POSTGRESQL + AUTH + RLS                      │
│                                                                              │
│  ┌──────────────────────┐   1:1 link    ┌─────────────────────────────────┐  │
│  │     auth.users       │◀─────────────▶│          public.users           │  │
│  │ - id (UUID)          │               │ - id, username, email, role     │  │
│  │ - email              │               │ - auth_user_id (UUID NOT NULL)  │  │
│  │ - user_metadata:     │               │ - school_id (UUID)              │  │
│  │   {school_id, role}  │               └────────────────┬────────────────┘  │
│  └──────────────────────┘                                │                   │
│                                                          ▼                   │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ RLS Policies on Tenant Tables (schools, users, students, classes,      │  │
│  │ attendance, results, term_reports, fee_payments, teachers, etc.)       │  │
│  │ - SELECT/INSERT/UPDATE/DELETE: school_id = get_my_school_id()          │  │
│  │   OR get_my_role() IN ('creator', 'super_admin')                       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Joyce Tenant Record (`public.schools`)**: `id = 'a0a24be2-cf17-4de7-a6a4-2739e250f955'`, `name = 'JOYCE'`, `slug = 'joyce'`, `license_id = 23`, `status = 'active'`.
  - **Joyce Canonical License (`public.school_licenses`)**: `id = 23`, `license_key = 'ESEPA-JOYC-STA-OW7FHO'`, `school_id = 'a0a24be2-cf17-4de7-a6a4-2739e250f955'`, `active_status = 'active'`.
  - **Joyce Admin Record (`public.users` & `auth.users`)**:
    - Linked to `school_id = 'a0a24be2-cf17-4de7-a6a4-2739e250f955'`, `role = 'admin'`, `status = 'active'`.
    - Authenticated with a valid `auth_user_id` in Supabase Auth (`auth.users`) with `user_metadata: { school_id: 'a0a24be2-cf17-4de7-a6a4-2739e250f955', role: 'admin', full_name: 'Joyce Head Administrator' }`.
    - Accepts both `ESEPA-JOYC-STA-OW7FHO` and `admin123` across login handles `admin`, `admin@joyce`, `admin@joyce.edu.gh`, and `admin@joyce.com`.
- **Interactive Component & State Mapping**:
  - **Startup & On-Demand Auth Reconciler**:
    - Scans `public.users` (including Joyce's admin `id: 163` and any other unlinked users) and ensures each user has a valid `auth.users` account and non-null `auth_user_id` in `public.users`.
    - Repairs Joyce's admin password hash and canonical license binding so `ESEPA-JOYC-STA-OW7FHO` and `admin123` both authenticate cleanly.
  - **Login Handler & Session Token Issuance**:
    - Checks all active licenses for a school (including `schools.license_id`) so a valid license key always authenticates the school's admin.
    - When a user logs in, ensures their `auth_user_id` is populated in `public.users`, signs or retrieves a real Supabase Auth session (`access_token` & `refresh_token`) alongside the application JWT (`sub = auth_user_id`), and returns both to the client.
  - **Client Auth Context & Supabase Session Hydration**:
    - Hydrates the browser Supabase client with the returned Supabase Auth session (`supabase.auth.setSession`) on login and session restore so direct client-side Supabase queries carry the authenticated user's RLS JWT.
  - **Strict Tenant RLS Enforcement**:
    - Updates backend tenant scope resolution so every authenticated non-creator user is strictly locked to their token's `school_id` (preventing cross-tenant spoofing via query parameters or headers) and ensures all protected API routes verify authentication and `auth_user_id`.
    - Synchronizes Supabase RLS policies and helper functions (`get_my_school_id()`, `get_my_role()`) so both `auth.jwt() -> 'user_metadata' ->> 'school_id'` and `public.users.auth_user_id = auth.uid()` resolve accurately for every authenticated user.
