# Complete `server.ts` Hardening, Dead-Code Removal & Supabase Auth Consolidation

This plan verifies the current live state of every item requested in `server.ts` and related modules, resolves all remaining discrepancies discovered in the actual files, and consolidates server authentication around Supabase Auth (`adminClient.auth.getUser(accessToken)`).

## User Review & Critical Decisions

> [!IMPORTANT]
> **Line-by-Line Audit of Current Workspace State (Verified Before Any Edits)**
>
> - **Pre-Check (`bcryptjs` & `password_hash`)**:
>   - `package.json` has no `bcryptjs` dependency, and `server.ts` has no `import bcrypt` or `bcrypt.compare`/`hash` calls.
>   - `POST /api/auth/login` authenticates passwords via `authClient.auth.signInWithPassword({ email: canonicalEmail, password: rawPasswordStr })` (`server.ts:3830`) and does not read `public.users.password_hash`.
>   - **Remaining references found to clean up**: `tests/security_and_api.test.ts` (lines 967–1036) and `supabase/schema_master.sql` (line 161) still reference `password_hash` / bcrypt hashes.
> - **Item 1 (TLS / DNS Bypass & `vwmahpuzthyxnzrohfxw`)**:
>   - `NODE_TLS_REJECT_UNAUTHORIZED = '0'` and the `dnsCache` / `dns.lookup` monkey-patch are gone from `server.ts`, **but `import dns from "dns";` is still present on `server.ts:7`**, and `lib/supabase/server.ts:24-27` still contains a string reference to the deleted project `vwmahpuzthyxnzrohfxw`. Both will be removed completely (standard Node DNS works natively in AI Studio, Vercel, and Electron).
> - **Item 2 (Hardcoded Fallbacks & Startup Service-Role Enforcement in `initDatabase()` / `getSupabaseAdmin()`)**:
>   - `getSupabaseAdmin()` in `lib/supabase/server.ts` throws when `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` is missing, **but `initDatabase()` in `server.ts:708-721` wraps `getSupabaseAdmin()` in a `try/catch` that swallows the fatal error into a `console.warn`**, and `server.ts:39` & `server.ts:705` still have hardcoded URL fallbacks (`|| 'https://niavmonyfwqlryppgksy.supabase.co'`). `initDatabase()` will be updated to use `getSupabaseUrlStrict()` and rethrow fatal startup configuration errors immediately.
> - **Item 3 (`createPostgresTables()` & `pgPool` / `pg` Direct-SQL Code)**:
>   - While `createPostgresTables()` was removed earlier, **`server.ts` STILL has `import pg from "pg";` (line 3), `const pgPool: any = null;` (line 42), and 12 unreachable `if (!insertedData && pgPool)` / `if (pgPool)` blocks with embedded raw SQL strings across lines 14535–15787** (in students, teachers, classes, and subjects routes). All 12 `pgPool` SQL blocks, `const pgPool`, and `import pg from "pg"` will be deleted completely.
> - **Item 4 (`pullData()` Error Visibility & Per-Table Error Flags)**:
>   - `pullData()` (`server.ts:1093-1427`) will log every failed Supabase table read via `console.error` with the table name, error code, and message, record per-table error flags in `tableErrors: Record<string, string>`, and throw / surface those errors on `/api/sync/pull` instead of silently returning `data[table] = []`.
> - **Item 5 (CORS Allow-List & `.env.example`)**:
>   - `server.ts` will read `ALLOWED_ORIGINS` (comma-separated) to reflect only explicitly allowed origins, and `.env.example` (currently `ALLOWED_ORIGINS=`) will be populated with the real frontend origins (`https://schoolsphere.app,https://www.schoolsphere.app,http://localhost:3000`).
> - **Item 6 (Auth Consolidation Audit Findings)**:
>   - **`electron-main.cjs` & `preload.cjs` check**: Neither file references `lib/auth.ts`, `lib/multiTenantAuth.ts`, or any custom JWT token (`electron-main.cjs` only spawns `dist/server.cjs` and opens `http://localhost:3000`; `preload.cjs` only exposes `{ platform, isElectron: true }`).
>   - **Dexie / Offline Sync (`src/db/schema.ts`, `src/lib/syncService.ts`, `src/lib/api.ts`) check**: Dexie stores (`src/db/schema.ts`) do not store custom tokens; `syncService.ts` and `api.ts` read the Supabase `access_token` (`esepa_supabase_access_token` / `esepa_auth_token`) and pass `Authorization: Bearer <accessToken>`.
>   - **Auth verification consolidation**: `lib/auth.ts` still had a unverified `jwt.decode(token)` fallback (`lib/auth.ts:71-77`) when `SUPABASE_JWT_SECRET` was absent. We will update `authenticateToken` and `optionalAuthenticateToken` to verify tokens directly with `await getSupabaseAdmin().auth.getUser(token)` (with short-lived verified session caching and `SUPABASE_JWT_SECRET` HMAC verification), and remove the unverified `jwt.decode()` fallback.

---

## 1. Overview & Core Concept

- **What It Does**: Eliminates all residual legacy database connection code (`pgPool`, `import pg`, `import dns`), enforces fail-fast startup validation when `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_URL` is missing, surfaces explicit per-table errors in `pullData()`, restricts CORS to `ALLOWED_ORIGINS`, and verifies all bearer tokens through Supabase Auth (`adminClient.auth.getUser(accessToken)`).
- **Target Audience / Persona**: School administrators, teachers, and platform operators running SchoolSphere across cloud and desktop deployments.
- **Key Value**: Guarantees a clean install with zero missing dependencies, prevents silent data-pull failures or unauthenticated token Forgery, and ensures `niavmonyfwqlryppgksy` is the sole Supabase backend.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  - **Password & License Login**: Users sign in via `supabase.auth.signInWithPassword()` or license activation and receive a real Supabase Auth `access_token` and `refresh_token`.
  - **Protected API Requests**: Every `/api/*` call bearing `Authorization: Bearer <access_token>` is verified against Supabase Auth (`adminClient.auth.getUser(accessToken)`), hydrating tenant scope (`school_id`) and role.
  - **Data Sync (`/api/sync/pull`)**: If any Supabase table query fails during sync, the backend logs the exact table name and error and returns structured error details rather than silently returning empty arrays.
- **Visual Identity & Theme**:
  - Backend-focused architectural remediation; preserves the existing SchoolSphere UI without visual regressions.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Complete Removal of `pgPool` and `import pg` / `import dns`**
  - *Chosen Approach*: Delete `import pg`, `import dns`, `const pgPool`, and all 12 `if (... && pgPool)` SQL fallback blocks in `server.ts`.
  - *Why*: `dbMode` is exclusively `"supabase"` via `@supabase/supabase-js`; `pgPool` was hardcoded to `null`, making all 12 SQL blocks dead code.
- **Decision 2: Fail-Fast Startup in `initDatabase()`**
  - *Chosen Approach*: Call `getSupabaseUrlStrict()` and `getSupabaseAdmin()` outside of any error-swallowing `try/catch` in `initDatabase()` so missing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` immediately throws a clear fatal startup error.
  - *Why*: Prevents the server from booting in a degraded state or silently downgrading to an anonymous key.
- **Decision 3: Supabase Auth Token Verification via `adminClient.auth.getUser(accessToken)`**
  - *Chosen Approach*: Remove the unverified `jwt.decode()` fallback in `lib/auth.ts` and validate Bearer tokens via `getSupabaseAdmin().auth.getUser(token)` (combined with cryptographic `SUPABASE_JWT_SECRET` verification when configured), while keeping organization/invitation helpers in `lib/multiTenantAuth.ts` using Supabase Auth sessions.
  - *Why*: Aligns runtime session validation with `SUPABASE_AUTH_ONBOARDING_GUIDE.md` while keeping `/api/auth/register-org`, `/api/auth/verify-invite`, `/api/auth/join-invite`, and `/api/tenant/workers` fully functional.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Frontend SPA / Electron                           │
│  • AuthContext + api.ts + syncService.ts                                 │
│  • Sends Authorization: Bearer <supabase_access_token>                   │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │ CORS (ALLOWED_ORIGINS allow-list)
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Express Server (server.ts)                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Startup: initDatabase()                                            │  │
│  │  • Enforces getSupabaseUrlStrict() & getSupabaseAdmin()            │  │
│  │  • Throws immediately if SUPABASE_SERVICE_ROLE_KEY is missing      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Auth Middleware (authenticateToken / optionalAuthenticateToken)    │  │
│  │  • Verifies token via adminClient.auth.getUser(accessToken)        │  │
│  │  • Resolves canonical public.users row + school_id scope           │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Data Layer (pullData & CRUD Routes)                                │  │
│  │  • 100% Supabase client (@supabase/supabase-js) — zero pgPool SQL  │  │
│  │  • pullData() logs table errors visibly & surfaces tableErrors     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│          Supabase Cloud (niavmonyfwqlryppgksy.supabase.co)               │
│  • GoTrue (auth.users) + PostgreSQL (public.* with RLS)                  │
└──────────────────────────────────────────────────────────────────────────┘
```
