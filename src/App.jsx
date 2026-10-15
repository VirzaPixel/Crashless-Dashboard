import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthGate } from './components/auth/AuthGate';
import { ThemeProvider } from './components/common/ThemeContext';
import { ThemeToggle } from './components/common/ThemeToggle';
import { Dashboard } from './pages/Dashboard';
import { DamageDetail } from './pages/DamageDetail';
import { supabaseConfigError } from './lib/supabase';
import './styles/index.css';

function NotFound() {
  const navigate = useNavigate();
  return (
    <main className="route-not-found">
      <p className="config-error-kicker">Crashless · Operasional jalan</p>
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat ini tidak mengarah ke laporan yang tersedia.</p>
      <button type="button" onClick={() => navigate('/')}>Kembali ke antrean</button>
    </main>
  );
}

function App() {
  return (
    <ThemeProvider>
      {supabaseConfigError ? (
        <main className="config-error" role="alert">
          <p className="config-error-kicker">Crashless · Operasional jalan</p>
          <h1>Supabase perlu dikonfigurasi</h1>
          <p>{supabaseConfigError}</p>
          <p className="config-error-help">Perbarui file .env, lalu mulai ulang server web.</p>
        </main>
      ) : (
        <AuthGate>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/damage/:id" element={<DamageDetail />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthGate>
      )}
      <ThemeToggle />
    </ThemeProvider>
  );
}

export default App;
