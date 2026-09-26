# Implementation Plan — Fix License Registry Persistence & Client Runtime Warnings

## 1. Root Cause Analysis

1. **Issued Licenses Not Showing in the Frontend Registry**
   - `POST /api/license/generate` provisions the school and license in Supabase via the `SECURITY DEFINER` RPC `sync_school_license` (returning `school_id`, `license_id`, `license_key`, `tier`, and `status`) and records the full license metadata in `saveGeneratedLicenses()` and `saveToFallback('schools')`.
   - Immediately after generation, `CreatorHub.tsx` calls `fetchGeneratedLicenses()`, which calls `GET /api/license/list`.
   - When running without `SUPABASE_SERVICE_ROLE_KEY`, direct `SELECT` on `public.school_licenses` is restricted by RLS, and `get_schools_directory()` returns `{ id, name, slug, status, license_id }` without `license_key`. Because `GET /api/license/list` skipped directory rows lacking `s.license_key` and did not merge `getGeneratedLicenses()` / `getFromFallback('schools')`, it returned `[]` and overwrote `licensesList` in `CreatorHub.tsx`.

2. **Multiple `GoTrueClient` Instances in Browser Context**
   - `src/lib/supabase.ts` initializes a singleton on `globalThis.__supabaseInstance`, whereas `lib/supabase/client.ts` (re-exported by `src/lib/supabase/client.ts`) calls `createClient(supabaseUrl, supabaseAnonKey)` directly without using `globalThis.__supabaseInstance`, creating a second `GoTrueClient` under the same storage key (`sb-niavmonyfwqlryppgksy-auth-token`).

3. **Supabase Realtime `postgres_changes` Subscription Warning**
   - `initRealtimeAndAutoSync()` in `src/lib/syncService.ts` calls `supabase.channel('schema-live-changes').on('postgres_changes', ...).subscribe()` without removing or reusing an existing subscribed channel. When `initRealtimeAndAutoSync()` runs again on component re-mount, `supabase.channel('schema-live-changes')` returns the already-subscribed channel instance, and `.on('postgres_changes', ...)` throws `cannot add postgres_changes callbacks for realtime:schema-live-changes after subscribe()`.

4. **Vite WebSocket Closed Without Opened (`Unhandled Rejection`)**
   - `server.ts` mounts Vite with `hmr: false`, but `vite.config.ts` enabled HMR unless `DISABLE_HMR === 'true'`, causing the browser bundle to attempt a WebSocket connection that immediately closes.

---

## 2. Planned Changes

### A. License Registry Persistence & Lookup (`server.ts` & `src/components/CreatorHub.tsx`)
- **`GET /api/license/list` & `GET /api/schools` (`server.ts`)**:
  - Merge records from `public.school_licenses` (when readable), `getGeneratedLicenses()`, `getFromFallback('schools')`, and `get_schools_directory()` (matching by `school_id`, `license_id`, or normalized `school_name`).
  - For schools returned by `get_schools_directory()` that have a valid `license_id` in Supabase, resolve their issued `license_key`, `tier`, `expiryDate`, `clientEmail`, `contactPerson`, and `activeModules` from the matched registry record (or deterministic key fallback when only `license_id` is available) so issued licenses always appear in the frontend registry.
- **`CreatorHub.tsx`**:
  - Ensure `fetchGeneratedLicenses()` preserves newly issued licenses in state while reconciling with `GET /api/license/list`, and trigger a refresh when the `esepa_licenses_updated` event fires.

### B. Single `GoTrueClient` Instance (`lib/supabase/client.ts` & `src/lib/supabase.ts`)
- Update `lib/supabase/client.ts` to share `globalThis.__supabaseInstance` with `src/lib/supabase.ts` so only one `GoTrueClient` instance is ever created in the browser.

### C. Idempotent Supabase Realtime Channel Setup (`src/lib/syncService.ts`)
- Before creating and subscribing to `'schema-live-changes'`, check for any existing channel with the same topic (via `supabase.getChannels()` or a module-level reference) and remove it via `supabase.removeChannel(...)` before registering `.on('postgres_changes', ...)`, and clean up the channel in the effect teardown function.

### D. Disable Vite HMR WebSocket & Suppress Benign WebSocket Rejections (`vite.config.ts` & `src/main.tsx`)
- Set `server.hmr: false` in `vite.config.ts` to match `server.ts`.
- Add a global `unhandledrejection` handler in `src/main.tsx` that suppresses benign `WebSocket closed without opened` rejections from Vite's client.

---

## 3. Verification
- Add an integration test in `tests/security_and_api.test.ts` verifying that after `POST /api/license/generate` issues a license, `GET /api/license/list` immediately includes the issued license key and school details.
- Run `npm test` and `compile_applet` to confirm all tests and the production build pass.
