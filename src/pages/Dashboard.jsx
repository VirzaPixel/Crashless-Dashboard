import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, RefreshCw, MapPinned, ArrowUpRight, LayoutGrid, Map as MapIcon, BarChart3 } from 'lucide-react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { useRoadDamages } from '../hooks/useRoadDamages';
import { StatsPanel } from '../components/dashboard/StatsPanel';
import { DamageCard } from '../components/dashboard/DamageCard';
import { ClusterLayer } from '../components/dashboard/GlobalMap';
import { MAP_LEGEND } from '../components/dashboard/mapLegend';
import { AnalyticsCharts } from '../components/dashboard/AnalyticsCharts';
import { supabase } from '../lib/supabase';
import 'leaflet/dist/leaflet.css';
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
  const [view, setView] = useState('list');

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
            <h1>Dashboard Operasional</h1>
          </div>
        </div>
        <div className="header-actions">
          <div className={`realtime-badge ${realtimeActive ? 'active' : ''}`}>
            <span className="realtime-indicator" aria-hidden="true" />
            <span>{realtimeActive ? 'Sinkronisasi Aktif' : 'Menghubungkan...'}</span>
          </div>

          <button
            className="refresh-btn"
            onClick={fetchDamages}
            disabled={loading}
            aria-label="Perbarui data laporan"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            <span>Perbarui</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="dashboard-error-panel" role="alert">
          <div>
            <strong>Gagal Memuat Data</strong>
            <p>{error}</p>
          </div>
          <button onClick={fetchDamages}>Muat Ulang</button>
        </div>
      )}

      <StatsPanel damages={damages} />

      <nav className="view-tabs" aria-label="Tampilan laporan">
        <button
          type="button"
          className={`view-tab ${view === 'list' ? 'active' : ''}`}
          onClick={() => setView('list')}
          aria-pressed={view === 'list'}
        >
          <LayoutGrid size={16} />
          <span>Daftar</span>
        </button>
        <button
          type="button"
          className={`view-tab ${view === 'map' ? 'active' : ''}`}
          onClick={() => setView('map')}
          aria-pressed={view === 'map'}
        >
          <MapIcon size={16} />
          <span>Peta</span>
        </button>
        <button
          type="button"
          className={`view-tab ${view === 'analytics' ? 'active' : ''}`}
          onClick={() => setView('analytics')}
          aria-pressed={view === 'analytics'}
        >
          <BarChart3 size={16} />
          <span>Analitik</span>
        </button>
      </nav>

      {view === 'analytics' && <AnalyticsCharts damages={filteredDamages} />}

      {view === 'map' && (
        <section className="global-map-section" aria-label="Peta sebaran laporan">
          <div className="global-map-wrap">
            <MapContainer
              center={[-6.2, 106.85]}
              zoom={11}
              style={{ height: 480, width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ClusterLayer damages={filteredDamages} />
            </MapContainer>
          </div>
          <ul className="map-legend" aria-label="Legenda status">
            {MAP_LEGEND.map((item) => (
              <li key={item.status}>
                <span className="legend-dot" style={{ background: item.color }} aria-hidden="true" />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
          <p className="map-hint">
            Menampilkan {filteredDamages.filter((d) => Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude))).length} dari {filteredDamages.length} lokasi laporan sesuai filter.
          </p>
        </section>
      )}

      {view === 'list' && (
      <section className="worklist-section" aria-label="Daftar laporan">
        <div className="filter-section">
          <label className="search-bar">
            <Search size={18} className="search-icon" aria-hidden="true" />
            <input
              type="search"
              placeholder="Cari ID, alamat, atau status..."
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
              aria-label="Filter jenis kerusakan"
            >
              <option value="all">Semua Jenis</option>
              <option value="pothole">Lubang Jalan</option>
              <option value="crack">Retakan</option>
              <option value="manhole">Manhole</option>
              <option value="no_damage">Tanpa Kerusakan</option>
            </select>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="filter-select"
              aria-label="Filter status penanganan"
            >
              <option value="all">Semua Status</option>
              <option value="pending">Menunggu</option>
              <option value="in_progress">Sedang Ditangani</option>
              <option value="fixed">Menunggu Verifikasi</option>
              <option value="verified">Terverifikasi</option>
              <option value="rejected">Ditolak</option>
            </select>
            <select
              value={filterPriority}
              onChange={(event) => setFilterPriority(event.target.value)}
              className="filter-select"
              aria-label="Filter prioritas"
            >
              <option value="all">Semua Prioritas</option>
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
              <h3>{hasActiveFilters ? 'Laporan Tidak Ditemukan' : 'Tidak Ada Laporan'}</h3>
              <p>
                {hasActiveFilters
                  ? 'Sesuaikan kata kunci pencarian atau filter yang dipilih.'
                  : 'Belum ada data laporan yang tercatat dalam sistem.'}
              </p>
              {hasActiveFilters && (
                <button className="clear-filters-btn" onClick={clearFilters}>
                  Reset Filter
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
      )}
    </div>
  );
}
