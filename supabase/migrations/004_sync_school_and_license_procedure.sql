-- ==============================================================================
-- Migration: 004_sync_school_and_license_procedure.sql
-- Description:
--   1. Add missing optional columns to public.school_licenses (activated_at, used, updated_at).
--   2. Atomic, security-definer procedure public.sync_school_license() to seamlessly
--      sync schools and licenses generated in License Management / Creator Hub to Supabase.
--   3. Public schools directory function for safe tenant resolution.
-- ==============================================================================

-- 1. Ensure school_licenses has all columns expected by API and sync routines
ALTER TABLE public.school_licenses ADD COLUMN IF NOT EXISTS activated_at BIGINT NULL;
ALTER TABLE public.school_licenses ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.school_licenses ADD COLUMN IF NOT EXISTS updated_at BIGINT NULL;

-- 2. Atomic School & License Sync Procedure
CREATE OR REPLACE FUNCTION public.sync_school_license(
  p_school_name TEXT,
  p_license_key TEXT,
  p_tier TEXT DEFAULT 'Standard',
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT 'Ghana',
  p_duration_months TEXT DEFAULT '12',
  p_expiry_date BIGINT DEFAULT NULL,
  p_modules JSONB DEFAULT '["students", "academic", "timetable", "attendance", "results", "reports", "fees", "siren", "evoting", "inventory"]'::JSONB,
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
  v_clean_name TEXT;
  v_slug TEXT;
  v_clean_key TEXT;
  v_existing_key TEXT;
  v_tier TEXT;
  v_status TEXT;
  v_school_status TEXT;
  v_res JSONB;
BEGIN
  v_clean_name := TRIM(p_school_name);
  v_clean_key := TRIM(UPPER(p_license_key));
  v_tier := COALESCE(p_tier, 'Standard');
  v_status := LOWER(TRIM(COALESCE(p_status, 'active')));
  IF v_status NOT IN ('active', 'suspended', 'expired', 'revoked', 'pending_activation') THEN
    v_status := 'active';
  END IF;
  v_school_status := CASE WHEN v_status = 'revoked' THEN 'suspended' ELSE v_status END;
  
  -- Generate URL-safe slug from school name
  v_slug := LOWER(REGEXP_REPLACE(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := TRIM(BOTH '-' FROM v_slug);
  IF v_slug = '' THEN
    v_slug := 'school-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);
  END IF;

  -- 1. Locate existing school by slug, name, or existing license key
  SELECT id INTO v_school_id 
  FROM public.schools 
  WHERE slug = v_slug OR LOWER(name) = LOWER(v_clean_name)
  LIMIT 1;

  IF v_school_id IS NULL AND v_clean_key <> '' THEN
    SELECT school_id INTO v_school_id
    FROM public.school_licenses
    WHERE UPPER(license_key) = v_clean_key
      AND school_id IS NOT NULL
    LIMIT 1;
  END IF;

  -- Security guard: never create a brand-new school or license when suspending/revoking
  IF v_school_id IS NULL AND v_status IN ('suspended', 'revoked', 'expired') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot suspend or revoke a school that does not exist in the database.'
    );
  END IF;

  IF v_school_id IS NULL THEN
    v_school_id := gen_random_uuid();
    INSERT INTO public.schools (
      id,
      name,
      slug,
      license_id,
      theme,
      email,
      phone,
      address,
      academic_year,
      current_term,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_school_id,
      v_clean_name,
      v_slug,
      NULL, -- Will link after license creation
      'indigo',
      COALESCE(p_email, 'admin@' || v_slug || '.edu.gh'),
      COALESCE(p_phone, '+233 24 000 0000'),
      COALESCE(p_address, 'Ghana'),
      '2026/2027',
      'Term 1',
      v_school_status,
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    );
  ELSE
    UPDATE public.schools SET
      status = v_school_status,
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE id = v_school_id;
  END IF;

  -- 2. Locate existing license row for this school FIRST to avoid creating duplicate rows
  SELECT id, license_key INTO v_license_id, v_existing_key
  FROM public.school_licenses
  WHERE id = (SELECT license_id FROM public.schools WHERE id = v_school_id)
     OR school_id = v_school_id
     OR (v_clean_key <> '' AND UPPER(license_key) = v_clean_key)
     OR LOWER(school_name) = LOWER(v_clean_name)
  ORDER BY
    CASE
      WHEN id = (SELECT license_id FROM public.schools WHERE id = v_school_id) THEN 0
      WHEN school_id = v_school_id THEN 1
      WHEN v_clean_key <> '' AND UPPER(license_key) = v_clean_key THEN 2
      ELSE 3
    END,
    id DESC
  LIMIT 1;

  IF v_license_id IS NOT NULL THEN
    -- Update existing license row in-place without inserting a new row
    UPDATE public.school_licenses SET
      school_id = v_school_id,
      tier = COALESCE(v_tier, tier),
      expiry_date = COALESCE(p_expiry_date, expiry_date),
      active_status = v_status,
      active_modules = COALESCE(p_modules, active_modules),
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE id = v_license_id;
    v_clean_key := COALESCE(v_existing_key, v_clean_key);
  ELSE
    -- Insert only when no license exists for this school yet
    INSERT INTO public.school_licenses (
      license_key,
      school_name,
      school_id,
      tier,
      expiry_date,
      active_status,
      active_modules,
      created_at,
      updated_at
    ) VALUES (
      v_clean_key,
      v_clean_name,
      v_school_id,
      v_tier,
      p_expiry_date,
      v_status,
      p_modules,
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
    ON CONFLICT (license_key) DO UPDATE SET
      school_name = EXCLUDED.school_name,
      school_id = v_school_id,
      tier = EXCLUDED.tier,
      expiry_date = COALESCE(EXCLUDED.expiry_date, public.school_licenses.expiry_date),
      active_status = v_status,
      active_modules = EXCLUDED.active_modules,
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    RETURNING id INTO v_license_id;
  END IF;

  -- 3. Link school.license_id to the license and persist v_school_status
  UPDATE public.schools 
  SET license_id = v_license_id,
      status = v_school_status,
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  WHERE id = v_school_id;

  -- 4. Also update any other licenses attached to this school_id if suspending/reactivating
  UPDATE public.school_licenses
  SET active_status = v_status,
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  WHERE school_id = v_school_id;

  v_res := jsonb_build_object(
    'success', true,
    'school_id', v_school_id,
    'school_name', v_clean_name,
    'slug', v_slug,
    'license_id', v_license_id,
    'license_key', v_clean_key,
    'status', v_school_status,
    'active_status', v_status,
    'tier', v_tier
  );

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_school_license TO anon, authenticated, service_role;

-- 2b. Atomic School & License Status Update Procedure (Suspend / Reactivate)
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
  IF v_status NOT IN ('active', 'suspended', 'expired', 'revoked', 'pending_activation') THEN
    v_status := 'suspended';
  END IF;
  v_school_status := CASE WHEN v_status = 'revoked' THEN 'suspended' ELSE v_status END;

  -- Locate school_id if not directly provided
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

GRANT EXECUTE ON FUNCTION public.set_school_tenant_status TO anon, authenticated, service_role;

-- 3. Helper to safely retrieve schools directory (reflecting suspended license status)
CREATE OR REPLACE FUNCTION public.get_schools_directory()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  logo_url TEXT,
  theme TEXT,
  academic_year TEXT,
  current_term TEXT,
  status TEXT,
  license_id BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 
    s.id,
    s.name::TEXT,
    s.slug::TEXT,
    s.logo_url::TEXT,
    s.theme::TEXT,
    s.academic_year::TEXT,
    s.current_term::TEXT,
    CASE
      WHEN s.status = 'suspended' OR sl.active_status IN ('suspended', 'revoked') THEN 'suspended'
      WHEN s.status = 'expired' OR sl.active_status = 'expired' THEN 'expired'
      ELSE COALESCE(s.status, 'active')
    END::TEXT AS status,
    s.license_id
  FROM public.schools s
  LEFT JOIN public.school_licenses sl ON sl.id = s.license_id
  ORDER BY s.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_schools_directory TO anon, authenticated, service_role;

-- 4. Reconcile public.schools.status with public.school_licenses.active_status for existing rows
UPDATE public.schools s
SET status = CASE WHEN sl.active_status = 'revoked' THEN 'suspended' ELSE sl.active_status END,
    updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
FROM public.school_licenses sl
WHERE (s.license_id = sl.id OR sl.school_id = s.id)
  AND sl.active_status IN ('suspended', 'revoked', 'expired', 'active')
  AND s.status IS DISTINCT FROM (CASE WHEN sl.active_status = 'revoked' THEN 'suspended' ELSE sl.active_status END);

