import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, MapPinned } from 'lucide-react';
import { supabase, supabaseAuthStorageKey } from '../../lib/supabase';
import { RoleContext, canAccessDashboard, getSessionRole } from '../../lib/roles';
import './AuthGate.css';

const INVALID_ACCESS_MESSAGE = 'Email, kata sandi, atau hak akses tidak valid.';

const ACCESS_DENIED_MESSAGE = 'Akun ini tidak memiliki hak akses dashboard operator. Hubungi Super Operator untuk mengatur peran akses akun Anda.';

const INACTIVE_MESSAGE = 'Akun ini telah dinonaktifkan. Hubungi Super Operator untuk mengaktifkan kembali akun Anda.';

function clearStoredBrowserSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(supabaseAuthStorageKey);
  window.sessionStorage.removeItem(`${supabaseAuthStorageKey}-code-verifier`);
}

async function fetchProfileActive(userId) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('is_active')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    return data?.is_active ?? null;
  } catch {
    return null;
  }
}

function hasOperatorAccess(session) {
  return Boolean(
    session?.user?.email_confirmed_at &&
    canAccessDashboard(getSessionRole(session)),
  );
}

export function AuthGate({ children }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const guardSession = async (event, nextSession) => {
      if (!mounted) return;
      if (nextSession && !hasOperatorAccess(nextSession)) {
        clearStoredBrowserSession();
        setSession(null);
        setError(ACCESS_DENIED_MESSAGE);
        if (event !== 'SIGNED_IN') {
          window.setTimeout(() => {
            void supabase.auth.signOut({ scope: 'local' });
          }, 0);
        }
      } else if (nextSession) {
        const active = await fetchProfileActive(nextSession.user.id);
        if (!mounted) return;
        if (active === false) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            // Lanjut bersihkan sesi lokal di bawah.
          }
          clearStoredBrowserSession();
          setSession(null);
          setError(INACTIVE_MESSAGE);
        } else {
          setSession(nextSession);
        }
      } else {
        // Sesi berakhir atau logout — kembali ke root agar URL bersih.
        if (event === 'SIGNED_OUT') navigate('/', { replace: true });
        setSession(nextSession);
      }
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(guardSession);

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearBrowserSession = () => {
    window.sessionStorage.removeItem(supabaseAuthStorageKey);
    window.sessionStorage.removeItem(`${supabaseAuthStorageKey}-code-verifier`);
    setSession(null);
  };

  const handleSignIn = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError('');
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      if (!hasOperatorAccess(data.session)) {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Clear the tab-local session below even when logout fails.
        }
        clearBrowserSession();
        setError(ACCESS_DENIED_MESSAGE);
        return;
      }
      const active = await fetchProfileActive(data.session.user.id);
      if (active === false) {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Clear the tab-local session below even when logout fails.
        }
        clearBrowserSession();
        setError(INACTIVE_MESSAGE);
        return;
      }
    } catch (err) {
      clearBrowserSession();
      const raw = err?.message || '';
      if (/invalid login credentials/i.test(raw)) {
        setError('Email atau kata sandi tidak sesuai. Periksa kembali data yang Anda masukkan.');
      } else if (/email not confirmed/i.test(raw)) {
        setError('Email belum dikonfirmasi. Periksa kotak masuk email Anda atau hubungi Super Operator.');
      } else if (/rate limit|too many/i.test(raw)) {
        setError('Terlalu banyak percobaan masuk. Silakan coba kembali beberapa saat lagi.');
      } else if (/fetch|network|failed to fetch/i.test(raw)) {
        setError('Tidak dapat terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.');
      } else {
        setError(INVALID_ACCESS_MESSAGE);
      }
    } finally {
      setPassword('');
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    let revokeFailed;
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      revokeFailed = Boolean(signOutError);
    } catch {
      revokeFailed = true;
    } finally {
      clearBrowserSession();
      navigate('/', { replace: true });
    }

    setError(revokeFailed
      ? 'Sesi browser sudah dihapus, tetapi server belum mengonfirmasi logout. Periksa koneksi sebelum meninggalkan perangkat.'
      : '');
  };

  if (loading) {
    return (
      <main className="auth-state" aria-live="polite">
        <span className="auth-loader" aria-hidden="true" />
        <p>Memverifikasi akses operator</p>
      </main>
    );
  }


  if (!hasOperatorAccess(session)) {
    return (
      <main className="auth-page">
        <section className="auth-intro" aria-labelledby="auth-intro-title">
          <div className="auth-brand">
            <span className="auth-brand-mark"><MapPinned size={19} strokeWidth={1.8} /></span>
            <span>CRASHLESS<small>OPERASIONAL JALAN</small></span>
          </div>
          <div className="auth-intro-copy">
            <p className="auth-eyebrow">Operator jalan</p>
            <h1 id="auth-intro-title">Laporan masuk, perbaikan tercatat.</h1>
            <p>Urutkan laporan berdasarkan prioritas dan tenggat, lalu catat bukti setiap perbaikan.</p>
          </div>
          <div className="auth-access-note">
            <LockKeyhole size={17} strokeWidth={1.8} />
            <span>Akses terbatas untuk operator terdaftar</span>
          </div>
        </section>

        <section className="auth-form-section" aria-labelledby="auth-title">
          <form className="auth-card" onSubmit={handleSignIn}>
            <div className="auth-form-heading">
              <p className="auth-eyebrow">Masuk</p>
              <h2 id="auth-title">Masuk operator</h2>
              <p>Gunakan akun operator atau super operator yang sudah aktif.</p>
            </div>

            <label htmlFor="operator-email">Email</label>
            <input
              id="operator-email"
              placeholder="nama@contoh.com"
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck="false"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <label htmlFor="operator-password">Kata sandi</label>
            <input
              id="operator-password"
              type="password"
              placeholder="Masukkan kata sandi"
              autoComplete="current-password"
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button className="auth-submit-button" type="submit" disabled={submitting}>
              <span>{submitting ? 'Memeriksa akses...' : 'Masuk'}</span>
              {!submitting && <ArrowRight size={17} strokeWidth={1.8} />}
            </button>
            <p className="auth-security-note">
              Hanya akun operator terverifikasi yang bisa masuk.
            </p>
          </form>
          <p className="auth-footer">Crashless <span>·</span> Pemantauan kerusakan jalan</p>
        </section>
      </main>
    );
  }

  return (
    <RoleContext.Provider value={{ role: getSessionRole(session), session }}>
      {error && <p className="auth-session-error" role="alert">{error}</p>}
      <div className="auth-session-bar">
        <span className="auth-session-role">{getRoleLabelFallback(getSessionRole(session))}</span>
        <span className="auth-session-user">{session.user.email}</span>
        <button type="button" onClick={handleSignOut}>Keluar</button>
      </div>
      {children}
    </RoleContext.Provider>
  );
}

function getRoleLabelFallback(role) {
  if (role === 'superadmin') return 'Super Operator';
  if (role === 'admin') return 'Operator';
  return 'Operator';
}

