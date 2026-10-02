# Diagnostic Breakdown of the 117 Errors & Vercel-Supabase Remediation Plan

Pinpoint the exact sources of the **117 errors** reported in Chrome DevTools on `https://www.schoolsphere.xyz/sign-in` and resolve all underlying Vercel Serverless `500` crashes, Supabase connectivity failures, and client fallback error storms.

## Where the 117 Errors Are Coming From

> [!IMPORTANT]
> From your Chrome DevTools network trace on `https://www.schoolsphere.xyz/sign-in`, all **117 console/network errors** come from **4 repeating sources** triggered while the `/sign-in` page is open:

1. **Error Source #1 (~85–95 of the 117 errors) — 15-Second Background Polling of `GET /api/db/status` Returning `500 Internal Server Error`**:
   - **Where in code**: `checkSupabaseConnection()` runs on mount and inside `setInterval(checkSupabaseConnection, 15000)` (every 15 seconds = 4 times/minute), even when the user is unauthenticated on `/sign-in`.
   - **Why it errors**: Every 15 seconds, the browser requests `https://www.schoolsphere.xyz/api/db/status`, which returns **`500 Internal Server Error`** (`id: 12992.427`, `statusCode: 500`), logging a new red console error every 15 seconds.
2. **Error Source #2 (~6–12 of the 117 errors) — Keystroke Auto-Detection `GET /api/auth/resolve-school?input=...` Returning `500 Internal Server Error`**:
   - **Where in code**: The debounced `useEffect` in the Sign-In screen (`fetch('/api/auth/resolve-school?input=...')` every 200ms while typing or editing the email input).
   - **Why it errors**: As seen in your DevTools source list (`id: 11` through `id: 16`), typing/editing `amoakoemmanuel2020@gmail.com` (`amoakoemmanuel2020@gmail.com`, `amoakoemmanuel20@gmail.com`, `amoakoemmanuel2@gmail.com`, `amoakoemmanuel@gmail.com`, `amoakoemmanuel@mail.com`, `amoakoemmanuel@hotmail.com`) fires a request on each pause, and every single one returns **`500 Internal Server Error`**.
3. **Error Source #3 (1–2 errors per Sign-In click) — `POST /api/auth/login` Returning `500 Internal Server Error` + Unauthenticated `GET /rest/v1/users` Returning `401 Unauthorized`**:
   - **Where in code**: Submitting the Sign-In form calls `POST /api/auth/login` (`id: 3`), which returns **`500`**. That triggers the client-side fallback, which immediately runs `supabase.from('users').select('*, schools(*)')` using the unauthenticated `anon` key—resulting in **`401 Unauthorized` (`permission denied for table users`)** from Supabase RLS.
4. **Error Source #4 (12 errors per Sign-In click) — Brute-Force Candidate Email × Password Loop in Client Fallback Returning `400 Bad Request`**:
   - **Where in code**: Immediately after `POST /api/auth/login` returns `500`, the client fallback constructs **4 candidate emails** (`amoakoemmanuel2020@gmail.com`, `amoakoemmanuel2020@schoolsphere.edu.gh`, `amoakoemmanuel2020@schoolsphere.app`, `amoakoemmanuel2020@schoolsphere.xyz`) × **3 password variations** and loops `supabase.auth.signInWithPassword(...)` up to **12 times in a row**, logging up to **12 red `400 (Bad Request)` errors** in Chrome DevTools per Sign-In click.

---

## Why `/api/*` Returns `500` on Vercel (`www.schoolsphere.xyz`)

1. **Unbundled `.ts` Extension Imports in ESM Serverless Function**:
   - The Vercel serverless entry imports `../server.ts` and internal server modules using explicit `.ts` file suffixes (`./lib/supabase/server.ts`, `./lib/auth.ts`, `./lib/auditLogger.ts`, `./lib/twoFactorAuth.ts`, `./lib/multiTenantAuth.ts`). On Vercel's Node ESM runtime (`"type": "module"`), unbundled `.ts` import specifiers fail module resolution or crash cold starts with `500 FUNCTION_INVOCATION_FAILED`.
2. **Uncaught `FATAL:` Throws When Server Env Vars Are Missing on Vercel**:
   - In `/api/db/status`, `getResolvedSupabaseUrl()` -> `getSupabaseUrlStrict()` is called **outside** the `try/catch` block and throws `FATAL: SUPABASE_URL ... is not set` if `SUPABASE_URL` is not duplicated in Vercel's environment variables.
   - In `/api/auth/resolve-school` and `/api/auth/login`, `getSupabaseAdmin()` throws `FATAL: SUPABASE_SERVICE_ROLE_KEY ... is not set` when that key is missing in Vercel, causing the catch block to return `500`.
3. **Tenant Email Alias Resolution (`amoakoemmanuel2020@gmail.com`)**:
   - In your live Supabase database, `amoakoemmanuel2020@gmail.com` is the registered institutional email on `public.schools` for **ABSA** (`slug: absa`, `license_key: ESEPA-ABSA-BAS-M4KUH5`, linked admin `amoakoimml@gmail.com`) and **SAW** (`slug: saw`, `license_key: ESEPA-SAW-ENT-ATRDYY`). When `/api/auth/login` crashes with `500`, the browser fallback cannot query `public.schools` or `public.users` with `anon` permissions to map `amoakoemmanuel2020@gmail.com` to the school's admin account.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Eliminates Vercel `/api/*` `500` Crashes**: Removes explicit `.ts` import specifiers across all server modules, pre-bundles the serverless API handler cleanly, and configures `lib/supabase/server.ts` with canonical project URL/key fallbacks and request-scoped JWT propagation so `/api/db/status`, `/api/auth/resolve-school`, `/api/auth/login`, and `/api/db/sync` never throw `FATAL` `500` errors on Vercel.
  2. **Stops the 117-Error Console Storm on `/sign-in`**:
     - Stops 15-second background `/api/db/status` polling while on the unauthenticated `/sign-in` screen and backs off automatically if offline or unreachable.
     - Ensures `/api/auth/resolve-school` always returns a clean `200 OK` (`{ success: false, school: null }` on fallback) rather than `500`.
     - Replaces the noisy 12-request `signInWithPassword` brute-force loop and unauthenticated `anon` `users` query in `AuthContext` with a targeted, single-attempt fallback using the public `get_schools_directory` RPC.
  3. **Restores Full Supabase Read/Write Sync on Vercel**: Adds direct authenticated Supabase multi-table sync fallback in `syncAllDataFromBackend` so all portals read and write live Supabase data seamlessly.
- **Target Audience / Persona**: School administrators, creators, teachers, students, and parents signing in at `https://www.schoolsphere.xyz`.
- **Key Value**: Zero console errors on `/sign-in`, instant school auto-detection for `amoakoemmanuel2020@gmail.com`, working sign-in, and full Supabase database connectivity on Vercel.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Zero-Error Sign-In Page (`/sign-in`)**: Opening `https://www.schoolsphere.xyz/sign-in` produces **0 console errors**. Typing `amoakoemmanuel2020@gmail.com` cleanly resolves the associated school (**ABSA** / **SAW**) with `200 OK`.
  2. **Seamless Institutional & License Email Sign-In**: Signing in with `amoakoemmanuel2020@gmail.com` (or username/license key) authenticates against `/api/auth/login` and hydrates the browser's Supabase RLS session without `400`/`401`/`500` errors.
  3. **Live Supabase Database Sync**: Once signed in, the header status indicator shows **Supabase Connected** and all tenant tables load immediately.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Resilient Server Supabase Client with Canonical Fallbacks**:
  - *Chosen Approach*: Configure `lib/supabase/server.ts` to use the canonical project URL (`https://niavmonyfwqlryppgksy.supabase.co`) and anon/service key fallbacks, plus `AsyncLocalStorage` Bearer token forwarding when `SUPABASE_SERVICE_ROLE_KEY` is not set in Vercel.
  - *Why*: Prevents `FATAL` unhandled exceptions that turn every `/api/*` call into a `500 Internal Server Error` on Vercel.
- **Decision 2 — Single-Shot Targeted Auth Fallback Instead of 12-Request Loop**:
  - *Chosen Approach*: Remove the unauthenticated `supabase.from('users')` call (which always fails with `401` under RLS before login) and restrict fallback `signInWithPassword` to the exact resolved email rather than looping 12 synthetic domain/password permutations.
  - *Why*: Eliminates the `401` and `12 × 400 Bad Request` console error burst in Chrome DevTools.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌───────────────────────────────────────────────────────────────────────────┐
│                 Browser on https://www.schoolsphere.xyz                   │
│  • /sign-in: Debounced school lookup -> 200 OK (no 15s polling storm)     │
│  • Sign-In submit -> POST /api/auth/login -> 200 OK + Supabase RLS JWT    │
│  • Dashboard -> /api/db/sync + direct authenticated Supabase pull         │
└──────────────────┬─────────────────────────────────────┬──────────────────┘
                   │                                     │
      GET/POST /api/* (Extensionless ESM)     Direct PostgREST (Bearer JWT)
                   │                                     │
                   ▼                                     ▼
┌──────────────────────────────────────┐ ┌──────────────────────────────────┐
│     Vercel Serverless Function       │ │    Supabase Cloud PostgreSQL     │
│  • Extensionless imports (no 500s)   │ │  • Resolves ABSA / SAW / GHOST   │
│  • Canonical URL & key fallback      │─┼─►  schools & admin accounts      │
│  • Never throws uncaught FATAL       │ │  • Enforces tenant RLS policies  │
└──────────────────────────────────────┘ └──────────────────────────────────┘
```
