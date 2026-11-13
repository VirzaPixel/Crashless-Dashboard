import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Percent,
  MapPin,
  CheckCircle,
  Clock,
  Play,
  ShieldCheck,
  XCircle,
  Star,
  MessageSquare,
  User,
} from 'lucide-react';
import { useRoadDamages } from '../hooks/useRoadDamages';
import { reverseGeocode } from '../lib/geocoding';
import { resolveDamageImage } from '../lib/damageImages';
import { useLanguage } from '../components/common/language';
import { ThemeToggle, LanguageToggle, ProfileButton } from '../components/common/ThemeToggle';
import {
  getDamageTypeLabel,
  getDamageDetections,
  getPriorityLabel,
  getWorkflowStatusLabel,
  hasValidCoordinates,
  formatConfidenceScore,
} from '../lib/roadDamage';
import { FixedModal } from '../components/modal/FixedModal';
import { useRole } from '../lib/roles';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import toast, { Toaster } from 'react-hot-toast';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './DamageDetail.css';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function formatDate(value, fallback = 'Waktu tidak tersedia') {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleString('id-ID');
}

function VerificationPanel({ onVerify, loading }) {
  const [verificationNotes, setVerificationNotes] = useState('');
  const [formError, setFormError] = useState(null);
  const submit = async () => {
    setFormError(null);
    try {
      await onVerify({ approved: true, verificationNotes });
      setVerificationNotes('');
    } catch (error) {
      setFormError(error.message);
    }
  };

  return (
    <div className="verification-panel">
      <h3>Verifikasi Perbaikan</h3>
      <p>Periksa tiga foto bukti sebelum menyetujui laporan. Gunakan formulir penolakan di bawah dengan kategori dan alasan bila bukti belum memadai.</p>
      {formError && <div className="inline-form-error">{formError}</div>}
      <textarea
        value={verificationNotes}
        onChange={(event) => setVerificationNotes(event.target.value)}
        placeholder="Catatan verifikasi (opsional)..."
        rows={3}
        disabled={loading}
      />
      <div className="verification-actions">
        <button type="button" className="verify-btn approve" onClick={submit} disabled={loading}>
          <ShieldCheck size={17} />
          Setujui
        </button>
      </div>
    </div>
  );
}

function RejectReportPanel({
  title,
  hint,
  category,
  reason,
  onCategoryChange,
  onReasonChange,
  onSubmit,
  loading,
}) {
  const canSubmit = Boolean(category) && reason.trim().length >= 5 && !loading;

  return (
    <form className="operational-panel reject-report-panel" onSubmit={onSubmit}>
      <h3><XCircle size={17} /> {title}</h3>
      <p className="reject-hint">{hint}</p>
      <select value={category} onChange={(event) => onCategoryChange(event.target.value)} required>
        <option value="">Pilih kategori</option>
        <option value="invalid_location">Lokasi tidak valid</option>
        <option value="insufficient_photo">Foto tidak memadai</option>
        <option value="duplicate">Laporan duplikat</option>
        <option value="not_found">Kerusakan tidak ditemukan</option>
        <option value="out_of_scope">Di luar cakupan</option>
        <option value="other">Lainnya</option>
      </select>
      <textarea
        value={reason}
        onChange={(event) => onReasonChange(event.target.value)}
        required
        minLength={5}
        maxLength={1000}
        placeholder="Tuliskan alasan/feedback yang akan dibaca pelapor"
      />
      <button type="submit" disabled={!canSubmit}>Tolak laporan</button>
    </form>
  );
}

export function DamageDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const {
    fetchDamageById,
    markAsFixed,
    verifyRepair,
    claimDamage,
    fetchOperationalData,
    addProgressNote,
    submitReview,
    rejectDamage,
    rejectReport,
    reassignDamage,
    disputeScoreEvent,
    resolveScoreEvent,
    loading: actionLoading,
    error: detailError,
  } = useRoadDamages();

  const [damage, setDamage] = useState(null);
  const [address, setAddress] = useState(t('loadingLocation'));
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ops, setOps] = useState({ events: [], conversation: null, review: null, scoreEvents: [], extensions: [] });
  const [opsError, setOpsError] = useState('');
  const [progressText, setProgressText] = useState('');
  const [progressAudience, setProgressAudience] = useState('user');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectCategory, setRejectCategory] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reassignId, setReassignId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [escalationNote, setEscalationNote] = useState('');
  const [decisionNotes, setDecisionNotes] = useState({});
  const [disputeReasons, setDisputeReasons] = useState({});
  const { role, session } = useRole();
  const requestRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setDamage(null);
    setAddress(t('loadingLocation'));

    try {
      const data = await fetchDamageById(id);
      if (requestId !== requestRef.current) return;

      if (!data) {
        setLoading(false);
        return;
      }

      setDamage(data);
      try {
        const operational = await fetchOperationalData(id);
        setOps(operational);
      } catch (error) {
        setOpsError(`Fitur progres belum tersedia. Jalankan migrasi database. (${error.message})`);
      }

      if (data.address && data.address.trim()) {
        setAddress(data.address);
      } else if (hasValidCoordinates(data)) {
        const addr = await reverseGeocode(data.latitude, data.longitude);
        if (requestId !== requestRef.current) return;
        setAddress(addr);
      } else {
        setAddress(t('noLocation'));
      }
    } catch (error) {
      console.error('Unable to load damage detail:', error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [fetchDamageById, fetchOperationalData, id, t]);

  useEffect(() => {
    // Fetching synchronizes the page with the external Supabase record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();

  }, [loadData]);

  const handleStartRepair = async () => {
    try {
      await claimDamage(damage.id);
      await loadData();
      toast.success('Laporan masuk ke antrean penanganan.');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const submitOperatorRejection = async (event) => {
    event.preventDefault();
    if (!rejectCategory || rejectReason.trim().length < 5) return;
    try {
      const updated = await rejectReport(damage.id, rejectCategory, rejectReason, true);
      setDamage(updated);
      setRejectReason('');
      setRejectCategory('');
      await loadData();
      toast.success('Laporan ditolak. Alasan akan tampil di aplikasi pelapor.');
    } catch (error) { setOpsError(error.message); }
  };

  const submitProgress = async (event) => {
    event.preventDefault();
    if (!progressText.trim()) return;
    try { await addProgressNote(damage.id, progressText, progressAudience); setProgressText(''); await loadData(); }
    catch (error) { setOpsError(error.message); }
  };

  const submitVerificationRejection = async (event) => {
    event.preventDefault();
    if (!rejectCategory || rejectReason.trim().length < 5) return;
    try {
      const updated = await rejectDamage(damage.id, rejectCategory, rejectReason, true);
      setDamage(updated);
      setRejectReason('');
      setRejectCategory('');
      await loadData();
      toast.success('Laporan ditolak dengan alasan yang akan diterima pelapor.');
    } catch (error) { setOpsError(error.message); }
  };

  const submitUserReview = async (event) => {
    event.preventDefault();
    try {
      await submitReview(damage.id, rating, reviewComment);
      setReviewComment('');
      await loadData();
      toast.success('Ulasan berhasil disimpan.');
    } catch (error) { setOpsError(error.message); }
  };

  const submitReassignment = async (event) => {
    event.preventDefault();
    try { await reassignDamage(damage.id, reassignId, reassignReason); await loadData(); }
    catch (error) { setOpsError(error.message); }
  };

  const submitEscalation = async (event) => {
    event.preventDefault();
    if (escalationNote.trim().length < 5) return;
    try {
      await addProgressNote(damage.id, `Eskalasi tenggat / permintaan perpanjangan: ${escalationNote.trim()}`, 'internal');
      setEscalationNote('');
      await loadData();
      toast.success('Eskalasi tercatat untuk tindak lanjut Super Operator.');
    } catch (error) { setOpsError(error.message); }
  };

  const disputeScore = async (eventId) => {
    const reason = disputeReasons[eventId] || '';
    if (reason.trim().length < 5) return;
    try {
      await disputeScoreEvent(eventId, reason);
      setDisputeReasons((current) => ({ ...current, [eventId]: '' }));
      await loadData();
      toast.success('Keberatan skor dikirim ke Super Operator.');
    } catch (error) { setOpsError(error.message); }
  };

  const resolveScore = async (eventId, reverse) => {
    try {
      await resolveScoreEvent(eventId, reverse, decisionNotes[eventId] || '');
      await loadData();
      toast.success(reverse ? 'Peristiwa skor dibatalkan.' : 'Keberatan ditolak.');
    } catch (error) { setOpsError(error.message); }
  };

  const isOverdueNow = damage?.due_at && new Date(damage.due_at) < new Date() && !['verified', 'rejected', 'cancelled'].includes(damage.workflow_status);
  const currentUserId = session?.user?.id;

  const handleVerify = async (values) => {
    const updated = await verifyRepair(damage.id, values);
    setDamage(updated);
    toast.success('Perbaikan berhasil diverifikasi.');
  };

  if (loading) {
    return (
      <div className="detail-loading">
        <span className="loading-spinner"></span>
        <p>Memuat detail laporan...</p>
      </div>
    );
  }

  if (!damage) {
    return (
      <div className="detail-error" role={detailError ? 'alert' : undefined}>
        <h2>{detailError ? 'Detail laporan gagal dimuat' : 'Laporan tidak ditemukan'}</h2>
        <p>
          {detailError ||
            'Laporan kerusakan jalan dengan ID tersebut tidak ada atau sudah dihapus.'}
        </p>
        <button onClick={() => navigate('/')}>Kembali ke Dashboard</button>
      </div>
    );
  }

  const workflowStatus = damage.workflow_status;
  const coordinatesAvailable = hasValidCoordinates(damage);
  const fixedPhotoUrls = [
    damage.fixed_photo_1,
    damage.fixed_photo_2,
    damage.fixed_photo_3,
  ].filter(Boolean);
  const detections = getDamageDetections(damage);

  const getDetectionBox = (detection) => {
    const box = detection?.bbox ?? detection?.box ?? detection?.xyxy;
    if (!Array.isArray(box) || box.length < 4) return null;
    let [x1, y1, x2, y2] = box.map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    // Detection payloads may use normalized xyxy coordinates or pixels.
    if (Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2)) <= 1) {
      x1 *= 100; y1 *= 100; x2 *= 100; y2 *= 100;
    }
    const left = Math.max(0, Math.min(x1, x2));
    const top = Math.max(0, Math.min(y1, y2));
    const width = Math.min(100 - left, Math.abs(x2 - x1));
    const height = Math.min(100 - top, Math.abs(y2 - y1));
    return width > 0 && height > 0 ? { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` } : null;
  };

  return (
    <div className="detail-container">
      <Toaster position="top-right" />
      <div className="detail-top-bar">
        <button className="back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          <span>{t('backToDashboard')}</span>
        </button>
        <div className="header-controls">
          <ProfileButton />
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>

      <div className="detail-layout">
        <section className="detail-map-section">
          {coordinatesAvailable ? (
            <MapContainer
              center={[Number(damage.latitude), Number(damage.longitude)]}
              zoom={16}
              style={{ width: '100%', height: '100%', minHeight: '400px' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <Marker position={[Number(damage.latitude), Number(damage.longitude)]}>
                <Popup>
                  <strong>{getDamageTypeLabel(damage.damage_type, lang)}</strong>
                  <br />
                  {address}
                </Popup>
              </Marker>
            </MapContainer>
          ) : (
            <div className="map-unavailable">
              <MapPin size={28} />
              <p>{t('noLocation')}</p>
            </div>
          )}
        </section>

        <section className="detail-info-section">
          <div className="info-header">
            <span className={`type-badge ${damage.damage_type}`}>
              {getDamageTypeLabel(damage.damage_type, lang)}
            </span>
            {damage.damage_type !== 'no_damage' && (
              <span className={`status-badge ${workflowStatus}`}>
                {getWorkflowStatusLabel(workflowStatus, lang)}
              </span>
            )}
          </div>

          {isOverdueNow && (
            <div className="overdue-detail-alert">
              <Clock size={18} />{' '}
              {lang === 'en'
                ? `Deadline passed since ${formatDate(damage.due_at)}. Report will be automatically cancelled.`
                : `Tenggat terlewati sejak ${formatDate(damage.due_at)}. Laporan akan dibatalkan otomatis.`}
            </div>
          )}
          <div className="reporter-banner">
            <User size={16} />
            <span>
              {t('reporterLabel')}: <strong>{damage.reporter_email || (lang === 'en' ? 'User' : 'Pengguna')}</strong>
              {damage.domicile ? ` · ${lang === 'en' ? 'Report Domicile' : 'Domisili laporan'}: ${damage.domicile}` : ''}
            </span>
          </div>
          {damage.assigned_operator_id ? (
            <div className="assignment-banner">
              {lang === 'en' ? 'Handled by operator ' : 'Dikerjakan oleh operator '}
              <strong>{damage.assigned_operator_name || 'Operator'}</strong>
              {damage.domicile ? ` · ${lang === 'en' ? 'Domicile Area' : 'Wilayah domisili'}: ${damage.domicile}` : ''}
            </div>
          ) : (
            <div className="assignment-banner assignment-pending">
              {lang === 'en'
                ? 'Awaiting local operator to claim · automatically assigned after 1 day'
                : 'Menunggu operator domisili mengambil laporan · otomatis dialokasikan setelah 1 hari'}
              {damage.domicile ? ` · ${lang === 'en' ? 'Target area' : 'Wilayah target'}: ${damage.domicile}` : ''}
            </div>
          )}
          {workflowStatus === 'cancelled' && (
            <div className="rejection-detail">
              <strong>Laporan dibatalkan otomatis</strong>
              <p>Tenggat penanganan terlewati sehingga laporan ini ditutup otomatis. Anda tetap dapat memberi rating kepada operator yang menangani.</p>
            </div>
          )}
          {workflowStatus === 'rejected' && damage.rejection_reason && (
            <div className="rejection-detail">
              <strong>Alasan penolakan{damage.rejection_category ? ` (${damage.rejection_category})` : ''}</strong>
              <p>{damage.rejection_reason}</p>
              <small>{damage.resubmission_allowed ? 'Pelapor dapat mengajukan ulang laporan.' : 'Laporan tidak dapat diajukan ulang.'}</small>
            </div>
          )}
          {opsError && <div className="inline-form-error" role="status">{opsError}</div>}

          {damage.damage_type !== 'no_damage' && (
            <div className="workflow-summary">
              <div>
                <span className="detail-label">{t('priorityLabel')}</span>
                <strong className={`priority-value ${damage.priority}`}>
                  {getPriorityLabel(damage.priority, lang)}
                </strong>
              </div>
              <div>
                <span className="detail-label">{t('dueAtLabel')}</span>
                <strong>{formatDate(damage.due_at, t('notSet'))}</strong>
              </div>
            </div>
          )}

          <div className="info-image-container">
            <img src={resolveDamageImage(damage)} alt={t('photoDamage')} />
            {detections.map((detection, index) => {
              const boxStyle = getDetectionBox(detection);
              if (!boxStyle) return null;
              const label = getDamageTypeLabel(detection.label ?? detection.class ?? damage.damage_type, lang);
              return (
                <div className="detection-box" key={`${label}-${index}`} style={boxStyle}>
                  <span className="detection-box-label">{label}</span>
                </div>
              );
            })}
          </div>

          <div className="info-details-list">
            <div className="info-detail-item">
              <div className="detail-icon"><MapPin size={18} /></div>
              <div className="detail-text">
                <span className="detail-label">{lang === 'en' ? 'Address / Location' : 'Alamat / Lokasi'}</span>
                <span className="detail-val">{address}</span>
              </div>
            </div>
            <div className="info-detail-item">
              <div className="detail-icon"><Calendar size={18} /></div>
              <div className="detail-text">
                <span className="detail-label">{lang === 'en' ? 'Reported Time' : 'Waktu Dilaporkan'}</span>
                <span className="detail-val">{formatDate(damage.created_at)}</span>
              </div>
            </div>
            <div className="info-detail-item">
              <div className="detail-icon"><Percent size={18} /></div>
              <div className="detail-text">
                <span className="detail-label">{lang === 'en' ? 'AI Confidence' : 'Tingkat Keyakinan AI'}</span>
                <span className="detail-val">
                  {damage.damage_type === 'no_damage'
                    ? t('noDamageText')
                    : (formatConfidenceScore(damage) ?? t('noScoreText'))}
                </span>
              </div>
            </div>
            <div className="info-detail-item">
              <div className="detail-icon"><Clock size={18} /></div>
              <div className="detail-text">
                <span className="detail-label">{lang === 'en' ? 'Coordinates' : 'Koordinat'}</span>
                <span className="detail-val">
                  {coordinatesAvailable
                    ? `${Number(damage.latitude).toFixed(6)}, ${Number(damage.longitude).toFixed(6)}`
                    : t('noLocation')}
                </span>
              </div>
            </div>
          </div>

          {damage.damage_type !== 'no_damage' && (
            <div className="workflow-timeline">
              {[
                ['pending', lang === 'en' ? 'Pending' : 'Pending'],
                ['in_progress', lang === 'en' ? 'In Progress' : 'Ditangani'],
                ['fixed', lang === 'en' ? 'Proof' : 'Bukti'],
                ['verified', lang === 'en' ? 'Verified' : 'Verifikasi'],
              ].map(([step, label], index) => (
                <div
                  key={step}
                  className={`timeline-step ${
                    ['pending', 'in_progress', 'fixed', 'verified', 'rejected']
                      .indexOf(workflowStatus) >= index ? 'done' : ''
                  }`}
                >
                  <span>{index + 1}</span>
                  <strong>{label}</strong>
                </div>
              ))}
            </div>
          )}

          {fixedPhotoUrls.length > 0 && (
            <div className="fixed-proof-section">
              <h3>{t('photoRepair')}</h3>
              <div className="fixed-photos-grid">
                {fixedPhotoUrls.map((url, index) => (
                  <div className="fixed-photo-wrapper" key={url}>
                    <img src={url} alt={`Bukti ${index + 1}`} />
                  </div>
                ))}
              </div>
              <div className="fixed-time-label">
                {lang === 'en' ? 'Repaired at:' : 'Diperbaiki pada:'} {formatDate(damage.fixed_at)}
              </div>
            </div>
          )}

          {(damage.repair_notes || damage.verification_notes) && (
            <div className="notes-section">
              {damage.repair_notes && (
                <div><strong>{lang === 'en' ? 'Repair Notes' : 'Catatan Perbaikan'}</strong><p>{damage.repair_notes}</p></div>
              )}
              {damage.verification_notes && (
                <div><strong>{lang === 'en' ? 'Verification Notes' : 'Catatan Verifikasi'}</strong><p>{damage.verification_notes}</p></div>
              )}
            </div>
          )}

          <section className="operational-panel">
            <h3>Riwayat progres</h3>
            {ops.events.length ? ops.events.map((event) => (
              <article className="operational-event" key={event.id}>
                <strong>{event.actor_name} · {event.to_status || 'Pembaruan'}{event.audience === 'internal' ? ' · Internal' : ''}</strong>
                <time>{formatDate(event.created_at)}</time>
                {event.note && <p>{event.note}</p>}
              </article>
            )) : <p>Belum ada catatan progres.</p>}
            {(workflowStatus === 'in_progress' || isOverdueNow) && <form onSubmit={submitProgress}><select value={progressAudience} onChange={(e)=>setProgressAudience(e.target.value)}><option value="user">Terlihat oleh pelapor</option><option value="internal">Catatan internal operator/CS</option></select><textarea value={progressText} onChange={(e) => setProgressText(e.target.value)} maxLength={1500} required placeholder={isOverdueNow ? 'Jelaskan tindak lanjut atau alasan keterlambatan' : 'Catatan progres'}/><button disabled={!progressText.trim()}>Tambah pembaruan</button></form>}
          </section>

          <section className="operational-panel">
            <h3>Penilaian operator</h3>
            {ops.review
              ? <p><Star size={15} /> {'★'.repeat(ops.review.stars)}{'☆'.repeat(5 - ops.review.stars)} {ops.review.comment} <small>— {ops.review.operator_name}</small></p>
              : <p>Belum ada ulasan user untuk laporan ini.</p>}
            {ops.scoreEvents.length > 0 && (
              <div className="score-list">
                {ops.scoreEvents.map((event) => (
                  <div className="score-event" key={event.id}>
                    <p>
                      <strong>{event.event_type}</strong>: {event.score_delta > 0 ? '+' : ''}{event.score_delta} · {event.reason}
                      {event.dispute_status !== 'none' && <small> · Sengketa: {event.dispute_status}</small>}
                    </p>
                    {event.dispute_status === 'none' && role === 'admin' && (
                      <div className="inline-row">
                        <input
                          value={disputeReasons[event.id] || ''}
                          onChange={(e) => setDisputeReasons((current) => ({ ...current, [event.id]: e.target.value }))}
                          placeholder="Alasan keberatan (min. 5 karakter)"
                          maxLength={500}
                        />
                        <button type="button" disabled={(disputeReasons[event.id] || '').trim().length < 5} onClick={() => disputeScore(event.id)}>Ajukan keberatan</button>
                      </div>
                    )}
                    {role === 'superadmin' && ['open', 'upheld'].includes(event.dispute_status) && (
                      <div className="inline-row">
                        <input
                          value={decisionNotes[event.id] || ''}
                          onChange={(e) => setDecisionNotes((current) => ({ ...current, [event.id]: e.target.value }))}
                          placeholder="Catatan keputusan (wajib)"
                          maxLength={500}
                        />
                        <button type="button" disabled={(decisionNotes[event.id] || '').trim().length < 3} onClick={() => resolveScore(event.id, true)}>Kabulkan</button>
                        <button type="button" disabled={(decisionNotes[event.id] || '').trim().length < 3} onClick={() => resolveScore(event.id, false)}>Tolak</button>
                      </div>
                    )}
                    {event.dispute_reason && <small>Alasan operator: {event.dispute_reason}</small>}
                    {event.resolution_note && <small>Keputusan: {event.resolution_note}</small>}
                  </div>
                ))}
              </div>
            )}
            {damage.user_id === currentUserId && ['verified', 'cancelled'].includes(workflowStatus) && damage.assigned_operator_id && (
              <form onSubmit={submitUserReview}>
                <label>Ulasan user
                  <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} bintang</option>)}
                  </select>
                </label>
                <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} maxLength={1000} placeholder="Komentar opsional" />
                <button type="submit">Kirim ulasan</button>
              </form>
            )}
            {isOverdueNow && (
              <>
                <p className="score-event">Terlambat sejak {formatDate(damage.due_at)}. Laporan akan dibatalkan otomatis oleh sistem.</p>
                <form onSubmit={submitEscalation}>
                  <textarea value={escalationNote} onChange={(e) => setEscalationNote(e.target.value)} required minLength={5} maxLength={1000} placeholder="Catatan eskalasi keterlambatan untuk Super Operator" />
                  <button disabled={escalationNote.trim().length < 5}>Catat eskalasi</button>
                </form>
              </>
            )}
            {role === 'superadmin' && (
              <form onSubmit={submitReassignment}>
                <input value={reassignId} onChange={(e) => setReassignId(e.target.value)} required placeholder="UUID operator tujuan" />
                <input value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} required minLength={5} placeholder="Alasan pengalihan" />
                <button type="submit">Alihkan penanggung jawab</button>
              </form>
            )}
          </section>

          <section className="operational-panel">
            <h3><MessageSquare size={17} /> Komunikasi pelapor</h3>
            <p className="chat-unassigned-notice">
              Komunikasi dengan pelapor kini terpusat di <strong>Pusat Bantuan</strong> dan ditangani Super Operator. Operator tidak lagi berkomunikasi langsung dengan pelapor.
            </p>
          </section>

          {damage.damage_type === 'no_damage' ? (
            <div className="decision-panel no-damage-panel">
              <ShieldCheck size={20} />
              <span>{t('noDamageNotice')}</span>
            </div>
          ) : (
            <>
              {workflowStatus === 'pending' && (
                <>
                  <button className="mark-fixed-action-btn" onClick={handleStartRepair} disabled={actionLoading}>
                    <Play size={18} />
                    <span>{actionLoading ? t('processing') : t('startRepairAction')}</span>
                  </button>
                  {role !== 'user' && (
                    <RejectReportPanel
                      title="Tolak laporan + feedback untuk pelapor"
                      hint="Gunakan bila laporan tidak layak ditangani (lokasi salah, duplikat, foto tidak jelas, dan sebagainya). Alasan akan tampil di aplikasi pelapor."
                      category={rejectCategory}
                      reason={rejectReason}
                      onCategoryChange={setRejectCategory}
                      onReasonChange={setRejectReason}
                      onSubmit={submitOperatorRejection}
                      loading={actionLoading}
                    />
                  )}
                </>
              )}
              {workflowStatus === 'in_progress' && (
                <>
                  <button className="mark-fixed-action-btn" onClick={() => setIsModalOpen(true)} disabled={actionLoading}>
                    <CheckCircle size={18} />
                    <span>{lang === 'en' ? 'Submit Repair Proof' : 'Laporkan Perbaikan'}</span>
                  </button>
                  {(role !== 'user') && (
                    <RejectReportPanel
                      title="Tolak laporan di tengah pengerjaan"
                      hint="Bila laporan ternyata tidak dapat diselesaikan, tolak dengan alasan agar pelapor mendapat feedback."
                      category={rejectCategory}
                      reason={rejectReason}
                      onCategoryChange={setRejectCategory}
                      onReasonChange={setRejectReason}
                      onSubmit={submitOperatorRejection}
                      loading={actionLoading}
                    />
                  )}
                </>
              )}
              {workflowStatus === 'fixed' && (
                <><VerificationPanel onVerify={handleVerify} loading={actionLoading} /><form className="operational-panel" onSubmit={submitVerificationRejection}><h3>Tolak laporan dengan alasan</h3><select value={rejectCategory} onChange={(e)=>setRejectCategory(e.target.value)} required><option value="">Pilih kategori</option><option value="invalid_location">Lokasi tidak valid</option><option value="insufficient_photo">Foto tidak memadai</option><option value="duplicate">Laporan duplikat</option><option value="not_found">Kerusakan tidak ditemukan</option><option value="out_of_scope">Di luar cakupan</option><option value="other">Lainnya</option></select><textarea value={rejectReason} onChange={(e)=>setRejectReason(e.target.value)} required minLength={5} maxLength={1000} placeholder="Jelaskan alasan yang akan diterima pelapor"/><button type="submit" disabled={!rejectCategory || rejectReason.trim().length < 5}>Tolak dengan alasan</button></form></>
              )}
              {workflowStatus === 'verified' && (
                <div className="decision-panel verified"><ShieldCheck size={20} /> {lang === 'en' ? 'Repair verified and approved.' : 'Perbaikan telah diverifikasi.'}</div>
              )}
              {workflowStatus === 'rejected' && (
                <>
                  <div className="decision-panel rejected"><XCircle size={20} /> {lang === 'en' ? 'Repair rejected; report needs to be reworked.' : 'Perbaikan ditolak; laporan siap ditangani ulang.'}</div>
                  <button className="mark-fixed-action-btn" onClick={handleStartRepair} disabled={actionLoading}>
                    <Play size={18} />
                    <span>{actionLoading ? t('processing') : t('reworkAction')}</span>
                  </button>
                </>
              )}
            </>
          )}
        </section>
      </div>

      <FixedModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        damageId={damage.id}
        onFixedSuccess={loadData}
        markAsFixed={markAsFixed}
        loading={actionLoading}
      />
    </div>
  );
}
