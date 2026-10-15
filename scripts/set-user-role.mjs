import { createClient } from '@supabase/supabase-js';

const [emailInput, role] = process.argv.slice(2);
const email = emailInput?.trim().toLowerCase();
const allowedRoles = new Set(['user', 'admin']);

if (!email || !allowedRoles.has(role)) {
  console.error('Usage: npm run user:role -- <email> <user|admin>');
  process.exitCode = 1;
} else {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this trusted shell.');
    process.exitCode = 1;
  } else {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      const { data: profile, error: profileLookupError } = await admin
        .from('user_profiles')
        .select('id, email')
        .eq('email', email)
        .single();
      if (profileLookupError) throw profileLookupError;

      const { data: authData, error: authLookupError } = await admin.auth.admin
        .getUserById(profile.id);
      if (authLookupError) throw authLookupError;

      const previousAppMetadata = authData.user.app_metadata ?? {};
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(profile.id, {
        app_metadata: { ...previousAppMetadata, role },
      });
      if (authUpdateError) throw authUpdateError;

      const { data: updatedProfiles, error: profileUpdateError } = await admin
        .from('user_profiles')
        .update({ role })
        .eq('id', profile.id)
        .select('id');
      if (profileUpdateError || updatedProfiles?.length !== 1) {
        const rollback = await admin.auth.admin.updateUserById(profile.id, {
          app_metadata: previousAppMetadata,
        });
        if (rollback.error) {
          throw new Error(
            `Profile role update failed and Auth metadata rollback failed: ${rollback.error.message}`,
            { cause: profileUpdateError ?? rollback.error },
          );
        }
        throw profileUpdateError ?? new Error('Profile row was not updated; Auth metadata was rolled back.');
      }

      console.log(`Role ${role} assigned to ${email} in Auth and user_profiles.`);
      console.log('The user must sign out and sign in again to receive the updated role claim.');
    } catch (error) {
      console.error(`Role update failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
