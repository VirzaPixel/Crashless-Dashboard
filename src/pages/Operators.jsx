import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShieldCheck, UserCog, UserX, UserCheck, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { useOperators } from '../hooks/useOperators';
import { useRole, getRoleLabel, isSuperadmin } from '../lib/roles';
import { Modal } from '../components/common/Modal';
import toast, { Toaster } from 'react-hot-toast';
import './Operators.css';

const ROLE_OPTIONS = [
  { value: 'superadmin', label: 'Super Operator' },
  { value: 'admin', label: 'Operator' },
  { value: 'user', label: 'User Mobile' },
];

const MIN_SUPERADMIN_WARNING =
  'Sistem mewajibkan minimal satu Super Operator yang aktif.';

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID');
}

function CreateAccountForm({ onClose, onCreate, submitting }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onCreate(email.trim(), password, role);
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title="Tambah Akun Baru">
      <form className="create-account-form" onSubmit={handleSubmit}>
        <p className="create-account-desc">
          Daftarkan akun operator atau pengguna baru beserta peran aksesnya.
        </p>

        <label htmlFor="new-account-email">Alamat email</label>
        <input
          id="new-account-email"
          type="email"
          autoComplete="off"
          inputMode="email"
          autoCapitalize="none"
          spellCheck="false"
          placeholder="nama@contoh.com"
          maxLength={254}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="new-account-password">Kata sandi</label>
        <input
          id="new-account-password"
          type="password"
          autoComplete="new-password"
          placeholder="Minimal 6 karakter"
          minLength={6}
          maxLength={128}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <label htmlFor="new-account-role">Peran akses</label>
        <select
          id="new-account-role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <div className="create-account-actions">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={submitting}>
            Batal
          </button>
          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? 'Mendaftarkan...' : 'Daftarkan Akun'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Operators() {
  const navigate = useNavigate();
  const { role, session } = useRole();
  const {
    operators,
    loading,
    error,
    fetchOperators,
    updateRole,
    setActive,
    deleteOperator,
    createOperator,
  } = useOperators();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actingId, setActingId] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const allowed = isSuperadmin(role);

  useEffect(() => {
    if (role && !allowed) {
      toast.error('Halaman ini hanya dapat diakses oleh Super Operator.');
      navigate('/', { replace: true });
    }
  }, [role, allowed, navigate]);

  useEffect(() => {
    if (allowed) void fetchOperators();
  }, [allowed, fetchOperators]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return operators.filter((op) => {
      const matchQ = !q || (op.email || '').toLowerCase().includes(q);
      const matchRole = filterRole === 'all' || op.role === filterRole;
      const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? op.is_active : !op.is_active);
      return matchQ && matchRole && matchStatus;
    });
  }, [operators, search, filterRole, filterStatus]);

  const superadminCount = useMemo(
    () => operators.filter((op) => op.role === 'superadmin' && op.is_active).length,
    [operators],
  );

  const handleRoleChange = async (op, nextRole) => {
    if (op.role === nextRole) return;
    if (op.role === 'superadmin' && nextRole !== 'superadmin' && superadminCount <= 1) {
      toast.error(MIN_SUPERADMIN_WARNING);
      return;
    }
    setActingId(op.id);
    try {
      await updateRole(op.id, nextRole, session?.user?.id);
      toast.success(`Peran ${op.email} diubah menjadi ${getRoleLabel(nextRole)}.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActingId(null);
    }
  };

  const handleToggleActive = async (op) => {
    if (op.role === 'superadmin' && op.is_active && superadminCount <= 1) {
      toast.error(MIN_SUPERADMIN_WARNING);
      return;
    }
    setActingId(op.id);
    try {
      await setActive(op.id, !op.is_active, session?.user?.id);
      toast.success(op.is_active ? `Akun ${op.email} dinonaktifkan.` : `Akun ${op.email} diaktifkan kembali.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (op) => {
    if (op.id === session?.user?.id) {
      toast.error('Akun yang sedang digunakan tidak dapat dihapus.');
      return;
    }
    if (op.role === 'superadmin' && superadminCount <= 1) {
      toast.error(MIN_SUPERADMIN_WARNING);
      return;
    }
    const confirmed = window.confirm(
      `Hapus permanen akun ${op.email}? Seluruh data akses akun ini akan ikut terhapus.`,
    );
    if (!confirmed) return;

    setActingId(op.id);
    try {
      await deleteOperator(op.id, session?.user?.id);
      toast.success(`Akun ${op.email} telah dihapus.`);
    } catch (err) {
      toast.error(err.message || 'Penghapusan akun gagal diproses.');
    } finally {
      setActingId(null);
    }
  };

  const handleCreate = async (newEmail, newPassword, newRole) => {
    setCreating(true);
    try {
      await createOperator(newEmail, newPassword, newRole);
      toast.success(`Akun ${newEmail} berhasil didaftarkan.`);
    } catch (err) {
      toast.error(err.message || 'Pendaftaran akun gagal diproses.');
      throw err;
    } finally {
      setCreating(false);
    }
  };

  if (!allowed) {
    return (
      <main className="operators-denied">
        <ShieldCheck size={22} />
        <h1>Akses Ditolak</h1>
        <p>Halaman pengelolaan akun hanya tersedia bagi Super Operator.</p>
        <button type="button" onClick={() => navigate('/')}>Kembali</button>
      </main>
    );
  }

  return (
    <div className="operators-container">
      <Toaster position="top-right" />

      <header className="operators-header">
        <div>
          <p className="section-kicker">Super Operator</p>
          <h1>Pengelolaan Akun</h1>
          <p className="operators-sub">Atur peran, status, dan akun operator sistem.</p>
        </div>
        <div className="operators-header-actions">
          <button className="primary-btn" onClick={() => setCreateModalOpen(true)}>
            <UserPlus size={16} />
            <span>Tambah Akun</span>
          </button>
          <button className="refresh-btn" onClick={fetchOperators} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            <span>Segarkan</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="operators-error" role="alert">
          <div><strong>Data akun gagal dimuat</strong><p>{error}</p></div>
          <button type="button" onClick={fetchOperators}>Coba lagi</button>
        </div>
      )}

      <div className="operators-toolbar">
        <label className="operators-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari alamat email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Cari akun"
          />
        </label>
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} aria-label="Filter peran">
          <option value="all">Semua peran</option>
          {ROLE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter status">
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
        <span className="operators-count"><strong>{filtered.length}</strong> akun</span>
      </div>

      {loading && operators.length === 0 ? (
        <p className="operators-loading">Memuat data akun...</p>
      ) : filtered.length === 0 ? (
        <div className="operators-empty">
          <UserCog size={22} aria-hidden="true" />
          <h3>Tidak Ada Akun yang Cocok</h3>
          <p>Sesuaikan kata kunci atau filter untuk menampilkan akun lainnya.</p>
        </div>
      ) : (
        <div className="operators-table-wrap">
          <table className="operators-table">
            <thead><tr><th>Alamat Email</th><th>Peran</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
            <tbody>
              {filtered.map((op) => {
                const isSelf = op.id === session?.user?.id;
                const busy = actingId === op.id;
                return (
                  <tr key={op.id} className={op.is_active ? '' : 'row-inactive'}>
                    <td><span className="op-email">{op.email}</span>{isSelf && <span className="op-self">Akun aktif</span>}</td>
                    <td>
                      <select value={op.role} onChange={(e) => handleRoleChange(op, e.target.value)} disabled={busy} aria-label={'Peran ' + op.email} className={'role-select role-' + op.role}>
                        {ROLE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                      </select>
                    </td>
                    <td><span className={'status-pill ' + (op.is_active ? 'on' : 'off')}>{op.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                    <td className="op-date">{formatDate(op.created_at)}</td>
                    <td>
                      <div className="op-actions">
                        <button type="button" className={'toggle-btn ' + (op.is_active ? 'danger' : 'ok')} onClick={() => handleToggleActive(op)} disabled={busy}>
                          {op.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                          <span>{busy ? 'Memproses...' : op.is_active ? 'Nonaktifkan' : 'Aktifkan'}</span>
                        </button>
                        {!isSelf && (
                          <button type="button" className="delete-btn" onClick={() => handleDelete(op)} disabled={busy} title="Hapus akun">
                            <Trash2 size={15} />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createModalOpen && (
        <CreateAccountForm
          onClose={() => setCreateModalOpen(false)}
          onCreate={handleCreate}
          submitting={creating}
        />
      )}
    </div>
  );
}
