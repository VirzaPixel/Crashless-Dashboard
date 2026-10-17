import { createClient } from '@supabase/supabase-js';

const rawArgs = process.argv.slice(2);
const activeFlag = rawArgs.includes('--inactive') ? false : true;
const args = rawArgs.filter((a) => !a.startsWith('--'));
const [emailInput, role] = args;
const email = emailInput?.trim().toLowerCase();
const allowedRoles = new Set(['superadmin', 'admin', 'user']);

function readEnv() {
  // Terima dua varian nama env agar fleksibel di shell mana pun.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return { supabaseUrl, serviceRoleKey };
}

async function findUserIdByEmail(admin, email) {
  // 1) Coba lewat tabel user_profiles (kalau ada).
  try {
    const { data: profile, error: profileLookupError } = await admin
      .from('user_profiles')
      .select('id, email')
      .eq('email', email)
      .single();
    if (!profileLookupError && profile?.id) return { id: profile.id, via: 'user_profiles' };
    if (profileLookupError && profileLookupError.code !== 'PGRST116' && !/relation|does not exist|schema cache/i.test(profileLookupError.message || '')) {
      throw profileLookupError;
    }
  } catch (err) {
    if (/relation|does not exist/i.test(err?.message || '')) {
      // Tabel tidak ada — lanjut ke pencarian Auth API.
    } else if (err?.code !== 'PGRST116') {
      throw err;
    }
  }

  // 2) Fallback: cari lewat Auth Admin API (selalu ada).
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = (data?.users || []).find(
      (u) => (u.email || '').toLowerCase() === email,
    );
    if (found) return { id: found.id, via: 'auth-api' };
    if (!data?.users?.length || data.users.length < 200) break;
    page += 1;
    if (page > 50) break;
  }
  return null;
}

if (!email || !allowedRoles.has(role)) {
  console.error('Usage: npm run user:role -- <email> <superadmin|admin|user> [--inactive]');
  process.exitCode = 1;
} else {
  const { supabaseUrl, serviceRoleKey } = readEnv();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this trusted shell.');
    console.error('(SUPABASE_SECRET_KEY juga diterima sebagai pengganti service-role key.)');
    process.exitCode = 1;
  } else {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      const found = await findUserIdByEmail(admin, email);
      if (!found) throw new Error(`User dengan email ${email} tidak ditemukan di Auth maupun user_profiles.`);

      const { data: authData, error: authLookupError } = await admin.auth.admin
        .getUserById(found.id);
      if (authLookupError) throw authLookupError;

      const previousAppMetadata = authData.user.app_metadata ?? {};
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(found.id, {
        app_metadata: { ...previousAppMetadata, role },
        // Pastikan email terkonfirmasi agar AuthGate meloloskan admin.
        email_confirm: true,
      });
      if (authUpdateError) throw authUpdateError;

      // 3) Sinkron ke user_profiles kalau tabelnya ada; kalau tidak ada, lewati.
      try {
        const { data: updatedProfiles, error: profileUpdateError } = await admin
          .from('user_profiles')
          .update({ role, is_active: activeFlag })
          .eq('id', found.id)
          .select('id');
        if (profileUpdateError) {
          if (/relation|does not exist|schema cache/i.test(profileUpdateError.message || '')) {
            console.log('Tabel user_profiles tidak ada — sinkron profil dilewati (tidak masalah).');
          } else {
            throw profileUpdateError;
          }
        } else if (updatedProfiles?.length !== 1) {
          console.log('Baris user_profiles tidak ditemukan — hanya Auth app_metadata yang diperbarui (tidak masalah).');
        } else {
          console.log('user_profiles ikut diperbarui.');
        }
      } catch (profileErr) {
        if (/relation|does not exist|schema cache/i.test(profileErr?.message || '')) {
          console.log('Tabel user_profiles tidak ada — sinkron profil dilewati (tidak masalah).');
        } else {
          // Rollback agar Auth dan profil tidak beda.
          const rollback = await admin.auth.admin.updateUserById(found.id, {
            app_metadata: previousAppMetadata,
          });
          if (rollback.error) {
            throw new Error(
              `Profile role update failed and Auth metadata rollback failed: ${rollback.error.message}`,
              { cause: profileErr ?? rollback.error },
            );
          }
          throw profileErr;
        }
      }

      console.log(`Role ${role} assigned to ${email} in Auth app_metadata (ditemukan via ${found.via}). is_active=${activeFlag}.`);
      console.log('The user must sign out and sign in again to receive the updated role claim.');
    } catch (error) {
      console.error(`Role update failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
