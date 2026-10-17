import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthGate } from './components/auth/AuthGate';
import { ThemeProvider } from './components/common/ThemeContext';
import { LanguageProvider } from './components/common/LanguageContext';
import { Dashboard } from './pages/Dashboard';
import { DamageDetail } from './pages/DamageDetail';
import { Operators } from './pages/Operators';
import { useRole, isSuperadmin } from './lib/roles';
import { supabaseConfigError } from './lib/supabase';
import './styles/index.css';

function NotFound() {
  const navigate = useNavigate();
  const { role } = useRole();
  return (
    <main className="route-not-found">
      <p className="config-error-kicker">Crashless · Operasional jalan</p>
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat ini tidak mengarah ke halaman yang tersedia.</p>
      <button type="button" onClick={() => navigate(isSuperadmin(role) ? '/operators' : '/')}>
        Kembali
      </button>
    </main>
  );
}

/** Hanya untuk operator biasa (admin). Superadmin diarahkan ke /operators. */
function OperatorRoute({ children }) {
  const { role } = useRole();
  if (role === null) return null; // masih loading
  if (isSuperadmin(role)) return <Navigate to="/operators" replace />;
  return children;
}

/** Hanya untuk superadmin. Operator biasa diarahkan ke /. */
function SuperadminRoute({ children }) {
  const { role } = useRole();
  if (role === null) return null; // masih loading
  if (!isSuperadmin(role)) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        {supabaseConfigError ? (
          <main className="config-error" role="alert">
            <p className="config-error-kicker">Crashless · Operasional jalan</p>
            <h1>Sistem Belum Siap Digunakan</h1>
            <p>{supabaseConfigError}</p>
            <p className="config-error-help">Segera hubungi administrator sistem untuk menyelesaikan konfigurasi.</p>
          </main>
        ) : (
          <BrowserRouter>
            <AuthGate>
              <Routes>
                <Route path="/" element={<OperatorRoute><Dashboard /></OperatorRoute>} />
                <Route path="/damage/:id" element={<OperatorRoute><DamageDetail /></OperatorRoute>} />
                <Route path="/operators" element={<SuperadminRoute><Operators /></SuperadminRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthGate>
          </BrowserRouter>
        )}
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
