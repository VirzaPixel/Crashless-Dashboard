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
  ? 'Konfigurasi koneksi layanan belum lengkap. Hubungi administrator sistem untuk memperbarui konfigurasi.'
  : isPrivilegedKey(supabaseAnonKey)
    ? 'Konfigurasi kunci akses tidak aman untuk aplikasi web. Hubungi administrator sistem untuk memperbaikinya.'
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
