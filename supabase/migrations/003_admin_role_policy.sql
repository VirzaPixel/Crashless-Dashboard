-- Move workflow access from the legacy operator claim to the admin claim.
DROP POLICY IF EXISTS "Authenticated operators can update repair workflow"
  ON public.road_damages;
DROP POLICY IF EXISTS "Verified operators can update repair workflow"
  ON public.road_damages;
DROP POLICY IF EXISTS "Require operator role for repair workflow updates"
  ON public.road_damages;
DROP POLICY IF EXISTS "Verified admins can update repair workflow"
  ON public.road_damages;
DROP POLICY IF EXISTS "Require admin role for repair workflow updates"
  ON public.road_damages;

CREATE POLICY "Verified admins can update repair workflow"
  ON public.road_damages
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- A restrictive policy is ANDed with every permissive UPDATE policy.
CREATE POLICY "Require admin role for repair workflow updates"
  ON public.road_damages
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

REVOKE UPDATE ON public.road_damages FROM anon, public;
REVOKE UPDATE ON public.road_damages FROM authenticated;
GRANT UPDATE (
  workflow_status,
  status,
  fixed_at,
  fixed_photo_1,
  fixed_photo_2,
  fixed_photo_3,
  repair_notes,
  verification_notes,
  verified_at,
  verified_by
) ON public.road_damages TO authenticated;
ALTER TABLE public.road_damages ENABLE ROW LEVEL SECURITY;
