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
  active_modules JSONB NOT NULL DEFAULT '["students", "academic", "timetable", "lesson_notes", "attendance", "results", "reports", "fees", "siren", "evoting", "inventory"]'::jsonb,
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
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'admin', 'headteacher', 'hod', 'teacher', 'accountant', 'student', 'parent')),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_user UNIQUE (school_id, username)
);

DO $$
BEGIN
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE public.users ADD CONSTRAINT users_role_check
    CHECK (role IN ('super_admin', 'creator', 'admin', 'headteacher', 'hod', 'teacher', 'accountant', 'student', 'parent'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

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
  category VARCHAR(100) NULL,
  level VARCHAR(100) NULL,
  description TEXT NULL,
  department VARCHAR(100) NULL,
  credit_hours INT NOT NULL DEFAULT 3 CHECK (credit_hours >= 0),
  status VARCHAR(50) NOT NULL DEFAULT 'Available' CHECK (status IN ('Enrolled', 'Pending Approval', 'Available')),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_subject_code UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON public.subjects (school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_category ON public.subjects (school_id, category);
CREATE INDEX IF NOT EXISTS idx_subjects_status ON public.subjects (school_id, status);

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
  residential_status VARCHAR(50) NOT NULL DEFAULT 'Day Student',
  status VARCHAR(50) NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'graduated', 'suspended', 'transferred', 'withdrawn')),
  fee_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  fee_paid_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  class_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  previous_classes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_student_id UNIQUE (school_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_students_school_id ON public.students (school_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students (school_id, class);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students (school_id, status);
CREATE INDEX IF NOT EXISTS idx_students_residential_status ON public.students (school_id, residential_status);

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
  exercise_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  exercise_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_ca_score NUMERIC(6, 2) NULL,
  raw_ca_max NUMERIC(6, 2) NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_result_term UNIQUE (school_id, student_id, subject, term, academic_year)
);

ALTER TABLE public.results ADD COLUMN IF NOT EXISTS exercise_scores JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS exercise_columns JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS raw_ca_score NUMERIC(6, 2) NULL;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS raw_ca_max NUMERIC(6, 2) NULL;

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

CREATE TABLE IF NOT EXISTS public.votes_table (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  poll_id BIGINT NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(255) NULL,
  student_class VARCHAR(100) NULL,
  candidate_id BIGINT NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  candidate_name VARCHAR(255) NULL,
  position VARCHAR(100) NOT NULL,
  receipt_code VARCHAR(100) NULL,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_votes_table_student_position UNIQUE (poll_id, student_id, position)
);

CREATE INDEX IF NOT EXISTS idx_votes_table_poll ON public.votes_table (poll_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_votes_table_student ON public.votes_table (student_id, poll_id);

-- ==============================================================================
-- 13. STUDENT PROMOTION & ACADEMIC TRANSITION AUDIT
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.promotion_history (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  student_identifier VARCHAR(50) NULL,
  student_name VARCHAR(255) NOT NULL,
  source_class VARCHAR(100) NOT NULL,
  dest_class VARCHAR(100) NOT NULL,
  academic_year VARCHAR(50) NOT NULL,
  term VARCHAR(50) NOT NULL,
  previous_fees_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (previous_fees_paid >= 0),
  previous_total_fees NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (previous_total_fees >= 0),
  previous_fee_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_fee_paid_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_promotion_history_school ON public.promotion_history (school_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_promotion_history_student ON public.promotion_history (school_id, student_id);

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
-- 15C. TIMETABLE & COURSE SCHEDULER (SLOTS & PERIOD SUGGESTIONS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  slot_id VARCHAR(100) NOT NULL,
  class_id VARCHAR(100) NOT NULL,
  subject_name VARCHAR(255) NOT NULL,
  teacher_name VARCHAR(255) NOT NULL,
  day VARCHAR(20) NOT NULL CHECK (day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')),
  start_time VARCHAR(20) NOT NULL,
  end_time VARCHAR(20) NOT NULL,
  room VARCHAR(150) NOT NULL DEFAULT 'Room A',
  notes TEXT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_timetable_slot UNIQUE (school_id, slot_id)
);

CREATE INDEX IF NOT EXISTS idx_timetable_slots_school_id ON public.timetable_slots (school_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_class_day ON public.timetable_slots (school_id, class_id, day);

CREATE TABLE IF NOT EXISTS public.timetable_suggestions (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  suggestion_id VARCHAR(100) NOT NULL,
  class_id VARCHAR(100) NOT NULL,
  subject_name VARCHAR(255) NOT NULL,
  teacher_name VARCHAR(255) NOT NULL,
  day VARCHAR(20) NOT NULL CHECK (day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')),
  start_time VARCHAR(20) NOT NULL,
  end_time VARCHAR(20) NOT NULL,
  room VARCHAR(150) NOT NULL DEFAULT 'Room A',
  notes TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  suggested_by VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_timetable_suggestion UNIQUE (school_id, suggestion_id)
);

CREATE INDEX IF NOT EXISTS idx_timetable_suggestions_school_id ON public.timetable_suggestions (school_id);
CREATE INDEX IF NOT EXISTS idx_timetable_suggestions_status ON public.timetable_suggestions (school_id, status);

-- ==============================================================================
-- 15D. TEACHER LESSON NOTES (STRUCTURED + PDF UPLOAD) & HOD/HEADMASTER REVIEW
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.lesson_notes (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  note_id VARCHAR(100) NOT NULL,
  teacher_id VARCHAR(100) NULL,
  teacher_name VARCHAR(255) NOT NULL,
  term VARCHAR(50) NOT NULL DEFAULT 'Term 1',
  academic_year VARCHAR(50) NOT NULL DEFAULT '2026/2027',
  week_number INT NOT NULL DEFAULT 1 CHECK (week_number >= 1 AND week_number <= 20),
  class VARCHAR(100) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  lesson_date VARCHAR(50) NULL,
  duration VARCHAR(50) NOT NULL DEFAULT '60 mins',
  class_size INT NULL,
  strand TEXT NOT NULL,
  sub_strand TEXT NULL,
  content_standard TEXT NULL,
  objectives TEXT NULL,
  tlms TEXT NULL,
  core_competencies TEXT NULL,
  starter_activity TEXT NULL,
  main_activity TEXT NULL,
  plenary_activity TEXT NULL,
  evaluation TEXT NULL,
  teacher_remarks TEXT NULL,
  pdf_file_name VARCHAR(255) NULL,
  pdf_file_size BIGINT NULL,
  pdf_file_url TEXT NULL,
  pdf_storage_path TEXT NULL,
  pdf_data TEXT NULL,
  pdf_uploaded_at BIGINT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Pending Review', 'Approved', 'Needs Revision', 'Rejected')),
  submitted_at BIGINT NULL,
  reviewed_by VARCHAR(255) NULL,
  reviewer_role VARCHAR(100) NULL,
  reviewer_feedback TEXT NULL,
  reviewed_at BIGINT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_lesson_note UNIQUE (school_id, note_id)
);

ALTER TABLE public.lesson_notes ADD COLUMN IF NOT EXISTS pdf_file_url TEXT NULL;
ALTER TABLE public.lesson_notes ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_notes_school_lookup ON public.lesson_notes (school_id, term, week_number, class, subject);
CREATE INDEX IF NOT EXISTS idx_lesson_notes_status ON public.lesson_notes (school_id, status);
CREATE INDEX IF NOT EXISTS idx_lesson_notes_teacher ON public.lesson_notes (school_id, teacher_name);

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
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_notes ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Tenant isolation for timetable_slots" ON public.timetable_slots;
CREATE POLICY "Tenant isolation for timetable_slots" ON public.timetable_slots
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for timetable_suggestions" ON public.timetable_suggestions;
CREATE POLICY "Tenant isolation for timetable_suggestions" ON public.timetable_suggestions
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Tenant isolation for lesson_notes" ON public.lesson_notes;
CREATE POLICY "Tenant isolation for lesson_notes" ON public.lesson_notes
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

DROP TRIGGER IF EXISTS trg_timetable_slots_updated_at ON public.timetable_slots;
CREATE TRIGGER trg_timetable_slots_updated_at
  BEFORE UPDATE ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_timetable_suggestions_updated_at ON public.timetable_suggestions;
CREATE TRIGGER trg_timetable_suggestions_updated_at
  BEFORE UPDATE ON public.timetable_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_lesson_notes_updated_at ON public.lesson_notes;
CREATE TRIGGER trg_lesson_notes_updated_at
  BEFORE UPDATE ON public.lesson_notes
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
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: platform administrators only.';
  END IF;
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

REVOKE EXECUTE ON FUNCTION public.sync_school_license(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_school_license(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT) TO authenticated, service_role;

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

REVOKE EXECUTE ON FUNCTION public.set_school_tenant_status(UUID, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_school_tenant_status(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 19. SUPABASE AUTH <-> PUBLIC.USERS AUTO-LINKING & RLS ALIASES
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID AS $$
BEGIN
  RETURN public.get_auth_school_id();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_creator()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.is_super_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_school_id UUID;
  v_role TEXT;
  v_username TEXT;
  v_full_name TEXT;
  v_matched_id BIGINT;
BEGIN
  BEGIN
    v_school_id := NULLIF(NEW.raw_user_meta_data ->> 'school_id', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_school_id := NULL;
  END;

  v_role := COALESCE(NULLIF(LOWER(NEW.raw_user_meta_data ->> 'role'), ''), 'admin');
  IF v_role IN ('creator', 'super_admin') THEN
    v_role := 'admin';
  END IF;
  v_username := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'username', ''), SPLIT_PART(NEW.email, '@', 1));
  v_full_name := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), v_username);

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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 20. CAMPUS-WIDE SIREN & BROADCAST CONSOLE TABLES + STORAGE BUCKET
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.school_settings (
  school_id UUID PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_boundaries JSONB NOT NULL DEFAULT '[]'::jsonb,
  terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  streams JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for school_settings" ON public.school_settings;
CREATE POLICY "Tenant isolation for school_settings" ON public.school_settings
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin())
  WITH CHECK (school_id = public.get_auth_school_id() OR public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NULL,
  triggered_by BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_school_created
  ON public.broadcasts (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_school_status
  ON public.broadcasts (school_id, status);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for broadcasts" ON public.broadcasts;
CREATE POLICY "Tenant isolation for broadcasts" ON public.broadcasts
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin())
  WITH CHECK (school_id = public.get_auth_school_id() OR public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.siren_schedules (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  bell_id VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  time VARCHAR(20) NOT NULL,
  days JSONB NOT NULL DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]'::jsonb,
  alarm_type VARCHAR(150) NOT NULL DEFAULT 'bell',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_siren_schedule UNIQUE (school_id, bell_id)
);

CREATE INDEX IF NOT EXISTS idx_siren_schedules_school_time
  ON public.siren_schedules (school_id, time);

ALTER TABLE public.siren_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for siren_schedules" ON public.siren_schedules;
CREATE POLICY "Tenant isolation for siren_schedules" ON public.siren_schedules
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin())
  WITH CHECK (school_id = public.get_auth_school_id() OR public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.siren_recordings (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  recording_id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  audio_url TEXT NULL,
  storage_path TEXT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'audio/webm',
  size BIGINT NOT NULL DEFAULT 0,
  base64_data TEXT NULL,
  created_by VARCHAR(255) NOT NULL DEFAULT 'Administrator',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_siren_recording UNIQUE (school_id, recording_id)
);

CREATE INDEX IF NOT EXISTS idx_siren_recordings_school_created
  ON public.siren_recordings (school_id, created_at DESC);

ALTER TABLE public.siren_recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for siren_recordings" ON public.siren_recordings;
CREATE POLICY "Tenant isolation for siren_recordings" ON public.siren_recordings
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin())
  WITH CHECK (school_id = public.get_auth_school_id() OR public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.siren_logs (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  log_id VARCHAR(100) NOT NULL,
  type VARCHAR(100) NOT NULL DEFAULT 'bell',
  label VARCHAR(255) NOT NULL,
  custom_msg TEXT NULL,
  is_drill BOOLEAN NOT NULL DEFAULT FALSE,
  triggered_by VARCHAR(255) NOT NULL DEFAULT 'Administrator',
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_siren_log UNIQUE (school_id, log_id)
);

CREATE INDEX IF NOT EXISTS idx_siren_logs_school_timestamp
  ON public.siren_logs (school_id, timestamp DESC);

ALTER TABLE public.siren_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for siren_logs" ON public.siren_logs;
CREATE POLICY "Tenant isolation for siren_logs" ON public.siren_logs
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin())
  WITH CHECK (school_id = public.get_auth_school_id() OR public.is_super_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('siren-audio', 'siren-audio', true, 15728640)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 15728640;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- 19. SUPABASE AUTH <-> PUBLIC.USERS AUTO-LINKING & RLS ALIASES
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID AS $$
BEGIN
  RETURN public.get_auth_school_id();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_creator()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.is_super_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_school_id UUID;
  v_role TEXT;
  v_username TEXT;
  v_full_name TEXT;
BEGIN
  BEGIN
    v_school_id := NULLIF(NEW.raw_user_meta_data ->> 'school_id', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_school_id := NULL;
  END;

  v_role := COALESCE(NULLIF(LOWER(NEW.raw_user_meta_data ->> 'role'), ''), 'admin');
  v_username := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'username', ''), SPLIT_PART(NEW.email, '@', 1));
  v_full_name := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), v_username);

  -- Link existing public.users record if matched by email or (school_id, username)
  UPDATE public.users
  SET auth_user_id = NEW.id,
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
  WHERE auth_user_id IS NULL
    AND (
      LOWER(email) = LOWER(NEW.email)
      OR (v_school_id IS NOT NULL AND school_id = v_school_id AND LOWER(username) = LOWER(v_username))
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 20. CAMPUS-WIDE SIREN & BROADCAST CONSOLE TABLES + STORAGE BUCKET
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.school_settings (
  school_id UUID PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_boundaries JSONB NOT NULL DEFAULT '[]'::jsonb,
  terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  streams JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for school_settings" ON public.school_settings;
CREATE POLICY "Tenant isolation for school_settings" ON public.school_settings
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NULL,
  triggered_by BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_school_created
  ON public.broadcasts (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_school_status
  ON public.broadcasts (school_id, status);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for broadcasts" ON public.broadcasts;
CREATE POLICY "Tenant isolation for broadcasts" ON public.broadcasts
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.siren_schedules (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  bell_id VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  time VARCHAR(20) NOT NULL,
  days JSONB NOT NULL DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]'::jsonb,
  alarm_type VARCHAR(150) NOT NULL DEFAULT 'bell',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_siren_schedule UNIQUE (school_id, bell_id)
);

CREATE INDEX IF NOT EXISTS idx_siren_schedules_school_time
  ON public.siren_schedules (school_id, time);

ALTER TABLE public.siren_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for siren_schedules" ON public.siren_schedules;
CREATE POLICY "Tenant isolation for siren_schedules" ON public.siren_schedules
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.siren_recordings (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  recording_id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  audio_url TEXT NULL,
  storage_path TEXT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'audio/webm',
  size BIGINT NOT NULL DEFAULT 0,
  base64_data TEXT NULL,
  created_by VARCHAR(255) NOT NULL DEFAULT 'Administrator',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_siren_recording UNIQUE (school_id, recording_id)
);

CREATE INDEX IF NOT EXISTS idx_siren_recordings_school_created
  ON public.siren_recordings (school_id, created_at DESC);

ALTER TABLE public.siren_recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for siren_recordings" ON public.siren_recordings;
CREATE POLICY "Tenant isolation for siren_recordings" ON public.siren_recordings
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.siren_logs (
  id BIGSERIAL PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  log_id VARCHAR(100) NOT NULL,
  type VARCHAR(100) NOT NULL DEFAULT 'bell',
  label VARCHAR(255) NOT NULL,
  custom_msg TEXT NULL,
  is_drill BOOLEAN NOT NULL DEFAULT FALSE,
  triggered_by VARCHAR(255) NOT NULL DEFAULT 'Administrator',
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  CONSTRAINT uq_school_siren_log UNIQUE (school_id, log_id)
);

CREATE INDEX IF NOT EXISTS idx_siren_logs_school_timestamp
  ON public.siren_logs (school_id, timestamp DESC);

ALTER TABLE public.siren_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation for siren_logs" ON public.siren_logs;
CREATE POLICY "Tenant isolation for siren_logs" ON public.siren_logs
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('siren-audio', 'siren-audio', true, 15728640)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 15728640;



-- ==============================================================================
-- SCHOOLSPHERE STAFF PAYROLL & COMPENSATION SYSTEM TABLES FOR SUPABASE
-- Connects Payroll to schools, teachers, school_expenses, and audit_logs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.staff_salary_profiles (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id VARCHAR(80) NOT NULL,
  staff_name VARCHAR(255) NOT NULL,
  designation VARCHAR(150) NOT NULL DEFAULT 'Subject Teacher',
  phone VARCHAR(60) NULL,
  email VARCHAR(150) NULL,
  ssnit_number VARCHAR(80) NOT NULL DEFAULT 'N/A',
  tin_number VARCHAR(80) NOT NULL DEFAULT 'N/A',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'Bank Transfer',
  bank_or_network VARCHAR(120) NOT NULL DEFAULT 'GCB Bank',
  account_number VARCHAR(100) NOT NULL DEFAULT '—',
  basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  responsibility_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  transport_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  other_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ssnit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  paye_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  manual_tax_override NUMERIC(12, 2) NULL,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_staff_salary_profiles_school
  ON public.staff_salary_profiles (school_id, staff_id);

CREATE TABLE IF NOT EXISTS public.staff_payslips (
  id VARCHAR(140) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payroll_month VARCHAR(20) NOT NULL,
  period_label VARCHAR(80) NOT NULL,
  staff_id VARCHAR(80) NOT NULL,
  staff_name VARCHAR(255) NOT NULL,
  designation VARCHAR(150) NOT NULL DEFAULT 'Subject Teacher',
  ssnit_number VARCHAR(80) NOT NULL DEFAULT 'N/A',
  tin_number VARCHAR(80) NOT NULL DEFAULT 'N/A',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'Bank Transfer',
  bank_or_network VARCHAR(120) NOT NULL DEFAULT 'GCB Bank',
  account_number VARCHAR(100) NOT NULL DEFAULT '—',
  basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  responsibility_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  transport_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  other_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  gross_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ssnit_employee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ssnit_employer NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  taxable_income NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  paye_tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  loan_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  other_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  net_pay NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  paid_at BIGINT NULL,
  receipt_ref VARCHAR(80) NOT NULL,
  notes TEXT NULL,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_staff_payslips_school_month
  ON public.staff_payslips (school_id, payroll_month, status);

CREATE TABLE IF NOT EXISTS public.staff_salary_advances (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id VARCHAR(80) NOT NULL,
  staff_name VARCHAR(255) NOT NULL,
  designation VARCHAR(150) NOT NULL DEFAULT 'Subject Teacher',
  type VARCHAR(50) NOT NULL DEFAULT 'Salary Advance',
  principal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  monthly_installment NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  remaining_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  reason TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  approved_by VARCHAR(150) NULL,
  approved_at BIGINT NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_salary_advances_school
  ON public.staff_salary_advances (school_id, status);

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- SCHOOLSPHERE BOARDING & RESIDENTIAL MANAGEMENT SYSTEM FOR SUPABASE
-- Tables:
--   1. boarding_houses
--   2. boarding_rooms
--   3. boarding_allocations
--   4. boarding_exeats
--   5. boarding_roll_calls
--   6. boarding_medical_logs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.boarding_houses (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL DEFAULT '',
  gender VARCHAR(20) NOT NULL DEFAULT 'Mixed',
  housemaster_name VARCHAR(150) NOT NULL DEFAULT '',
  housemaster_phone VARCHAR(60) NOT NULL DEFAULT '',
  assistant_name VARCHAR(150) NOT NULL DEFAULT '',
  motto VARCHAR(255) NOT NULL DEFAULT '',
  color VARCHAR(40) NOT NULL DEFAULT '#2563EB',
  capacity INTEGER NOT NULL DEFAULT 50,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_boarding_houses_school
  ON public.boarding_houses (school_id, name);

CREATE TABLE IF NOT EXISTS public.boarding_rooms (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  house_id VARCHAR(120) NOT NULL,
  room_number VARCHAR(60) NOT NULL,
  floor VARCHAR(50) NOT NULL DEFAULT 'Ground Floor',
  capacity INTEGER NOT NULL DEFAULT 8,
  gender VARCHAR(20) NOT NULL DEFAULT 'Mixed',
  prefect_name VARCHAR(150) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_boarding_rooms_house
  ON public.boarding_rooms (school_id, house_id);

CREATE TABLE IF NOT EXISTS public.boarding_allocations (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(80) NOT NULL,
  student_name VARCHAR(255) NOT NULL DEFAULT '',
  class_name VARCHAR(80) NOT NULL DEFAULT '',
  gender VARCHAR(20) NOT NULL DEFAULT '',
  house_id VARCHAR(120) NOT NULL,
  house_name VARCHAR(150) NOT NULL DEFAULT '',
  room_id VARCHAR(120) NOT NULL,
  room_number VARCHAR(60) NOT NULL DEFAULT '',
  bed_number VARCHAR(50) NOT NULL DEFAULT 'Bed 1',
  bed_type VARCHAR(40) NOT NULL DEFAULT 'Single',
  academic_year VARCHAR(40) NOT NULL DEFAULT '',
  term VARCHAR(40) NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  assigned_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  notes TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_boarding_allocations_school_student
  ON public.boarding_allocations (school_id, student_id);

CREATE INDEX IF NOT EXISTS idx_boarding_allocations_room
  ON public.boarding_allocations (school_id, room_id);

CREATE TABLE IF NOT EXISTS public.boarding_exeats (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(80) NOT NULL,
  student_name VARCHAR(255) NOT NULL DEFAULT '',
  class_name VARCHAR(80) NOT NULL DEFAULT '',
  house_id VARCHAR(120) NOT NULL,
  house_name VARCHAR(150) NOT NULL DEFAULT '',
  pass_code VARCHAR(40) NOT NULL,
  exeat_type VARCHAR(50) NOT NULL DEFAULT 'Weekend Exeat',
  reason TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL DEFAULT '',
  parent_consent BOOLEAN NOT NULL DEFAULT TRUE,
  parent_name VARCHAR(150) NOT NULL DEFAULT '',
  parent_phone VARCHAR(60) NOT NULL DEFAULT '',
  departure_date VARCHAR(60) NOT NULL,
  expected_return_date VARCHAR(60) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  approved_by VARCHAR(150) NULL,
  approved_at BIGINT NULL,
  checked_out_at BIGINT NULL,
  checked_out_by VARCHAR(150) NULL,
  checked_in_at BIGINT NULL,
  checked_in_by VARCHAR(150) NULL,
  remarks TEXT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_boarding_exeats_school_status
  ON public.boarding_exeats (school_id, status);

CREATE INDEX IF NOT EXISTS idx_boarding_exeats_pass_code
  ON public.boarding_exeats (pass_code);

CREATE TABLE IF NOT EXISTS public.boarding_roll_calls (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  house_id VARCHAR(120) NOT NULL,
  house_name VARCHAR(150) NOT NULL DEFAULT '',
  roll_date VARCHAR(30) NOT NULL,
  session_type VARCHAR(40) NOT NULL DEFAULT 'evening',
  conducted_by VARCHAR(150) NOT NULL DEFAULT '',
  records JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_boarding_roll_calls_school_date
  ON public.boarding_roll_calls (school_id, roll_date, house_id);

CREATE TABLE IF NOT EXISTS public.boarding_medical_logs (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(80) NOT NULL,
  student_name VARCHAR(255) NOT NULL DEFAULT '',
  class_name VARCHAR(80) NOT NULL DEFAULT '',
  house_id VARCHAR(120) NOT NULL,
  house_name VARCHAR(150) NOT NULL DEFAULT '',
  visit_date VARCHAR(30) NOT NULL,
  complaint TEXT NOT NULL DEFAULT '',
  vitals VARCHAR(150) NOT NULL DEFAULT '',
  treatment_given TEXT NOT NULL DEFAULT '',
  attending_staff VARCHAR(150) NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'treated',
  admitted_at BIGINT NULL,
  discharged_at BIGINT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_boarding_medical_logs_school
  ON public.boarding_medical_logs (school_id, student_id);

-- Enable RLS and grants
ALTER TABLE public.boarding_houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_exeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_roll_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_medical_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on boarding_houses"
  ON public.boarding_houses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert/update on boarding_houses"
  ON public.boarding_houses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read on boarding_rooms"
  ON public.boarding_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert/update on boarding_rooms"
  ON public.boarding_rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read on boarding_allocations"
  ON public.boarding_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert/update on boarding_allocations"
  ON public.boarding_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read on boarding_exeats"
  ON public.boarding_exeats FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert/update on boarding_exeats"
  ON public.boarding_exeats FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read on boarding_roll_calls"
  ON public.boarding_roll_calls FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert/update on boarding_roll_calls"
  ON public.boarding_roll_calls FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read on boarding_medical_logs"
  ON public.boarding_medical_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert/update on boarding_medical_logs"
  ON public.boarding_medical_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ==============================================================================
-- Migration: 20261010140000_add_curriculum_and_student_columns.sql
-- Description: Adds remaining columns to subjects, students, and promotion_history
--   - subjects: category, level, description, department, credit_hours, status
--   - students: residential_status, class_history, previous_classes
--   - promotion_history: student_identifier, previous_fees_paid, previous_total_fees,
--                        previous_fee_breakdown, previous_fee_paid_breakdown
-- ==============================================================================

-- 1. EXTEND SUBJECTS TABLE
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS category VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS level VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS department VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS credit_hours INT NOT NULL DEFAULT 3 CHECK (credit_hours >= 0),
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'Available'
    CHECK (status IN ('Enrolled', 'Pending Approval', 'Available'));

CREATE INDEX IF NOT EXISTS idx_subjects_category ON public.subjects (school_id, category);
CREATE INDEX IF NOT EXISTS idx_subjects_status ON public.subjects (school_id, status);

-- 2. EXTEND STUDENTS TABLE
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS residential_status VARCHAR(50) NOT NULL DEFAULT 'Day Student',
  ADD COLUMN IF NOT EXISTS class_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS previous_classes JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_students_residential_status ON public.students (school_id, residential_status);

-- 3. EXTEND PROMOTION_HISTORY TABLE
ALTER TABLE public.promotion_history
  ADD COLUMN IF NOT EXISTS student_identifier VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS previous_fees_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (previous_fees_paid >= 0),
  ADD COLUMN IF NOT EXISTS previous_total_fees NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (previous_total_fees >= 0),
  ADD COLUMN IF NOT EXISTS previous_fee_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS previous_fee_paid_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_promotion_history_student ON public.promotion_history (school_id, student_id);


-- ==============================================================================
-- Migration: 20261010150000_add_remaining_frontend_columns_and_tables.sql
-- Description: Synchronizes all remaining frontend model columns and tables to Supabase
--   1. Adds missing columns to students, subjects, promotion_history, users,
--      fee_transactions, exam_analysis, lesson_notes, boarding_roll_calls
--   2. Updates users role check constraint to include 'creator'
--   3. Creates missing tables:
--      - public.client_proposals
--      - public.assessments
--      - public.assessment_submissions
--      - public.question_bank
--   4. Configures indexes, RLS policies, and service_role/authenticated grants
-- ==============================================================================

-- 1. EXTEND EXISTING TABLES WITH REMAINING COLUMNS

-- 1.1 students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS remote_id VARCHAR(120) NULL;

CREATE INDEX IF NOT EXISTS idx_students_remote_id ON public.students (remote_id);

-- 1.2 subjects
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS remote_id VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS registration_status VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

CREATE INDEX IF NOT EXISTS idx_subjects_remote_id ON public.subjects (remote_id);
CREATE INDEX IF NOT EXISTS idx_subjects_reg_status ON public.subjects (school_id, registration_status);

-- 1.3 promotion_history
ALTER TABLE public.promotion_history
  ADD COLUMN IF NOT EXISTS remote_id VARCHAR(120) NULL;

CREATE INDEX IF NOT EXISTS idx_promotion_history_remote_id ON public.promotion_history (remote_id);

-- 1.4 users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS school_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS password_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_login BIGINT NULL;

-- Update role constraint to include creator
DO $$
BEGIN
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE public.users ADD CONSTRAINT users_role_check
    CHECK (role IN ('super_admin', 'creator', 'admin', 'headteacher', 'hod', 'teacher', 'accountant', 'student', 'parent'));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_school_name ON public.users (school_name);

-- 1.5 fee_transactions
ALTER TABLE public.fee_transactions
  ADD COLUMN IF NOT EXISTS remote_id VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS student_code VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS student_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS class_name VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS channel_label VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS payment_channel_label VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS academic_year VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS term VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) NOT NULL DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS allocation_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

CREATE INDEX IF NOT EXISTS idx_fee_transactions_student_name ON public.fee_transactions (school_id, student_name);
CREATE INDEX IF NOT EXISTS idx_fee_transactions_invoice_id ON public.fee_transactions (school_id, invoice_id);

-- 1.6 exam_analysis
ALTER TABLE public.exam_analysis
  ADD COLUMN IF NOT EXISTS school_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS subject_name VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

-- 1.7 lesson_notes
ALTER TABLE public.lesson_notes
  ADD COLUMN IF NOT EXISTS learning_indicators TEXT NULL,
  ADD COLUMN IF NOT EXISTS assessment_plan TEXT NULL;

-- 1.8 boarding_roll_calls
ALTER TABLE public.boarding_roll_calls
  ADD COLUMN IF NOT EXISTS total INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS present INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absent INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exeat INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sick INT NOT NULL DEFAULT 0;

-- 2. CREATE CLIENT PROPOSALS TABLE
CREATE TABLE IF NOT EXISTS public.client_proposals (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE SET NULL,
  school_name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(150) NOT NULL DEFAULT '',
  phone VARCHAR(60) NOT NULL DEFAULT '',
  email VARCHAR(150) NOT NULL DEFAULT '',
  location VARCHAR(255) NOT NULL DEFAULT '',
  students_count INT NOT NULL DEFAULT 0,
  tier VARCHAR(50) NOT NULL DEFAULT 'Standard',
  currency VARCHAR(20) NOT NULL DEFAULT 'GHS',
  selected_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  module_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  add_ons JSONB NOT NULL DEFAULT '[]'::jsonb,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  billing_frequency VARCHAR(50) NOT NULL DEFAULT 'term',
  status VARCHAR(50) NOT NULL DEFAULT 'Draft',
  total_per_term NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_annual NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  notes TEXT NOT NULL DEFAULT '',
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_client_proposals_school_name
  ON public.client_proposals (school_name);
CREATE INDEX IF NOT EXISTS idx_client_proposals_status
  ON public.client_proposals (status);

-- 3. CREATE ASSESSMENTS TABLE
CREATE TABLE IF NOT EXISTS public.assessments (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'homework'
    CHECK (category IN ('homework', 'classwork', 'class_test', 'examination')),
  subject VARCHAR(150) NOT NULL,
  class VARCHAR(100) NOT NULL,
  academic_year VARCHAR(50) NOT NULL DEFAULT '2026/2027',
  term VARCHAR(50) NOT NULL DEFAULT 'Term 1',
  description TEXT NOT NULL DEFAULT '',
  due_date VARCHAR(50) NOT NULL DEFAULT '',
  max_score NUMERIC(8, 2) NOT NULL DEFAULT 100.00,
  weight_percentage NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  rubric JSONB NOT NULL DEFAULT '[]'::jsonb,
  teacher_id VARCHAR(120) NULL,
  teacher_name VARCHAR(150) NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'closed')),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions TEXT NULL,
  duration_minutes INT NULL,
  allow_instant_self_check BOOLEAN NOT NULL DEFAULT false,
  shuffle_questions BOOLEAN NOT NULL DEFAULT false,
  source_lesson_note_id VARCHAR(120) NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_assessments_school_class_subject
  ON public.assessments (school_id, class, subject);
CREATE INDEX IF NOT EXISTS idx_assessments_status
  ON public.assessments (school_id, status);

-- 4. CREATE ASSESSMENT SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.assessment_submissions (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  assessment_id VARCHAR(120) NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_id VARCHAR(80) NOT NULL,
  student_name VARCHAR(255) NOT NULL DEFAULT '',
  class VARCHAR(100) NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'graded', 'returned')),
  submitted_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  content TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  rubric_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score NUMERIC(8, 2) NULL,
  grade VARCHAR(20) NULL,
  feedback TEXT NULL,
  graded_by VARCHAR(150) NULL,
  graded_at BIGINT NULL,
  synced_to_sba BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT uq_assessment_submission UNIQUE (assessment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_submissions_student
  ON public.assessment_submissions (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_assessment_submissions_assessment
  ON public.assessment_submissions (assessment_id, status);

-- 5. CREATE QUESTION BANK TABLE
CREATE TABLE IF NOT EXISTS public.question_bank (
  id VARCHAR(120) PRIMARY KEY,
  school_id UUID NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject VARCHAR(150) NOT NULL,
  topic VARCHAR(255) NOT NULL,
  class_name VARCHAR(100) NOT NULL DEFAULT 'All',
  strand VARCHAR(255) NULL,
  sub_strand VARCHAR(255) NULL,
  difficulty VARCHAR(50) NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage_count INT NOT NULL DEFAULT 0,
  created_by VARCHAR(150) NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_question_bank_subject_topic
  ON public.question_bank (school_id, subject, topic);
CREATE INDEX IF NOT EXISTS idx_question_bank_difficulty
  ON public.question_bank (school_id, difficulty);

-- 6. CONFIGURE ROW LEVEL SECURITY & PERMISSIONS
ALTER TABLE public.client_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

-- 6.1 Policies for client_proposals (Creator & authenticated platform admins)
CREATE POLICY "Allow authenticated read on client_proposals"
  ON public.client_proposals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert/update on client_proposals"
  ON public.client_proposals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6.2 Policies for assessments
CREATE POLICY "Allow authenticated read on assessments"
  ON public.assessments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated manage on assessments"
  ON public.assessments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6.3 Policies for assessment_submissions
CREATE POLICY "Allow authenticated read on assessment_submissions"
  ON public.assessment_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated manage on assessment_submissions"
  ON public.assessment_submissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6.4 Policies for question_bank
CREATE POLICY "Allow authenticated read on question_bank"
  ON public.question_bank FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated manage on question_bank"
  ON public.question_bank FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6.5 Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_proposals TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assessment_submissions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_bank TO authenticated, service_role;


NOTIFY pgrst, 'reload schema';


