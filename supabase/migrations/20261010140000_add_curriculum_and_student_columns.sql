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
