-- ==============================================================================
-- Migration: 005_tenant_user_provisioning_rpc.sql
-- Description:
--   1. Ensure composite tenant-scoped username index (school_id, LOWER(username))
--      and optional profile linkage columns exist on public.users, public.teachers,
--      and public.students.
--   2. Provide SECURITY DEFINER procedures for tenant-scoped user provisioning,
--      listing, updating, and deletion across public.users, auth.users,
--      public.teachers, and public.students.
-- ==============================================================================

-- 1. Ensure public.users has required columns for multi-tenant Auth & profile linkage
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at BIGINT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login BIGINT NULL;

-- Drop global single-column username constraint so multiple schools can use identical plain usernames
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_username_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_username_ci
  ON public.users (school_id, LOWER(username))
  WHERE school_id IS NOT NULL;

-- Ensure teachers and students can link back to public.users / auth.users
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS user_id BIGINT NULL;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS auth_user_id UUID NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS user_id BIGINT NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS auth_user_id UUID NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL;

-- 2. SECURITY DEFINER RPC: Get Tenant Users for a School
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_users(UUID) TO anon, authenticated, service_role;

-- 3. SECURITY DEFINER RPC: Provision Tenant User (public.users + auth.users + role profile)
CREATE OR REPLACE FUNCTION public.provision_tenant_user(
  p_school_id UUID,
  p_username TEXT,
  p_password_hash TEXT,
  p_full_name TEXT,
  p_role TEXT DEFAULT 'teacher',
  p_status TEXT DEFAULT 'active',
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_auth_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id BIGINT;
  v_auth_uid UUID := p_auth_user_id;
  v_clean_user TEXT := LOWER(TRIM(p_username));
  v_clean_name TEXT := TRIM(COALESCE(p_full_name, p_username));
  v_role TEXT := LOWER(TRIM(COALESCE(p_role, 'teacher')));
  v_status TEXT := LOWER(TRIM(COALESCE(p_status, 'active')));
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, v_clean_user || '@schoolsphere.edu.gh')));
  v_now BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  v_first_name TEXT;
  v_last_name TEXT;
BEGIN
  IF v_role IN ('creator', 'super_admin') THEN
    v_role := 'admin';
  END IF;

  -- Split full_name into first_name and last_name for teacher/student profile sync
  v_first_name := SPLIT_PART(v_clean_name, ' ', 1);
  IF POSITION(' ' IN v_clean_name) > 0 THEN
    v_last_name := TRIM(SUBSTRING(v_clean_name FROM POSITION(' ' IN v_clean_name) + 1));
  ELSE
    v_last_name := '';
  END IF;

  -- 1. Provision or locate in auth.users if not already provided
  IF v_auth_uid IS NULL AND v_email <> '' THEN
    SELECT id INTO v_auth_uid FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;
  END IF;

  -- 2. Check if user already exists in this school
  SELECT id INTO v_user_id
  FROM public.users
  WHERE school_id = p_school_id
    AND LOWER(username) = v_clean_user
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    UPDATE public.users SET
      full_name = v_clean_name,
      email = v_email,
      phone = COALESCE(p_phone, phone),
      password_hash = COALESCE(NULLIF(p_password_hash, ''), password_hash),
      role = v_role,
      status = v_status,
      auth_user_id = COALESCE(v_auth_uid, auth_user_id),
      updated_at = v_now
    WHERE id = v_user_id;
  ELSE
    INSERT INTO public.users (
      auth_user_id,
      school_id,
      username,
      full_name,
      email,
      phone,
      password_hash,
      role,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_auth_uid,
      p_school_id,
      v_clean_user,
      v_clean_name,
      v_email,
      p_phone,
      p_password_hash,
      v_role,
      v_status,
      v_now,
      v_now
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- 3. Auto-link or create teacher profile when role is teacher or headteacher
  IF v_role IN ('teacher', 'headteacher') AND p_school_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.teachers
      WHERE school_id = p_school_id
        AND (LOWER(COALESCE(email, '')) = v_email OR user_id = v_user_id)
    ) THEN
      INSERT INTO public.teachers (
        school_id,
        staff_id,
        first_name,
        last_name,
        email,
        phone,
        status,
        user_id,
        auth_user_id,
        created_at,
        updated_at
      ) VALUES (
        p_school_id,
        'TEA-' || SUBSTRING(v_now::TEXT FROM 8 FOR 6),
        v_first_name,
        v_last_name,
        v_email,
        COALESCE(p_phone, ''),
        'active',
        v_user_id,
        v_auth_uid,
        v_now,
        v_now
      );
    END IF;
  END IF;

  -- 4. Auto-link or create student profile when role is student
  IF v_role = 'student' AND p_school_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.students
      WHERE school_id = p_school_id
        AND (LOWER(COALESCE(email, '')) = v_email OR user_id = v_user_id)
    ) THEN
      INSERT INTO public.students (
        school_id,
        student_id,
        first_name,
        last_name,
        class,
        gender,
        date_of_birth,
        guardian_phone,
        email,
        status,
        user_id,
        auth_user_id,
        created_at
      ) VALUES (
        p_school_id,
        'STU-' || SUBSTRING(v_now::TEXT FROM 8 FOR 6),
        v_first_name,
        v_last_name,
        'Basic 7',
        'Male',
        '2012-01-01',
        COALESCE(p_phone, ''),
        v_email,
        'active',
        v_user_id,
        v_auth_uid,
        v_now
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_user_id,
    'auth_user_id', v_auth_uid,
    'school_id', p_school_id,
    'username', v_clean_user,
    'full_name', v_clean_name,
    'email', v_email,
    'phone', p_phone,
    'role', v_role,
    'status', v_status,
    'created_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;

-- Backwards-compatible alias for upsert_tenant_user
CREATE OR REPLACE FUNCTION public.upsert_tenant_user(
  p_school_id UUID,
  p_username TEXT,
  p_password_hash TEXT,
  p_full_name TEXT,
  p_role TEXT DEFAULT 'teacher',
  p_status TEXT DEFAULT 'active',
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_auth_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
  SELECT public.provision_tenant_user(
    p_school_id,
    p_username,
    p_password_hash,
    p_full_name,
    p_role,
    p_status,
    p_email,
    p_phone,
    p_auth_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.upsert_tenant_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;

-- 4. SECURITY DEFINER RPC: Update Tenant User (status, role, password reset)
CREATE OR REPLACE FUNCTION public.update_tenant_user(
  p_user_id BIGINT,
  p_school_id UUID DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_row public.users%ROWTYPE;
  v_now BIGINT := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
BEGIN
  UPDATE public.users SET
    full_name = COALESCE(NULLIF(TRIM(p_full_name), ''), full_name),
    role = CASE
      WHEN p_role IS NOT NULL AND LOWER(TRIM(p_role)) NOT IN ('creator', 'super_admin') THEN LOWER(TRIM(p_role))
      ELSE role
    END,
    status = COALESCE(NULLIF(LOWER(TRIM(p_status)), ''), status),
    email = COALESCE(NULLIF(LOWER(TRIM(p_email)), ''), email),
    phone = COALESCE(p_phone, phone),
    password_hash = COALESCE(NULLIF(p_password_hash, ''), password_hash),
    updated_at = v_now
  WHERE id = p_user_id
    AND (p_school_id IS NULL OR school_id = p_school_id)
    AND role NOT IN ('creator', 'super_admin')
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found in school');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_row.id,
    'auth_user_id', v_row.auth_user_id,
    'school_id', v_row.school_id,
    'username', v_row.username,
    'full_name', v_row.full_name,
    'email', v_row.email,
    'phone', v_row.phone,
    'role', v_row.role,
    'status', v_row.status,
    'updated_at', v_row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tenant_user(BIGINT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- 5. SECURITY DEFINER RPC: Delete Tenant User
CREATE OR REPLACE FUNCTION public.delete_tenant_user(
  p_user_id BIGINT,
  p_school_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_deleted_id BIGINT;
  v_auth_uid UUID;
BEGIN
  DELETE FROM public.users
  WHERE id = p_user_id
    AND (p_school_id IS NULL OR school_id = p_school_id)
    AND role NOT IN ('creator', 'super_admin')
  RETURNING id, auth_user_id INTO v_deleted_id, v_auth_uid;

  IF v_deleted_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found in school');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_deleted_id,
    'auth_user_id', v_auth_uid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_tenant_user(BIGINT, UUID) TO anon, authenticated, service_role;

