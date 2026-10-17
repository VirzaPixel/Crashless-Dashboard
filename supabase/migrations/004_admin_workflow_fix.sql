-- Konsolidasi & perbaikan total workflow RLS (jalankan di Supabase SQL Editor).
-- Menggantikan 001/002/003 yang tumpang-tindih. Aman dijalankan ulang.
--
-- Yang diperbaiki:
-- 1. SELECT policy eksplisit untuk anon + authenticated.
--    Tanpa ini, UPDATE...RETURNING sukses tapi mengembalikan 0 baris.
-- 2. UPDATE policy admin-only yang konsisten.
-- 3. Column-level GRANT lengkap untuk semua kolom workflow.

ALTER TABLE public.road_damages
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS workflow_status text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS fixed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fixed_photo_1 text,
  ADD COLUMN IF NOT EXISTS fixed_photo_2 text,
  ADD COLUMN IF NOT EXISTS fixed_photo_3 text,
  ADD COLUMN IF NOT EXISTS repair_notes text,
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid;

UPDATE public.road_damages
SET workflow_status = CASE
  WHEN lower(coalesce(status, 'pending')) = 'fixed' THEN 'fixed'
  WHEN lower(coalesce(status, 'pending')) = 'in_progress' THEN 'in_progress'
  WHEN lower(coalesce(status, 'pending')) = 'verified' THEN 'verified'
  WHEN lower(coalesce(status, 'pending')) = 'rejected' THEN 'rejected'
  ELSE 'pending'
END
WHERE workflow_status IS NULL
   OR workflow_status NOT IN ('pending', 'in_progress', 'fixed', 'verified', 'rejected');

UPDATE public.road_damages
SET priority = CASE
  WHEN lower(coalesce(severity, '')) = 'high' THEN 'high'
  WHEN lower(coalesce(severity, '')) = 'medium' THEN 'medium'
  ELSE 'low'
END
WHERE priority IS NULL
   OR priority NOT IN ('low', 'medium', 'high', 'critical');

ALTER TABLE public.road_damages
  ALTER COLUMN priority SET DEFAULT 'medium',
  ALTER COLUMN workflow_status SET DEFAULT 'pending';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'road_damages_priority_check' AND conrelid = 'public.road_damages'::regclass) THEN
    ALTER TABLE public.road_damages ADD CONSTRAINT road_damages_priority_check CHECK (priority IN ('low','medium','high','critical'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'road_damages_workflow_status_check' AND conrelid = 'public.road_damages'::regclass) THEN
    ALTER TABLE public.road_damages ADD CONSTRAINT road_damages_workflow_status_check CHECK (workflow_status IN ('pending','in_progress','fixed','verified','rejected'));
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated operators can update repair workflow" ON public.road_damages;
DROP POLICY IF EXISTS "Verified operators can update repair workflow" ON public.road_damages;
DROP POLICY IF EXISTS "Require operator role for repair workflow updates" ON public.road_damages;
DROP POLICY IF EXISTS "Verified admins can update repair workflow" ON public.road_damages;
DROP POLICY IF EXISTS "Require admin role for repair workflow updates" ON public.road_damages;
DROP POLICY IF EXISTS "Public can read road damages" ON public.road_damages;
DROP POLICY IF EXISTS "Authenticated can read road damages" ON public.road_damages;
DROP POLICY IF EXISTS "Admins can read road damages" ON public.road_damages;

CREATE POLICY "Public can read road damages" ON public.road_damages FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Verified admins can update repair workflow" ON public.road_damages FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Require admin role for repair workflow updates" ON public.road_damages AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

REVOKE UPDATE ON public.road_damages FROM anon, public;
REVOKE UPDATE ON public.road_damages FROM authenticated;
GRANT SELECT ON public.road_damages TO anon, authenticated;
GRANT UPDATE (workflow_status, status, priority, due_at, fixed_at, fixed_photo_1, fixed_photo_2, fixed_photo_3, repair_notes, verification_notes, verified_at, verified_by) ON public.road_damages TO authenticated;
ALTER TABLE public.road_damages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_road_damage_due_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.due_at IS NULL THEN
    NEW.due_at := now() + CASE NEW.priority WHEN 'critical' THEN interval '1 day' WHEN 'high' THEN interval '3 days' WHEN 'medium' THEN interval '7 days' ELSE interval '14 days' END;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS road_damages_set_due_at ON public.road_damages;
CREATE TRIGGER road_damages_set_due_at BEFORE INSERT OR UPDATE OF priority, due_at ON public.road_damages FOR EACH ROW EXECUTE FUNCTION public.set_road_damage_due_at();

UPDATE public.road_damages SET due_at = created_at + CASE priority WHEN 'critical' THEN interval '1 day' WHEN 'high' THEN interval '3 days' WHEN 'medium' THEN interval '7 days' ELSE interval '14 days' END WHERE due_at IS NULL;

CREATE INDEX IF NOT EXISTS road_damages_workflow_queue_idx ON public.road_damages (workflow_status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS road_damages_due_at_idx ON public.road_damages (due_at);
