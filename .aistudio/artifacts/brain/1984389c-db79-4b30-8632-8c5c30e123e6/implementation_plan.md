# SchoolSphere 3.1 Production Security Remediation Plan (`niavmonyfwqlryppgksy`)

Remediate all 9 CRITICAL, HIGH, and MEDIUM security vulnerabilities across the live Supabase PostgreSQL database (`niavmonyfwqlryppgksy`), Express backend, and React client while preserving all existing school and user logins.

## User Review & Critical Decisions

> [!IMPORTANT]
> This plan incorporates your confirmed choices and presents the exact SQL statements below for your review before anything is executed against `niavmonyfwqlryppgksy`.

- **Confirmed Decision 1 (Canonical Email Source of Truth)**: Treat `auth.users.email` as the single canonical email and synchronize `public.users.email` to match `auth.users.email` across all 5 rows (and on every future auth link/update), so existing Supabase Auth credentials continue working without disruption.
- **Confirmed Decision 2 (Single-Source Supabase Auth Login)**: Consolidate authentication onto **Supabase Auth (`auth.users`)** as the single source of truth. When a user signs in with a username handle (e.g. `admin@joyce`, `eamoako`, `creator`), the backend resolves the handle to the user's canonical `auth.users.email` and verifies the password strictly via Supabase Auth (`signInWithPassword`), eliminating the legacy `bcryptjs` / `password_hash` verification path.
- **Confirmed Decision 3 (RPC Lockdown Scope)**: Lock down both the **3 school/license RPCs** (`get_schools_directory`, `set_school_tenant_status`, `sync_school_license`) and the **5 tenant user RPCs** (`get_tenant_users`, `provision_tenant_user` [9-arg & 15-arg], `upsert_tenant_user`, `update_tenant_user`, `delete_tenant_user`) by revoking `anon` execution and enforcing explicit role guards inside each `SECURITY DEFINER` function body.

---

## 1. Item-by-Item Remediation & Behavioral Impact Analysis

### CRITICAL — Item 1: Lock Down Unprotected Postgres RPC Functions
- **What Changes & Why**:
  - Convert `public.get_schools_directory()` from `LANGUAGE sql` to `LANGUAGE plpgsql` and insert the platform administrator guard (`IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN RAISE EXCEPTION 'Access denied: platform administrators only.'; END IF;`) as the very first statement in `get_schools_directory`, `set_school_tenant_status`, and `sync_school_license`.
  - Add tenant/admin authorization guards to `get_tenant_users`, `provision_tenant_user` (9-arg and 15-arg), `upsert_tenant_user`, `update_tenant_user`, and `delete_tenant_user` so they require `auth.role() = 'service_role'`, `public.is_super_admin()`, or an authenticated school administrator acting strictly within their own `public.get_auth_school_id()`.
  - Execute `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` followed by `GRANT EXECUTE ... TO authenticated, service_role` on all 8 functions.
- **Behavioral Impact Flag**:
  - **Frontend Impact**: **None.** Our codebase audit confirmed that the React frontend (`src/`) makes zero direct `.rpc()` calls to any of these functions; all calls originate from the backend using `service_role`.
  - **Direct REST API Impact**: Unauthenticated (`anon`) and non-admin (`authenticated`) requests to `/rest/v1/rpc/get_schools_directory`, `set_school_tenant_status`, or `sync_school_license` will now be rejected with `"Access denied: platform administrators only."`

### CRITICAL — Item 2: Fix `public.users` ↔ `auth.users` Email Mismatch & Account-Takeover Vectors
- **Root Causes Identified on Live Project `niavmonyfwqlryppgksy`**:
  1. **Row `id=163` (`admin`, school `JOYCE`)**: `public.users.email` = `admin@joyce.com` vs. `auth.users.email` = `admin@joyce.edu.gh` — caused by `provisionAndSyncTenantSchoolAdmin` (`server.ts:1864–1888`) matching `u.role === 'admin'` and overwriting `public.users.email` with `client_email` without updating `auth.users.email`.
  2. **Row `id=139` (`creator`)**: `public.users.email` = `amoakoemmanuel@hotmail.com` vs. `auth.users.email` = `creator@schoolsphere.app` — caused by `ensureUserSupabaseAuthIdentity` (`server.ts:320–322`) hardcoding `rawEmail = 'creator@schoolsphere.app'` for `auth.users` while leaving `public.users.email` unchanged.
  3. **Row `id=171` (`amoakoimml`, school `ABSA`) & Row `id=174` (`amoakoemmnauel2026`, school `GHOST`)**: `public.users.email` was overwritten with the school's license contact email (`amoakoemmanuel2020@gmail.com` / `amoakoemmanuel2026@gmail.com`) by `provisionAndSyncTenantSchoolAdmin` while `auth.users.email` remained the initial signup email (`amoakoimml@gmail.com` / `amoakoemmnauel2026@gmail.com`).
  4. **Account-Takeover Path A (`POST /api/auth/verify` in `server.ts:4329–4362`)**: Accepted unverified `{ email, supabaseUserId }` from `req.body` without verifying `accessToken` against `supabase.auth.getUser(accessToken)`. If `email` matched an existing `admin` or `creator` row in `public.users`, it overwrote `public.users.auth_user_id = supabaseUserId` with the caller's UUID and issued an admin/creator JWT.
  5. **Account-Takeover Path B (`handle_new_user()` Trigger in `supabase/schema_master.sql:1121–1128`)**: Linked unlinked `public.users` rows (`WHERE auth_user_id IS NULL`) using `OR (v_school_id IS NOT NULL AND school_id = v_school_id AND LOWER(username) = LOWER(v_username))` derived from unverified client `raw_user_meta_data` on signup, allowing a new signup to claim an unlinked school user row with a different email.
  6. **Random UUID Bug (`lib/multiTenantAuth.ts:173, 512`)**: Generated `const authUserId = crypto.randomUUID()` instead of using the real `auth.users.id` returned by `admin.auth.admin.createUser()`.
- **What Changes & Why**:
  - **Database Trigger & Backfill SQL**: Update `public.handle_new_user()` so linking an existing `public.users` row requires an exact case-insensitive email match (`LOWER(email) = LOWER(NEW.email)`), always keeps `public.users.email = LOWER(NEW.email)`, and syncs all existing `public.users` rows so `public.users.email` matches `auth.users.email`. Add a trigger `sync_auth_user_email_to_public_users()` on `auth.users` (`AFTER UPDATE OF email`) so future email updates stay in lockstep.
  - **`POST /api/auth/verify` Hardening**: Require a valid Bearer/body `accessToken`, verify it via `adminClient.auth.getUser(accessToken)`, derive `supabaseUserId` and `verifiedEmail` exclusively from the verified Supabase Auth user object, and refuse to link `auth_user_id` to any `public.users` row unless `LOWER(dbUser.email) === LOWER(verifiedEmail)`.
  - **`ensureUserSupabaseAuthIdentity` & `lib/multiTenantAuth.ts`**: Remove the synthetic email rewrite (`creator@schoolsphere.app` / `fallbackScopedEmail`), capture the real `createdUser.user.id` and `createdUser.user.email` from `adminClient.auth.admin.createUser`, and always keep `public.users.email` synchronized with `auth.users.email`.

### HIGH — Item 3: Remove Insecure TLS/DNS Overrides, Anon Key Fallback, Dead DDL, and Deleted Project Refs
- **What Changes & Why**:
  - Remove the custom DNS-over-HTTPS query to `https://1.1.1.1/dns-query` in `server.ts` (`verifyEmailAddressServerSide`), using standard Node `dns.promises.resolveMx` / `resolve`. Confirm zero `NODE_TLS_REJECT_UNAUTHORIZED = '0'` exists.
  - In `lib/supabase/server.ts`, remove the hardcoded `anon` JWT literal fallback inside `getSupabaseAdmin()`. Require `SUPABASE_SERVICE_ROLE_KEY` (or a valid registered `SUPABASE_SECRET_KEY`) and `SUPABASE_URL` / `VITE_SUPABASE_URL`, throwing a clear startup error if unset instead of silently downgrading `getSupabaseAdmin()` to `anon`.
  - Remove any dead `createPostgresTables()` / `USING (true)` policy helpers and any residual references to `vwmahpuzthyxnzrohfxw`.
- **Behavioral Impact Flag**:
  - Server startup now fails fast with an explicit error if `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_URL` is missing from the environment.

### HIGH — Item 4: Fail/Log Visibly in `pullData()` Instead of Silently Returning Empty Arrays
- **What Changes & Why**:
  - In `pullData()` (`server.ts:1145–1193`), stop silently swallowing per-table Supabase query errors and substituting empty arrays `[]`. Log structured `[Supabase pullData Table Error]` diagnostics with table name, school ID, and Postgres error code/message, and throw/propagate read failures so `/api/sync/pull` returns an explicit HTTP 500 error instead of masking broken reads as empty tables.

### HIGH — Item 5: Strict Explicit CORS Origin Allow-List
- **What Changes & Why**:
  - Replace broad wildcard regexes in `server.ts` with an explicit allow-list of your real frontend origins (`https://ais-dev-2m4lcq44pyuwmghy2bv5zn-689154690670.europe-west2.run.app`, `https://ais-pre-2m4lcq44pyuwmghy2bv5zn-689154690670.europe-west2.run.app`, `https://schoolsphere.app`, `https://www.schoolsphere.app`, `http://localhost:3000`, `http://127.0.0.1:3000`, plus any origin explicitly listed in `process.env.ALLOWED_ORIGINS`) and add `Vary: Origin`.

### HIGH — Item 6: Consolidate Dual Auth System onto Supabase Auth
- **What Changes & Why**:
  - In `POST /api/auth/login` (`server.ts`), resolve username handles (`admin@joyce`, `eamoako`, `creator`, or email) to the user's canonical `auth.users.email` and authenticate credentials via Supabase Auth (`signInWithPassword`).
  - Remove the `bcryptjs` `password_hash` comparison fallback in `POST /api/auth/login` and stop writing plaintext-derived `bcryptjs` hashes as an independent auth authority.
  - Update `README.md` to document the unified Supabase Auth + handle-resolution flow.
- **Behavioral Impact Flag**:
  - Users can still type either their email or their username handle (`admin@joyce`, `eamoako`, `creator`), and password verification is performed strictly by Supabase Auth (`auth.users`).

### MEDIUM — Items 7, 8 & 9: Credential Hygiene, Tracked Files & Leaked-Password Protection
- **Item 7**: Remove all hardcoded fallback passwords (such as `'july94bab'`, `'admin123'`, `'demo123'`) from `server.ts` and `lib/supabase/server.ts`, ensure `README.md` directs operators to `SUPABASE_AUTH_ONBOARDING_GUIDE.md`, and enforce `mustChangePassword` when a user signs in with an initial temporary/license password.
- **Item 8**: Add `registered_users.json`, `generated_licenses.json`, `license_status.json`, `sync_logs.json`, `firebase-applet-config.json`, and `.env*` (except `.env.example`) to `.gitignore`, remove `firebase-applet-config.json` from tracked files, and verify git history.
- **Item 9**: Provide the exact verification & CLI/Dashboard toggle instructions for HaveIBeenPwned leaked-password protection on project `niavmonyfwqlryppgksy`.

---

## 2. Exact SQL Script for Review (Target: `niavmonyfwqlryppgksy`)

> [!WARNING]
> **Nothing has been executed against the live database yet.** Please review the complete SQL migration below. Once you click **Proceed**, I will apply and verify this migration against `niavmonyfwqlryppgksy`.

```sql
BEGIN;

-- ============================================================================
-- PART 1: LOCK DOWN SECURITY DEFINER RPC FUNCTIONS (ITEM 1 + TENANT USER RPCS)
-- ============================================================================

-- 1A. public.get_schools_directory() — Platform Admins & Service Role Only
DROP FUNCTION IF EXISTS public.get_schools_directory();

CREATE OR REPLACE FUNCTION public.get_schools_directory()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  theme TEXT,
  logo_url TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  academic_year TEXT,
  current_term TEXT,
  status TEXT,
  license_id BIGINT,
  license_key TEXT,
  tier TEXT,
  expiry_date BIGINT,
  active_modules JSONB,
  used BOOLEAN,
  activated_at BIGINT,
  client_email TEXT,
  contact_person TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: platform administrators only.';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name::TEXT,
    s.slug::TEXT,
    s.theme::TEXT,
    s.logo_url::TEXT,
    s.email::TEXT,
    s.phone::TEXT,
    s.address::TEXT,
    s.academic_year::TEXT,
    s.current_term::TEXT,
    CASE
      WHEN sl.active_status IN ('suspended', 'revoked') THEN 'suspended'
      WHEN sl.active_status = 'expired' THEN 'expired'
      ELSE COALESCE(s.status, 'active')
    END::TEXT AS status,
    COALESCE(s.license_id, sl.id) AS license_id,
    sl.license_key::TEXT,
    COALESCE(sl.tier, 'Enterprise')::TEXT AS tier,
    sl.expiry_date,
    COALESCE(sl.active_modules, '["students","academic","timetable","attendance","results","reports","fees"]'::jsonb) AS active_modules,
    COALESCE(sl.used, (sl.activated_at IS NOT NULL AND sl.activated_at > 0)) AS used,
    sl.activated_at,
    COALESCE(sl.client_email, s.email)::TEXT AS client_email,
    sl.contact_person::TEXT
  FROM public.schools s
  LEFT JOIN LATERAL (
    SELECT l.*
    FROM public.school_licenses l
    WHERE l.id = s.license_id
       OR l.school_id = s.id
       OR LOWER(TRIM(l.school_name)) = LOWER(TRIM(s.name))
    ORDER BY
      CASE WHEN l.id = s.license_id THEN 0 ELSE 1 END,
      l.updated_at DESC NULLS LAST,
      l.id DESC
    LIMIT 1
  ) sl ON TRUE
  ORDER BY s.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_schools_directory() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_schools_directory() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_schools_directory() TO authenticated, service_role;


-- 1B. public.set_school_tenant_status(uuid, text, text, text) — Platform Admins & Service Role Only
CREATE OR REPLACE FUNCTION public.set_school_tenant_status(
  p_school_id UUID DEFAULT NULL,
  p_school_name TEXT DEFAULT NULL,
  p_license_key TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'suspended'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_school_id UUID := p_school_id;
  v_school_name TEXT;
  v_status TEXT := LOWER(TRIM(COALESCE(p_status, 'suspended')));
  v_school_status TEXT;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: platform administrators only.';
  END IF;

  IF v_status NOT IN ('active', 'suspended', 'expired', 'revoked', 'pending_activation') THEN
    v_status := 'suspended';
  END IF;
  v_school_status := CASE WHEN v_status = 'revoked' THEN 'suspended' ELSE v_status END;

  IF v_school_id IS NULL AND p_license_key IS NOT NULL AND TRIM(p_license_key) <> '' THEN
    SELECT school_id, school_name INTO v_school_id, v_school_name
    FROM public.school_licenses
    WHERE UPPER(license_key) = UPPER(TRIM(p_license_key))
       OR id::TEXT = TRIM(p_license_key)
    LIMIT 1;
  END IF;

  IF v_school_id IS NULL AND p_school_name IS NOT NULL AND TRIM(p_school_name) <> '' THEN
    SELECT id, name INTO v_school_id, v_school_name
    FROM public.schools
    WHERE LOWER(name) = LOWER(TRIM(p_school_name))
       OR LOWER(slug) = LOWER(TRIM(p_school_name))
    LIMIT 1;
  END IF;

  IF v_school_id IS NOT NULL THEN
    UPDATE public.schools
    SET status = v_school_status,
        updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE id = v_school_id
    RETURNING name INTO v_school_name;

    UPDATE public.school_licenses
    SET active_status = v_status,
        updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE school_id = v_school_id;
  END IF;

  IF p_license_key IS NOT NULL AND TRIM(p_license_key) <> '' THEN
    UPDATE public.school_licenses
    SET active_status = v_status,
        updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE UPPER(license_key) = UPPER(TRIM(p_license_key))
       OR id::TEXT = TRIM(p_license_key);
  END IF;

  RETURN jsonb_build_object(
    'success', v_school_id IS NOT NULL,
    'school_id', v_school_id,
    'school_name', v_school_name,
    'status', v_school_status,
    'active_status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_school_tenant_status(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_school_tenant_status(UUID, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_school_tenant_status(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- 1C. public.sync_school_license(...) — Platform Admins & Service Role Only
CREATE OR REPLACE FUNCTION public.sync_school_license(
  p_school_name TEXT,
  p_license_key TEXT,
  p_tier TEXT DEFAULT 'Standard',
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT 'Ghana',
  p_duration_months TEXT DEFAULT '12',
  p_expiry_date BIGINT DEFAULT NULL,
  p_modules JSONB DEFAULT '["students","academic","timetable","attendance","results","reports","fees"]'::jsonb,
  p_status TEXT DEFAULT 'active'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_school_id UUID;
  v_license_id BIGINT;
  v_existing_license_id BIGINT;
  v_existing_key TEXT;
  v_final_key TEXT;
  v_slug TEXT;
  v_clean_name TEXT;
  v_clean_tier TEXT;
  v_clean_status TEXT;
  v_school_status TEXT;
  v_now BIGINT;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: platform administrators only.';
  END IF;

  v_now := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  v_clean_name := UPPER(TRIM(COALESCE(p_school_name, 'SCHOOL SPHERE ACADEMY')));
  v_slug := TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(v_clean_name), '[^a-z0-9]+', '-', 'g'));
  IF v_slug = '' OR v_slug IS NULL THEN
    v_slug := 'school-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);
  END IF;

  v_clean_tier := CASE
    WHEN LOWER(COALESCE(p_tier, '')) LIKE '%basic%' OR LOWER(COALESCE(p_tier, '')) LIKE '%starter%' THEN 'Basic'
    WHEN LOWER(COALESCE(p_tier, '')) LIKE '%enterprise%' OR LOWER(COALESCE(p_tier, '')) LIKE '%premium%' OR LOWER(COALESCE(p_tier, '')) LIKE '%pro%' THEN 'Enterprise'
    ELSE 'Standard'
  END;

  v_clean_status := CASE
    WHEN LOWER(COALESCE(p_status, '')) LIKE '%suspend%' THEN 'suspended'
    WHEN LOWER(COALESCE(p_status, '')) LIKE '%revoke%' THEN 'revoked'
    WHEN LOWER(COALESCE(p_status, '')) LIKE '%expire%' THEN 'expired'
    ELSE 'active'
  END;

  v_school_status := CASE
    WHEN v_clean_status = 'revoked' THEN 'suspended'
    ELSE v_clean_status
  END;

  SELECT id, license_id INTO v_school_id, v_existing_license_id
  FROM public.schools
  WHERE slug = v_slug OR LOWER(TRIM(name)) = LOWER(v_clean_name)
  LIMIT 1;

  IF v_school_id IS NULL THEN
    INSERT INTO public.schools (
      name, slug, email, phone, address, theme, academic_year, current_term, status, created_at, updated_at
    ) VALUES (
      v_clean_name,
      v_slug,
      COALESCE(p_email, 'admin@' || v_slug || '.edu.gh'),
      COALESCE(p_phone, '+233 24 000 0000'),
      COALESCE(p_address, 'Ghana'),
      'indigo',
      '2026/2027',
      'Term 1',
      v_school_status,
      v_now,
      v_now
    )
    RETURNING id INTO v_school_id;
  ELSE
    UPDATE public.schools
    SET status = v_school_status,
        email = COALESCE(p_email, email),
        phone = COALESCE(p_phone, phone),
        updated_at = v_now
    WHERE id = v_school_id;
  END IF;

  IF v_existing_license_id IS NULL THEN
    SELECT id, license_key INTO v_existing_license_id, v_existing_key
    FROM public.school_licenses
    WHERE school_id = v_school_id
       OR LOWER(TRIM(school_name)) = LOWER(v_clean_name)
    ORDER BY updated_at DESC NULLS LAST, id DESC
    LIMIT 1;
  ELSE
    SELECT license_key INTO v_existing_key
    FROM public.school_licenses
    WHERE id = v_existing_license_id;
  END IF;

  v_final_key := NULLIF(UPPER(TRIM(COALESCE(p_license_key, ''))), '');
  IF v_final_key IS NULL THEN
    v_final_key := NULLIF(UPPER(TRIM(COALESCE(v_existing_key, ''))), '');
  END IF;
  IF v_final_key IS NULL THEN
    v_final_key := 'ESEPA-' || SUBSTRING(REGEXP_REPLACE(v_clean_name, '[^A-Z0-9]', '', 'g') FROM 1 FOR 4) || '-' ||
                   UPPER(SUBSTRING(REPLACE(v_school_id::TEXT, '-', '') FROM 1 FOR 4)) || '-' ||
                   UPPER(SUBSTRING(REPLACE(v_school_id::TEXT, '-', '') FROM 5 FOR 4));
  END IF;

  IF v_existing_license_id IS NULL THEN
    SELECT id INTO v_existing_license_id
    FROM public.school_licenses
    WHERE license_key = v_final_key
    LIMIT 1;
  END IF;

  IF v_existing_license_id IS NOT NULL THEN
    DELETE FROM public.school_licenses
    WHERE id <> v_existing_license_id
      AND (school_id = v_school_id OR license_key = v_final_key OR LOWER(TRIM(school_name)) = LOWER(v_clean_name));

    UPDATE public.school_licenses
    SET license_key = v_final_key,
        school_name = v_clean_name,
        school_id = v_school_id,
        tier = v_clean_tier,
        expiry_date = COALESCE(p_expiry_date, expiry_date),
        active_status = v_clean_status,
        active_modules = COALESCE(p_modules, active_modules),
        updated_at = v_now
    WHERE id = v_existing_license_id
    RETURNING id INTO v_license_id;
  ELSE
    INSERT INTO public.school_licenses (
      license_key, school_name, expiry_date, active_status, school_id, tier, active_modules, created_at, updated_at
    ) VALUES (
      v_final_key,
      v_clean_name,
      p_expiry_date,
      v_clean_status,
      v_school_id,
      v_clean_tier,
      p_modules,
      v_now,
      v_now
    )
    ON CONFLICT (license_key) DO UPDATE SET
      school_name = EXCLUDED.school_name,
      school_id = EXCLUDED.school_id,
      tier = EXCLUDED.tier,
      expiry_date = COALESCE(EXCLUDED.expiry_date, public.school_licenses.expiry_date),
      active_status = EXCLUDED.active_status,
      active_modules = COALESCE(EXCLUDED.active_modules, public.school_licenses.active_modules),
      updated_at = v_now
    RETURNING id INTO v_license_id;
  END IF;

  UPDATE public.schools
  SET license_id = v_license_id,
      status = v_school_status,
      updated_at = v_now
  WHERE id = v_school_id;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', v_school_id,
    'license_id', v_license_id,
    'school_name', v_clean_name,
    'slug', v_slug,
    'license_key', v_final_key,
    'tier', v_clean_tier,
    'status', v_school_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_school_license(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_school_license(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_school_license(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT) TO authenticated, service_role;


-- 1D. Lock Down Tenant User RPCs (get_tenant_users, provision_tenant_user, upsert_tenant_user, update_tenant_user, delete_tenant_user)
CREATE OR REPLACE FUNCTION public.get_tenant_users(
  p_school_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  auth_user_id UUID,
  school_id UUID,
  username TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT,
  status TEXT,
  created_at BIGINT,
  updated_at BIGINT,
  last_login BIGINT,
  school_name TEXT,
  school_slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    IF auth.uid() IS NULL OR p_school_id IS NULL OR p_school_id <> public.get_auth_school_id() THEN
      RAISE EXCEPTION 'Access denied: unauthorized tenant user directory query.';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.auth_user_id,
    u.school_id,
    u.username::TEXT,
    u.full_name::TEXT,
    u.email::TEXT,
    u.phone::TEXT,
    u.role::TEXT,
    COALESCE(u.status, 'active')::TEXT AS status,
    u.created_at,
    u.updated_at,
    u.last_login,
    s.name::TEXT AS school_name,
    s.slug::TEXT AS school_slug
  FROM public.users u
  LEFT JOIN public.schools s ON s.id = u.school_id
  WHERE u.role NOT IN ('creator', 'super_admin')
    AND (p_school_id IS NULL OR u.school_id = p_school_id)
  ORDER BY u.created_at DESC NULLS LAST, u.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_users(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_users(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_users(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_tenant_user(BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_tenant_user(BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_user(BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_tenant_user(BIGINT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_tenant_user(BIGINT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_user(BIGINT, UUID) FROM authenticated, service_role;


-- ============================================================================
-- PART 2: RECONCILE public.users.email WITH CANONICAL auth.users.email &
--         HARDEN handle_new_user() TRIGGER AGAINST ACCOUNT TAKEOVER (ITEM 2)
-- ============================================================================

-- 2A. Sync existing public.users rows so public.users.email matches canonical auth.users.email
UPDATE public.users u
SET email = LOWER(au.email),
    updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
FROM auth.users au
WHERE u.auth_user_id = au.id
  AND au.email IS NOT NULL
  AND LOWER(COALESCE(u.email, '')) <> LOWER(au.email);

-- 2B. Harden handle_new_user() so it ONLY links unlinked public.users rows when LOWER(email) = LOWER(NEW.email)
--     (Never link by unverified raw_user_meta_data username/school_id) and always keeps email synced.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_full_name TEXT;
  v_username  TEXT;
  v_role      TEXT;
  v_school_id UUID;
  v_matched_id BIGINT;
BEGIN
  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'fullName'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    SPLIT_PART(NEW.email, '@', 1)
  );

  v_username := COALESCE(
    NULLIF(LOWER(TRIM(NEW.raw_user_meta_data->>'username')), ''),
    LOWER(SPLIT_PART(NEW.email, '@', 1))
  );

  v_role := COALESCE(
    NULLIF(LOWER(TRIM(NEW.raw_user_meta_data->>'role')), ''),
    'admin'
  );
  IF v_role IN ('creator', 'super_admin') THEN
    v_role := 'admin';
  END IF;

  BEGIN
    v_school_id := NULLIF(TRIM(NEW.raw_user_meta_data->>'school_id'), '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_school_id := NULL;
  END;

  -- 1. If a row is already linked to this auth_user_id, keep its email synchronized with auth.users.email
  UPDATE public.users
  SET email = LOWER(NEW.email),
      full_name = COALESCE(NULLIF(public.users.full_name, ''), v_full_name),
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  WHERE auth_user_id = NEW.id
  RETURNING id INTO v_matched_id;

  -- 2. Otherwise, ONLY link an existing unlinked public.users row if its email strictly matches NEW.email
  IF v_matched_id IS NULL AND NEW.email IS NOT NULL THEN
    UPDATE public.users
    SET auth_user_id = NEW.id,
        email = LOWER(NEW.email),
        updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE auth_user_id IS NULL
      AND LOWER(email) = LOWER(NEW.email)
    RETURNING id INTO v_matched_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Notice in handle_new_user trigger: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 2C. Keep public.users.email automatically synchronized whenever auth.users.email is updated
CREATE OR REPLACE FUNCTION public.sync_auth_user_email_to_public_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
    UPDATE public.users
    SET email = LOWER(NEW.email),
        updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE auth_user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_email_to_public_users();

COMMIT;
```

---

## 3. Verification Plan (Post-Approval)

1. **RPC Security Verification (Item 1)**:
   - Call `supabase.rpc('get_schools_directory')`, `supabase.rpc('set_school_tenant_status', ...)`, and `supabase.rpc('sync_school_license', ...)` using:
     1. An unauthenticated `anon` client → confirm rejection (`permission denied for function`).
     2. A signed-in non-admin user (`eamoako@joyce.edu.gh`, role `teacher`) → confirm rejection (`Access denied: platform administrators only.`).
     3. The `service_role` admin client → confirm normal execution.
2. **`public.users` ↔ `auth.users` Email Parity Verification (Item 2)**:
   - Query all rows in `public.users` and compare against `auth.users` via `getUserById(auth_user_id)` to verify **5/5 rows have 100% matching emails** and that `POST /api/auth/verify` rejects unverified or mismatched tokens.
3. **Server & Build Verification (Items 3–9)**:
   - Run `compile_applet` and verify logins for existing school accounts (`admin@joyce.edu.gh` / `admin@joyce`, `eamoako@joyce.edu.gh`, `creator@schoolsphere.app`) via Supabase Auth.
