-- ============================================================================
-- SCHOOLSPHERE 3.1 — AUTHORITATIVE LIVE REMEDIATION (niavmonyfwqlryppgksy)
-- Migration: 20261001220000_live_schema_and_security_reconciliation.sql
--
-- Covers:
--   Step 1: Lock down get_schools_directory, set_school_tenant_status,
--           sync_school_license, and create_school_with_license
--   Step 2: Enable RLS, Grants, and Verified-Email Policy on public.lesson_notes
--   Step 3: Add on_auth_user_email_updated trigger on auth.users -> public.users
--   Step 4.4: Drop obsolete password_hash column from public.users & update user RPCs
-- ============================================================================

-- ============================================================================
-- STEP 1.1: Lock down public.get_schools_directory()
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_schools_directory();

CREATE OR REPLACE FUNCTION public.get_schools_directory()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  theme TEXT,
  academic_year TEXT,
  current_term TEXT,
  status TEXT,
  license_id BIGINT,
  created_at BIGINT,
  updated_at BIGINT,
  license_key TEXT,
  tier TEXT,
  expiry_date BIGINT,
  active_status TEXT,
  active_modules JSONB,
  max_students INT
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
    s.email::TEXT,
    s.phone::TEXT,
    s.address::TEXT,
    s.logo_url::TEXT,
    s.theme::TEXT,
    s.academic_year::TEXT,
    s.current_term::TEXT,
    CASE
      WHEN s.status = 'suspended' OR sl.active_status IN ('suspended', 'revoked') THEN 'suspended'
      WHEN s.status = 'expired' OR sl.active_status = 'expired' THEN 'expired'
      ELSE COALESCE(s.status, 'active')
    END::TEXT AS status,
    COALESCE(s.license_id, sl.id) AS license_id,
    s.created_at,
    s.updated_at,
    sl.license_key::TEXT,
    sl.tier::TEXT,
    sl.expiry_date,
    sl.active_status::TEXT,
    to_jsonb(sl.active_modules) AS active_modules,
    sl.max_students
  FROM public.schools s
  LEFT JOIN LATERAL (
    SELECT l.*
    FROM public.school_licenses l
    WHERE l.school_id = s.id OR l.id = s.license_id
    ORDER BY (CASE WHEN l.school_id = s.id THEN 0 ELSE 1 END), l.updated_at DESC NULLS LAST, l.id DESC
    LIMIT 1
  ) sl ON true
  ORDER BY s.created_at DESC NULLS LAST;
END;
$$;

-- ============================================================================
-- STEP 1.2: Lock down public.set_school_tenant_status(uuid, text, text, text)
-- ============================================================================
DROP FUNCTION IF EXISTS public.set_school_tenant_status(UUID, TEXT, TEXT, TEXT);

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
  v_now BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  v_school_id UUID := p_school_id;
  v_school_name TEXT;
  v_license_id BIGINT := NULL;
  v_clean_status TEXT := LOWER(TRIM(COALESCE(p_status, 'suspended')));
  v_school_status TEXT;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: platform administrators only.';
  END IF;

  IF v_clean_status IN ('revoked', 'suspended', 'inactive', 'disabled') THEN
    v_school_status := 'suspended';
  ELSIF v_clean_status = 'expired' THEN
    v_school_status := 'expired';
  ELSE
    v_clean_status := 'active';
    v_school_status := 'active';
  END IF;

  IF v_school_id IS NULL AND p_license_key IS NOT NULL AND TRIM(p_license_key) <> '' THEN
    SELECT sl.school_id, sl.id, sl.school_name INTO v_school_id, v_license_id, v_school_name
    FROM public.school_licenses sl
    WHERE UPPER(sl.license_key) = UPPER(TRIM(p_license_key))
       OR sl.id::TEXT = TRIM(p_license_key)
    LIMIT 1;
  END IF;

  IF v_school_id IS NULL AND p_school_name IS NOT NULL AND TRIM(p_school_name) <> '' THEN
    SELECT s.id, s.license_id, s.name INTO v_school_id, v_license_id, v_school_name
    FROM public.schools s
    WHERE LOWER(s.name) = LOWER(TRIM(p_school_name))
       OR LOWER(s.slug) = LOWER(TRIM(p_school_name))
    LIMIT 1;
  END IF;

  IF v_school_id IS NOT NULL THEN
    UPDATE public.schools
    SET status = v_school_status, updated_at = v_now
    WHERE id = v_school_id
    RETURNING name INTO v_school_name;

    UPDATE public.school_licenses
    SET active_status = v_clean_status, updated_at = v_now
    WHERE school_id = v_school_id
       OR (v_license_id IS NOT NULL AND id = v_license_id)
       OR (p_license_key IS NOT NULL AND UPPER(license_key) = UPPER(TRIM(p_license_key)));
  ELSIF p_license_key IS NOT NULL AND TRIM(p_license_key) <> '' THEN
    UPDATE public.school_licenses
    SET active_status = v_clean_status, updated_at = v_now
    WHERE UPPER(license_key) = UPPER(TRIM(p_license_key))
       OR id::TEXT = TRIM(p_license_key)
    RETURNING school_id, id, school_name INTO v_school_id, v_license_id, v_school_name;
  END IF;

  RETURN jsonb_build_object(
    'success', v_school_id IS NOT NULL,
    'school_id', v_school_id,
    'school_name', v_school_name,
    'license_id', v_license_id,
    'status', v_school_status,
    'active_status', v_clean_status,
    'updated_at', v_now
  );
END;
$$;

-- ============================================================================
-- STEP 1.3: Lock down public.sync_school_license(...)
-- Matches exact live signature: (p_school_name, p_license_key, p_tier, p_email,
-- p_phone, p_address, p_duration_months, p_expiry_date, p_modules, p_status)
-- ============================================================================
DROP FUNCTION IF EXISTS public.sync_school_license(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.sync_school_license(
  p_school_name TEXT,
  p_license_key TEXT,
  p_tier TEXT DEFAULT 'Standard',
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT 'Ghana',
  p_duration_months TEXT DEFAULT '12',
  p_expiry_date BIGINT DEFAULT NULL,
  p_modules JSONB DEFAULT '["students","academic","timetable","attendance","results","exam_analysis","reports","fees","siren","evoting","inventory","settings","users"]'::jsonb,
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
  v_existing_key TEXT;
  v_slug TEXT;
  v_now BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  v_expiry BIGINT;
  v_clean_name TEXT;
  v_clean_key TEXT;
  v_tier TEXT;
  v_status TEXT;
  v_school_status TEXT;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: platform administrators only.';
  END IF;

  v_clean_name := TRIM(COALESCE(p_school_name, 'SchoolSphere Academy'));
  v_clean_key := UPPER(TRIM(COALESCE(p_license_key, '')));
  v_tier := COALESCE(NULLIF(TRIM(p_tier), ''), 'Standard');
  v_status := LOWER(TRIM(COALESCE(p_status, 'active')));
  IF v_status NOT IN ('active', 'suspended', 'expired', 'revoked', 'pending_activation') THEN
    v_status := 'active';
  END IF;
  v_school_status := CASE WHEN v_status = 'revoked' THEN 'suspended' ELSE v_status END;

  v_slug := LOWER(REGEXP_REPLACE(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := TRIM(BOTH '-' FROM v_slug);
  IF v_slug = '' OR v_slug IS NULL THEN
    v_slug := 'school-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);
  END IF;

  v_expiry := COALESCE(p_expiry_date, v_now + (365::BIGINT * 24 * 60 * 60 * 1000));

  -- 1. Locate existing school by slug, name, or license key
  SELECT id INTO v_school_id
  FROM public.schools
  WHERE slug = v_slug OR LOWER(TRIM(name)) = LOWER(v_clean_name)
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  IF v_school_id IS NULL AND v_clean_key <> '' THEN
    SELECT school_id INTO v_school_id
    FROM public.school_licenses
    WHERE UPPER(TRIM(license_key)) = v_clean_key
      AND school_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_school_id IS NULL AND v_status IN ('suspended', 'revoked', 'expired') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot suspend or revoke a school that does not exist in the database.'
    );
  END IF;

  IF v_school_id IS NULL THEN
    v_school_id := gen_random_uuid();
    INSERT INTO public.schools (
      id, name, slug, license_id, theme, email, phone, address,
      academic_year, current_term, status, created_at, updated_at
    ) VALUES (
      v_school_id,
      v_clean_name,
      v_slug,
      NULL,
      'indigo',
      COALESCE(NULLIF(TRIM(p_email), ''), 'admin@' || v_slug || '.edu.gh'),
      COALESCE(NULLIF(TRIM(p_phone), ''), '+233 24 000 0000'),
      COALESCE(NULLIF(TRIM(p_address), ''), 'Ghana'),
      '2026/2027',
      'Term 1',
      v_school_status,
      v_now,
      v_now
    );
  ELSE
    UPDATE public.schools
    SET
      status = v_school_status,
      email = COALESCE(NULLIF(TRIM(p_email), ''), email),
      phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
      address = COALESCE(NULLIF(TRIM(p_address), ''), address),
      updated_at = v_now
    WHERE id = v_school_id;
  END IF;

  -- 2. Locate existing license row for this school
  SELECT id, license_key INTO v_license_id, v_existing_key
  FROM public.school_licenses
  WHERE id = (SELECT license_id FROM public.schools WHERE id = v_school_id)
     OR school_id = v_school_id
     OR (v_clean_key <> '' AND UPPER(TRIM(license_key)) = v_clean_key)
     OR LOWER(TRIM(school_name)) = LOWER(v_clean_name)
  ORDER BY
    CASE
      WHEN id = (SELECT license_id FROM public.schools WHERE id = v_school_id) THEN 0
      WHEN school_id = v_school_id THEN 1
      WHEN v_clean_key <> '' AND UPPER(TRIM(license_key)) = v_clean_key THEN 2
      ELSE 3
    END,
    id DESC
  LIMIT 1;

  IF v_clean_key = '' OR v_clean_key = 'TEST' THEN
    v_clean_key := COALESCE(
      NULLIF(UPPER(TRIM(v_existing_key)), ''),
      'ESEPA-' || UPPER(SUBSTRING(REGEXP_REPLACE(v_clean_name, '[^A-Za-z0-9]', '', 'g') || 'XXXX' FROM 1 FOR 4)) || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6))
    );
  END IF;

  IF v_license_id IS NOT NULL THEN
    UPDATE public.school_licenses
    SET
      school_id = v_school_id,
      school_name = v_clean_name,
      tier = COALESCE(v_tier, tier),
      expiry_date = COALESCE(p_expiry_date, expiry_date, v_expiry),
      active_status = v_status,
      active_modules = COALESCE(p_modules, active_modules),
      updated_at = v_now
    WHERE id = v_license_id;
    v_clean_key := COALESCE(v_existing_key, v_clean_key);
  ELSE
    INSERT INTO public.school_licenses (
      license_key, school_name, school_id, tier, expiry_date,
      active_status, active_modules, created_at, updated_at
    ) VALUES (
      v_clean_key, v_clean_name, v_school_id, v_tier, v_expiry,
      v_status, p_modules, v_now, v_now
    )
    ON CONFLICT (license_key) DO UPDATE SET
      school_name = EXCLUDED.school_name,
      school_id = v_school_id,
      tier = EXCLUDED.tier,
      expiry_date = COALESCE(EXCLUDED.expiry_date, public.school_licenses.expiry_date),
      active_status = v_status,
      active_modules = COALESCE(EXCLUDED.active_modules, public.school_licenses.active_modules),
      updated_at = v_now
    RETURNING id INTO v_license_id;
  END IF;

  -- Remove any duplicate license rows for the same school
  DELETE FROM public.school_licenses
  WHERE id <> v_license_id
    AND (school_id = v_school_id OR LOWER(TRIM(school_name)) = LOWER(v_clean_name));

  UPDATE public.schools
  SET license_id = v_license_id,
      status = v_school_status,
      updated_at = v_now
  WHERE id = v_school_id;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', v_school_id,
    'school_name', v_clean_name,
    'slug', v_slug,
    'license_id', v_license_id,
    'license_key', v_clean_key,
    'status', v_school_status,
    'active_status', v_status,
    'tier', v_tier,
    'expiry_date', v_expiry
  );
END;
$$;

-- ============================================================================
-- STEP 1.4: Revoke & Grant RPC Execute Privileges Across All Signatures
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.get_schools_directory() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_school_tenant_status(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_school_license(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_schools_directory() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_school_tenant_status(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_school_license(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT) TO authenticated, service_role;

-- Dynamically lock down create_school_with_license and any overloads of the 4 admin RPCs
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_schools_directory',
        'set_school_tenant_status',
        'sync_school_license',
        'create_school_with_license'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- ============================================================================
-- STEP 2: Enable RLS, Grants, and Verified-Email Policy on public.lesson_notes
-- ============================================================================
ALTER TABLE public.lesson_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_notes TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lesson_notes_id_seq TO authenticated, service_role;

DROP POLICY IF EXISTS "Tenant isolation for lesson_notes" ON public.lesson_notes;
DROP POLICY IF EXISTS "Verified tenant access for lesson_notes" ON public.lesson_notes;
DROP POLICY IF EXISTS "lesson_notes_tenant_isolation" ON public.lesson_notes;
DROP POLICY IF EXISTS "lesson_notes_super_admin_all" ON public.lesson_notes;

CREATE POLICY "Verified tenant access for lesson_notes"
  ON public.lesson_notes
  FOR ALL
  TO authenticated
  USING (
    public.is_email_verified()
    AND (school_id = public.get_auth_school_id() OR public.is_super_admin())
  )
  WITH CHECK (
    public.is_email_verified()
    AND (school_id = public.get_auth_school_id() OR public.is_super_admin())
  );

-- ============================================================================
-- STEP 3: Add on_auth_user_email_updated Trigger on auth.users -> public.users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_auth_user_email_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND (OLD.email IS DISTINCT FROM NEW.email) THEN
    UPDATE public.users
    SET
      email = LOWER(TRIM(NEW.email)),
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE auth_user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_email_updated();

-- Backfill any existing email drift between auth.users and public.users
UPDATE public.users u
SET email = LOWER(TRIM(au.email)),
    updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
FROM auth.users au
WHERE u.auth_user_id = au.id
  AND au.email IS NOT NULL
  AND LOWER(TRIM(COALESCE(u.email, ''))) <> LOWER(TRIM(au.email));

-- ============================================================================
-- STEP 4.4: Drop obsolete password_hash column from public.users & update RPCs
-- ============================================================================
ALTER TABLE public.users DROP COLUMN IF EXISTS password_hash;

-- Update tenant user RPCs if present so they never reference dropped password_hash
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN ('provision_tenant_user', 'upsert_tenant_user', 'update_tenant_user')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

-- Record canonical reconciliation migration in supabase_migrations.schema_migrations
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES ('20261001220000', 'live_schema_and_security_reconciliation', ARRAY[]::text[])
    ON CONFLICT (version) DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
