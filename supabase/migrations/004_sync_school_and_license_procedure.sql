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
  v_tier TEXT;
  v_status TEXT;
  v_res JSONB;
BEGIN
  v_clean_name := TRIM(p_school_name);
  v_clean_key := TRIM(UPPER(p_license_key));
  v_tier := COALESCE(p_tier, 'Standard');
  v_status := COALESCE(p_status, 'active');
  
  -- Generate URL-safe slug from school name
  v_slug := LOWER(REGEXP_REPLACE(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := TRIM(BOTH '-' FROM v_slug);
  IF v_slug = '' THEN
    v_slug := 'school-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);
  END IF;

  -- 1. Locate existing school by slug or name, or create new school
  SELECT id INTO v_school_id 
  FROM public.schools 
  WHERE slug = v_slug OR LOWER(name) = LOWER(v_clean_name)
  LIMIT 1;

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
      'active',
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    );
  ELSE
    UPDATE public.schools SET
      name = v_clean_name,
      status = 'active',
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE id = v_school_id;
  END IF;

  -- 2. Upsert record in public.school_licenses
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
    'active',
    p_modules,
    (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  )
  ON CONFLICT (license_key) DO UPDATE SET
    school_name = EXCLUDED.school_name,
    school_id = v_school_id,
    tier = EXCLUDED.tier,
    expiry_date = COALESCE(EXCLUDED.expiry_date, public.school_licenses.expiry_date),
    active_status = 'active',
    active_modules = EXCLUDED.active_modules,
    updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  RETURNING id INTO v_license_id;

  -- 3. Link school.license_id to the created license
  UPDATE public.schools 
  SET license_id = v_license_id,
      status = 'active'
  WHERE id = v_school_id;

  -- 4. Optionally upsert into legacy licenses table if present
  BEGIN
    INSERT INTO public.licenses (
      key,
      "schoolName",
      tier,
      "durationMonths",
      "expiryDate",
      status,
      "activeModules",
      school_id,
      "createdAt"
    ) VALUES (
      v_clean_key,
      v_clean_name,
      v_tier,
      COALESCE(p_duration_months, '12'),
      p_expiry_date,
      'active',
      p_modules,
      v_school_id,
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
    ON CONFLICT (key) DO UPDATE SET
      "schoolName" = EXCLUDED."schoolName",
      tier = EXCLUDED.tier,
      status = 'active',
      school_id = v_school_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  v_res := jsonb_build_object(
    'success', true,
    'school_id', v_school_id,
    'school_name', v_clean_name,
    'slug', v_slug,
    'license_id', v_license_id,
    'license_key', v_clean_key,
    'status', 'active',
    'tier', v_tier
  );

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_school_license TO anon, authenticated, service_role;

-- 3. Helper to safely retrieve active schools directory
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
    s.status::TEXT,
    s.license_id
  FROM public.schools s
  ORDER BY s.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_schools_directory TO anon, authenticated, service_role;
