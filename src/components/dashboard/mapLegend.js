export const MAP_STATUS_COLORS = {
  pending: '#ef4444',
  in_progress: '#f59e0b',
  fixed: '#3b82f6',
  verified: '#22c55e',
  rejected: '#6b7280',
};

export const MAP_LEGEND = [
  { status: 'pending', label: 'Menunggu', color: MAP_STATUS_COLORS.pending },
  { status: 'in_progress', label: 'Ditangani', color: MAP_STATUS_COLORS.in_progress },
  { status: 'fixed', label: 'Menunggu verifikasi', color: MAP_STATUS_COLORS.fixed },
  { status: 'verified', label: 'Selesai', color: MAP_STATUS_COLORS.verified },
  { status: 'rejected', label: 'Ditolak', color: MAP_STATUS_COLORS.rejected },
];
