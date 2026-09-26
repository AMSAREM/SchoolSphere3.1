-- ==============================================================================
-- SCHOOLSPHERE 1.0 - MASTER ENTERPRISE DATABASE SCHEMA FOR SUPABASE (POSTGRESQL)
-- ==============================================================================
-- Architecture: Multi-Tenant Hybrid Offline-First School Information System (SIS)
-- Engine: PostgreSQL 15+ / Supabase
-- Features: Row-Level Security (RLS), Strict Foreign Key Integrity, Role-Based Access
-- Control (RBAC), Cascade Protection, Automated Triggers, and B-Tree Indexes.
-- ==============================================================================

-- 0. EXTENSIONS & PREREQUISITES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. HELPER FUNCTIONS & SECURITY POLICIES INFRASTRUCTURE
-- ==============================================================================

-- Function to safely extract the active school_id for the authenticated session
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

-- Function to check if the caller is a global Super Admin (Creator) or Service Role
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

-- Function for automatic updated_at timestamp management
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. CORE TENANCY & LICENSING (Circular FK Resolved)
-- ==============================================================================

-- Table: public.school_licenses (Single Canonical Source of Truth for Licenses)
CREATE TABLE IF NOT EXISTS public.school_licenses (
  id BIGSERIAL PRIMARY KEY,
  license_key VARCHAR(255) NOT NULL UNIQUE,
  school_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NULL,
  contact_person VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  duration_months VARCHAR(50) NOT NULL DEFAULT '12',
  issued_date BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  expiry_date BIGINT NULL,
  active_status VARCHAR(50) NOT NULL DEFAULT 'active' 
    CHECK (active_status IN ('active', 'pending_activation', 'unactivated', 'suspended', 'expired', 'revoked', 'deactivated')),
  tier VARCHAR(50) NOT NULL DEFAULT 'Standard' 
    CHECK (tier IN ('Standard', 'Pro', 'Professional', 'Enterprise', 'Ultimate', 'Lifetime', 'Developer', 'Trial', 'Basic', 'Diagnostic', 'Custom', 'Starter')),
  active_modules JSONB NOT NULL DEFAULT '["students", "academic", "timetable", "attendance", "results", "reports", "fees", "siren", "evoting", "inventory"]'::jsonb,
  announcement TEXT NULL,
  notes TEXT NULL,
  school_id UUID NULL,
  max_students INT NOT NULL DEFAULT 1000 CHECK (max_students > 0),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

ALTER TABLE public.school_licenses ADD COLUMN IF NOT EXISTS client_email VARCHAR(255) NULL;
ALTER TABLE public.school_licenses ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255) NULL;
ALTER TABLE public.school_licenses ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL;
ALTER TABLE public.school_licenses ADD COLUMN IF NOT EXISTS duration_months VARCHAR(50) NOT NULL DEFAULT '12';
ALTER TABLE public.school_licenses ADD COLUMN IF NOT EXISTS issued_date BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
ALTER TABLE public.school_licenses ADD COLUMN IF NOT EXISTS announcement TEXT NULL;
ALTER TABLE public.school_licenses ADD COLUMN IF NOT EXISTS notes TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_school_licenses_key ON public.school_licenses (license_key);
CREATE INDEX IF NOT EXISTS idx_school_licenses_school_id ON public.school_licenses (school_id);
CREATE INDEX IF NOT EXISTS idx_school_licenses_status ON public.school_licenses (active_status);

-- Table: public.schools (Tenants)
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  license_id BIGINT NULL REFERENCES public.school_licenses(id) ON DELETE SET NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  address TEXT NULL,
  logo_url TEXT NULL,
  theme VARCHAR(50) NOT NULL DEFAULT 'indigo',
  academic_year VARCHAR(50) NOT NULL DEFAULT '2026/2027',
  current_term VARCHAR(50) NOT NULL DEFAULT 'Term 1',
  status VARCHAR(50) NOT NULL DEFAULT 'pending_activation' 
    CHECK (status IN ('active', 'pending_activation', 'inactive', 'suspended', 'expired')),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_schools_slug ON public.schools (slug);
CREATE INDEX IF NOT EXISTS idx_schools_license_id ON public.schools (license_id);
CREATE INDEX IF NOT EXISTS idx_schools_status ON public.schools (status);

-- Add reciprocal foreign key constraint from school_licenses to schools
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_school_licenses_school_id'
  ) THEN
    ALTER TABLE public.school_licenses 
    ADD CONSTRAINT fk_school_licenses_school_id 
    FOREIGN KEY (school_id) REFERENCES public.schools (id) ON DELETE SET NULL;
  END IF;

  -- Upgrade tier check constraint if existing table was created with stricter values
  ALTER TABLE public.school_licenses DROP CONSTRAINT IF EXISTS school_licenses_tier_check;
  ALTER TABLE public.school_licenses ADD CONSTRAINT school_licenses_tier_check 
    CHECK (tier IN ('Standard', 'Professional', 'Enterprise', 'Ultimate', 'Trial', 'Basic', 'Diagnostic', 'Custom', 'Starter'));
END $$;

-- ==============================================================================
-- 3. USERS & ROLE-BASED ACCESS CONTROL (RBAC)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  auth_user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'admin', 'headteacher', 'teacher', 'accountant', 'student', 'parent')),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_user UNIQUE (school_id, username)
);

CREATE INDEX IF NOT EXISTS idx_users_school_id ON public.users (school_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_uid ON public.users (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);

-- ==============================================================================
-- 4. ACADEMIC STRUCTURE: CLASSES & SUBJECTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.classes (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  level VARCHAR(50) NOT NULL,
  capacity INT NOT NULL DEFAULT 50 CHECK (capacity > 0),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_class_name UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_classes_school_id ON public.classes (school_id);

CREATE TABLE IF NOT EXISTS public.subjects (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  is_core BOOLEAN NOT NULL DEFAULT false,
  applicable_classes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_subject_code UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON public.subjects (school_id);

-- ==============================================================================
-- 5. FACULTY & STAFF
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.teachers (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  staff_id VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(150) NULL,
  assigned_classes JSONB NOT NULL DEFAULT '[]'::jsonb,
  subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'resigned')),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_staff_id UNIQUE (school_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_teachers_school_id ON public.teachers (school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_staff_id ON public.teachers (staff_id);

-- ==============================================================================
-- 6. STUDENT DIRECTORY & ENROLLMENT
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.students (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  class VARCHAR(100) NOT NULL,
  date_of_birth DATE NULL,
  gender VARCHAR(20) NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
  guardian_name VARCHAR(255) NULL,
  guardian_phone VARCHAR(50) NULL,
  guardian_email VARCHAR(150) NULL,
  fees_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (fees_paid >= 0),
  total_fees NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_fees >= 0),
  house VARCHAR(100) NULL,
  department VARCHAR(100) NULL,
  photo TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'graduated', 'suspended', 'transferred', 'withdrawn')),
  fee_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  fee_paid_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_student_id UNIQUE (school_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students (school_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students (school_id, class);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students (school_id, status);

-- ==============================================================================
-- 7. ATTENDANCE TRACKING
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.attendance (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  class VARCHAR(100) NULL,
  date DATE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Excused')),
  reason TEXT NULL,
  recorded_by VARCHAR(100) NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_student_date UNIQUE (school_id, student_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON public.attendance (school_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance (school_id, student_id);

-- ==============================================================================
-- 8. ACADEMIC RESULTS & GRADING LEDGER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.results (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  term VARCHAR(50) NOT NULL,
  academic_year VARCHAR(50) NOT NULL DEFAULT '2026/2027',
  class VARCHAR(100) NOT NULL,
  class_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (class_score >= 0 AND class_score <= 100),
  exam_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (exam_score >= 0 AND exam_score <= 100),
  total_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (total_score >= 0 AND total_score <= 100),
  grade VARCHAR(5) NOT NULL,
  remarks VARCHAR(100) NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_result_term UNIQUE (school_id, student_id, subject, term, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_results_school_lookup ON public.results (school_id, term, academic_year, class);
CREATE INDEX IF NOT EXISTS idx_results_student ON public.results (school_id, student_id);

-- ==============================================================================
-- 9. TERM REPORT CARDS & POSITIONING
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.term_reports (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  term VARCHAR(50) NOT NULL,
  academic_year VARCHAR(50) NOT NULL,
  attendance_present INT NOT NULL DEFAULT 0 CHECK (attendance_present >= 0),
  attendance_total INT NOT NULL DEFAULT 0 CHECK (attendance_total >= 0),
  teacher_remark TEXT NULL,
  headmaster_remark TEXT NULL,
  position INT NULL CHECK (position > 0 OR position IS NULL),
  total_students INT NULL CHECK (total_students > 0 OR total_students IS NULL),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_term_report UNIQUE (school_id, student_id, term, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_term_reports_school ON public.term_reports (school_id, term, academic_year);

-- ==============================================================================
-- 10. FEE TRANSACTIONS & FINANCIAL LEDGER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.fee_transactions (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  receipt_number VARCHAR(100) NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  fee_type VARCHAR(100) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(50) NOT NULL 
    CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Card')),
  transaction_reference VARCHAR(150) NULL,
  received_by VARCHAR(100) NULL,
  notes TEXT NULL,
  date BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_receipt UNIQUE (school_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_fee_transactions_school ON public.fee_transactions (school_id, date);
CREATE INDEX IF NOT EXISTS idx_fee_transactions_student ON public.fee_transactions (school_id, student_id);

-- ==============================================================================
-- 11. NATIONAL EXAM ANALYTICS (BECE / WASSCE)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.exam_analysis (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(255) NOT NULL,
  exam_type VARCHAR(50) NOT NULL CHECK (exam_type IN ('BECE', 'WASSCE', 'IGCSE', 'Internal Mocks')),
  year INT NOT NULL CHECK (year >= 2000),
  index_number VARCHAR(100) NULL,
  subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
  aggregate INT NOT NULL CHECK (aggregate >= 0),
  status VARCHAR(50) NOT NULL CHECK (status IN ('Excellent', 'Qualified', 'Conditional', 'Failed')),
  remarks TEXT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_exam_analysis_school_year ON public.exam_analysis (school_id, exam_type, year);

-- ==============================================================================
-- 12. CAMPUS E-VOTING (BALLOT INTEGRITY)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.polls (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  category VARCHAR(100) NOT NULL DEFAULT 'SRC Election',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_polls_school ON public.polls (school_id, status);

CREATE TABLE IF NOT EXISTS public.candidates (
  id BIGSERIAL PRIMARY KEY,
  poll_id BIGINT NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(100) NOT NULL,
  class VARCHAR(100) NULL,
  votes_count INT NOT NULL DEFAULT 0 CHECK (votes_count >= 0),
  photo TEXT NULL,
  manifesto TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_candidates_poll ON public.candidates (poll_id, position);

CREATE TABLE IF NOT EXISTS public.votes (
  id BIGSERIAL PRIMARY KEY,
  poll_id BIGINT NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  candidate_id BIGINT NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  position VARCHAR(100) NOT NULL,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_ballot_student_position UNIQUE (poll_id, student_id, position)
);

CREATE INDEX IF NOT EXISTS idx_votes_poll ON public.votes (poll_id, candidate_id);

-- ==============================================================================
-- 13. STUDENT PROMOTION & ACADEMIC TRANSITION AUDIT
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.promotion_history (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(255) NOT NULL,
  source_class VARCHAR(100) NOT NULL,
  dest_class VARCHAR(100) NOT NULL,
  academic_year VARCHAR(50) NOT NULL,
  term VARCHAR(50) NOT NULL,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_promotion_history_school ON public.promotion_history (school_id, academic_year);

-- ==============================================================================
-- 14. ASSETS, INVENTORY & EXPENSE TRACKING
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity INT NOT NULL DEFAULT 5 CHECK (min_quantity >= 0),
  unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
  location VARCHAR(150) NULL,
  supplier_name VARCHAR(255) NULL,
  supplier_phone VARCHAR(50) NULL,
  last_updated BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_inventory_school ON public.inventory_items (school_id, category);

CREATE TABLE IF NOT EXISTS public.school_expenses (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  date BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  inventory_item_id BIGINT NULL REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  quantity_purchased INT NULL,
  payment_method VARCHAR(50) NOT NULL,
  recorded_by VARCHAR(100) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_school ON public.school_expenses (school_id, date);

-- ==============================================================================
-- 15. COMMUNICATIONS, SIREN BROADCASTS & AUDIT LOGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.sms_logs (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  recipient_name VARCHAR(255) NULL,
  recipient_phone VARCHAR(50) NOT NULL,
  recipient_type VARCHAR(50) NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_school ON public.sms_logs (school_id, created_at);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100) NULL,
  details JSONB NULL,
  ip_address VARCHAR(50) NULL,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_school ON public.audit_logs (school_id, timestamp);

-- Table: public.two_factor_settings (2FA/TOTP settings)
CREATE TABLE IF NOT EXISTS public.two_factor_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  secret VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  last_used_at BIGINT NULL
);

CREATE INDEX IF NOT EXISTS idx_two_factor_user ON public.two_factor_settings (user_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_school ON public.two_factor_settings (school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_two_factor_user_unique ON public.two_factor_settings (user_id);

-- ==============================================================================
-- 15B. CREATOR HUB SALES SUITE: CRM LEADS & SUBSCRIPTION INVOICES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NOT NULL,
  location VARCHAR(255) NULL,
  estimated_students INT NOT NULL DEFAULT 250,
  stage VARCHAR(50) NOT NULL DEFAULT 'New'
    CHECK (stage IN ('New', 'Contacted', 'Demo Scheduled', 'Proposal Sent', 'Closed Won', 'Closed Lost')),
  expected_tier VARCHAR(50) NOT NULL DEFAULT 'Standard',
  deal_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  follow_up_date VARCHAR(50) NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON public.crm_leads (stage);
CREATE INDEX IF NOT EXISTS idx_crm_leads_created_at ON public.crm_leads (created_at DESC);

CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(100) NOT NULL UNIQUE,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE SET NULL,
  school_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NULL,
  contact_person VARCHAR(255) NULL,
  tier VARCHAR(50) NOT NULL DEFAULT 'Standard',
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'GHS',
  status VARCHAR(50) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled')),
  issued_date VARCHAR(50) NOT NULL,
  due_date VARCHAR(50) NULL,
  paid_at BIGINT NULL,
  license_key VARCHAR(255) NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_school ON public.subscription_invoices (school_id);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_status ON public.subscription_invoices (status);

-- ==============================================================================
-- 16. ROW LEVEL SECURITY (RLS) POLICIES ENFORCEMENT
-- ==============================================================================

ALTER TABLE public.school_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.term_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.two_factor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

-- Policy helper: Super Admin & Service Role bypass
DROP POLICY IF EXISTS "Super admin full access on licenses" ON public.school_licenses;
CREATE POLICY "Super admin full access on licenses" ON public.school_licenses
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super admin full access on crm_leads" ON public.crm_leads;
CREATE POLICY "Super admin full access on crm_leads" ON public.crm_leads
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super admin full access on subscription_invoices" ON public.subscription_invoices;
CREATE POLICY "Super admin full access on subscription_invoices" ON public.subscription_invoices
  FOR ALL USING (public.is_super_admin());

DROP POLICY IF EXISTS "Tenant view own license" ON public.school_licenses;
CREATE POLICY "Tenant view own license" ON public.school_licenses
  FOR SELECT USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Public select active schools" ON public.schools;
CREATE POLICY "Public select active schools" ON public.schools
  FOR SELECT USING (status = 'active' OR public.is_super_admin());

DROP POLICY IF EXISTS "School admin manage own school" ON public.schools;
CREATE POLICY "School admin manage own school" ON public.schools
  FOR UPDATE USING (id = public.get_auth_school_id() OR public.is_super_admin());

-- Tenant-isolated policies for core modules
DROP POLICY IF EXISTS "Tenant isolation for users" ON public.users;
CREATE POLICY "Tenant isolation for users" ON public.users
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for classes" ON public.classes;
CREATE POLICY "Tenant isolation for classes" ON public.classes
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for subjects" ON public.subjects;
CREATE POLICY "Tenant isolation for subjects" ON public.subjects
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for teachers" ON public.teachers;
CREATE POLICY "Tenant isolation for teachers" ON public.teachers
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for students" ON public.students;
CREATE POLICY "Tenant isolation for students" ON public.students
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for attendance" ON public.attendance;
CREATE POLICY "Tenant isolation for attendance" ON public.attendance
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for results" ON public.results;
CREATE POLICY "Tenant isolation for results" ON public.results
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for term_reports" ON public.term_reports;
CREATE POLICY "Tenant isolation for term_reports" ON public.term_reports
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for fee_transactions" ON public.fee_transactions;
CREATE POLICY "Tenant isolation for fee_transactions" ON public.fee_transactions
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for exam_analysis" ON public.exam_analysis;
CREATE POLICY "Tenant isolation for exam_analysis" ON public.exam_analysis
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for polls" ON public.polls;
CREATE POLICY "Tenant isolation for polls" ON public.polls
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for candidates" ON public.candidates;
CREATE POLICY "Tenant isolation for candidates" ON public.candidates
  FOR ALL USING (
    poll_id IN (SELECT id FROM public.polls WHERE school_id = public.get_auth_school_id())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Tenant isolation for votes" ON public.votes;
CREATE POLICY "Tenant isolation for votes" ON public.votes
  FOR ALL USING (
    poll_id IN (SELECT id FROM public.polls WHERE school_id = public.get_auth_school_id())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Tenant isolation for promotion_history" ON public.promotion_history;
CREATE POLICY "Tenant isolation for promotion_history" ON public.promotion_history
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for inventory_items" ON public.inventory_items;
CREATE POLICY "Tenant isolation for inventory_items" ON public.inventory_items
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for school_expenses" ON public.school_expenses;
CREATE POLICY "Tenant isolation for school_expenses" ON public.school_expenses
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for sms_logs" ON public.sms_logs;
CREATE POLICY "Tenant isolation for sms_logs" ON public.sms_logs
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for audit_logs" ON public.audit_logs;
CREATE POLICY "Tenant isolation for audit_logs" ON public.audit_logs
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for two_factor_settings" ON public.two_factor_settings;
CREATE POLICY "Tenant isolation for two_factor_settings" ON public.two_factor_settings
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

-- ==============================================================================
-- 17. AUTOMATED TRIGGERS FOR TIMESTAMPS & AUDITING
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_schools_updated_at ON public.schools;
CREATE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_school_licenses_updated_at ON public.school_licenses;
CREATE TRIGGER trg_school_licenses_updated_at
  BEFORE UPDATE ON public.school_licenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_students_updated_at ON public.students;
CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ==============================================================================
-- 18. ATOMIC TENANT & LICENSE SYNCHRONIZATION / SUSPENSION PROCEDURES
-- ==============================================================================

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
  v_school_status TEXT;
BEGIN
  v_clean_name := TRIM(p_school_name);
  v_clean_key := TRIM(UPPER(p_license_key));
  v_tier := COALESCE(p_tier, 'Standard');
  v_status := LOWER(TRIM(COALESCE(p_status, 'active')));
  IF v_status NOT IN ('active', 'suspended', 'expired', 'revoked', 'pending_activation') THEN
    v_status := 'active';
  END IF;
  v_school_status := CASE WHEN v_status = 'revoked' THEN 'suspended' ELSE v_status END;

  v_slug := LOWER(REGEXP_REPLACE(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := TRIM(BOTH '-' FROM v_slug);
  IF v_slug = '' THEN
    v_slug := 'school-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);
  END IF;

  SELECT id INTO v_school_id 
  FROM public.schools 
  WHERE slug = v_slug OR LOWER(name) = LOWER(v_clean_name)
  LIMIT 1;

  IF v_school_id IS NULL THEN
    v_school_id := gen_random_uuid();
    INSERT INTO public.schools (
      id, name, slug, license_id, theme, email, phone, address,
      academic_year, current_term, status, created_at, updated_at
    ) VALUES (
      v_school_id, v_clean_name, v_slug, NULL, 'indigo',
      COALESCE(p_email, 'admin@' || v_slug || '.edu.gh'),
      COALESCE(p_phone, '+233 24 000 0000'),
      COALESCE(p_address, 'Ghana'),
      '2026/2027', 'Term 1', v_school_status,
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    );
  ELSE
    UPDATE public.schools SET
      name = v_clean_name,
      status = v_school_status,
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE id = v_school_id;
  END IF;

  INSERT INTO public.school_licenses (
    license_key, school_name, school_id, tier, expiry_date,
    active_status, active_modules, created_at, updated_at
  ) VALUES (
    v_clean_key, v_clean_name, v_school_id, v_tier, p_expiry_date,
    v_status, p_modules,
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

  UPDATE public.schools 
  SET license_id = v_license_id,
      status = v_school_status,
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  WHERE id = v_school_id;

  UPDATE public.school_licenses
  SET active_status = v_status,
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  WHERE school_id = v_school_id;

  RETURN jsonb_build_object(
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_school_license TO anon, authenticated, service_role;

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
  IF v_status NOT IN ('active', 'suspended', 'expired', 'revoked', 'deactivated', 'pending_activation') THEN
    v_status := 'suspended';
  END IF;
  v_school_status := CASE WHEN v_status IN ('revoked', 'deactivated') THEN 'suspended' ELSE v_status END;

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

