# Network Diagnostic & Authorization Resolution Plan

Resolve authorization, database permission (PostgreSQL `42501`), token refresh (`400 Bad Request`), and school scoping (`403 Forbidden`) errors across `www.schoolsphere.xyz/api/*` and Supabase REST endpoints, while eliminating high-latency table queries.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed to resolve the network diagnostics:
> - **Token Lifecycle (400 on Refresh)**: When Supabase Auth returns a `400 Bad Request` on `/auth/v1/token?grant_type=refresh_token`, the client session is dead. The app will immediately clear stored authentication credentials and cleanly redirect the user to `/sign-in`.
> - **Database Permissions (42501 on REST)**: Direct browser-to-Supabase REST calls failing with PostgreSQL `42501 Permission Denied` (e.g. `classes`, `teachers`, `students`) will seamlessly fall back to authenticated server proxy routes (`/api/*` and `/api/academic/sync-tenant/:id`) executing with service-role security.
> - **Tenant Scoping (403 on `/api/license/status` & sync)**: The server will dynamically link the JWT user with their `public.users` database profile, granting tenant access when the school ID matches, and providing full tenant override capabilities for `creator`, `super_admin`, and school `admin` roles.

---

## 1. Overview & Core Concept

- **What It Does**: Hardens SchoolSphere's client-server authentication and data synchronization pipeline against stale tokens, permission boundaries, and tenant scope mismatches. When network calls encounter permission denials or dead sessions, the system intelligently self-heals: expired tokens trigger graceful redirection to sign-in, while database queries bypass client RLS barriers by routing through high-performance, cached backend API proxies.
- **Target Audience / Persona**: School administrators, teachers, accountants, and creators operating across multi-tenant school workspaces in Ghana, ensuring zero white-screens or broken sync states on desktop and mobile web.
- **Key Value**: Guarantees uninterrupted academic operations, zero phantom 401/403/42501 error loops, reduced data synchronization latency (from 3.3s+ down to sub-100ms via batch proxying), and strict tenant data safety.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Stale / Expired Session Recovery Flow**:
   - User opens or returns to `schoolsphere.xyz` with an expired refresh token (>30 days old or revoked).
   - The global fetch/auth interceptor catches the `400 Bad Request` or unresolvable `401 Unauthorized`.
   - Instead of breaking component trees or leaving the user on a half-loaded dashboard, the app clears stale `localStorage` tokens, shows a smooth, non-intrusive toast notification (*"Your session has expired. Please sign in to continue."*), and smoothly navigates to `/sign-in`.

2. **Seamless Data Synchronization Flow**:
   - On workspace initialization, `syncService` queries tenant data (`classes`, `teachers`, `students`, `subjects`, `attendance`).
   - If direct Supabase REST endpoints return `42501` (permission denied) or timeout, the sync pipeline immediately routes through `/api/academic/sync-tenant/:schoolId` in a single combined payload.
   - The dashboard transitions seamlessly from skeleton loaders into populated classes and student tables without stalling.

3. **Multi-Tenant License & Feature Access Flow**:
   - User navigates to the portal or Siren console. `/api/license/status` and `/api/siren/state` validate the school context.
   - School admins and creators automatically retain valid scope; features unlock with real-time status indicators.

### Visual Styling & Interactive Feedback

- **Palette & Tokens**:
  - Primary: Deep Indigo (`#4f46e5`, Tailwind `bg-indigo-600`)
  - Surface Background: Neutral slate (`bg-slate-50` light, `bg-slate-900` dark)
  - Card & Container: Clean border framing (`border-slate-200`, `shadow-sm`)
  - Status Accents: Emerald (`#10b981`) for synced state, Amber (`#f59e0b`) for re-authenticating, Rose (`#ef4444`) for critical lockout.
- **Typography**: Clean modern sans (`Inter`, `system-ui`) with clear typographic scale (12px caption, 14px body, 18px subsection, 24px view title).
- **Feedback & Motion**: Subtle toast alerts (`sonner`), smooth opacity transitions on re-auth, and skeleton pulse placeholders during batch tenant hydration.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Server Proxy Fallback vs. Sole Direct Supabase Queries
- **Chosen Approach**: Hybrid with immediate server proxy fallback (`/api/academic/sync-tenant/:id` and individual `/api/*` routes).
- **Why**: Supabase client queries can be blocked by restrictive RLS policies (`42501`) if migrations or role grants (`GRANT SELECT ON ... TO authenticated;`) have not been executed on the hosted database. Server proxies utilize the verified Supabase service-role client with strict server-side tenant isolation, eliminating client permission errors and reducing 9 parallel REST calls (3.3s+ cold-start TTFB) into a single optimized payload.
- **Alternatives Considered**: Relying purely on client SQL migration scripts would break existing production clients until external database admin intervention occurred.

### Decision 2: Automatic Token Purge & Sign-In Redirect on 400 Refresh Token Errors
- **Chosen Approach**: Intercept `400 Bad Request` on refresh and `401 Unauthorized` on authenticated endpoints, purging local credentials and navigating to `/sign-in`.
- **Why**: When Supabase's auth service responds with `400` to a refresh token grant, the token cannot be recovered. Continuing to send the expired JWT causes endless 401s across every background poll and feature query.
- **Alternatives Considered**: Showing a blocking modal dialog with manual re-try buttons leaves the user confused when the token is permanently invalid.

### Decision 3: School Profile Auto-Hydration in Tenant Scoping
- **Chosen Approach**: When a valid Supabase JWT lacks `school_id` in its user metadata, look up the user's tenant in `public.users` via `auth_user_id`, granting access when matching or when the user holds `admin`, `creator`, or `super_admin` permissions.
- **Why**: Prevents false-positive `403 Forbidden` responses on `/api/license/status`, `/api/db/sync`, and `/api/siren/state` for genuine school staff members whose metadata wasn't populated during email/password sign-up.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Client Application                            │
│  ┌───────────────────────┐  ┌────────────────┐  ┌───────────────────┐  │
│  │   AuthContext.tsx     │  │  syncService   │  │   api.ts Client   │  │
│  │  - onAuthStateChange  │  │  - Multi-table │  │  - Global Fetch   │  │
│  │  - 400 Refresh Purge  │  │    Batch Sync  │  │    Interceptor    │  │
│  └──────────┬────────────┘  └───────┬────────┘  └─────────┬─────────┘  │
└─────────────┼───────────────────────┼─────────────────────┼────────────┘
              │                       │                     │
              ▼                       ▼                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│           Network & API Layer (schoolsphere.xyz / Express)             │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                      authenticateToken                         │   │
│   │  - Verifies JWT (Crypto / Supabase Auth getUser)               │   │
│   │  - Hydrates school_id & role from public.users profile         │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────▼────────────────────────────────┐   │
│   │                  resolveTenantAccessScope                      │   │
│   │  - Evaluates user tenant vs requested school_id                │   │
│   │  - Grants Creator / Super Admin / School Admin overrides       │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────▼────────────────────────────────┐   │
│   │               Server API Endpoints (Service Role)              │   │
│   │  - GET /api/academic/sync-tenant/:schoolId (single batch sync) │   │
│   │  - GET /api/license/status (reconciled school license)         │   │
│   │  - GET /api/siren/state (canonical timetable & siren state)    │   │
│   │  - GET /api/classes, /api/teachers, /api/students              │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Supabase Postgres Database                         │
│  - public.classes, teachers, students, subjects, attendance            │
│  - public.school_licenses, schools, users                              │
│  - High-performance indexes: idx_classes_school_id, idx_students_...   │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Strategy

- **Client Session Store (`localStorage`)**:
  - `esepa_auth_token`: Active JWT access token
  - `esepa_supabase_access_token`: Supabase session token
  - `esepa_refresh_token`: Refresh token string
  - `esepa_user`: Cached user profile record with `school_id`, `role`, and `auth_user_id`
  - `esepa_active_school`: Current school tenant profile
- **IndexedDB (`Dexie`)**:
  - Offline-first cache for `students`, `teachers`, `classes`, `subjects`, `attendance`, `results`, `termReports`, `feeTransactions`, `settings`. Reconciled in a single atomic transaction upon batch sync.

### Interactive Component & State Mapping

1. **`AuthContext.tsx`**:
   - Listens to `supabase.auth.onAuthStateChange`. If event is `SIGNED_OUT` or refresh fails with `TOKEN_REFRESH_FINISHED` error, executes cleanup and routes to `/sign-in`.
   - `refreshSession()`: Handles 400 responses from `/auth/v1/token?grant_type=refresh_token` and `/api/auth/refresh-token` by invoking `logout()`.
2. **`api.ts` (Global Fetch Interceptor)**:
   - Wraps outgoing requests to inject `x-school-id` and Bearer Authorization.
   - Proactively intercepts `401 Unauthorized` responses: attempts a single silent token refresh; if the refresh fails or returns `400`, clears credentials and issues a navigation event to `/sign-in`.
3. **`syncService.ts`**:
   - Updates `syncAllDataFromBackend()`: checks for direct Supabase REST response status. If PostgreSQL error `42501` occurs, immediately calls `/api/academic/sync-tenant/${schoolId}`, avoiding 9 separate high-latency failures.
4. **`server.ts` & `lib/auth.ts`**:
   - Enhances `verifySupabaseSessionToken`: queries `public.users` when `user_metadata.school_id` is missing, attaching the true tenant ID to `req.user`.
   - Updates `resolveTenantAccessScope`: allows school `admin` access to their school scope and supports creator/admin overrides.
   - Provides optional SQL migration file (`scripts/db-grants-and-indexes.sql`) granting `SELECT` on `classes`, `teachers`, `students` to role `authenticated` and adding performance indexes (`idx_classes_school_id`, `idx_students_school_id`).
