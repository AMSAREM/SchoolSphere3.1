-- ==============================================================================
-- Migration: Security Audit Fixes & Role-Aware RLS Hardening
-- Date: 2026-09-24
-- 1. Add SET search_path = public, pg_temp to all security definer functions.
-- 2. Implement role-aware RLS policies (prevent students/parents from mutating data or viewing other users' PII).
-- 3. Implement atomic license activation transaction function.
-- ==============================================================================

-- 1. Helper function: Get authenticated user role
CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN 'service_role';
  END IF;

  SELECT role INTO v_role 
  FROM public.users 
  WHERE auth_user_id = auth.uid() 
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  RETURN COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'authenticated');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

-- 2. Update get_auth_school_id with search_path protection
CREATE OR REPLACE FUNCTION public.get_auth_school_id()
RETURNS UUID AS $$
DECLARE
  v_school_id UUID;
BEGIN
  -- 1. Check if auth.uid() exists in users table
  SELECT school_id INTO v_school_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_school_id IS NOT NULL THEN
    RETURN v_school_id;
  END IF;

  -- 2. Fallback to JWT app_metadata claim if provided
  BEGIN
    v_school_id := (auth.jwt() -> 'app_metadata' ->> 'school_id')::UUID;
    RETURN v_school_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

-- 3. Update is_super_admin with search_path protection
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role IN ('super_admin', 'creator')
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

-- 4. Role-aware & Privacy-hardened User Policies
DROP POLICY IF EXISTS "Tenant isolation for users" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile or admins view school profiles" ON public.users;
CREATE POLICY "Users can view own profile or admins view school profiles" ON public.users
  FOR SELECT USING (
    auth_user_id = auth.uid()
    OR (
      school_id = public.get_auth_school_id() 
      AND public.get_auth_user_role() IN ('admin', 'super_admin', 'creator', 'headmaster', 'principal')
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can manage school users" ON public.users;
CREATE POLICY "Admins can manage school users" ON public.users
  FOR ALL USING (
    (
      school_id = public.get_auth_school_id() 
      AND public.get_auth_user_role() IN ('admin', 'super_admin', 'creator')
    )
    OR public.is_super_admin()
  );

-- 5. Role-aware Academic Write Policies (Students/Parents cannot mutate records)
DROP POLICY IF EXISTS "Tenant isolation for results" ON public.results;
CREATE POLICY "Tenant view results" ON public.results
  FOR SELECT USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

CREATE POLICY "Staff manage results" ON public.results
  FOR ALL USING (
    (
      school_id = public.get_auth_school_id() 
      AND public.get_auth_user_role() IN ('admin', 'teacher', 'super_admin', 'creator')
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Tenant isolation for attendance" ON public.attendance;
CREATE POLICY "Tenant view attendance" ON public.attendance
  FOR SELECT USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

CREATE POLICY "Staff manage attendance" ON public.attendance
  FOR ALL USING (
    (
      school_id = public.get_auth_school_id() 
      AND public.get_auth_user_role() IN ('admin', 'teacher', 'super_admin', 'creator')
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Tenant isolation for fee_transactions" ON public.fee_transactions;
CREATE POLICY "Tenant view fee_transactions" ON public.fee_transactions
  FOR SELECT USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

CREATE POLICY "Accountants and admins manage fees" ON public.fee_transactions
  FOR ALL USING (
    (
      school_id = public.get_auth_school_id() 
      AND public.get_auth_user_role() IN ('admin', 'accountant', 'super_admin', 'creator')
    )
    OR public.is_super_admin()
  );

-- 6. Atomic License Activation Database Function
CREATE OR REPLACE FUNCTION public.activate_license_atomic(
  p_license_key TEXT,
  p_school_name TEXT,
  p_admin_email TEXT,
  p_admin_name TEXT DEFAULT NULL,
  p_school_slug TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_license RECORD;
  v_school_id UUID;
  v_slug TEXT;
BEGIN
  -- Atomically acquire exclusive lock on license row
  SELECT * INTO v_license
  FROM public.school_licenses
  WHERE license_key = p_license_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid license key.');
  END IF;

  IF v_license.active_status = 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'License key has already been activated.');
  END IF;

  -- Determine unique slug
  v_slug := COALESCE(NULLIF(p_school_slug, ''), lower(regexp_replace(p_school_name, '[^a-zA-Z0-9]+', '-', 'g')));
  IF EXISTS (SELECT 1 FROM public.schools WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 6);
  END IF;

  -- Create school tenant
  INSERT INTO public.schools (name, slug, license_id)
  VALUES (p_school_name, v_slug, v_license.id)
  RETURNING id INTO v_school_id;

  -- Mark license as activated
  UPDATE public.school_licenses
  SET 
    active_status = 'active',
    school_id = v_school_id,
    updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  WHERE id = v_license.id;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', v_school_id,
    'school_slug', v_slug,
    'school_name', p_school_name,
    'license_id', v_license.id,
    'tier', v_license.tier
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;
