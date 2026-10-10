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
