import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Headphones,
  RefreshCw,
  Send,
  Image as ImageIcon,
  Search,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Ban,
  Clock,
  X,
  ExternalLink,
  MapPin,
  User,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Info,
  FileText,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useSupport } from '../hooks/useSupport';
import { useLanguage } from '../components/common/language';
import { ThemeToggle, LanguageToggle, ProfileButton } from '../components/common/ThemeToggle';
import {
  getDamageTypeLabel,
  getPriorityLabel,
  getWorkflowStatusLabel,
  formatConfidenceScore,
  isOverdue,
} from '../lib/roadDamage';
import { resolveDamageImage } from '../lib/damageImages';
import './Support.css';

const QUICK_REPLIES = [
  'Kami sedang meninjau laporan dan tindakan operator Anda.',
  'Mohon lampirkan foto bukti terbaru agar dapat kami verifikasi.',
  'Laporan Anda akan kami buka kembali dan tugaskan ulang.',
  'Terima kasih, keluhan Anda telah kami tindak lanjuti.',
];

function relativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

function formatDate(value, fallback = 'Tidak tersedia') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

function senderLabel(message, userEmail) {
  if (message.sender_role === 'system') return 'Pusat Bantuan';
  if (message.sender_role === 'superadmin') return 'Super Operator';
  return userEmail || 'Pengguna';
}

export function Support() {
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const {
    conversations,
    messages,
    activeId,
    loadingConversations,
    loadingMessages,
    sending,
    error,
    loadConversations,
    openConversation,
    sendMessage,
    uploadImage,
    disciplinaryAction,
    reopenReport,
    fetchReportContext,
    fetchUserReports,
    fetchOperator,
  } = useSupport();

  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [reportOptions, setReportOptions] = useState([]);
  const [selectedDamageId, setSelectedDamageId] = useState('');
  const [reportContext, setReportContext] = useState(null);
  const [targetOperator, setTargetOperator] = useState(null);
  const [suspendDays, setSuspendDays] = useState(7);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDamageId, setModalDamageId] = useState(null);
  const [modalReport, setModalReport] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.conversation_id === activeId) ?? null,
    [conversations, activeId],
  );

  const filteredConversations = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return conversations;
    return conversations.filter((item) => (item.user_email || '').toLowerCase().includes(keyword));
  }, [conversations, search]);

  const handleOpen = useCallback(async (conversation) => {
    setText('');
    setFile(null);
    setSelectedDamageId('');
    setReportContext(null);
    setTargetOperator(null);
    setModalOpen(false);
    setModalReport(null);
    await openConversation(conversation.conversation_id);
    const reports = await fetchUserReports(conversation.user_id);
    setReportOptions(reports);
  }, [openConversation, fetchUserReports]);

  const openReportDetailModal = useCallback(async (damageId) => {
    if (!damageId) return;
    setModalDamageId(damageId);
    setModalOpen(true);
    setModalLoading(true);
    try {
      const data = await fetchReportContext(damageId);
      setModalReport(data);
      setSelectedDamageId(damageId);
      setReportContext(data);
      if (data?.operator || data?.verifier) {
        setTargetOperator(data.operator || data.verifier);
      }
    } catch {
      toast.error('Gagal memuat detail laporan.');
    } finally {
      setModalLoading(false);
    }
  }, [fetchReportContext]);

  const closeReportModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const lastWithDamage = [...messages].reverse().find((item) => item.damage_id);
    if (!lastWithDamage?.damage_id) return undefined;
    let cancelled = false;
    fetchReportContext(lastWithDamage.damage_id).then((context) => {
      if (cancelled) return;
      setReportContext(context);
      setSelectedDamageId(lastWithDamage.damage_id);
    });
    return () => {
      cancelled = true;
    };
  }, [messages, fetchReportContext]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!reportContext) {
        setTargetOperator(null);
        return;
      }
      const operatorId = reportContext.verified_by || reportContext.assigned_operator_id;
      if (!operatorId) {
        setTargetOperator(null);
        return;
      }
      fetchOperator(operatorId).then((operator) => {
        if (!cancelled) setTargetOperator(operator);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [reportContext, fetchOperator]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectReport = async (damageId) => {
    setSelectedDamageId(damageId);
    if (!damageId) {
      setReportContext(null);
      return;
    }
    const context = await fetchReportContext(damageId);
    setReportContext(context);
    if (context?.verified_by || context?.assigned_operator_id) {
      setTargetOperator(await fetchOperator(context.verified_by || context.assigned_operator_id));
    }
  };

  const handleSend = async () => {
    if (!text.trim() && !file) return;
    try {
      let imageUrl = null;
      if (file) imageUrl = await uploadImage(file);
      await sendMessage({
        body: text,
        imageUrl,
        damageId: selectedDamageId || null,
      });
      setText('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      toast.error(err.message || 'Pesan gagal dikirim.');
    }
  };

  const handleReopen = async (damageId) => {
    const id = damageId || reportContext?.id;
    if (!id) return;
    setActionLoading(true);
    try {
      await reopenReport(id, actionReason || 'Dibuka kembali melalui Pusat Bantuan.');
      toast.success('Laporan berhasil dibuka kembali.');
      const context = await fetchReportContext(id);
      setReportContext(context);
      if (modalReport && modalReport.id === id) {
        setModalReport(context);
      }
    } catch (err) {
      toast.error(err.message || 'Gagal membuka ulang laporan.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisciplinary = async (action, opId) => {
    const operatorId = opId || targetOperator?.id;
    if (!operatorId) return;
    setActionLoading(true);
    try {
      await disciplinaryAction(
        operatorId,
        action,
        action === 'suspend' ? suspendDays : null,
        actionReason || 'Tindakan dari Pusat Bantuan.',
      );
      toast.success(
        action === 'ban'
          ? 'Akun operator diblokir permanen.'
          : action === 'suspend'
            ? `Operator ditangguhkan ${suspendDays} hari.`
            : 'Peringatan dikirim ke operator.',
      );
      const updatedOp = await fetchOperator(operatorId);
      setTargetOperator(updatedOp);
      if (modalReport && (modalReport.operator?.id === operatorId || modalReport.assigned_operator_id === operatorId)) {
        setModalReport((prev) => (prev ? { ...prev, operator: updatedOp } : null));
      }
    } catch (err) {
      toast.error(err.message || 'Gagal menerapkan tindakan.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="support-container">
      <Toaster position="top-right" />

      <header className="support-header">
        <div>
          <p className="section-kicker">Super Operator</p>
          <h1><Headphones size={22} aria-hidden="true" /> Pusat Bantuan</h1>
          <p className="support-sub">Komunikasi langsung dengan pengguna untuk menindaklanjuti keluhan penanganan laporan.</p>
        </div>
        <div className="support-header-actions">
          <button type="button" className="support-link-btn" onClick={() => navigate('/operators')}>
            <ShieldCheck size={16} /> Kelola Operator
          </button>
          <button
            type="button"
            className="header-icon-btn"
            onClick={loadConversations}
            disabled={loadingConversations}
            aria-label={t('refresh')}
            title={t('refresh')}
          >
            <RefreshCw size={16} className={loadingConversations ? 'spinning' : ''} />
          </button>
          <div className="header-controls">
            <ProfileButton />
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {error && (
        <div className="support-error" role="alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="support-layout">
        <aside className="support-list" aria-label="Daftar percakapan">
          <label className="support-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Cari email pengguna..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Cari percakapan"
            />
          </label>

          <div className="support-list-body">
            {loadingConversations && conversations.length === 0 && (
              <p className="support-list-empty">Memuat percakapan…</p>
            )}
            {!loadingConversations && filteredConversations.length === 0 && (
              <p className="support-list-empty">Belum ada keluhan dari pengguna.</p>
            )}
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.conversation_id}
                type="button"
                className={`support-conversation ${activeId === conversation.conversation_id ? 'active' : ''}`}
                onClick={() => handleOpen(conversation)}
              >
                <span className="support-avatar" aria-hidden="true">
                  {(conversation.user_email || 'U').charAt(0).toUpperCase()}
                </span>
                <span className="support-conversation-body">
                  <span className="support-conversation-top">
                    <span className="support-conversation-email">{conversation.user_email || 'Pengguna'}</span>
                    <span className="support-conversation-time">{relativeTime(conversation.last_message_at)}</span>
                  </span>
                  <span className="support-conversation-preview">
                    {conversation.last_message_image_url && !conversation.last_message_body
                      ? '📷 Gambar'
                      : conversation.last_message_body || 'Belum ada pesan'}
                  </span>
                </span>
                {Number(conversation.unread_count) > 0 && (
                  <span className="support-unread">{conversation.unread_count}</span>
                )}
              </button>
            ))}
          </div>
        </aside>

        <section className="support-thread" aria-label="Percakapan">
          {!activeConversation ? (
            <div className="support-thread-empty">
              <Headphones size={28} aria-hidden="true" />
              <h3>Pilih Percakapan</h3>
              <p>Pilih salah satu keluhan pengguna di sebelah kiri untuk mulai membalas.</p>
            </div>
          ) : (
            <>
              <div className="support-thread-head">
                <div>
                  <strong>{activeConversation.user_email || 'Pengguna'}</strong>
                  <span>Keluhan penanganan laporan</span>
                </div>
                {reportContext && (
                  <div className="support-head-links">
                    <button
                      type="button"
                      className="support-report-link"
                      onClick={() => openReportDetailModal(reportContext.id)}
                      title="Klik untuk melihat informasi laporan, operator, dan akar masalah"
                    >
                      <Info size={14} /> Detail Masalah
                    </button>
                    <button
                      type="button"
                      className="support-report-link secondary"
                      onClick={() => navigate(`/damage/${reportContext.id}`)}
                      title="Buka halaman perbaikan lengkap"
                    >
                      <ExternalLink size={14} /> Halaman Detail
                    </button>
                  </div>
                )}
              </div>

              <div className="support-messages">
                {loadingMessages && <p className="support-thread-empty-text">Memuat pesan…</p>}
                {!loadingMessages && messages.length === 0 && (
                  <p className="support-thread-empty-text">Belum ada pesan.</p>
                )}
                {messages.map((message) => {
                  const own = message.sender_role === 'superadmin';
                  return (
                    <div key={message.id} className={`support-row ${own ? 'own' : ''} ${message.sender_role === 'system' ? 'system' : ''}`}>
                      <div className="support-bubble">
                        <small>{senderLabel(message, activeConversation.user_email)} · {relativeTime(message.created_at)}</small>
                        {message.image_url && (
                          <a href={message.image_url} target="_blank" rel="noreferrer">
                            <img src={message.image_url} alt="Lampiran" loading="lazy" />
                          </a>
                        )}
                        {message.body && <p>{message.body}</p>}
                        {message.damage_id && (
                          <button
                            type="button"
                            className="support-bubble-report-card"
                            onClick={() => openReportDetailModal(message.damage_id)}
                            title="Klik untuk membuka detail lengkap laporan, operator, dan akar masalah"
                          >
                            <div className="report-card-top">
                              <MapPin size={13} className="report-card-pin" />
                              <span className="report-card-id">Laporan Terkait #{message.damage_id.slice(0, 8)}</span>
                            </div>
                            <div className="report-card-bottom">
                              <span>Lihat info operator & akar masalah</span>
                              <ChevronRight size={13} />
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {reportContext && (
                <div className="support-context">
                  <div
                    className="support-context-info clickable"
                    onClick={() => openReportDetailModal(reportContext.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') openReportDetailModal(reportContext.id);
                    }}
                    title="Klik untuk membuka modal detail laporan, operator, dan akar masalah"
                  >
                    <div className="support-context-top-line">
                      <span className="support-context-label">Laporan terkait</span>
                      <span className="support-context-open-badge">
                        <Info size={12} /> Buka Modal Detail &rarr;
                      </span>
                    </div>
                    <strong>{reportContext.address || 'Tanpa alamat'}</strong>
                    <span className="support-context-meta">
                      {getWorkflowStatusLabel(reportContext.workflow_status, lang)}
                      {reportContext.domicile ? ` · ${reportContext.domicile}` : ''}
                      {reportContext.operator ? ` · Operator: ${reportContext.operator.email}` : ''}
                    </span>
                    {reportContext.rejection_reason && (
                      <span className="support-context-reason">Alasan: {reportContext.rejection_reason}</span>
                    )}
                  </div>

                  <div className="support-context-actions">
                    {(reportContext.workflow_status === 'rejected' || reportContext.workflow_status === 'cancelled') && (
                      <button
                        type="button"
                        className="support-action-btn reopen"
                        onClick={() => handleReopen(reportContext.id)}
                        disabled={actionLoading}
                      >
                        <RotateCcw size={13} /> Buka ulang laporan
                      </button>
                    )}

                    {targetOperator && (
                      <>
                        <span className="support-operator-tag">
                          Operator: {targetOperator.email}
                          {targetOperator.is_banned ? ' · Diblokir' : ''}
                        </span>
                        <select
                          value={suspendDays}
                          onChange={(event) => setSuspendDays(Number(event.target.value))}
                          aria-label="Durasi penangguhan"
                          className="support-days-select"
                        >
                          <option value={7}>7 hari</option>
                          <option value={30}>30 hari</option>
                        </select>
                        <button
                          type="button"
                          className="support-action-btn suspend"
                          onClick={() => handleDisciplinary('suspend', targetOperator.id)}
                          disabled={actionLoading}
                        >
                          <Clock size={13} /> Suspend
                        </button>
                        <button
                          type="button"
                          className="support-action-btn ban"
                          onClick={() => handleDisciplinary('ban', targetOperator.id)}
                          disabled={actionLoading}
                        >
                          <Ban size={13} /> Ban
                        </button>
                      </>
                    )}
                  </div>

                  {(targetOperator || reportContext) && (
                    <input
                      className="support-action-reason"
                      type="text"
                      placeholder="Catatan tindakan (opsional)"
                      value={actionReason}
                      maxLength={200}
                      onChange={(event) => setActionReason(event.target.value)}
                    />
                  )}
                </div>
              )}

              <div className="support-composer">
                <div className="support-quick-replies">
                  {QUICK_REPLIES.map((reply) => (
                    <button key={reply} type="button" onClick={() => setText(reply)}>
                      {reply}
                    </button>
                  ))}
                </div>

                <div className="support-report-picker">
                  <label>
                    Laporan
                    <select
                      value={selectedDamageId}
                      onChange={(event) => handleSelectReport(event.target.value)}
                    >
                      <option value="">Tanpa laporan</option>
                      {reportOptions.map((report) => (
                        <option key={report.id} value={report.id}>
                          {(report.address || 'Tanpa alamat')} · {getWorkflowStatusLabel(report.workflow_status, lang)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {file && (
                  <div className="support-attachment">
                    <ImageIcon size={14} />
                    <span>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      aria-label="Hapus lampiran"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                <div className="support-input-row">
                  <button
                    type="button"
                    className="support-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Lampirkan gambar"
                    aria-label="Lampirkan gambar"
                  >
                    <ImageIcon size={18} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const picked = event.target.files?.[0] ?? null;
                      if (picked && !picked.type.startsWith('image/')) {
                        toast.error('Hanya berkas gambar yang diperbolehkan.');
                        event.target.value = '';
                        return;
                      }
                      setFile(picked);
                    }}
                  />
                  <textarea
                    value={text}
                    rows={1}
                    maxLength={2000}
                    placeholder="Tulis balasan untuk pengguna…"
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="support-send-btn"
                    onClick={handleSend}
                    disabled={sending || (!text.trim() && !file)}
                    aria-label="Kirim pesan"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {modalOpen && (
        <div className="support-modal-overlay" onClick={closeReportModal}>
          <div
            className="support-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="support-modal-header">
              <div className="support-modal-title">
                <Info size={20} className="modal-title-icon" />
                <div>
                  <h3>Detail Laporan & Akar Masalah</h3>
                  <span className="modal-subtitle">
                    ID Laporan: {modalReport?.id || modalDamageId}
                  </span>
                </div>
              </div>
              <div className="support-modal-header-right">
                {modalReport && (
                  <span className={`modal-status-badge ${modalReport.workflow_status}`}>
                    {getWorkflowStatusLabel(modalReport.workflow_status, lang)}
                  </span>
                )}
                <button
                  type="button"
                  className="support-modal-close"
                  onClick={closeReportModal}
                  aria-label="Tutup modal"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="support-modal-body">
              {modalLoading && (
                <div className="modal-loading-state">
                  <RefreshCw size={24} className="spinning" />
                  <p>Memuat informasi laporan, operator, dan riwayat masalah…</p>
                </div>
              )}

              {!modalLoading && !modalReport && (
                <div className="modal-error-state">
                  <AlertCircle size={24} />
                  <p>Informasi laporan tidak ditemukan atau gagal dimuat.</p>
                </div>
              )}

              {!modalLoading && modalReport && (
                <>
                  {/* 1. Laporannya Gimana? */}
                  <div className="support-modal-section">
                    <div className="support-section-header">
                      <FileText size={16} />
                      <h4>1. Laporannya Gimana? (Detail Kerusakan & Lokasi)</h4>
                    </div>

                    <div className="modal-damage-grid">
                      <div className="modal-damage-image-wrapper">
                        <img
                          src={resolveDamageImage(modalReport)}
                          alt="Foto Kerusakan"
                          className="modal-damage-image"
                        />
                        {modalReport.damage_type && (
                          <span className="modal-image-tag">
                            {getDamageTypeLabel(modalReport.damage_type, lang)}
                          </span>
                        )}
                      </div>

                      <div className="modal-damage-fields">
                        <div className="modal-field">
                          <span className="modal-field-label">Tipe & Prioritas</span>
                          <strong className="modal-field-val">
                            {getDamageTypeLabel(modalReport.damage_type, lang)} ·{' '}
                            <span className={`modal-priority ${modalReport.priority}`}>
                              {getPriorityLabel(modalReport.priority, lang)}
                            </span>
                          </strong>
                        </div>

                        <div className="modal-field">
                          <span className="modal-field-label">Keyakinan AI</span>
                          <span className="modal-field-val">
                            {formatConfidenceScore(modalReport) || 'N/A'}
                          </span>
                        </div>

                        <div className="modal-field">
                          <span className="modal-field-label">Waktu Dilaporkan</span>
                          <span className="modal-field-val">
                            {formatDate(modalReport.created_at)}
                          </span>
                        </div>

                        <div className="modal-field">
                          <span className="modal-field-label">Pelapor</span>
                          <span className="modal-field-val">
                            {modalReport.reporter?.email || 'Pengguna'}
                          </span>
                        </div>

                        <div className="modal-field full-width">
                          <span className="modal-field-label">Alamat / Wilayah</span>
                          <span className="modal-field-val">
                            <MapPin size={13} className="inline-icon" />
                            {modalReport.address || 'Alamat tidak tersedia'}
                            {modalReport.domicile ? ` (${modalReport.domicile})` : ''}
                          </span>
                        </div>

                        {modalReport.latitude && modalReport.longitude && (
                          <div className="modal-field full-width">
                            <span className="modal-field-label">Koordinat GPS</span>
                            <span className="modal-field-val text-muted">
                              {Number(modalReport.latitude).toFixed(6)},{' '}
                              {Number(modalReport.longitude).toFixed(6)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2. Operatornya Siapa? */}
                  <div className="support-modal-section">
                    <div className="support-section-header">
                      <User size={16} />
                      <h4>2. Operatornya Siapa? (Penanggung Jawab)</h4>
                    </div>

                    {modalReport.operator ? (
                      <div className="modal-operator-card">
                        <div className="modal-operator-avatar">
                          {(modalReport.operator.email || 'O').charAt(0).toUpperCase()}
                        </div>
                        <div className="modal-operator-info">
                          <div className="modal-operator-name-row">
                            <strong>{modalReport.operator.email}</strong>
                            {modalReport.operator.is_banned ? (
                              <span className="modal-badge-danger">Diblokir Permanen</span>
                            ) : modalReport.operator.suspended_until &&
                              new Date(modalReport.operator.suspended_until) > new Date() ? (
                              <span className="modal-badge-warning">
                                Ditangguhkan s.d. {formatDate(modalReport.operator.suspended_until)}
                              </span>
                            ) : (
                              <span className="modal-badge-success">Akun Aktif</span>
                            )}
                          </div>
                          <div className="modal-operator-meta">
                            <span>
                              Domisili:{' '}
                              <strong>{modalReport.operator.domicile || 'Belum diisi'}</strong>
                            </span>
                            <span>·</span>
                            <span>
                              Rating: ⭐{' '}
                              <strong>
                                {Number(modalReport.operator.rating_average || 5.0).toFixed(1)}
                              </strong>
                            </span>
                            {modalReport.assigned_at && (
                              <>
                                <span>·</span>
                                <span>Ditugaskan: {formatDate(modalReport.assigned_at)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="modal-operator-unassigned">
                        <AlertCircle size={18} />
                        <div>
                          <strong>Belum ada operator yang ditugaskan</strong>
                          <p>
                            Laporan masih dalam antrean atau masa tunggu 1 hari untuk alokasi otomatis
                            berdasarkan kecocokan domisili.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Masalahnya Ini Kenapa? */}
                  <div className="support-modal-section">
                    <div className="support-section-header">
                      <AlertTriangle size={16} />
                      <h4>3. Masalahnya Ini Kenapa? (Akar Masalah & Status)</h4>
                    </div>

                    {modalReport.workflow_status === 'rejected' && (
                      <div className="modal-problem-box danger">
                        <div className="modal-problem-head">
                          <AlertTriangle size={18} />
                          <strong>Laporan Ditolak oleh Operator</strong>
                        </div>
                        <div className="modal-problem-content">
                          <p>
                            <strong>Kategori Penolakan:</strong>{' '}
                            {modalReport.rejection_category || 'Tidak ditentukan'}
                          </p>
                          <p>
                            <strong>Alasan / Feedback Operator:</strong>{' '}
                            {modalReport.rejection_reason || 'Tidak ada alasan rinci.'}
                          </p>
                          <p className="modal-problem-sub">
                            {modalReport.resubmission_allowed
                              ? 'ℹ️ Pelapor diizinkan untuk mengajukan ulang laporan perbaikan.'
                              : '⚠️ Pelapor tidak diizinkan mengajukan ulang laporan ini.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {modalReport.workflow_status === 'cancelled' && (
                      <div className="modal-problem-box warning">
                        <div className="modal-problem-head">
                          <Clock size={18} />
                          <strong>Laporan Dibatalkan Otomatis (Melewati Tenggat SLA)</strong>
                        </div>
                        <div className="modal-problem-content">
                          <p>
                            Laporan dibatalkan otomatis oleh sistem karena melewati batas tenggat
                            penanganan (SLA).
                          </p>
                          <p>
                            <strong>Batas Tenggat:</strong> {formatDate(modalReport.due_at)}
                          </p>
                          <p className="modal-problem-sub">
                            Operator tidak menyelesaikan perbaikan tepat waktu. Pelapor dapat memberi
                            rating pada operator yang menangani laporan ini.
                          </p>
                        </div>
                      </div>
                    )}

                    {modalReport.workflow_status === 'in_progress' && (
                      <div
                        className={`modal-problem-box ${isOverdue(modalReport) ? 'danger' : 'info'}`}
                      >
                        <div className="modal-problem-head">
                          {isOverdue(modalReport) ? (
                            <AlertTriangle size={18} />
                          ) : (
                            <Clock size={18} />
                          )}
                          <strong>
                            {isOverdue(modalReport)
                              ? 'Laporan Terlambat / Melewati Tenggat SLA!'
                              : 'Sedang Dalam Penanganan Operator'}
                          </strong>
                        </div>
                        <div className="modal-problem-content">
                          <p>
                            <strong>Tenggat SLA:</strong> {formatDate(modalReport.due_at)}
                          </p>
                          <p>
                            <strong>Pembaruan Terakhir:</strong>{' '}
                            {formatDate(modalReport.last_progress_at)}
                          </p>
                          {isOverdue(modalReport) && (
                            <p className="text-danger">
                              ⚠️ Laporan ini belum diselesaikan operator padahal batas waktu SLA telah
                              terlewati.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {modalReport.workflow_status === 'pending' && (
                      <div className="modal-problem-box neutral">
                        <div className="modal-problem-head">
                          <Clock size={18} />
                          <strong>Laporan Masih Berstatus Pending</strong>
                        </div>
                        <div className="modal-problem-content">
                          <p>
                            Laporan baru menunggu diambil oleh operator wilayah setempat. Jika tidak ada
                            yang mengambil dalam 1 hari, sistem akan menugaskannya otomatis.
                          </p>
                        </div>
                      </div>
                    )}

                    {(modalReport.workflow_status === 'fixed' ||
                      modalReport.workflow_status === 'verified') && (
                      <div className="modal-problem-box success">
                        <div className="modal-problem-head">
                          <CheckCircle2 size={18} />
                          <strong>
                            {modalReport.workflow_status === 'verified'
                              ? 'Perbaikan Telah Diverifikasi'
                              : 'Pekerjaan Selesai (Menunggu Verifikasi)'}
                          </strong>
                        </div>
                        <div className="modal-problem-content">
                          {modalReport.repair_notes && (
                            <p>
                              <strong>Catatan Perbaikan:</strong> {modalReport.repair_notes}
                            </p>
                          )}
                          {modalReport.verification_notes && (
                            <p>
                              <strong>Catatan Verifikasi:</strong>{' '}
                              {modalReport.verification_notes}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Riwayat kejadian / pembaruan status jika ada */}
                    {modalReport.recent_events && modalReport.recent_events.length > 0 && (
                      <div className="modal-events-timeline">
                        <span className="modal-timeline-title">Riwayat Catatan & Status:</span>
                        <div className="modal-events-list">
                          {modalReport.recent_events.map((ev) => (
                            <div key={ev.id} className="modal-event-item">
                              <span className="modal-event-time">{formatDate(ev.created_at)}</span>
                              <span className="modal-event-desc">
                                <strong>
                                  {ev.from_status || 'awal'} &rarr; {ev.to_status}
                                </strong>
                                {ev.note ? `: ${ev.note}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tindakan Super Operator */}
                  <div className="support-modal-actions-box">
                    <span className="modal-actions-title">Tindakan Super Operator:</span>
                    <div className="modal-actions-row">
                      <button
                        type="button"
                        className="modal-action-btn primary"
                        onClick={() => {
                          closeReportModal();
                          navigate(`/damage/${modalReport.id}`);
                        }}
                      >
                        <ExternalLink size={15} /> Buka Halaman Detail Penuh
                      </button>

                      {(modalReport.workflow_status === 'rejected' ||
                        modalReport.workflow_status === 'cancelled') && (
                        <button
                          type="button"
                          className="modal-action-btn success"
                          onClick={() => handleReopen(modalReport.id)}
                          disabled={actionLoading}
                        >
                          <RotateCcw size={15} /> Buka Ulang Laporan
                        </button>
                      )}

                      {modalReport.operator && (
                        <>
                          <button
                            type="button"
                            className="modal-action-btn warning"
                            onClick={() => handleDisciplinary('suspend', modalReport.operator.id)}
                            disabled={actionLoading}
                          >
                            <Clock size={15} /> Suspend Operator (7 Hari)
                          </button>
                          <button
                            type="button"
                            className="modal-action-btn danger"
                            onClick={() => handleDisciplinary('ban', modalReport.operator.id)}
                            disabled={actionLoading}
                          >
                            <Ban size={15} /> Ban Operator
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="support-modal-footer">
              <button
                type="button"
                className="support-btn-secondary"
                onClick={closeReportModal}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
