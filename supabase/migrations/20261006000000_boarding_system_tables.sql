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
