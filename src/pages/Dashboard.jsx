import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, RefreshCw, MapPinned, ArrowUpRight } from 'lucide-react';
import { useRoadDamages } from '../hooks/useRoadDamages';
import { StatsPanel } from '../components/dashboard/StatsPanel';
import { DamageCard } from '../components/dashboard/DamageCard';
import { supabase } from '../lib/supabase';
import {
  getDamageType,
  getDamageTypeLabel,
  getPriorityLabel,
  getWorkflowStatusLabel,
} from '../lib/roadDamage';
import toast, { Toaster } from 'react-hot-toast';
import './Dashboard.css';

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];

function compareDamages(a, b) {
  const priorityDifference =
    PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
  if (priorityDifference !== 0) return priorityDifference;
  if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;

  const aCreated = new Date(a.created_at).getTime();
  const bCreated = new Date(b.created_at).getTime();
  return (Number.isFinite(bCreated) ? bCreated : 0) -
    (Number.isFinite(aCreated) ? aCreated : 0);
}

export function Dashboard() {
  const { damages, loading, error, fetchDamages } = useRoadDamages();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [realtimeActive, setRealtimeActive] = useState(false);

  useEffect(() => {
    fetchDamages();

    const channel = supabase
      .channel('road-damages-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'road_damages' },
        (payload) => {
          fetchDamages();

          if (payload.eventType === 'INSERT') {
            const typeLabel = getDamageTypeLabel(getDamageType(payload.new));
            const workflowLabel = getWorkflowStatusLabel(
              payload.new.workflow_status || 'pending',
            );
            toast.success(`Laporan ${typeLabel} masuk: ${workflowLabel}.`, {
              icon: '🚨',
              duration: 5000,
            });
          } else if (
            payload.eventType === 'UPDATE' &&
            payload.old?.workflow_status !== payload.new?.workflow_status
          ) {
            const typeLabel = getDamageTypeLabel(getDamageType(payload.new));
            const workflowLabel = getWorkflowStatusLabel(
              payload.new.workflow_status,
            );
            toast.success(`${typeLabel}: ${workflowLabel}.`, {
              icon: payload.new.workflow_status === 'verified' ? '✅' : '🔄',
              duration: 4000,
            });
          }
        },
      )
      .subscribe((status) => {
        setRealtimeActive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDamages]);

  const filteredDamages = damages
    .filter((item) => {
      const normalizedSearch = searchQuery.trim().toLowerCase();
      const searchableText = [
        item.id,
        item.latitude,
        item.longitude,
        item.address,
        item.damage_type,
        getDamageTypeLabel(item.damage_type),
        item.priority,
        getPriorityLabel(item.priority),
        item.workflow_status,
        getWorkflowStatusLabel(item.workflow_status),
      ]
        .filter((value) => value !== null && value !== undefined)
        .join(' ')
        .toLowerCase();
      const matchesSearch = searchableText.includes(normalizedSearch);
      const matchesType =
        filterType === 'all' ? true : item.damage_type === filterType;
      const matchesStatus =
        filterStatus === 'all' ? true : item.workflow_status === filterStatus;
      const matchesPriority =
        filterPriority === 'all' ? true : item.priority === filterPriority;

      return matchesSearch && matchesType && matchesStatus && matchesPriority;
    })
    .sort(compareDamages);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    filterType !== 'all' ||
    filterStatus !== 'all' ||
    filterPriority !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setFilterType('all');
    setFilterStatus('all');
    setFilterPriority('all');
  };

  return (
    <div className="dashboard-container">
      <Toaster position="top-right" toastOptions={{
        style: {
          background: 'var(--surface)',
          color: 'var(--ink)',
          border: '1px solid var(--line-strong)',
        },
      }} />

      <header className="dashboard-header">
        <div className="header-brand">
          <span className="dashboard-brand-mark" aria-hidden="true">
            <MapPinned size={21} strokeWidth={1.8} />
          </span>
          <div>
            <p className="brand-overline">Crashless</p>
            <h1>Laporan jalan</h1>
          </div>
        </div>
        <div className="header-actions">
          <div className={`realtime-badge ${realtimeActive ? 'active' : ''}`}>
            <span className="realtime-indicator" aria-hidden="true" />
            <span>{realtimeActive ? 'Data langsung aktif' : 'Menghubungkan data'}</span>
          </div>
          <button
            className="refresh-btn"
            onClick={fetchDamages}
            disabled={loading}
            aria-label="Segarkan data laporan"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            <span>Segarkan</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="dashboard-error-panel" role="alert">
          <div>
            <strong>Data laporan gagal dimuat</strong>
            <p>{error}</p>
          </div>
          <button onClick={fetchDamages}>Coba lagi</button>
        </div>
      )}

      <StatsPanel damages={damages} />

      <section className="worklist-section" aria-labelledby="worklist-title">
        <div className="worklist-heading">
          <div>
            <p className="section-kicker">Daftar kerja</p>
            <h2 id="worklist-title">Laporan</h2>
          </div>
          <span className="report-count">
            <strong>{filteredDamages.length}</strong>
            laporan
          </span>
        </div>

        <div className="filter-section">
          <label className="search-bar">
            <Search size={18} className="search-icon" aria-hidden="true" />
            <input
              type="search"
              placeholder="Cari ID, alamat, tipe, atau status"
              aria-label="Cari laporan"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>

          <div className="filter-controls">
            <span className="filter-group">
              <SlidersHorizontal size={15} aria-hidden="true" />
              <span>Filter</span>
            </span>
            <select
              value={filterType}
              onChange={(event) => setFilterType(event.target.value)}
              className="filter-select"
              aria-label="Filter tipe kerusakan"
            >
              <option value="all">Semua tipe</option>
              <option value="pothole">Lubang jalan</option>
              <option value="crack">Retakan</option>
              <option value="manhole">Manhole</option>
            </select>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="filter-select"
              aria-label="Filter status workflow"
            >
              <option value="all">Semua status</option>
              <option value="pending">Menunggu</option>
              <option value="in_progress">Sedang ditangani</option>
              <option value="fixed">Menunggu verifikasi</option>
              <option value="verified">Terverifikasi</option>
              <option value="rejected">Perlu ditinjau ulang</option>
            </select>
            <select
              value={filterPriority}
              onChange={(event) => setFilterPriority(event.target.value)}
              className="filter-select"
              aria-label="Filter prioritas"
            >
              <option value="all">Semua prioritas</option>
              <option value="critical">Kritis</option>
              <option value="high">Tinggi</option>
              <option value="medium">Sedang</option>
              <option value="low">Rendah</option>
            </select>
          </div>
        </div>

        <main className="dashboard-main">
          {loading && damages.length === 0 ? (
            <div className="cards-grid" aria-label="Memuat laporan" aria-busy="true">
              {[1, 2, 3, 4].map((number) => (
                <div key={number} className="card-skeleton" />
              ))}
            </div>
          ) : filteredDamages.length === 0 ? (
            <div className="empty-state-panel">
              <span className="empty-state-icon" aria-hidden="true">
                {hasActiveFilters ? <Search size={20} /> : <MapPinned size={20} />}
              </span>
              <h3>{hasActiveFilters ? 'Tidak ada laporan yang cocok' : 'Belum ada laporan masuk'}</h3>
              <p>
                {hasActiveFilters
                  ? 'Ubah kata kunci atau filter untuk melihat laporan lain.'
                  : 'Laporan kerusakan dari aplikasi lapangan akan muncul di sini.'}
              </p>
              {hasActiveFilters && (
                <button className="clear-filters-btn" onClick={clearFilters}>
                  Hapus semua filter
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <div className="cards-grid">
              {filteredDamages.map((damage) => (
                <DamageCard key={damage.id} damage={damage} />
              ))}
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
