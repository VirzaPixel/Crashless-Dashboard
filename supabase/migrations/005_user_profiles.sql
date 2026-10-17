-- 005: tabel cermin user + role (superadmin/admin/user).
-- Sumber kebenaran role tetap auth.users.app_metadata.role (dibaca RLS via JWT).
-- Tabel ini dipakai halaman Kelola Operator untuk listing & tampilan.
-- Jalankan di Supabase SQL Editor. Idempotent.
--
-- CATATAN: beberapa project Supabase (template bootstrap) sudah punya
-- tabel public.user_profiles dengan kolom tambahan seperti full_name,
-- username, dan avatar_url yang NOT NULL. Blok DO di bawah menyesuaikan:
-- tambah kolom yang kurang + lunakkan NOT NULL yang tidak dipakai web.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin','admin','user')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Samakan kolom bila tabel warisan template sudah ada duluan.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_active boolean;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$
BEGIN
  -- Kolom warisan template yang tidak dipakai web: boleh NULL + default aman.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'user_profiles'
               AND column_name = 'full_name') THEN
    ALTER TABLE public.user_profiles ALTER COLUMN full_name DROP NOT NULL;
    ALTER TABLE public.user_profiles ALTER COLUMN full_name SET DEFAULT '';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'user_profiles'
               AND column_name = 'username') THEN
    ALTER TABLE public.user_profiles ALTER COLUMN username DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'user_profiles'
               AND column_name = 'avatar_url') THEN
    ALTER TABLE public.user_profiles ALTER COLUMN avatar_url DROP NOT NULL;
  END IF;

  -- Pastikan kolom inti sesuai kebutuhan web.
  ALTER TABLE public.user_profiles ALTER COLUMN email SET NOT NULL;
  ALTER TABLE public.user_profiles ALTER COLUMN role SET NOT NULL;
  ALTER TABLE public.user_profiles ALTER COLUMN role SET DEFAULT 'user';
  ALTER TABLE public.user_profiles ALTER COLUMN is_active SET NOT NULL;
  ALTER TABLE public.user_profiles ALTER COLUMN is_active SET DEFAULT true;

  -- Batasi CHECK role ke 3 nilai web (ganti bila template punya CHECK lain).
  ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
  ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('superadmin','admin','user'));
END $$;

CREATE INDEX IF NOT EXISTS user_profiles_role_idx ON public.user_profiles (role);
CREATE INDEX IF NOT EXISTS user_profiles_email_idx ON public.user_profiles (email);

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- full_name diisi email bila kolom warisan template masih ada (NOT NULL
  -- sudah dilonggarkan di atas, tapi isi sekalian agar data rapi).
  INSERT INTO public.user_profiles (id, email, role, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_app_meta_data ->> 'role', 'user'), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN undefined_column THEN
    -- Tabel tanpa kolom full_name (skema bersih versi web): insert minimal.
    INSERT INTO public.user_profiles (id, email, role)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_app_meta_data ->> 'role', 'user'))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill: user Auth yang sudah ada tapi belum punya baris profil.
INSERT INTO public.user_profiles (id, email, role)
SELECT u.id, u.email, COALESCE(u.raw_app_meta_data ->> 'role', 'user')
FROM auth.users u LEFT JOIN public.user_profiles p ON p.id = u.id
WHERE p.id IS NULL;

CREATE OR REPLACE FUNCTION public.touch_user_profile_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS user_profiles_touch_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_touch_updated_at
  BEFORE UPDATE ON public.user_profiles FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_profile_updated_at();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operators can read profiles" ON public.user_profiles;
CREATE POLICY "Operators can read profiles" ON public.user_profiles
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','superadmin'));

DROP POLICY IF EXISTS "Superadmins manage profiles" ON public.user_profiles;
CREATE POLICY "Superadmins manage profiles" ON public.user_profiles
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin');

REVOKE ALL ON public.user_profiles FROM anon, public;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT INSERT, UPDATE ON public.user_profiles TO authenticated;
