-- ==============================================================================
-- Migration: 003_grants_creator_and_school_creation.sql
-- Description:
--   1. Grant table, sequence, and routine privileges to `authenticated` (and `anon` for public helpers).
--      This activates Option B (direct client-side access with RLS policies as the authority).
--   2. Update check constraints to support 'creator' role and 'pending_activation' school status.
--   3. Provision Platform Creator credentials in auth.users and public.users.
--   4. Helper function and template for school & license creation.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE & SCHEMA GRANTS (Enables Option B with RLS Authority)
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant standard DML to authenticated users (RLS will restrict what rows they see/edit)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- Ensure future tables, sequences and routines automatically inherit these privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

-- Allow anonymous visitors to execute get_school_public (for subdomain/slug lookup before login)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' AND p.proname = 'get_school_public'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.get_school_public(TEXT) TO anon, authenticated;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. CONSTRAINT REFINEMENTS
-- ------------------------------------------------------------------------------
-- Add 'creator' to the allowed roles in public.users
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('creator', 'super_admin', 'admin', 'headteacher', 'teacher', 'accountant', 'student', 'parent'));

-- Add 'pending_activation' to allowed statuses in public.schools
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_status_check;
ALTER TABLE public.schools ADD CONSTRAINT schools_status_check 
  CHECK (status IN ('active', 'suspended', 'expired', 'pending_activation'));

-- Ensure license tier allows all tier types
ALTER TABLE public.school_licenses DROP CONSTRAINT IF EXISTS school_licenses_tier_check;
ALTER TABLE public.school_licenses ADD CONSTRAINT school_licenses_tier_check 
  CHECK (tier IN ('Standard', 'Professional', 'Enterprise', 'Ultimate', 'Trial', 'Basic', 'Diagnostic', 'Custom', 'Starter'));

-- ------------------------------------------------------------------------------
-- 3. PLATFORM CREATOR PROVISIONING
-- Creates the Platform Creator user account with full cross-school creator authority.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_creator_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
  v_creator_email TEXT := 'amoakoemmanuel@hotmail.com';
  v_creator_name TEXT := 'Platform Creator';
  v_creator_username TEXT := 'creator';
  -- bcrypt hash for 'July94bab!' (cost 10)
  v_pw_hash TEXT := '$2a$10$7Z8bU9kZt4g.fP1eZ6t.O.Q6tF41s3mXG5YJ4bYVf7zM2sK1xQO6e';
BEGIN
  -- A. Insert or update in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_creator_email) THEN
    SELECT id INTO v_creator_id FROM auth.users WHERE email = v_creator_email LIMIT 1;
    UPDATE auth.users 
    SET encrypted_password = v_pw_hash,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'creator'),
        raw_user_meta_data = jsonb_build_object('full_name', v_creator_name, 'username', v_creator_username),
        updated_at = NOW()
    WHERE id = v_creator_id;
  ELSIF EXISTS (SELECT 1 FROM auth.users WHERE id = v_creator_id) THEN
    -- The fixed UUID already exists under a different email, generate a fresh UUID
    v_creator_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_creator_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_creator_email, v_pw_hash, NOW(),
      jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'creator'),
      jsonb_build_object('full_name', v_creator_name, 'username', v_creator_username),
      NOW(), NOW()
    );
  ELSE
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      v_creator_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_creator_email,
      v_pw_hash,
      NOW(),
      jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'creator'),
      jsonb_build_object('full_name', v_creator_name, 'username', v_creator_username),
      NOW(),
      NOW()
    );
  END IF;

  -- B. Insert or update in public.users safely handling auth_user_id unique constraint
  IF EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = v_creator_id) THEN
    UPDATE public.users SET
      school_id = NULL,
      username = v_creator_username,
      full_name = v_creator_name,
      email = v_creator_email,
      role = 'creator',
      status = 'active',
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE auth_user_id = v_creator_id;
  ELSIF EXISTS (SELECT 1 FROM public.users WHERE email = v_creator_email) THEN
    UPDATE public.users SET
      auth_user_id = v_creator_id,
      school_id = NULL,
      username = v_creator_username,
      full_name = v_creator_name,
      role = 'creator',
      status = 'active',
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE email = v_creator_email;
  ELSIF EXISTS (SELECT 1 FROM public.users WHERE school_id IS NULL AND username = v_creator_username) THEN
    UPDATE public.users SET
      auth_user_id = v_creator_id,
      full_name = v_creator_name,
      email = v_creator_email,
      role = 'creator',
      status = 'active',
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE school_id IS NULL AND username = v_creator_username;
  ELSE
    INSERT INTO public.users (
      auth_user_id,
      school_id,
      username,
      full_name,
      email,
      role,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_creator_id,
      NULL, -- Cross-school platform creator
      v_creator_username,
      v_creator_name,
      v_creator_email,
      'creator',
      'active',
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
    ON CONFLICT (auth_user_id) DO UPDATE SET
      school_id = NULL,
      username = EXCLUDED.username,
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      role = 'creator',
      status = 'active',
      updated_at = EXCLUDED.updated_at;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. ATOMIC SCHOOL & LICENSE CREATION STORED PROCEDURE
-- Callable by 'creator' or 'service_role' to provision a new school tenant atomically.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_school_with_license(
  p_name TEXT,
  p_slug TEXT,
  p_tier TEXT DEFAULT 'Enterprise',
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT 'Ghana',
  p_academic_year TEXT DEFAULT '2026/2027',
  p_current_term TEXT DEFAULT 'Term 1',
  p_theme TEXT DEFAULT 'indigo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_school_id UUID := gen_random_uuid();
  v_license_id BIGINT;
  v_license_key TEXT;
  v_slug TEXT;
  v_clean_name TEXT;
  v_res JSONB;
BEGIN
  -- Security check: caller must be service_role, creator, or super_admin
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Only platform creators or administrators can provision schools.';
  END IF;

  v_clean_name := TRIM(p_name);
  v_slug := LOWER(REGEXP_REPLACE(COALESCE(p_slug, v_clean_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := TRIM(BOTH '-' FROM v_slug);

  -- Generate readable license key
  v_license_key := 'ESEPA-' || 
                   UPPER(SUBSTRING(REGEXP_REPLACE(v_clean_name, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4)) || '-' ||
                   UPPER(SUBSTRING(COALESCE(p_tier, 'STD') FROM 1 FOR 3)) || '-' ||
                   UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

  -- Step 1: Create school record (license_id initially NULL to satisfy foreign key)
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
    status
  ) VALUES (
    v_school_id,
    v_clean_name,
    v_slug,
    NULL,
    p_theme,
    COALESCE(p_email, 'admin@' || v_slug || '.edu.gh'),
    p_phone,
    p_address,
    p_academic_year,
    p_current_term,
    'active'
  );

  -- Step 2: Create school license record
  INSERT INTO public.school_licenses (
    license_key,
    school_name,
    school_id,
    tier,
    active_status,
    active_modules
  ) VALUES (
    v_license_key,
    v_clean_name,
    v_school_id,
    COALESCE(p_tier, 'Enterprise'),
    'active',
    '["students", "academic", "timetable", "attendance", "results", "reports", "fees", "inventory", "siren"]'::JSONB
  ) RETURNING id INTO v_license_id;

  -- Step 3: Link license_id back to schools
  UPDATE public.schools 
  SET license_id = v_license_id 
  WHERE id = v_school_id;

  v_res := jsonb_build_object(
    'school_id', v_school_id,
    'name', v_clean_name,
    'slug', v_slug,
    'license_id', v_license_id,
    'license_key', v_license_key,
    'status', 'active',
    'tier', p_tier
  );

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_school_with_license TO authenticated, service_role;
