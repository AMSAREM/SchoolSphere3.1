-- ==============================================================================
-- Migration: 20260928_lesson_notes_and_storage.sql
-- Description:
--   1. Creates public.lesson_notes in the public schema with structured lesson plan
--      fields, Supabase Storage PDF attachment columns (pdf_file_url, pdf_storage_path,
--      pdf_file_name, pdf_file_size), and HOD / Headmaster review workflow columns.
--   2. Enables multi-tenant Row-Level Security (RLS) policies on public.lesson_notes.
--   3. Configures the "lesson-notes" Supabase Storage bucket and storage.objects RLS.
--   4. Reloads the PostgREST schema cache (NOTIFY pgrst, 'reload schema').
-- ==============================================================================

-- 1. Create public.lesson_notes table
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

-- Ensure columns exist if upgrading an earlier table version
ALTER TABLE public.lesson_notes ADD COLUMN IF NOT EXISTS pdf_file_url TEXT NULL;
ALTER TABLE public.lesson_notes ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT NULL;
ALTER TABLE public.lesson_notes ADD COLUMN IF NOT EXISTS pdf_file_name VARCHAR(255) NULL;
ALTER TABLE public.lesson_notes ADD COLUMN IF NOT EXISTS pdf_file_size BIGINT NULL;
ALTER TABLE public.lesson_notes ADD COLUMN IF NOT EXISTS pdf_data TEXT NULL;
ALTER TABLE public.lesson_notes ADD COLUMN IF NOT EXISTS pdf_uploaded_at BIGINT NULL;

-- 2. Indexes for fast filtering by school, term, week, class, subject, and status
CREATE INDEX IF NOT EXISTS idx_lesson_notes_school_lookup
  ON public.lesson_notes (school_id, term, week_number, class, subject);
CREATE INDEX IF NOT EXISTS idx_lesson_notes_status
  ON public.lesson_notes (school_id, status);
CREATE INDEX IF NOT EXISTS idx_lesson_notes_teacher
  ON public.lesson_notes (school_id, teacher_name);

-- 3. Enable Row-Level Security (RLS)
ALTER TABLE public.lesson_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for lesson_notes" ON public.lesson_notes;
CREATE POLICY "Tenant isolation for lesson_notes" ON public.lesson_notes
  FOR ALL USING (school_id = public.get_auth_school_id() OR public.is_super_admin())
  WITH CHECK (school_id = public.get_auth_school_id() OR public.is_super_admin());

-- 4. Updated_at timestamp trigger
DROP TRIGGER IF EXISTS trg_lesson_notes_updated_at ON public.lesson_notes;
CREATE TRIGGER trg_lesson_notes_updated_at
  BEFORE UPDATE ON public.lesson_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- 5. Ensure "lesson-notes" Storage Bucket exists for PDF attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lesson-notes', 'lesson-notes', true, 15728640, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY['application/pdf'];

-- 6. Reload PostgREST schema cache so /rest/v1/lesson_notes is immediately active
NOTIFY pgrst, 'reload schema';
