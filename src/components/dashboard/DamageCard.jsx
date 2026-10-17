import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Percent, MapPin, Clock3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId, enUS as localeEn } from 'date-fns/locale';
import { reverseGeocode } from '../../lib/geocoding';
import { useLanguage } from '../common/language';
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
  const { lang, t } = useLanguage();
  const [address, setAddress] = useState(t('loadingLocation'));

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
    return 'var(--muted-strong)';
  };

  const createdAt = new Date(damage.created_at);
  const timeAgo = Number.isNaN(createdAt.getTime())
    ? t('noTime')
    : formatDistanceToNow(createdAt, {
        addSuffix: true,
        locale: lang === 'en' ? localeEn : localeId,
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
  const damageTypeLabel = getDamageTypeLabel(damage.damage_type, lang);
  const workflowStatusLabel = getWorkflowStatusLabel(damage.workflow_status, lang);
  const priorityLabel = getPriorityLabel(damage.priority, lang);

  const isNoDamage = damage.damage_type === 'no_damage';

  return (
    <div
      className="damage-card"
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label={isNoDamage ? damageTypeLabel : `${damageTypeLabel} — ${workflowStatusLabel}`}
    >
      <div className="card-image-wrapper">
        <img
          src={damage.image_url}
          alt={damageTypeLabel}
          loading="lazy"
        />
        {!isNoDamage && (
          <span className={`status-badge ${damage.workflow_status}`}>
            {damage.workflow_status === 'verified' ? '⚑ ' : ''}
            {workflowStatusLabel}
          </span>
        )}
        {!isNoDamage && overdue && (
          <span className="overdue-ribbon">
            <Clock3 size={12} />
            <span>{t('overdueBadge')}</span>
          </span>
        )}
      </div>

      <div className="card-info">
        <div className="card-header">
          <span className={`type-badge ${damage.damage_type}`}>
            {isNoDamage ? '✓ ' : ''}{damageTypeLabel}
          </span>
          <div className="card-meta-badges">
            {!isNoDamage && (
              <span className={`priority-badge ${damage.priority}`}>
                {priorityLabel}
              </span>
            )}
            <div className="confidence-score">
              <Percent size={14} />
              <span style={{ color: getConfidenceColor(damage.confidence_score) }}>
                {isNoDamage
                  ? t('noDamageText')
                  : (formatConfidenceScore(damage) ?? t('noScoreText'))}
              </span>
            </div>
          </div>

        </div>
        {!isNoDamage && (
          <div className="card-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
            <span className={`card-progress-bar ${damage.workflow_status}`} style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="info-row location-row">
          <MapPin size={16} className="info-icon" />
          <span className="info-text">
            {hasValidCoordinates(damage)
              ? address
              : damage.address || t('noLocation')}
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
