-- =============================================================================
-- MIGRATION: Canonical License Authority & School-License Deduplication
-- =============================================================================
-- 1. Deduplicates public.school_licenses so each school has exactly one canonical license row.
-- 2. Updates get_schools_directory() to return the canonical license_key, tier, expiry_date,
--    active_modules, used, activated_at, client_email, and contact_person.
-- 3. Updates sync_school_license() to update existing school license rows in-place per school
--    and eliminate duplicate license rows.
-- =============================================================================

BEGIN;

-- 1. Link any unlinked school_licenses rows to matching schools by normalized name
UPDATE public.school_licenses sl
SET school_id = s.id
FROM public.schools s
WHERE sl.school_id IS NULL
  AND LOWER(TRIM(sl.school_name)) = LOWER(TRIM(s.name));

-- 2. Ensure every school points to its most authoritative license_id
WITH ranked_licenses AS (
  SELECT
    sl.id AS license_id,
    s.id AS school_id,
    ROW_NUMBER() OVER (
      PARTITION BY s.id
      ORDER BY
        CASE WHEN s.license_id = sl.id THEN 0 ELSE 1 END,
        CASE WHEN sl.license_key IS NOT NULL AND sl.license_key <> '' AND sl.license_key !~ '^ESEPA-[A-Z0-9]{1,4}-(ENT|STD|BAS|PRO)-(\d{1,5}|2026)$' THEN 0 ELSE 1 END,
        sl.updated_at DESC NULLS LAST,
        sl.id DESC
    ) AS rn
  FROM public.schools s
  JOIN public.school_licenses sl
    ON sl.school_id = s.id
    OR sl.id = s.license_id
    OR LOWER(TRIM(sl.school_name)) = LOWER(TRIM(s.name))
)
UPDATE public.schools s
SET license_id = rl.license_id
FROM ranked_licenses rl
WHERE s.id = rl.school_id
  AND rl.rn = 1
  AND (s.license_id IS DISTINCT FROM rl.license_id);

-- 3. Ensure canonical license rows point back to their owning school_id
UPDATE public.school_licenses sl
SET school_id = s.id,
    school_name = UPPER(TRIM(s.name))
FROM public.schools s
WHERE s.license_id = sl.id
  AND (sl.school_id IS DISTINCT FROM s.id OR sl.school_name IS DISTINCT FROM UPPER(TRIM(s.name)));

-- 4. Delete duplicate or orphaned rows in public.school_licenses that belong to a school
--    which already has a canonical license_id
DELETE FROM public.school_licenses sl
WHERE sl.id NOT IN (
  SELECT license_id FROM public.schools WHERE license_id IS NOT NULL
)
AND (
  sl.school_id IN (SELECT id FROM public.schools WHERE license_id IS NOT NULL)
  OR LOWER(TRIM(sl.school_name)) IN (SELECT LOWER(TRIM(name)) FROM public.schools WHERE license_id IS NOT NULL)
  OR sl.license_key IS NULL
  OR TRIM(sl.license_key) = ''
);

-- 5. Upgrade get_schools_directory() to return canonical license_key and license metadata
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.name,
    s.slug,
    s.theme,
    s.logo_url,
    s.email,
    s.phone,
    s.address,
    s.academic_year,
    s.current_term,
    CASE
      WHEN sl.active_status IN ('suspended', 'revoked') THEN 'suspended'
      WHEN sl.active_status = 'expired' THEN 'expired'
      ELSE COALESCE(s.status, 'active')
    END AS status,
    COALESCE(s.license_id, sl.id) AS license_id,
    sl.license_key,
    COALESCE(sl.tier, 'Enterprise') AS tier,
    sl.expiry_date,
    COALESCE(sl.active_modules, '["students","academic","timetable","attendance","results","reports","fees"]'::jsonb) AS active_modules,
    COALESCE(sl.used, (sl.activated_at IS NOT NULL AND sl.activated_at > 0)) AS used,
    sl.activated_at,
    COALESCE(sl.client_email, s.email) AS client_email,
    sl.contact_person
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
$$;

GRANT EXECUTE ON FUNCTION public.get_schools_directory() TO anon, authenticated, service_role;

-- 6. Upgrade sync_school_license() to enforce 1-to-1 canonical school_licenses row per school
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
SET search_path = public
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

  -- Step 1: Find or create the school in public.schools
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

  -- Step 2: Locate existing canonical license row for this school
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

  -- Check if another row already holds v_final_key
  IF v_existing_license_id IS NULL THEN
    SELECT id INTO v_existing_license_id
    FROM public.school_licenses
    WHERE license_key = v_final_key
    LIMIT 1;
  END IF;

  -- Step 3: Update existing license row in-place OR insert single canonical row
  IF v_existing_license_id IS NOT NULL THEN
    -- Delete any other duplicate rows for this school or colliding key before updating
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

  -- Step 4: Link schools.license_id -> v_license_id
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

GRANT EXECUTE ON FUNCTION public.sync_school_license(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT) TO anon, authenticated, service_role;

COMMIT;
