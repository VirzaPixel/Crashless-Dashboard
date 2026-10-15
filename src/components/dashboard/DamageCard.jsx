import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Percent, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { reverseGeocode } from '../../lib/geocoding';
import {
  getDamageTypeLabel,
  getPriorityLabel,
  getWorkflowStatusLabel,
  hasValidCoordinates,
} from '../../lib/roadDamage';
import './DamageCard.css';

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

  return (
    <div
      className="damage-card"
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
    >
      <div className="card-image-wrapper">
        <img 
          src={damage.image_url} 
          alt={getDamageTypeLabel(damage.damage_type)}
          loading="lazy" 
        />
        <span className={`status-badge ${damage.workflow_status}`}>
          {getWorkflowStatusLabel(damage.workflow_status)}
        </span>
      </div>

      <div className="card-info">
        <div className="card-header">
          <span className={`type-badge ${damage.damage_type}`}>
            {getDamageTypeLabel(damage.damage_type)}
          </span>
          <div className="card-meta-badges">
            <span className={`priority-badge ${damage.priority}`}>
              {getPriorityLabel(damage.priority)}
            </span>
            <div className="confidence-score">
              <Percent size={14} />
              <span style={{ color: getConfidenceColor(damage.confidence_score) }}>
                {(damage.confidence_score * 100).toFixed(0)}%
              </span>
            </div>
          </div>

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
