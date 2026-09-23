-- ==============================================================================
-- Enterprise Multi-Tenant Authentication, Staff Profiles & Invitations Migration
-- ==============================================================================

-- 1. Table: public.staff_profiles (Worker and Staff Multi-Tenant Profiles)
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'teacher' 
    CHECK (role IN ('super_admin', 'admin', 'headteacher', 'teacher', 'accountant', 'staff')),
  status VARCHAR(50) NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_org_staff_email UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_org ON public.staff_profiles (organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_auth_uid ON public.staff_profiles (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_email ON public.staff_profiles (email);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_role ON public.staff_profiles (role);

-- Enable RLS on staff_profiles
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_profiles_tenant_isolation ON public.staff_profiles
  FOR ALL
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID
    OR organization_id = (auth.jwt() ->> 'organization_id')::UUID
    OR organization_id = public.get_auth_school_id()
    OR public.is_super_admin()
  )
  WITH CHECK (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID
    OR organization_id = (auth.jwt() ->> 'organization_id')::UUID
    OR organization_id = public.get_auth_school_id()
    OR public.is_super_admin()
  );

-- 2. Table: public.organization_invitations (Invite Token Engine)
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'teacher'
    CHECK (role IN ('admin', 'headteacher', 'teacher', 'accountant', 'staff')),
  invited_by UUID NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at BIGINT NOT NULL,
  accepted_at BIGINT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON public.organization_invitations (token);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON public.organization_invitations (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON public.organization_invitations (status);

-- Enable RLS on organization_invitations
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitations_tenant_isolation ON public.organization_invitations
  FOR ALL
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID
    OR organization_id = (auth.jwt() ->> 'organization_id')::UUID
    OR organization_id = public.get_auth_school_id()
    OR public.is_super_admin()
  )
  WITH CHECK (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID
    OR organization_id = (auth.jwt() ->> 'organization_id')::UUID
    OR organization_id = public.get_auth_school_id()
    OR public.is_super_admin()
  );

-- 3. Table: public.user_login_activities (Session & Telemetry Audit Tracking)
CREATE TABLE IF NOT EXISTS public.user_login_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NULL,
  organization_id UUID NULL REFERENCES public.schools(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(100) NULL,
  user_agent TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'success',
  login_timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_login_activities_org ON public.user_login_activities (organization_id);
CREATE INDEX IF NOT EXISTS idx_login_activities_email ON public.user_login_activities (email);
CREATE INDEX IF NOT EXISTS idx_login_activities_time ON public.user_login_activities (login_timestamp DESC);

-- Enable RLS on user_login_activities
ALTER TABLE public.user_login_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY login_activities_tenant_isolation ON public.user_login_activities
  FOR ALL
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::UUID
    OR organization_id = (auth.jwt() ->> 'organization_id')::UUID
    OR organization_id = public.get_auth_school_id()
    OR public.is_super_admin()
  );
