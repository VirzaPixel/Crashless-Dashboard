const DAMAGE_LABELS = {
  pothole: 'Lubang Jalan',
  crack: 'Retakan',
  manhole: 'Manhole',
  no_damage: 'Tidak Ada Kerusakan',
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

const REAL_DAMAGE_TYPES = new Set(['pothole', 'crack', 'manhole']);
const SUPPORTED_TYPES = new Set([...Object.keys(DAMAGE_LABELS), 'unknown']);
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
    .filter((detection) => REAL_DAMAGE_TYPES.has(detection?.label))
    .reduce((primary, detection) => {
      if (!primary) return detection;
      return toFiniteNumber(detection.confidence) >
        toFiniteNumber(primary.confidence)
        ? detection
        : primary;
    }, null);
}

export function getDamageType(damage) {
  if (hasNoDamage(damage)) return 'no_damage';

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

export function formatConfidenceScore(damage) {
  if (hasNoDamage(damage)) return null;
  const score = getConfidenceScore(damage);
  if (!Number.isFinite(score)) return null;
  return `${(score * 100).toFixed(0)}%`;
}

export function getConfidenceScore(damage) {
  const rawScore = damage?.confidence_score;
  if (rawScore !== null && rawScore !== undefined && rawScore !== '') {
    const explicitScore = Number(rawScore);
    if (Number.isFinite(explicitScore)) return explicitScore;
  }

  const primary = getPrimaryDetection(damage);
  if (primary) {
    const primaryScore = Number(primary.confidence);
    if (Number.isFinite(primaryScore)) return primaryScore;
  }

  // Tidak ada info AI sama sekali → null (bukan 0!) agar tidak
  // disalahartikan sebagai "tidak ada kerusakan".
  return null;
}

export function hasNoDamage(damage) {
  // Hanya "tidak ada kerusakan" bila AI EKSPILISIT memberi skor 0 —
  // via confidence_score, deteksi primer, atau daftar deteksi.
  // Data tanpa info AI sama sekali (null/tanpa deteksi) = bukan no_damage,
  // supaya laporan lama tetap tampil normal.
  const rawScore = damage?.confidence_score;
  if (rawScore !== null && rawScore !== undefined && rawScore !== '') {
    const explicitScore = Number(rawScore);
    if (Number.isFinite(explicitScore)) return explicitScore <= 0;
  }

  const detections = getDamageDetections(damage);
  const realDetections = detections.filter((detection) =>
    REAL_DAMAGE_TYPES.has(detection?.label),
  );
  if (realDetections.length > 0) {
    return !realDetections.some(
      (detection) => Number(detection?.confidence) > 0,
    );
  }

  return false;
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

