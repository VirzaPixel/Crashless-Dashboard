-- 007: Manajemen Operator oleh Superadmin (Create & Delete)
-- Idempotent, dapat dijalankan berulang.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Fungsi Tambah Operator Baru langsung dari UI
CREATE OR REPLACE FUNCTION public.create_operator_by_superadmin(
  new_email text,
  new_password text,
  new_role text DEFAULT 'admin'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_role text;
  v_instance_id uuid;
  v_user_id uuid;
  clean_email text;
  v_meta jsonb;
BEGIN
  caller_role := (auth.jwt() -> 'app_metadata' ->> 'role');

  -- Validasi pemanggil harus superadmin
  IF caller_role IS NULL OR caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya super operator yang berwenang menambahkan akun.';
  END IF;

  -- Validasi role yang diberikan
  IF new_role NOT IN ('superadmin', 'admin', 'user') THEN
    RAISE EXCEPTION 'Peran tidak valid. Pilih superadmin, admin, atau user.';
  END IF;

  clean_email := lower(trim(new_email));
  IF clean_email = '' OR clean_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'Format alamat email tidak valid.';
  END IF;

  IF length(new_password) < 6 THEN
    RAISE EXCEPTION 'Kata sandi minimal terdiri dari 6 karakter.';
  END IF;

  -- Cek apakah email sudah terdaftar
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = clean_email) THEN
    RAISE EXCEPTION 'Alamat email % sudah terdaftar dalam sistem.', clean_email;
  END IF;

  SELECT instance_id INTO v_instance_id FROM auth.users LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  v_user_id := gen_random_uuid();
  v_meta := jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', new_role);

  -- Insert ke auth.users dengan token terinisialisasi bersih
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    v_instance_id, v_user_id, 'authenticated', 'authenticated', clean_email,
    crypt(new_password, gen_salt('bf')), now(),
    v_meta, '{}'::jsonb,
    false, now(), now(),
    '', '',
    '', '', '',
    '', '', ''
  );

  -- Insert ke auth.identities
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', clean_email),
    'email',
    now(), now(), now()
  )
  ON CONFLICT (provider_id, provider) DO UPDATE SET updated_at = now();

  -- Cermin profil ke public.user_profiles
  INSERT INTO public.user_profiles (id, email, role, is_active)
  VALUES (v_user_id, clean_email, new_role, true)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    is_active = true,
    updated_at = now();

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_operator_by_superadmin(text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_operator_by_superadmin(text, text, text) TO authenticated;

-- 2. Fungsi Hapus Operator oleh Superadmin
CREATE OR REPLACE FUNCTION public.delete_user_by_superadmin(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_role text;
  caller_id uuid;
  target_role text;
  superadmin_count int;
BEGIN
  caller_id := auth.uid();
  caller_role := (auth.jwt() -> 'app_metadata' ->> 'role');

  -- Validasi pemanggil harus superadmin
  IF caller_role IS NULL OR caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya super operator yang berwenang menghapus akun.';
  END IF;

  -- Tidak boleh menghapus akun sendiri
  IF caller_id = target_user_id THEN
    RAISE EXCEPTION 'Tidak dapat menghapus akun yang sedang digunakan.';
  END IF;

  -- Cek target role & sisa superadmin
  SELECT role INTO target_role FROM public.user_profiles WHERE id = target_user_id;
  IF target_role = 'superadmin' THEN
    SELECT count(*) INTO superadmin_count
    FROM public.user_profiles
    WHERE role = 'superadmin' AND is_active = true;

    IF superadmin_count <= 1 THEN
      RAISE EXCEPTION 'Operasi dibatalkan: Sistem mewajibkan minimal 1 super operator aktif.';
    END IF;
  END IF;

  -- Hapus dari user_profiles & auth.users secara cascading
  DELETE FROM public.user_profiles WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_by_superadmin(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_user_by_superadmin(uuid) TO authenticated;
