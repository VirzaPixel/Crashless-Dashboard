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
} from 'lucide-react';
import { useRoadDamages } from '../hooks/useRoadDamages';
import { reverseGeocode } from '../lib/geocoding';
import { useLanguage } from '../components/common/language';
import { ThemeToggle, LanguageToggle } from '../components/common/ThemeToggle';
import {
  getDamageTypeLabel,
  getPriorityLabel,
  getWorkflowStatusLabel,
  hasValidCoordinates,
  formatConfidenceScore,
} from '../lib/roadDamage';
import { FixedModal } from '../components/modal/FixedModal';
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
  const submit = async (approved) => {
    setFormError(null);
    if (!approved && !verificationNotes.trim()) {
      setFormError('Catatan wajib diisi saat verifikasi ditolak.');
      return;
    }

    try {
      await onVerify({ approved, verificationNotes });
      setVerificationNotes('');
    } catch (error) {
      setFormError(error.message);
    }
  };

  return (
    <div className="verification-panel">
      <h3>Verifikasi Perbaikan</h3>
      <p>Periksa tiga foto bukti sebelum menyetujui laporan.</p>
      {formError && <div className="inline-form-error">{formError}</div>}
      <textarea
        value={verificationNotes}
        onChange={(event) => setVerificationNotes(event.target.value)}
        placeholder="Catatan verifikasi atau alasan penolakan..."
        rows={3}
        disabled={loading}
      />
      <div className="verification-actions">
        <button type="button" className="verify-btn approve" onClick={() => submit(true)} disabled={loading}>
          <ShieldCheck size={17} />
          Setujui
        </button>
        <button type="button" className="verify-btn reject" onClick={() => submit(false)} disabled={loading}>
          <XCircle size={17} />
          Tolak
        </button>
      </div>
    </div>
  );
}

export function DamageDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const {
    fetchDamageById,
    startRepair,
    markAsFixed,
    verifyRepair,
    loading: actionLoading,
    error: detailError,
  } = useRoadDamages();

  const [damage, setDamage] = useState(null);
  const [address, setAddress] = useState(t('loadingLocation'));
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const requestRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setDamage(null);
    setAddress(t('loadingLocation'));

    const data = await fetchDamageById(id);
    if (requestId !== requestRef.current) return;

    if (!data) {
      setLoading(false);
      return;
    }

    setDamage(data);

    if (hasValidCoordinates(data)) {
      const addr = await reverseGeocode(data.latitude, data.longitude);
      if (requestId !== requestRef.current) return;
      setAddress(addr);
    } else {
      setAddress(data.address || 'Lokasi tidak tersedia');
    }

    if (requestId === requestRef.current) {
      setLoading(false);
    }
  }, [fetchDamageById, id, t]);

  useEffect(() => {
    // Fetching synchronizes the page with the external Supabase record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();

  }, [loadData]);

  const handleStartRepair = async () => {
    try {
      const updated = await startRepair(damage.id);
      setDamage(updated);
      toast.success('Laporan masuk ke antrean penanganan.');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleVerify = async (values) => {
    const updated = await verifyRepair(damage.id, values);
    setDamage(updated);
    toast.success(values.approved
      ? 'Perbaikan berhasil diverifikasi.'
      : 'Perbaikan ditolak dan dikembalikan untuk ditinjau.');
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

  return (
    <div className="detail-container">
      <Toaster position="top-right" />
      <div className="detail-top-bar">
        <button className="back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          <span>{t('backToDashboard')}</span>
        </button>
        <div className="header-controls">
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
            <img src={damage.image_url} alt={t('photoDamage')} />
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

          {damage.damage_type === 'no_damage' ? (
            <div className="decision-panel no-damage-panel">
              <ShieldCheck size={20} />
              <span>{t('noDamageNotice')}</span>
            </div>
          ) : (
            <>
              {workflowStatus === 'pending' && (
                <button className="mark-fixed-action-btn" onClick={handleStartRepair} disabled={actionLoading}>
                  <Play size={18} />
                  <span>{actionLoading ? t('processing') : t('startRepairAction')}</span>
                </button>
              )}
              {workflowStatus === 'in_progress' && (
                <button className="mark-fixed-action-btn" onClick={() => setIsModalOpen(true)} disabled={actionLoading}>
                  <CheckCircle size={18} />
                  <span>{lang === 'en' ? 'Submit Repair Proof' : 'Laporkan Perbaikan'}</span>
                </button>
              )}
              {workflowStatus === 'fixed' && (
                <VerificationPanel onVerify={handleVerify} loading={actionLoading} />
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
