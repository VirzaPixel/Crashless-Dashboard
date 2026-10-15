import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function isPrivilegedKey(key) {
  if (key.startsWith('sb_secret_')) return true;

  try {
    const payload = key.split('.')[1];
    if (!payload) return false;
    const normalizedPayload = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(atob(normalizedPayload)).role === 'service_role';
  } catch {
    return false;
  }
}

export const supabaseConfigError = !supabaseUrl || !supabaseAnonKey
  ? 'Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY dengan URL project dan anon/publishable key.'
  : isPrivilegedKey(supabaseAnonKey)
    ? 'VITE_SUPABASE_ANON_KEY berisi secret/service-role key. Gunakan anon/publishable key; key berhak istimewa tidak boleh digunakan di browser.'
    : null;

export const supabaseAuthStorageKey = 'crashless-operator-session';

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: supabaseAuthStorageKey,
        storage: typeof window === 'undefined' ? undefined : window.sessionStorage,
      },
    });
