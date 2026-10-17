import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Percent, MapPin, Clock3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { reverseGeocode } from '../../lib/geocoding';
import {
  getDamageTypeLabel,
  getPriorityLabel,
  getWorkflowStatusLabel,
  hasValidCoordinates,
  isOverdue,
  formatConfidenceScore,
} from '../../lib/roadDamage';
import './DamageCard.css';

const WORKFLOW_STEPS = ['pending', 'in_progress', 'fixed', 'verified'];

export function DamageCard({ damage }) {
  const navigate = useNavigate();
  const [address, setAddress] = useState('Mengambil lokasi...');

  useEffect(() => {
    let isMounted = true;

    if (!hasValidCoordinates(damage)) {
      return undefined;
    }

    reverseGeocode(damage.latitude, damage.longitude).then((addr) => {
      if (isMounted) setAddress(addr);
    });

    return () => {
      isMounted = false;
    };
  }, [damage]);

  const getConfidenceColor = (score) => {
    if (!Number.isFinite(score)) return 'var(--muted)';
    if (score >= 0.8) return 'var(--success)';
    if (score >= 0.6) return 'var(--warning)';
    return 'var(--danger)';
  };

  const createdAt = new Date(damage.created_at);
  const timeAgo = Number.isNaN(createdAt.getTime())
    ? 'Waktu tidak tersedia'
    : formatDistanceToNow(createdAt, {
        addSuffix: true,
        locale: localeId,
      });

  const handleOpen = () => navigate(`/damage/${damage.id}`);
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };

  const stepIndex = WORKFLOW_STEPS.indexOf(damage.workflow_status);
  const progress = damage.workflow_status === 'rejected'
    ? 0
    : stepIndex >= 0
      ? Math.round(((stepIndex + 1) / WORKFLOW_STEPS.length) * 100)
      : 0;
  const overdue = isOverdue(damage);

  return (
    <div
      className="damage-card"
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label={`${getDamageTypeLabel(damage.damage_type)} — ${getWorkflowStatusLabel(damage.workflow_status)}`}
    >
      <div className="card-image-wrapper">
        <img
          src={damage.image_url}
          alt={getDamageTypeLabel(damage.damage_type)}
          loading="lazy"
        />
        <span className={`status-badge ${damage.workflow_status}`}>
          {damage.workflow_status === 'verified' ? '⚑ ' : ''}
          {getWorkflowStatusLabel(damage.workflow_status)}
        </span>
        {overdue && (
          <span className="overdue-ribbon">
            <Clock3 size={12} />
            <span>Melewati Batas Waktu</span>
          </span>
        )}
      </div>

      <div className="card-info">
        <div className="card-header">
          <span className={`type-badge ${damage.damage_type}`}>
            {damage.damage_type === 'no_damage' ? '✓ ' : ''}{getDamageTypeLabel(damage.damage_type)}
          </span>
          <div className="card-meta-badges">
            <span className={`priority-badge ${damage.priority}`}>
              {getPriorityLabel(damage.priority)}
            </span>
            <div className="confidence-score">
              <Percent size={14} />
              <span style={{ color: getConfidenceColor(damage.confidence_score) }}>
                {damage.damage_type === 'no_damage'
                  ? 'Tanpa Kerusakan'
                  : (formatConfidenceScore(damage) ?? 'Akurasi tidak tersedia')}
              </span>
            </div>
          </div>

        </div>
        <div className="card-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progres penanganan">
          <span className={`card-progress-bar ${damage.workflow_status}`} style={{ width: `${progress}%` }} />
        </div>
        <div className="info-row location-row">
          <MapPin size={16} className="info-icon" />
          <span className="info-text">
            {hasValidCoordinates(damage)
              ? address
              : damage.address || 'Lokasi tidak tersedia'}
          </span>
        </div>

        <div className="info-row time-row">
          <Calendar size={16} className="info-icon" />
          <span className="info-text">{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}
