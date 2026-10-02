-- ============================================================================
-- SCHOOLSPHERE 3.1 — PRODUCTION SECURITY HARDENING MIGRATION
-- Target Project: niavmonyfwqlryppgksy
-- ============================================================================
-- 1. Locks down get_schools_directory(), set_school_tenant_status(), and
--    sync_school_license() so ONLY service_role or public.is_super_admin()
--    can execute them, and revokes EXECUTE from anon.
-- 2. Locks down tenant user RPCs (get_tenant_users, provision_tenant_user,
--    upsert_tenant_user, update_tenant_user, delete_tenant_user) and revokes
--    EXECUTE from anon.
-- 3. Reconciles public.users.email with canonical auth.users.email across all
--    linked rows and hardens handle_new_user() + sync_auth_user_email_to_public_users()
--    so unverified client metadata can never hijack an existing user profile.
-- ============================================================================

BEGIN;

-- 1A. Lock down public.get_schools_directory()
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


-- 1B. Lock down public.set_school_tenant_status(uuid, text, text, text)
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


-- 1C. Lock down public.sync_school_license(text, text, text, text, text, text, text, bigint, jsonb, text)
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


-- 1D. Lock down Tenant User RPCs (if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_tenant_users') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_tenant_users(UUID) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_tenant_users(UUID) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_tenant_users(UUID) TO authenticated, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'provision_tenant_user' AND pronargs = 9) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'provision_tenant_user' AND pronargs = 15) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_tenant_user') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.upsert_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.upsert_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.upsert_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_tenant_user') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.update_tenant_user(BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.update_tenant_user(BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.update_tenant_user(BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'delete_tenant_user') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.delete_tenant_user(BIGINT, UUID) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.delete_tenant_user(BIGINT, UUID) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.delete_tenant_user(BIGINT, UUID) TO authenticated, service_role';
  END IF;
END;
$$;


-- 2A. Reconcile public.users.email with canonical auth.users.email
UPDATE public.users u
SET email = LOWER(au.email),
    updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
FROM auth.users au
WHERE u.auth_user_id = au.id
  AND au.email IS NOT NULL
  AND LOWER(COALESCE(u.email, '')) <> LOWER(au.email);

-- 2B. Harden handle_new_user() against unverified metadata account takeover
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
