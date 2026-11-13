import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Star,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowLeft,
  CheckCircle2,
  FileText,
  RefreshCw,
  ExternalLink,
  Award,
  TrendingDown,
  Pencil,
  Check,
  X,
  Users,
  Headphones,
  SlidersHorizontal,
  Compass,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRole, getRoleLabel, isSuperadmin } from '../lib/roles';
import { useLanguage } from '../components/common/language';
import { ThemeToggle, LanguageToggle } from '../components/common/ThemeToggle';
import { Modal } from '../components/common/Modal';
import { getWorkflowStatusLabel, getDamageTypeLabel } from '../lib/roadDamage';
import toast, { Toaster } from 'react-hot-toast';
import './Profile.css';

function formatDate(value, lang = 'id') {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString(lang === 'en' ? 'en-US' : 'id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

function renderStars(rating, size = 16) {
  const fullStars = Math.floor(rating || 0);
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star
        key={i}
        size={size}
        className={i <= fullStars ? 'star-filled' : 'star-empty'}
        fill={i <= fullStars ? 'currentColor' : 'none'}
      />
    );
  }
  return <span className="stars-row">{stars}</span>;
}

export function Profile() {
  const navigate = useNavigate();
  const { role, session } = useRole();
  const { lang, t } = useLanguage();
  const isSuper = isSuperadmin(role);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileData, setProfileData] = useState(null);

  // Field Operator Data
  const [reviews, setReviews] = useState([]);
  const [scoreEvents, setScoreEvents] = useState([]);
  const [reports, setReports] = useState([]);

  // Super Operator Executive Data
  const [allOperators, setAllOperators] = useState([]);
  const [allDamages, setAllDamages] = useState([]);
  const [supportCount, setSupportCount] = useState(0);

  const [activeTab, setActiveTab] = useState(isSuper ? 'system' : 'reviews');

  // Modal sanggahan penalti SLA
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeEvent, setDisputeEvent] = useState(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  // Edit domisili mandiri (Operator biasa)
  const [editingDomicile, setEditingDomicile] = useState(false);
  const [domicileInput, setDomicileInput] = useState('');
  const [savingDomicile, setSavingDomicile] = useState(false);

  const userId = session?.user?.id;

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    try {
      // 1. Profil pengguna aktif
      const { data: prof } = await supabase
        .from('user_profiles')
        .select('id, email, role, domicile, is_active, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle();

      setProfileData(
        prof || {
          id: userId,
          email: session?.user?.email,
          role: role || 'admin',
          is_active: true,
          created_at: session?.user?.created_at,
        }
      );

      if (isSuperadmin(role)) {
        // Super Operator: Muat data eksekutif seluruh sistem
        const [opsRes, damagesRes, supportRes] = await Promise.all([
          supabase
            .from('user_profiles')
            .select('id, email, role, domicile, is_active, is_banned, suspended_until, rating_average, created_at')
            .order('created_at', { ascending: false }),
          supabase
            .from('road_damages')
            .select('id, workflow_status, status, priority, damage_type, assigned_operator_id, due_at, created_at, address')
            .order('created_at', { ascending: false }),
          supabase
            .from('support_conversations')
            .select('id', { count: 'exact', head: true }),
        ]);

        setAllOperators(opsRes.data || []);
        setAllDamages(damagesRes.data || []);
        setSupportCount(supportRes.count || 0);
      } else {
        // Field Operator: Muat data kerja pribadi operator
        const [reviewsRes, scoresRes, reportsRes] = await Promise.all([
          supabase
            .from('damage_reviews')
            .select('id, damage_id, stars, comment, created_at, reviewer_id')
            .eq('operator_id', userId)
            .order('created_at', { ascending: false }),
          supabase
            .from('operator_score_events')
            .select(
              'id, damage_id, score_delta, event_type, rule_name, reason, dispute_status, dispute_reason, resolution_note, created_at'
            )
            .eq('operator_id', userId)
            .order('created_at', { ascending: false }),
          supabase
            .from('road_damages')
            .select(
              'id, damage_type, priority, status, workflow_status, address, created_at, assigned_at, due_at, fixed_at'
            )
            .eq('assigned_operator_id', userId)
            .order('assigned_at', { ascending: false }),
        ]);

        setReviews(reviewsRes.data || []);
        setScoreEvents(scoresRes.data || []);
        setReports(reportsRes.data || []);
      }
    } catch (err) {
      console.error('Error loading profile data:', err);
      toast.error(lang === 'en' ? 'Failed to load some profile data.' : 'Gagal memuat sebagian data profil.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, session, role, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile();
  }, [loadProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    toast.success(t('profileUpdated'));
  };

  // Metrik Operator Biasa
  const ratingMetrics = useMemo(() => {
    const count = reviews.length;
    const sum = reviews.reduce((acc, r) => acc + Number(r.stars || 0), 0);
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => {
      const s = Math.max(1, Math.min(5, Math.floor(r.stars || 0)));
      distribution[s] = (distribution[s] || 0) + 1;
    });
    return {
      average: (25 + sum) / (5 + count),
      count,
      distribution,
    };
  }, [reviews]);

  const slaMetrics = useMemo(() => {
    let score = 100;
    let activePenaltiesCount = 0;
    let reversedCount = 0;
    let pendingDisputesCount = 0;

    scoreEvents.forEach((ev) => {
      if (ev.dispute_status === 'reversed') {
        reversedCount++;
      } else {
        score += Number(ev.score_delta || 0);
        activePenaltiesCount++;
        if (ev.dispute_status === 'open' || ev.dispute_status === 'disputed') {
          pendingDisputesCount++;
        }
      }
    });

    const finalScore = Math.max(0, Math.min(100, score));

    let tierLabel = lang === 'en' ? 'Excellent' : 'Sangat Baik';
    let tierClass = 'tier-excellent';
    if (finalScore < 60) {
      tierLabel = lang === 'en' ? 'Needs Attention' : 'Perlu Perhatian';
      tierClass = 'tier-critical';
    } else if (finalScore < 75) {
      tierLabel = lang === 'en' ? 'Fair' : 'Cukup';
      tierClass = 'tier-warning';
    } else if (finalScore < 90) {
      tierLabel = lang === 'en' ? 'Good' : 'Baik';
      tierClass = 'tier-good';
    }

    return {
      score: finalScore,
      tierLabel,
      tierClass,
      activePenaltiesCount,
      reversedCount,
      pendingDisputesCount,
    };
  }, [scoreEvents, lang]);

  const reportMetrics = useMemo(() => {
    const total = reports.length;
    const inProgress = reports.filter(
      (r) => (r.workflow_status || r.status) === 'in_progress'
    ).length;
    const completed = reports.filter((r) =>
      ['fixed', 'verified'].includes(r.workflow_status || r.status)
    ).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      total,
      inProgress,
      completed,
      completionRate,
    };
  }, [reports]);

  // Metrik Eksekutif Super Operator
  const superMetrics = useMemo(() => {
    const totalOps = allOperators.length;
    const activeOps = allOperators.filter(
      (o) => o.role === 'admin' && o.is_active && !o.is_banned && (!o.suspended_until || new Date(o.suspended_until) <= new Date())
    ).length;
    const suspendedOrBanned = allOperators.filter(
      (o) => o.is_banned || (o.suspended_until && new Date(o.suspended_until) > new Date())
    ).length;
    const totalReports = allDamages.length;
    const pending = allDamages.filter((d) => (d.workflow_status || d.status) === 'pending').length;
    const inProgress = allDamages.filter((d) => (d.workflow_status || d.status) === 'in_progress').length;
    const completed = allDamages.filter((d) => ['fixed', 'verified'].includes(d.workflow_status || d.status)).length;
    const overdue = allDamages.filter(
      (d) => d.due_at && new Date(d.due_at) < new Date() && !['verified', 'rejected', 'cancelled'].includes(d.workflow_status || d.status)
    ).length;
    const completionRate = totalReports > 0 ? Math.round((completed / totalReports) * 100) : 0;

    return {
      totalOps,
      activeOps,
      suspendedOrBanned,
      totalReports,
      pending,
      inProgress,
      completed,
      overdue,
      completionRate,
      supportCount,
    };
  }, [allOperators, allDamages, supportCount]);

  // Handle buka modal sanggahan
  const openDisputeModal = (event) => {
    setDisputeEvent(event);
    setDisputeReason('');
    setDisputeModalOpen(true);
  };

  const handleSubmitDispute = async (e) => {
    e.preventDefault();
    if (!disputeEvent) return;
    const reason = disputeReason.trim();
    if (reason.length < 5) {
      toast.error(lang === 'en' ? 'Dispute reason must be at least 5 characters.' : 'Alasan sanggahan harus minimal 5 karakter.');
      return;
    }

    setSubmittingDispute(true);
    try {
      const { error } = await supabase.rpc('crashless_dispute_score_event', {
        p_event_id: disputeEvent.id,
        p_reason: reason,
      });
      if (error) throw error;

      toast.success(lang === 'en' ? 'Dispute submitted for review.' : 'Sanggahan berhasil diajukan untuk ditinjau.');
      setDisputeModalOpen(false);
      setDisputeEvent(null);
      setDisputeReason('');
      await loadProfile();
    } catch (err) {
      console.error('Error submitting dispute:', err);
      toast.error(err.message || 'Gagal mengajukan sanggahan.');
    } finally {
      setSubmittingDispute(false);
    }
  };

  const handleSaveOwnDomicile = async () => {
    if (!userId) return;
    setSavingDomicile(true);
    try {
      const clean = domicileInput.trim() || null;
      let { error: rpcError } = await supabase.rpc('update_user_domicile', {
        target_user_id: userId,
        new_domicile: clean,
      });
      if (rpcError) {
        const fallback = await supabase
          .from('user_profiles')
          .update({ domicile: clean })
          .eq('id', userId);
        rpcError = fallback.error;
      }
      if (rpcError) throw rpcError;

      setProfileData((prev) => ({ ...prev, domicile: clean }));
      setEditingDomicile(false);
      toast.success(lang === 'en' ? 'Handling domicile saved successfully.' : 'Domisili penanganan berhasil disimpan.');
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan domisili.');
    } finally {
      setSavingDomicile(false);
    }
  };

  const backDestination = isSuper ? '/operators' : '/';
  const backLabel = isSuper ? t('backToAccountManagement') : t('backToDashboard');

  return (
    <div className="profile-container">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--line-strong)',
          },
        }}
      />

      {/* Header Halaman */}
      <header className="profile-header">
        <div className="profile-header-left">
          <button
            type="button"
            className="back-nav-btn"
            onClick={() => navigate(backDestination)}
          >
            <ArrowLeft size={16} />
            <span>{backLabel}</span>
          </button>
          <div className="profile-header-title">
            <h1>{isSuper ? t('profileTitleSuper') : t('profileTitleOperator')}</h1>
            <p className="profile-header-sub">
              {isSuper ? t('profileSubtitleSuper') : t('profileSubtitleOperator')}
            </p>
          </div>
        </div>

        <div className="profile-header-actions">
          <button
            type="button"
            className="header-icon-btn refresh-icon-btn"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            aria-label={t('refresh')}
            title={t('refresh')}
          >
            <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
          </button>
          <div className="header-controls">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Identitas Pengguna Card */}
      <section className={`profile-identity-card ${isSuper ? 'super-card' : ''}`} aria-label="Identitas Profil">
        <div className="identity-avatar-col">
          <div className={`identity-avatar ${isSuper ? 'super-avatar' : ''}`}>
            {(profileData?.email?.[0] || 'O').toUpperCase()}
          </div>
        </div>

        <div className="identity-info-col">
          <div className="identity-main-line">
            <h2 className="identity-email">{profileData?.email || session?.user?.email}</h2>
            <span className={`identity-role-badge role-${role || 'admin'}`}>
              {getRoleLabel(role || 'admin')}
            </span>
            <span
              className={`identity-status-pill ${
                profileData?.is_active ? 'active' : 'inactive'
              }`}
            >
              {profileData?.is_active ? t('accountActive') : t('accountInactive')}
            </span>
          </div>

          <div className="identity-meta-grid">
            <div className="meta-item">
              <span className="meta-label">{t('accountId')}</span>
              <span className="meta-value font-mono">{userId}</span>
            </div>

            {isSuper ? (
              <div className="meta-item">
                <span className="meta-label">{lang === 'en' ? 'System Coverage' : 'Cakupan Kendali'}</span>
                <span className="meta-value super-coverage">
                  <Compass size={13} className="inline-icon" />
                  {lang === 'en' ? 'Central System (All Areas)' : 'Pusat Kendali Seluruh Wilayah'}
                </span>
              </div>
            ) : (
              <div className="meta-item">
                <span className="meta-label">{t('domicileHandling')}</span>
                {editingDomicile ? (
                  <div className="profile-domicile-edit">
                    <input
                      type="text"
                      value={domicileInput}
                      placeholder={lang === 'en' ? 'e.g. Jakarta Selatan' : 'Contoh: Kebayoran Baru'}
                      maxLength={100}
                      onChange={(e) => setDomicileInput(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveOwnDomicile();
                        if (e.key === 'Escape') setEditingDomicile(false);
                      }}
                    />
                    <button
                      type="button"
                      className="profile-domicile-btn save"
                      onClick={handleSaveOwnDomicile}
                      disabled={savingDomicile}
                      title={lang === 'en' ? 'Save' : 'Simpan'}
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      className="profile-domicile-btn cancel"
                      onClick={() => setEditingDomicile(false)}
                      disabled={savingDomicile}
                      title={lang === 'en' ? 'Cancel' : 'Batal'}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="profile-domicile-view">
                    <span className="meta-value">{profileData?.domicile || t('notSetYet')}</span>
                    <button
                      type="button"
                      className="profile-domicile-trigger"
                      onClick={() => {
                        setDomicileInput(profileData?.domicile || '');
                        setEditingDomicile(true);
                      }}
                      title={lang === 'en' ? 'Edit handling domicile' : 'Ubah domisili penanganan'}
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="meta-item">
              <span className="meta-label">{t('registeredSince')}</span>
              <span className="meta-value">{formatDate(profileData?.created_at, lang)}</span>
            </div>

            <div className="meta-item">
              <span className="meta-label">{t('systemRole')}</span>
              <span className="meta-value">
                {isSuper ? t('roleSuperadminLabel') : t('roleOperatorLabel')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* VIEW BERBEDA: SUPER OPERATOR VS FIELD OPERATOR */}
      {isSuper ? (
        <>
          {/* Executive Bento Grid untuk Super Operator */}
          <section className="profile-metrics-grid" aria-label="Ringkasan Eksekutif Sistem">
            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-title">{t('superMetricOperators')}</span>
                <Users size={18} className="metric-icon" />
              </div>
              <div className="metric-primary-row">
                <span className="metric-huge-value">{superMetrics.totalOps}</span>
                <span className="metric-max-unit">{lang === 'en' ? 'accounts' : 'akun'}</span>
              </div>
              <div className="metric-status-line">
                <span className="metric-tier-pill tier-good">
                  {superMetrics.activeOps} {lang === 'en' ? 'active' : 'aktif'}
                </span>
                {superMetrics.suspendedOrBanned > 0 && (
                  <span className="metric-tier-pill tier-critical">
                    {superMetrics.suspendedOrBanned} {lang === 'en' ? 'restricted' : 'dibatasi'}
                  </span>
                )}
              </div>
              <p className="metric-footer-text">
                {lang === 'en'
                  ? 'Total operators registered under system control.'
                  : 'Total operator di bawah pengawasan sistem.'}
              </p>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-title">{t('superMetricReports')}</span>
                <FileText size={18} className="metric-icon" />
              </div>
              <div className="metric-primary-row">
                <span className="metric-huge-value">{superMetrics.totalReports}</span>
                <span className="metric-max-unit">{lang === 'en' ? 'reports' : 'laporan'}</span>
              </div>
              <div className="metric-progress-line">
                <span className="metric-sub-stat">
                  <Clock size={13} /> {superMetrics.pending} {lang === 'en' ? 'pending' : 'menunggu'}
                </span>
                <span className="metric-sub-stat ok">
                  <CheckCircle2 size={13} /> {superMetrics.completed} {lang === 'en' ? 'done' : 'selesai'}
                </span>
              </div>
              <p className="metric-footer-text">
                {superMetrics.overdue > 0 ? (
                  <strong className="text-danger">
                    ⚠️ {superMetrics.overdue} {lang === 'en' ? 'overdue SLA' : 'melewati tenggat SLA'}
                  </strong>
                ) : (
                  lang === 'en' ? 'All reports within healthy SLA.' : 'Semua laporan dalam SLA normal.'
                )}
              </p>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-title">{t('metricCompletionRate')}</span>
                <CheckCircle2 size={18} className="metric-icon" />
              </div>
              <div className="metric-primary-row">
                <span className="metric-huge-value">{superMetrics.completionRate}%</span>
              </div>
              <div className="metric-progress-bar-wrap">
                <div
                  className="metric-progress-fill"
                  style={{ width: `${Math.min(100, superMetrics.completionRate)}%` }}
                />
              </div>
              <p className="metric-footer-text">
                {superMetrics.completed} {lang === 'en' ? 'of' : 'dari'} {superMetrics.totalReports} {lang === 'en' ? 'reports resolved & verified.' : 'laporan telah selesai & diverifikasi.'}
              </p>
            </div>

            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-title">{t('supportTitle')}</span>
                <Headphones size={18} className="metric-icon" />
              </div>
              <div className="metric-primary-row">
                <span className="metric-huge-value">{superMetrics.supportCount}</span>
                <span className="metric-max-unit">{lang === 'en' ? 'threads' : 'sesi'}</span>
              </div>
              <div className="metric-status-line">
                <Link to="/support" className="metric-cta-link">
                  <span>{lang === 'en' ? 'Open Support Center' : 'Buka Pusat Bantuan'}</span>
                  <ExternalLink size={12} />
                </Link>
              </div>
              <p className="metric-footer-text">
                {lang === 'en'
                  ? 'Direct complaint escalation & disciplinary management.'
                  : 'Saluran komplain langsung masyarakat & eskalasi operator.'}
              </p>
            </div>
          </section>

          {/* Tabs Khusus Super Operator */}
          <section className="profile-tabs-section">
            <nav className="profile-tabs-nav" aria-label="Menu Super Operator">
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === 'system' ? 'active' : ''}`}
                onClick={() => setActiveTab('system')}
              >
                <SlidersHorizontal size={15} />
                <span>{t('tabSuperOverview')}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === 'operators' ? 'active' : ''}`}
                onClick={() => setActiveTab('operators')}
              >
                <Users size={15} />
                <span>{t('tabSuperOperators')}</span>
                <span className="tab-counter">{allOperators.length}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === 'shortcuts' ? 'active' : ''}`}
                onClick={() => setActiveTab('shortcuts')}
              >
                <Award size={15} />
                <span>{t('tabSuperPrivileges')}</span>
              </button>
            </nav>

            {/* Tab 1: Ringkasan Sistem */}
            {activeTab === 'system' && (
              <div className="tab-content-panel">
                <div className="super-section-intro">
                  <h3>{lang === 'en' ? 'System Status & SLA Policy' : 'Status Sistem & Kebijakan SLA'}</h3>
                  <p>{t('superOverviewDesc')}</p>
                </div>

                <div className="super-status-grid">
                  <div className="super-status-card pending">
                    <span className="status-num">{superMetrics.pending}</span>
                    <span className="status-label">{t('statusPending')}</span>
                    <small>{lang === 'en' ? '1-day manual claim window' : 'Jendela klaim manual 1 hari'}</small>
                  </div>
                  <div className="super-status-card in-progress">
                    <span className="status-num">{superMetrics.inProgress}</span>
                    <span className="status-label">{t('statusInProgress')}</span>
                    <small>{lang === 'en' ? 'Active repair handling' : 'Dalam pengerjaan lapangan'}</small>
                  </div>
                  <div className="super-status-card fixed">
                    <span className="status-num">
                      {allDamages.filter((d) => (d.workflow_status || d.status) === 'fixed').length}
                    </span>
                    <span className="status-label">{t('statusFixed')}</span>
                    <small>{lang === 'en' ? 'Awaiting supervisor verification' : 'Menunggu verifikasi bukti'}</small>
                  </div>
                  <div className="super-status-card verified">
                    <span className="status-num">
                      {allDamages.filter((d) => (d.workflow_status || d.status) === 'verified').length}
                    </span>
                    <span className="status-label">{t('statusVerified')}</span>
                    <small>{lang === 'en' ? 'Approved & closed' : 'Disetujui & ditutup'}</small>
                  </div>
                  <div className="super-status-card rejected">
                    <span className="status-num">
                      {allDamages.filter((d) => (d.workflow_status || d.status) === 'rejected').length}
                    </span>
                    <span className="status-label">{t('statusRejected')}</span>
                    <small>{lang === 'en' ? 'Reopened or dropped' : 'Ditolak / siap dikaji ulang'}</small>
                  </div>
                  <div className="super-status-card cancelled">
                    <span className="status-num">
                      {allDamages.filter((d) => (d.workflow_status || d.status) === 'cancelled').length}
                    </span>
                    <span className="status-label">{t('statusCancelled')}</span>
                    <small>{lang === 'en' ? 'Expired past deadline' : 'Batal otomatis lewat tenggat'}</small>
                  </div>
                </div>

                <div className="super-policy-box">
                  <div className="policy-box-head">
                    <ShieldCheck size={18} />
                    <strong>{lang === 'en' ? 'Accountability & Discipline Standards' : 'Standar Akuntabilitas & Penalti'}</strong>
                  </div>
                  <ul className="policy-list">
                    <li>
                      <strong>Auto-Assignment 1 Hari:</strong> {lang === 'en' ? 'Reports remain pending for 1 day allowing local operators to manually claim. If unassigned after 1 day, system auto-allocates to matching domicile admin by lowest workload.' : 'Laporan baru menunggu 1 hari untuk diambil manual oleh operator domisili. Lewat 1 hari, dialokasikan otomatis ke operator domisili dengan beban paling sedikit.'}
                    </li>
                    <li>
                      <strong>Disiplin Rating Rendah:</strong> {lang === 'en' ? 'Rating < 3 stars triggers 7-day suspension; < 2 stars triggers 30-day suspension; <= 1 star results in permanent ban.' : 'Rating rata-rata < 3 terkena penangguhan 7 hari; < 2 terkena penangguhan 30 hari; <= 1 terkena pemblokiran permanen.'}
                    </li>
                    <li>
                      <strong>Pemulihan Akun:</strong> {lang === 'en' ? 'Reopening reports and unbanning accounts is exclusive to the Super Operator via the Support Center.' : 'Pembukaan ulang laporan dan pencabutan blokir hanya dapat dilakukan oleh Super Operator melalui Pusat Bantuan.'}
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* Tab 2: Direktori Operator */}
            {activeTab === 'operators' && (
              <div className="tab-content-panel">
                <div className="super-operators-header">
                  <div>
                    <h3>{t('operatorsTitle')}</h3>
                    <p>{t('operatorsSubtitle')}</p>
                  </div>
                  <Link to="/operators" className="btn-manage-link">
                    <Users size={15} />
                    <span>{t('btnManageAccounts')}</span>
                  </Link>
                </div>

                <div className="handled-reports-table-wrap">
                  <table className="handled-reports-table">
                    <thead>
                      <tr>
                        <th>{t('emailCol')}</th>
                        <th>{t('roleCol')}</th>
                        <th>{t('domicileCol')}</th>
                        <th>{t('ratingCol')}</th>
                        <th>{t('statusCol')}</th>
                        <th>{t('createdCol')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allOperators.map((op) => {
                        const isBanned = op.is_banned;
                        const isSuspended = op.suspended_until && new Date(op.suspended_until) > new Date();
                        return (
                          <tr key={op.id}>
                            <td>
                              <strong className="operator-email-cell">{op.email}</strong>
                              {op.id === userId && (
                                <span className="current-account-tag">({t('currentAccountBadge')})</span>
                              )}
                            </td>
                            <td>
                              <span className={`identity-role-badge role-${op.role || 'admin'}`}>
                                {getRoleLabel(op.role || 'admin')}
                              </span>
                            </td>
                            <td>{op.domicile || '-'}</td>
                            <td>
                              {op.rating_average !== null && op.rating_average !== undefined ? (
                                <span className="table-rating-val">
                                  ⭐ {Number(op.rating_average).toFixed(1)}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>
                              {isBanned ? (
                                <span className="status-badge-banned">Diblokir</span>
                              ) : isSuspended ? (
                                <span className="status-badge-suspended">
                                  Suspend s.d. {formatDate(op.suspended_until, lang)}
                                </span>
                              ) : op.is_active ? (
                                <span className="status-badge-active">{t('activeStatus')}</span>
                              ) : (
                                <span className="status-badge-inactive">{t('inactiveStatus')}</span>
                              )}
                            </td>
                            <td className="table-date-col">{formatDate(op.created_at, lang)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 3: Pintasan & Hak Istimewa */}
            {activeTab === 'shortcuts' && (
              <div className="tab-content-panel">
                <div className="super-section-intro">
                  <h3>{t('quickShortcuts')}</h3>
                  <p>{lang === 'en' ? 'Direct command links for executive control.' : 'Akses cepat ke pusat kendali dan fungsi administratif utama.'}</p>
                </div>

                <div className="super-shortcuts-grid">
                  <div
                    className="super-shortcut-card"
                    onClick={() => navigate('/operators')}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="shortcut-icon-badge users">
                      <Users size={22} />
                    </div>
                    <h4>{t('btnManageAccounts')}</h4>
                    <p>
                      {lang === 'en'
                        ? 'Register new operators, adjust handling domicile, suspend, or ban accounts.'
                        : 'Daftarkan operator baru, sesuaikan wilayah domisili, lakukan penangguhan atau pemblokiran akun.'}
                    </p>
                    <span className="shortcut-arrow">&rarr;</span>
                  </div>

                  <div
                    className="super-shortcut-card"
                    onClick={() => navigate('/support')}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="shortcut-icon-badge support">
                      <Headphones size={22} />
                    </div>
                    <h4>{t('btnSupportCenter')}</h4>
                    <p>
                      {lang === 'en'
                        ? 'Handle user complaints, review report issues, and reopen closed reports directly.'
                        : 'Tanggapi keluhan pengguna, tinjau akar masalah laporan, dan buka kembali laporan tertutup.'}
                    </p>
                    <span className="shortcut-arrow">&rarr;</span>
                  </div>

                  <div
                    className="super-shortcut-card"
                    onClick={() => navigate('/')}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="shortcut-icon-badge dashboard">
                      <SlidersHorizontal size={22} />
                    </div>
                    <h4>{t('dashboardTitle')}</h4>
                    <p>
                      {lang === 'en'
                        ? 'Realtime monitoring of all road damage detections across the region.'
                        : 'Pantau seluruh kerusakan jalan yang dilaporkan masyarakat secara realtime di peta & tabel.'}
                    </p>
                    <span className="shortcut-arrow">&rarr;</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {/* Bento Grid untuk Operator Biasa */}
          <section className="profile-metrics-grid" aria-label="Ringkasan Performa">
            {/* Kartu 1: Rating Pengguna */}
            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-title">{t('metricUserRating')}</span>
                <Award size={18} className="metric-icon" />
              </div>
              <div className="metric-primary-row">
                {ratingMetrics.average !== null ? (
                  <>
                    <span className="metric-huge-value">
                      {ratingMetrics.average.toFixed(1)}
                    </span>
                    <span className="metric-max-unit">/ 5.0</span>
                  </>
                ) : (
                  <span className="metric-no-value">-</span>
                )}
              </div>
              <div className="metric-stars-line">
                {ratingMetrics.average !== null ? (
                  renderStars(ratingMetrics.average, 18)
                ) : (
                  <span className="metric-hint">Menunggu ulasan pertama</span>
                )}
              </div>
              <p className="metric-footer-text">
                {lang === 'en'
                  ? `Based on ${ratingMetrics.count} user reviews after completed repairs.`
                  : `Berdasarkan ${ratingMetrics.count} ulasan setelah perbaikan terverifikasi.`}
              </p>
            </div>

            {/* Kartu 2: Kepatuhan SLA */}
            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-title">{t('metricSlaCompliance')}</span>
                <ShieldCheck size={18} className="metric-icon" />
              </div>
              <div className="metric-primary-row">
                <span className="metric-huge-value">{slaMetrics.score}</span>
                <span className="metric-max-unit">/ 100</span>
              </div>
              <div className="metric-status-line">
                <span className={`metric-tier-pill ${slaMetrics.tierClass}`}>
                  {slaMetrics.tierLabel}
                </span>
              </div>
              <p className="metric-footer-text">
                {slaMetrics.activePenaltiesCount > 0 ? (
                  <>
                    <strong>{slaMetrics.activePenaltiesCount}</strong>{' '}
                    {lang === 'en' ? 'active penalties' : 'penalti aktif'}
                  </>
                ) : (
                  lang === 'en' ? 'No active penalties recorded.' : 'Tidak ada catatan penalti aktif.'
                )}
              </p>
            </div>

            {/* Kartu 3: Total Laporan Ditangani */}
            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-title">{t('metricHandledReports')}</span>
                <FileText size={18} className="metric-icon" />
              </div>
              <div className="metric-primary-row">
                <span className="metric-huge-value">{reportMetrics.total}</span>
                <span className="metric-max-unit">{lang === 'en' ? 'reports' : 'laporan'}</span>
              </div>
              <div className="metric-progress-line">
                <span className="metric-sub-stat">
                  <Clock size={13} /> {reportMetrics.inProgress} {lang === 'en' ? 'in progress' : 'proses'}
                </span>
                <span className="metric-sub-stat ok">
                  <CheckCircle2 size={13} /> {reportMetrics.completed} {lang === 'en' ? 'done' : 'selesai'}
                </span>
              </div>
              <p className="metric-footer-text">
                {lang === 'en'
                  ? 'Total reports claimed and handled by your account.'
                  : 'Total laporan yang diklaim dan dikerjakan akun ini.'}
              </p>
            </div>

            {/* Kartu 4: Rasio Penyelesaian */}
            <div className="metric-card">
              <div className="metric-card-header">
                <span className="metric-card-title">{t('metricCompletionRate')}</span>
                <CheckCircle2 size={18} className="metric-icon" />
              </div>
              <div className="metric-primary-row">
                <span className="metric-huge-value">{reportMetrics.completionRate}%</span>
              </div>
              <div className="metric-progress-bar-wrap">
                <div
                  className="metric-progress-fill"
                  style={{ width: `${Math.min(100, reportMetrics.completionRate)}%` }}
                />
              </div>
              <p className="metric-footer-text">
                {reportMetrics.completed} {lang === 'en' ? 'of' : 'dari'} {reportMetrics.total} {lang === 'en' ? 'reports completed & verified.' : 'laporan selesai / terverifikasi.'}
              </p>
            </div>
          </section>

          {/* Tabs Khusus Field Operator */}
          <section className="profile-tabs-section">
            <nav className="profile-tabs-nav" aria-label="Pilihan Informasi Profil">
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === 'reviews' ? 'active' : ''}`}
                onClick={() => setActiveTab('reviews')}
              >
                <Star size={15} />
                <span>{t('tabReviews')}</span>
                <span className="tab-counter">{reviews.length}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === 'sla' ? 'active' : ''}`}
                onClick={() => setActiveTab('sla')}
              >
                <ShieldCheck size={15} />
                <span>{t('tabSlaHistory')}</span>
                <span className="tab-counter">{scoreEvents.length}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
                onClick={() => setActiveTab('reports')}
              >
                <FileText size={15} />
                <span>{t('tabHandledReports')}</span>
                <span className="tab-counter">{reports.length}</span>
              </button>
            </nav>

            {/* Tab 1: Ulasan Pengguna */}
            {activeTab === 'reviews' && (
              <div className="tab-content-panel">
                {ratingMetrics.count > 0 && (
                  <div className="rating-distribution-bar">
                    <div className="distribution-title">
                      {lang === 'en' ? 'Star Distribution' : 'Distribusi Bintang'}
                    </div>
                    <div className="distribution-rows">
                      {[5, 4, 3, 2, 1].map((stars) => {
                        const count = ratingMetrics.distribution[stars] || 0;
                        const pct = ratingMetrics.count > 0 ? (count / ratingMetrics.count) * 100 : 0;
                        return (
                          <div key={stars} className="dist-row">
                            <span className="dist-label">{stars} ★</span>
                            <div className="dist-bar-track">
                              <div className="dist-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="dist-count">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {reviews.length === 0 ? (
                  <div className="tab-empty-state">
                    <Star size={32} className="empty-icon" />
                    <h3>{t('emptyReviewsTitle')}</h3>
                    <p>{t('emptyReviewsDesc')}</p>
                  </div>
                ) : (
                  <div className="reviews-list">
                    {reviews.map((rev) => (
                      <article key={rev.id} className="review-card">
                        <div className="review-card-top">
                          <div className="review-stars-display">
                            {renderStars(rev.stars, 16)}
                            <span className="review-stars-num">{rev.stars} / 5</span>
                          </div>
                          <time className="review-date">{formatDate(rev.created_at, lang)}</time>
                        </div>

                        {rev.comment ? (
                          <p className="review-comment-body">"{rev.comment}"</p>
                        ) : (
                          <p className="review-comment-empty">
                            {lang === 'en' ? 'No written comment provided.' : 'Tanpa catatan ulasan tertulis.'}
                          </p>
                        )}

                        <div className="review-card-footer">
                          <span className="report-ref-label">ID Laporan:</span>
                          <Link
                            to={`/damage/${rev.damage_id}`}
                            className="report-ref-link"
                            title="Buka detail laporan"
                          >
                            <span className="font-mono">{rev.damage_id.slice(0, 8)}...</span>
                            <ExternalLink size={13} />
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Kepatuhan SLA */}
            {activeTab === 'sla' && (
              <div className="tab-content-panel">
                <div className="sla-guideline-banner">
                  <ShieldCheck size={20} className="guideline-icon" />
                  <div>
                    <strong>{lang === 'en' ? 'SLA Scoring Guidelines' : 'Aturan Skor Kepatuhan SLA'}</strong>
                    <p>
                      {lang === 'en'
                        ? 'Every account starts with a base score of 100. Deductions apply when overdue or missing updates. You can submit disputes for valid exceptions.'
                        : 'Setiap akun memulai dengan skor dasar 100. Poin berkurang saat terjadi keterlambatan atau tidak memperbarui progres. Anda dapat mengajukan sanggahan sah untuk ditinjau Super Operator.'}
                    </p>
                  </div>
                </div>

                {scoreEvents.length === 0 ? (
                  <div className="tab-empty-state">
                    <CheckCircle2 size={32} className="empty-icon ok" />
                    <h3>{t('emptySlaTitle')}</h3>
                    <p>{t('emptySlaDesc')}</p>
                  </div>
                ) : (
                  <div className="score-events-list">
                    {scoreEvents.map((ev) => {
                      const isReversed = ev.dispute_status === 'reversed';
                      const isDisputed = ev.dispute_status === 'open' || ev.dispute_status === 'disputed';
                      const isRejected = ev.dispute_status === 'rejected';

                      return (
                        <article
                          key={ev.id}
                          className={`score-event-card ${isReversed ? 'event-reversed' : ''}`}
                        >
                          <div className="score-event-header">
                            <div className="event-type-badge">
                              <TrendingDown size={14} />
                              <span>{ev.event_type || 'SLA'}</span>
                            </div>
                            <span
                              className={`score-delta-tag ${
                                isReversed ? 'delta-reversed' : 'delta-penalty'
                              }`}
                            >
                              {isReversed ? '+0' : `${ev.score_delta} Poin`}
                            </span>
                          </div>

                          <h4 className="event-rule-title">
                            {ev.rule_name || 'Penalti Kepatuhan'}
                          </h4>
                          <p className="event-reason-text">{ev.reason}</p>

                          <div className="event-meta-line">
                            <span>{lang === 'en' ? 'Time:' : 'Waktu:'} {formatDate(ev.created_at, lang)}</span>
                            {ev.damage_id && (
                              <Link
                                to={`/damage/${ev.damage_id}`}
                                className="event-damage-link"
                              >
                                <span>Laporan {ev.damage_id.slice(0, 8)}...</span>
                                <ExternalLink size={12} />
                              </Link>
                            )}
                          </div>

                          {/* Status Sanggahan */}
                          <div className="event-dispute-section">
                            {ev.dispute_status === 'none' && (
                              <div className="dispute-cta-row">
                                <span className="dispute-status-pill none">
                                  {lang === 'en' ? 'Not disputed' : 'Belum disanggah'}
                                </span>
                                <button
                                  type="button"
                                  className="dispute-action-btn"
                                  onClick={() => openDisputeModal(ev)}
                                >
                                  {lang === 'en' ? 'Submit Dispute' : 'Ajukan Keberatan / Sanggahan'}
                                </button>
                              </div>
                            )}

                            {isDisputed && (
                              <div className="dispute-status-box open">
                                <AlertTriangle size={15} />
                                <div>
                                  <strong>{lang === 'en' ? 'Dispute Under Review' : 'Sanggahan Sedang Ditinjau'}</strong>
                                  {ev.dispute_reason && (
                                    <p className="dispute-note">"{ev.dispute_reason}"</p>
                                  )}
                                </div>
                              </div>
                            )}

                            {isReversed && (
                              <div className="dispute-status-box reversed">
                                <CheckCircle2 size={15} />
                                <div>
                                  <strong>{lang === 'en' ? 'Dispute Upheld — Points Restored' : 'Sanggahan Diterima — Poin Dipulihkan'}</strong>
                                  {ev.resolution_note && (
                                    <p className="dispute-note">
                                      {ev.resolution_note}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {isRejected && (
                              <div className="dispute-status-box rejected">
                                <AlertTriangle size={15} />
                                <div>
                                  <strong>{lang === 'en' ? 'Dispute Rejected' : 'Sanggahan Ditolak'}</strong>
                                  {ev.resolution_note && (
                                    <p className="dispute-note">
                                      {ev.resolution_note}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Laporan Ditangani */}
            {activeTab === 'reports' && (
              <div className="tab-content-panel">
                {reports.length === 0 ? (
                  <div className="tab-empty-state">
                    <FileText size={32} className="empty-icon" />
                    <h3>{t('emptyReportsTitle')}</h3>
                    <p>{t('emptyReportsDesc')}</p>
                  </div>
                ) : (
                  <div className="handled-reports-table-wrap">
                    <table className="handled-reports-table">
                      <thead>
                        <tr>
                          <th>ID Laporan</th>
                          <th>{t('chartType')}</th>
                          <th>{t('priorityLabel')}</th>
                          <th>{t('statusCol')}</th>
                          <th>{t('location')}</th>
                          <th>{lang === 'en' ? 'Assigned' : 'Ditugaskan'}</th>
                          <th>{t('actionCol')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((rep) => {
                          const st = rep.workflow_status || rep.status || 'pending';
                          return (
                            <tr key={rep.id}>
                              <td className="font-mono">
                                <Link to={`/damage/${rep.id}`} className="table-report-link">
                                  {rep.id.slice(0, 8)}...
                                </Link>
                              </td>
                              <td>{getDamageTypeLabel(rep.damage_type, lang)}</td>
                              <td>
                                <span className={`modal-priority ${rep.priority || 'medium'}`}>
                                  {rep.priority || 'medium'}
                                </span>
                              </td>
                              <td>
                                <span className={`workflow-tag wf-${st}`}>
                                  {getWorkflowStatusLabel(st, lang)}
                                </span>
                              </td>
                              <td className="table-address-col">
                                {rep.address || '-'}
                              </td>
                              <td className="table-date-col">
                                {formatDate(rep.assigned_at || rep.created_at, lang)}
                              </td>
                              <td>
                                <Link
                                  to={`/damage/${rep.id}`}
                                  className="view-report-btn"
                                  title="Buka laporan"
                                >
                                  <span>{lang === 'en' ? 'View' : 'Lihat'}</span>
                                  <ExternalLink size={13} />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* Modal Ajukan Sanggahan */}
      {disputeModalOpen && disputeEvent && (
        <Modal
          isOpen={disputeModalOpen}
          onClose={() => setDisputeModalOpen(false)}
          title={lang === 'en' ? 'Submit SLA Score Dispute' : 'Ajukan Keberatan Skor SLA'}
        >
          <form className="dispute-form" onSubmit={handleSubmitDispute}>
            <p className="dispute-modal-desc">
              {lang === 'en'
                ? 'Explain valid reasons why this penalty should be reviewed (e.g. extreme weather, equipment issues, system error).'
                : 'Jelaskan alasan sah mengapa penalti skor ini perlu ditinjau ulang (misalnya kondisi cuaca ekstrem, kendala teknis, atau kesalahan sistem).'}
            </p>

            <div className="dispute-event-summary">
              <div>
                <strong>{lang === 'en' ? 'Event:' : 'Peristiwa:'}</strong> {disputeEvent.rule_name || disputeEvent.event_type}
              </div>
              <div>
                <strong>{lang === 'en' ? 'Deduction:' : 'Pengurangan:'}</strong> {disputeEvent.score_delta} Poin
              </div>
              <div>
                <strong>{lang === 'en' ? 'System Reason:' : 'Alasan Sistem:'}</strong> {disputeEvent.reason}
              </div>
            </div>

            <label htmlFor="dispute-reason-input">
              {lang === 'en' ? 'Dispute Reason (Required)' : 'Alasan Sanggahan (wajib diisi)'}
            </label>
            <textarea
              id="dispute-reason-input"
              rows={4}
              maxLength={1000}
              required
              placeholder={lang === 'en' ? 'Provide chronological evidence...' : 'Jelaskan kronologi atau bukti pendukung secara objektif...'}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <div className="char-count-hint">
              {disputeReason.trim().length} / 1000 {lang === 'en' ? 'chars (min 5)' : 'karakter (minimal 5)'}
            </div>

            <div className="dispute-modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setDisputeModalOpen(false)}
                disabled={submittingDispute}
              >
                {lang === 'en' ? 'Cancel' : 'Batal'}
              </button>
              <button
                type="submit"
                className="primary-btn"
                disabled={submittingDispute || disputeReason.trim().length < 5}
              >
                {submittingDispute
                  ? (lang === 'en' ? 'Submitting...' : 'Mengirim Sanggahan...')
                  : (lang === 'en' ? 'Submit Dispute' : 'Kirim Sanggahan')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
