-- 008: Pembaruan peran operator oleh Super Operator (satu RPC, propagasi ke Auth)
-- Idempotent, dapat dijalankan berulang.

-- Fungsi memperbarui peran di user_profiles DAN raw_app_meta_data auth.users
-- sehingga perubahan berlaku setelah token pengguna diperbarui (≤1 jam).
CREATE OR REPLACE FUNCTION public.update_user_role_by_superadmin(
  target_user_id uuid,
  new_role        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_role      text;
  caller_id        uuid;
  current_role     text;
  superadmin_count int;
BEGIN
  caller_id   := auth.uid();
  caller_role := (auth.jwt() -> 'app_metadata' ->> 'role');

  -- Hanya Super Operator yang dapat mengubah peran.
  IF caller_role IS NULL OR caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Super Operator yang berwenang mengubah peran akun.';
  END IF;

  -- Validasi nilai peran baru.
  IF new_role NOT IN ('superadmin', 'admin', 'user') THEN
    RAISE EXCEPTION 'Peran tidak valid. Pilih salah satu: superadmin, admin, atau user.';
  END IF;

  -- Tidak dapat menurunkan peran akun sendiri.
  IF caller_id = target_user_id AND new_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Peran akun yang sedang aktif tidak dapat diturunkan.';
  END IF;

  -- Pastikan minimal satu Super Operator aktif tersisa setelah perubahan.
  SELECT role INTO current_role
  FROM public.user_profiles
  WHERE id = target_user_id;

  IF current_role = 'superadmin' AND new_role <> 'superadmin' THEN
    SELECT count(*) INTO superadmin_count
    FROM public.user_profiles
    WHERE role = 'superadmin' AND is_active = true;

    IF superadmin_count <= 1 THEN
      RAISE EXCEPTION 'Operasi dibatalkan: sistem mewajibkan minimal satu Super Operator aktif.';
    END IF;
  END IF;

  -- 1. Perbarui tabel cermin.
  UPDATE public.user_profiles
  SET role = new_role, updated_at = now()
  WHERE id = target_user_id;

  -- 2. Propagasi ke raw_app_meta_data agar berlaku saat token diperbarui.
  UPDATE auth.users
  SET
    raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', new_role),
    updated_at        = now()
  WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_role_by_superadmin(uuid, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.update_user_role_by_superadmin(uuid, text) TO authenticated;
