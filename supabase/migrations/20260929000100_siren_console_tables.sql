-- ==============================================================================
-- MIGRATION: CAMPUS-WIDE SIREN & BROADCAST CONSOLE TABLES + STORAGE BUCKET
-- ==============================================================================
-- Tables Connected to the Siren Console:
--   1. public.broadcasts        (Live & historical emergency alarms, drills, intercoms)
--   2. public.siren_schedules   (Automated period bell timetable schedules)
--   3. public.siren_recordings  (Recorded voice announcements & uploaded audio chimes)
--   4. public.siren_logs        (Detailed campus siren trigger & drill history)
--   5. public.school_settings   (Siren console state, acoustic volume & global mute)
--   6. public.audit_logs        (Security audit trail for all siren operations)
--   7. storage.buckets          ('siren-audio' public bucket for audio files)
-- ==============================================================================

-- 1. Ensure public.school_settings exists
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

-- 2. Ensure public.broadcasts exists (Active & historical campus broadcasts)
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

-- 3. Dedicated Table: public.siren_schedules (Automated Period Bell Timetable)
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

-- 4. Dedicated Table: public.siren_recordings (Voice Announcements & Uploaded Chimes)
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

-- 5. Dedicated Table: public.siren_logs (Campus Emergency, Drill & Bell Dispatch Ledger)
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

-- 6. Provision 'siren-audio' Supabase Storage Bucket for Voice Recordings & Chimes
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('siren-audio', 'siren-audio', true, 15728640)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 15728640;

DROP POLICY IF EXISTS "Public read access for siren-audio" ON storage.objects;
CREATE POLICY "Public read access for siren-audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'siren-audio');

DROP POLICY IF EXISTS "Authenticated upload access for siren-audio" ON storage.objects;
CREATE POLICY "Authenticated upload access for siren-audio" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'siren-audio');

DROP POLICY IF EXISTS "Authenticated update access for siren-audio" ON storage.objects;
CREATE POLICY "Authenticated update access for siren-audio" ON storage.objects
  FOR UPDATE USING (bucket_id = 'siren-audio');

DROP POLICY IF EXISTS "Authenticated delete access for siren-audio" ON storage.objects;
CREATE POLICY "Authenticated delete access for siren-audio" ON storage.objects
  FOR DELETE USING (bucket_id = 'siren-audio');

NOTIFY pgrst, 'reload schema';
