-- ==============================================================================
-- Migration: Dedicated Timetable & Course Scheduler Tables (Supabase Persistence)
-- Date: 2026-09-26
-- Description:
--   Creates public.timetable_slots and public.timetable_suggestions with
--   multi-tenant school_id foreign keys, unique constraints, indexes, and
--   role-aware Row-Level Security (RLS) policies.
-- ==============================================================================

-- 1. Active Timetable Slots Table
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

-- 2. Teacher Period Suggestions Table
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

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_suggestions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for timetable_slots
DROP POLICY IF EXISTS "Tenant view timetable_slots" ON public.timetable_slots;
CREATE POLICY "Tenant view timetable_slots" ON public.timetable_slots
  FOR SELECT USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Admins manage timetable_slots" ON public.timetable_slots;
CREATE POLICY "Admins manage timetable_slots" ON public.timetable_slots
  FOR ALL USING (
    (
      school_id = public.get_auth_school_id()
      AND public.get_auth_user_role() IN ('admin', 'headteacher', 'super_admin', 'creator')
    )
    OR public.is_super_admin()
  );

-- 5. RLS Policies for timetable_suggestions
DROP POLICY IF EXISTS "Tenant view timetable_suggestions" ON public.timetable_suggestions;
CREATE POLICY "Tenant view timetable_suggestions" ON public.timetable_suggestions
  FOR SELECT USING (school_id = public.get_auth_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Staff manage timetable_suggestions" ON public.timetable_suggestions;
CREATE POLICY "Staff manage timetable_suggestions" ON public.timetable_suggestions
  FOR ALL USING (
    (
      school_id = public.get_auth_school_id()
      AND public.get_auth_user_role() IN ('teacher', 'admin', 'headteacher', 'super_admin', 'creator')
    )
    OR public.is_super_admin()
  );

-- 6. Updated_at triggers
DROP TRIGGER IF EXISTS trg_timetable_slots_updated_at ON public.timetable_slots;
CREATE TRIGGER trg_timetable_slots_updated_at
  BEFORE UPDATE ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_timetable_suggestions_updated_at ON public.timetable_suggestions;
CREATE TRIGGER trg_timetable_suggestions_updated_at
  BEFORE UPDATE ON public.timetable_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
