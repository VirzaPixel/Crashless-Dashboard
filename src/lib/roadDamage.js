const DAMAGE_LABELS = {
  pothole: 'Lubang Jalan',
  crack: 'Retakan',
  manhole: 'Manhole',
};

const WORKFLOW_LABELS = {
  pending: 'Pending',
  in_progress: 'Sedang Ditangani',
  fixed: 'Menunggu Verifikasi',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
};

const PRIORITY_LABELS = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  critical: 'Kritis',
};

const SUPPORTED_TYPES = new Set(Object.keys(DAMAGE_LABELS));
const SUPPORTED_WORKFLOW_STATUSES = new Set(Object.keys(WORKFLOW_LABELS));
const SUPPORTED_PRIORITIES = new Set(Object.keys(PRIORITY_LABELS));

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getDamageDetections(damage) {
  return Array.isArray(damage?.detections) ? damage.detections : [];
}

export function getPrimaryDetection(damage) {
  return getDamageDetections(damage)
    .filter((detection) => SUPPORTED_TYPES.has(detection?.label))
    .reduce((primary, detection) => {
      if (!primary) return detection;
      return toFiniteNumber(detection.confidence) >
        toFiniteNumber(primary.confidence)
        ? detection
        : primary;
    }, null);
}

export function getDamageType(damage) {
  if (SUPPORTED_TYPES.has(damage?.damage_type)) {
    return damage.damage_type;
  }

  const primaryDetection = getPrimaryDetection(damage);
  if (primaryDetection) return primaryDetection.label;

  const potholes = toFiniteNumber(damage?.potholes_count);
  const cracks = toFiniteNumber(damage?.cracks_count);
  if (potholes > 0 && potholes >= cracks) return 'pothole';
  if (cracks > 0) return 'crack';

  return 'unknown';
}

export function getDamageTypeLabel(type) {
  return DAMAGE_LABELS[type] ?? 'Kerusakan Jalan';
}

export function getConfidenceScore(damage) {
  const explicitScore = Number(damage?.confidence_score);
  if (Number.isFinite(explicitScore)) return explicitScore;

  return toFiniteNumber(getPrimaryDetection(damage)?.confidence);
}

export function normalizeWorkflowStatus(damage) {
  const workflowStatus = damage?.workflow_status;
  if (SUPPORTED_WORKFLOW_STATUSES.has(workflowStatus)) {
    return workflowStatus;
  }

  if (damage?.status === 'fixed') return 'fixed';
  return 'pending';
}

export function getWorkflowStatusLabel(status) {
  return WORKFLOW_LABELS[status] ?? 'Status Tidak Diketahui';
}

export function getPriority(damage) {
  if (SUPPORTED_PRIORITIES.has(damage?.priority)) {
    return damage.priority;
  }

  if (damage?.severity === 'high') return 'high';
  if (damage?.severity === 'medium') return 'medium';
  return 'low';
}

export function getPriorityLabel(priority) {
  return PRIORITY_LABELS[priority] ?? 'Rendah';
}

export function isOverdue(damage, now = new Date()) {
  if (['verified', 'rejected'].includes(damage?.workflow_status)) {
    return false;
  }

  const dueAt = new Date(damage?.due_at);
  return !Number.isNaN(dueAt.getTime()) && dueAt < now;
}

export function normalizeRoadDamage(damage) {
  const workflowStatus = normalizeWorkflowStatus(damage);
  return {
    ...damage,
    damage_type: getDamageType(damage),
    confidence_score: getConfidenceScore(damage),
    workflow_status: workflowStatus,
    priority: getPriority(damage),
    due_at: damage?.due_at ?? null,
    fixed_at: damage?.fixed_at ?? null,
    fixed_photo_1: damage?.fixed_photo_1 ?? null,
    fixed_photo_2: damage?.fixed_photo_2 ?? null,
    fixed_photo_3: damage?.fixed_photo_3 ?? null,
    repair_notes: damage?.repair_notes ?? null,
    verification_notes: damage?.verification_notes ?? null,
    verified_at: damage?.verified_at ?? null,
    verified_by: damage?.verified_by ?? null,
    is_overdue: isOverdue({ ...damage, workflow_status: workflowStatus }),
  };
}

export function hasValidCoordinates(damage) {
  return Number.isFinite(Number(damage?.latitude)) &&
    Number.isFinite(Number(damage?.longitude));
}

