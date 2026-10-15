import { useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole, MapPinned } from 'lucide-react';
import { supabase, supabaseAuthStorageKey } from '../../lib/supabase';
import './AuthGate.css';

const INVALID_ACCESS_MESSAGE = 'Email, kata sandi, atau akses admin tidak valid.';

const ACCESS_DENIED_MESSAGE = 'Akun berhasil masuk, tetapi akses admin belum terbaca. Pastikan role "admin" ada di app_metadata akun Supabase Auth, lalu keluar dan masuk kembali.';

function clearStoredBrowserSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(supabaseAuthStorageKey);
  window.sessionStorage.removeItem(`${supabaseAuthStorageKey}-code-verifier`);
}

function hasAdminAccess(session) {
  return Boolean(
    session?.user?.email_confirmed_at &&
    session.user.app_metadata?.role === 'admin',
  );
}

export function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (nextSession && !hasAdminAccess(nextSession)) {
        clearStoredBrowserSession();
        setSession(null);
        setError(ACCESS_DENIED_MESSAGE);
        if (event !== 'SIGNED_IN') {
          window.setTimeout(() => {
            void supabase.auth.signOut({ scope: 'local' });
          }, 0);
        }
      } else {
        setSession(nextSession);
      }
      setLoading(false);
    });

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
      if (!hasAdminAccess(data.session)) {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Clear the tab-local session below even when logout fails.
        }
        clearBrowserSession();
        setError(ACCESS_DENIED_MESSAGE);
        return;
      }
    } catch {
      clearBrowserSession();
      setError(INVALID_ACCESS_MESSAGE);
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
    }

    setError(revokeFailed
      ? 'Sesi browser sudah dihapus, tetapi server belum mengonfirmasi logout. Periksa koneksi sebelum meninggalkan perangkat.'
      : '');
  };

  if (loading) {
    return (
      <main className="auth-state" aria-live="polite">
        <span className="auth-loader" aria-hidden="true" />
        <p>Memverifikasi akses admin</p>
      </main>
    );
  }


  if (!hasAdminAccess(session)) {
    return (
      <main className="auth-page">
        <section className="auth-intro" aria-labelledby="auth-intro-title">
          <div className="auth-brand">
            <span className="auth-brand-mark"><MapPinned size={19} strokeWidth={1.8} /></span>
            <span>CRASHLESS<small>OPERASIONAL JALAN</small></span>
          </div>
          <div className="auth-intro-copy">
            <p className="auth-eyebrow">Admin jalan</p>
            <h1 id="auth-intro-title">Laporan masuk, perbaikan tercatat.</h1>
            <p>Urutkan laporan berdasarkan prioritas dan tenggat, lalu catat bukti setiap perbaikan.</p>
          </div>
          <div className="auth-access-note">
            <LockKeyhole size={17} strokeWidth={1.8} />
            <span>Akses terbatas untuk admin terdaftar</span>
          </div>
        </section>

        <section className="auth-form-section" aria-labelledby="auth-title">
          <form className="auth-card" onSubmit={handleSignIn}>
            <div className="auth-form-heading">
              <p className="auth-eyebrow">Masuk</p>
              <h2 id="auth-title">Masuk admin</h2>
              <p>Gunakan akun admin yang sudah aktif.</p>
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
              <span>{submitting ? 'Memeriksa akses...' : 'Masuk sebagai admin'}</span>
              {!submitting && <ArrowRight size={17} strokeWidth={1.8} />}
            </button>
            <p className="auth-security-note">
              Hanya akun admin terverifikasi yang bisa masuk.
            </p>
          </form>
          <p className="auth-footer">Crashless <span>·</span> Pemantauan kerusakan jalan</p>
        </section>
      </main>
    );
  }

  return (
    <>
      {error && <p className="auth-session-error" role="alert">{error}</p>}
      <div className="auth-session-bar">
        <span className="auth-session-user">{session.user.email}</span>
        <button type="button" onClick={handleSignOut}>Keluar</button>
      </div>
      {children}
    </>
  );
}


