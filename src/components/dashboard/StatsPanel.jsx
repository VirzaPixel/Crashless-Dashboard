import { BarChart3, AlertTriangle, CheckCircle, TrendingUp, Clock3, ShieldCheck } from 'lucide-react';
import { isOverdue } from '../../lib/roadDamage';
import './StatsPanel.css';

export function StatsPanel({ damages }) {
  const total = damages.length;
  const fixed = damages.filter((damage) =>
    ['fixed', 'verified'].includes(damage.workflow_status),
  ).length;
  const pending = damages.filter((damage) =>
    ['pending', 'in_progress'].includes(damage.workflow_status),
  ).length;
  const overdue = damages.filter((damage) => isOverdue(damage)).length;
  const awaitingVerification = damages.filter(
    (damage) => damage.workflow_status === 'fixed',
  ).length;
  const completionRate = total > 0 ? ((fixed / total) * 100).toFixed(0) : 0;

  const stats = [
    { title: 'Total Laporan', value: total, icon: BarChart3, tone: 'accent' },
    { title: 'Dalam Proses', value: pending, icon: AlertTriangle, tone: 'warning' },
    { title: 'Selesai', value: fixed, icon: CheckCircle, tone: 'success' },
    { title: 'Tingkat Penyelesaian', value: `${completionRate}%`, icon: TrendingUp, tone: 'accent' },
    { title: 'Melewati Batas Waktu', value: overdue, icon: Clock3, tone: 'danger' },
    { title: 'Menunggu Verifikasi', value: awaitingVerification, icon: ShieldCheck, tone: 'info' },
  ];

  return (
    <section className="stats-grid" aria-label="Ringkasan laporan">
      {stats.map(({ title, value, icon: Icon, tone }) => (
        <article key={title} className={`stat-card tone-${tone}`}>
          <div className="stat-info">
            <span className="stat-label">{title}</span>
            <span className="stat-value">{value}</span>
          </div>
          <span className="stat-icon-wrapper" aria-hidden="true">
            <Icon size={19} strokeWidth={1.8} />
          </span>
        </article>
      ))}
    </section>
  );
}
