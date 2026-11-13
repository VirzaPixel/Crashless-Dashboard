import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShieldCheck, UserCog, UserX, UserCheck, RefreshCw, Trash2, UserPlus, Pencil, Check, X, Headphones } from 'lucide-react';
import { useOperators } from '../hooks/useOperators';
import { useRole, getRoleLabel, isSuperadmin } from '../lib/roles';
import { Modal } from '../components/common/Modal';
import { NotificationBell } from '../components/dashboard/NotificationBell';
import { ThemeToggle, LanguageToggle, ProfileButton } from '../components/common/ThemeToggle';
import { useLanguage } from '../components/common/language';
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
  const [domicile, setDomicile] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onCreate(email.trim(), password, role, domicile.trim());
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title="Tambah Akun Baru">
      <form className="create-account-form" onSubmit={handleSubmit}>
        <p className="create-account-desc">
          Daftarkan akun operator atau pengguna baru beserta peran akses dan domisili penanganannya.
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

        <label htmlFor="new-account-domicile">Domisili wilayah tugas</label>
        <input
          id="new-account-domicile"
          type="text"
          placeholder="Contoh: Jakarta, Bandung, Surabaya"
          maxLength={100}
          value={domicile}
          onChange={(event) => setDomicile(event.target.value)}
        />

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
  const { t } = useLanguage();
  const {
    operators,
    loading,
    error,
    fetchOperators,
    updateRole,
    setActive,
    deleteOperator,
    createOperator,
    updateDomicile,
  } = useOperators();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actingId, setActingId] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingDomicileId, setEditingDomicileId] = useState(null);
  const [editingDomicileValue, setEditingDomicileValue] = useState('');
  const [savingDomicile, setSavingDomicile] = useState(false);

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

  const handleCreate = async (newEmail, newPassword, newRole, newDomicile) => {
    setCreating(true);
    try {
      await createOperator(newEmail, newPassword, newRole, newDomicile);
      toast.success(`Akun ${newEmail} berhasil didaftarkan.`);
    } catch (err) {
      toast.error(err.message || 'Pendaftaran akun gagal diproses.');
      throw err;
    } finally {
      setCreating(false);
    }
  };

  const startEditDomicile = (op) => {
    setEditingDomicileId(op.id);
    setEditingDomicileValue(op.domicile || '');
  };

  const cancelEditDomicile = () => {
    setEditingDomicileId(null);
    setEditingDomicileValue('');
  };

  const handleSaveDomicile = async (op) => {
    setSavingDomicile(true);
    try {
      await updateDomicile(op.id, editingDomicileValue);
      toast.success(`Domisili akun ${op.email} berhasil diperbarui.`);
      setEditingDomicileId(null);
    } catch (err) {
      toast.error(err.message || 'Gagal memperbarui domisili.');
    } finally {
      setSavingDomicile(false);
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
          <h1>{t('operatorsTitle')}</h1>
          <p className="operators-sub">{t('operatorsSubtitle')}</p>
        </div>
        <div className="operators-header-actions">
          <button className="secondary-btn" onClick={() => navigate('/support')}>
            <Headphones size={16} />
            <span>Pusat Bantuan</span>
          </button>
          <button className="primary-btn" onClick={() => setCreateModalOpen(true)}>
            <UserPlus size={16} />
            <span>{t('addAccount')}</span>
          </button>
          <NotificationBell />
          <button
            className="header-icon-btn refresh-icon-btn"
            onClick={fetchOperators}
            disabled={loading}
            aria-label={t('refresh')}
            title={t('refresh')}
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
          <div className="header-controls">
            <ProfileButton />
            <LanguageToggle />
            <ThemeToggle />
          </div>
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
            <thead>
              <tr>
                <th>{t('emailCol')}</th>
                <th>{t('roleCol')}</th>
                <th>Domisili</th>
                <th>Rating pengguna</th>
                <th>Kepatuhan SLA</th>
                <th>{t('statusCol')}</th>
                <th>{t('createdCol')}</th>
                <th>{t('actionCol')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((op) => {
                const isSelf = op.id === session?.user?.id;
                const busy = actingId === op.id;
                return (
                  <tr key={op.id} className={op.is_active ? '' : 'row-inactive'}>
                    <td><span className="op-email">{op.email}</span>{isSelf && <span className="op-self">{t('currentAccountBadge')}</span>}</td>
                    <td>
                      <select value={op.role} onChange={(e) => handleRoleChange(op, e.target.value)} disabled={busy} aria-label={'Peran ' + op.email} className={'role-select role-' + op.role}>
                        {ROLE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                      </select>
                    </td>
                    <td>
                      {editingDomicileId === op.id ? (
                        <div className="op-domicile-edit">
                          <input
                            type="text"
                            className="op-domicile-input"
                            placeholder="Nama domisili"
                            value={editingDomicileValue}
                            maxLength={100}
                            onChange={(e) => setEditingDomicileValue(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveDomicile(op);
                              if (e.key === 'Escape') cancelEditDomicile();
                            }}
                          />
                          <button
                            type="button"
                            className="domicile-btn save-btn"
                            disabled={savingDomicile}
                            onClick={() => handleSaveDomicile(op)}
                            title="Simpan domisili"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            className="domicile-btn cancel-btn"
                            disabled={savingDomicile}
                            onClick={cancelEditDomicile}
                            title="Batal"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="op-domicile-cell">
                          <span className="op-domicile">{op.domicile || '—'}</span>
                          <button
                            type="button"
                            className="domicile-edit-trigger"
                            onClick={() => startEditDomicile(op)}
                            title="Ubah domisili"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td>{op.rating_average == null ? '★ 5.0 (baru)' : `★ ${Number(op.rating_average).toFixed(1)} (${op.rating_count || 0})`}</td>
                    <td>{op.role === 'admin' ? `${op.sla_score}/100` : '—'}</td>
                    <td>
                      {op.is_banned
                        ? <span className="status-pill off">Diblokir permanen</span>
                        : op.suspended_until && new Date(op.suspended_until) > new Date()
                          ? <span className="status-pill off">Ditangguhkan s.d. {formatDate(op.suspended_until)}</span>
                          : <span className={'status-pill ' + (op.is_active ? 'on' : 'off')}>{op.is_active ? t('activeStatus') : t('inactiveStatus')}</span>}
                    </td>
                    <td className="op-date">{formatDate(op.created_at)}</td>
                    <td>
                      <div className="op-actions">
                        <button type="button" className={'toggle-btn ' + (op.is_active ? 'danger' : 'ok')} onClick={() => handleToggleActive(op)} disabled={busy}>
                          {op.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                          <span>{busy ? t('processing') : op.is_active ? t('deactivate') : t('activate')}</span>
                        </button>
                        {!isSelf && (
                          <button type="button" className="delete-btn" onClick={() => handleDelete(op)} disabled={busy} title="Hapus akun">
                            <Trash2 size={15} />
                            <span>{t('delete')}</span>
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
