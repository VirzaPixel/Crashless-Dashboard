-- 006: naikkan policy workflow agar superadmin ikut bisa (admin tetap bisa).
-- Jalankan SETELAH 004 & 005. Idempotent.

DROP POLICY IF EXISTS "Verified admins can update repair workflow" ON public.road_damages;
DROP POLICY IF EXISTS "Require admin role for repair workflow updates" ON public.road_damages;
DROP POLICY IF EXISTS "Verified operators can update repair workflow" ON public.road_damages;
DROP POLICY IF EXISTS "Require operator role for repair workflow updates" ON public.road_damages;
CREATE POLICY "Verified operators can update repair workflow" ON public.road_damages
  FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','superadmin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','superadmin'));

CREATE POLICY "Require operator role for repair workflow updates" ON public.road_damages
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','superadmin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','superadmin'));
