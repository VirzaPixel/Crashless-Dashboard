-- SEED: akun super operator / superadmin
-- Email    : crashless@mail.id
-- Password : 123456 (di-hash bcrypt via crypt + gen_salt)
-- Role     : superadmin (app_metadata) + user_profiles tersinkron
--
-- Cara pakai: Supabase Dashboard -> SQL Editor -> New query
-- -> paste seluruh file ini -> RUN.
-- Idempotent: aman dijalankan ulang (update bila email sudah ada).
-- WAJIB: ganti password setelah login pertama!
--
-- Catatan: butuh ekstensi pgcrypto (sudah tersedia di Supabase).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_instance_id uuid;
  v_user_id uuid;
  v_email text := 'crashless@mail.id';
  v_password text := '123456';
  v_meta jsonb := '{"provider":"email","providers":["email"],"role":"superadmin"}';
BEGIN
  -- Instance auth: coba dari user yang sudah ada; kalau belum ada user
  -- sama sekali, pakai UUID nol (default instance tunggal Supabase).
  -- (Tidak baca auth.instances langsung karena role SQL Editor
  --  umumnya tidak punya izin ke tabel itu.)
  SELECT instance_id INTO v_instance_id FROM auth.users LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    -- 1) Buat user Auth baru.
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, created_at, updated_at,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_instance_id, v_user_id, 'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')), now(),
      v_meta, '{}'::jsonb,
      false, now(), now(),
      '', '',
      '', '', '',
      '', '', ''
    );

    -- 2) Identity provider email (wajib agar bisa login).
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_user_id, v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email),
        'email',
        now(), now(), now()
      )
      ON CONFLICT (provider_id, provider) DO UPDATE SET
        last_sign_in_at = now(),
        updated_at = now();
    EXCEPTION
      WHEN undefined_column THEN
        -- Skema legacy auth.identities di mana provider_id belum dipisah dari id:
        INSERT INTO auth.identities (
          id, user_id, identity_data, provider,
          last_sign_in_at, created_at, updated_at
        ) VALUES (
          v_user_id::text, v_user_id,
          jsonb_build_object('sub', v_user_id::text, 'email', v_email),
          'email',
          now(), now(), now()
        )
        ON CONFLICT (id, provider) DO NOTHING;
    END;
  ELSE
    -- User sudah ada: reset password + konfirmasi email + role.
    UPDATE auth.users SET
      encrypted_password = crypt(v_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"superadmin"}'::jsonb,
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      phone_change = COALESCE(phone_change, ''),
      phone_change_token = COALESCE(phone_change_token, ''),
      reauthentication_token = COALESCE(reauthentication_token, ''),
      updated_at = now()
    WHERE id = v_user_id;

    BEGIN
      INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_user_id, v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email),
        'email',
        now(), now(), now()
      )
      ON CONFLICT (provider_id, provider) DO UPDATE SET
        last_sign_in_at = now(),
        updated_at = now();
    EXCEPTION
      WHEN undefined_column THEN
        INSERT INTO auth.identities (
          id, user_id, identity_data, provider,
          last_sign_in_at, created_at, updated_at
        ) VALUES (
          v_user_id::text, v_user_id,
          jsonb_build_object('sub', v_user_id::text, 'email', v_email),
          'email',
          now(), now(), now()
        )
        ON CONFLICT (id, provider) DO NOTHING;
    END;

  -- 3) Cermin profil untuk halaman Kelola Operator.
  -- full_name diisi email (kolom warisan template); kalau skema bersih
  -- tanpa kolom itu, fallback ke insert minimal via blok terpisah.
  BEGIN
    EXECUTE format(
      'INSERT INTO public.user_profiles (id, email, role, is_active, full_name)
       VALUES (%L, %L, ''superadmin'', true, %L)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         role = ''superadmin'',
         is_active = true,
         full_name = COALESCE(NULLIF(public.user_profiles.full_name, ''''), EXCLUDED.email),
         updated_at = now()',
      v_user_id, v_email, v_email
    );
  EXCEPTION
    WHEN undefined_column THEN
      INSERT INTO public.user_profiles (id, email, role, is_active)
      VALUES (v_user_id, v_email, 'superadmin', true)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        role = 'superadmin',
        is_active = true,
        updated_at = now();
  END;
END $$;

-- 4) Verifikasi hasil (muncul di Result).
SELECT
  u.id,
  u.email,
  u.email_confirmed_at IS NOT NULL AS email_terkonfirmasi,
  u.raw_app_meta_data ->> 'role' AS app_role,
  p.role AS profil_role,
  p.is_active AS profil_aktif
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id
WHERE u.email = 'crashless@mail.id';
