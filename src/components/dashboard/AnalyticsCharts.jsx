import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts';
import { getDamageTypeLabel, getWorkflowStatusLabel } from '../../lib/roadDamage';
import './AnalyticsCharts.css';

const STATUS_COLORS = {
  pending: '#ef4444',
  in_progress: '#f59e0b',
  fixed: '#3b82f6',
  verified: '#22c55e',
  rejected: '#6b7280',
};

const TYPE_COLORS = {
  pothole: '#f59e0b',
  crack: '#3b82f6',
  manhole: '#8b5cf6',
  no_damage: '#22c55e',
  unknown: '#9ca3af',
};

function weekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function AnalyticsCharts({ damages }) {
  const statusData = useMemo(() => {
    const counts = {};
    damages.forEach((d) => {
      counts[d.workflow_status] = (counts[d.workflow_status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, value]) => ({
      name: getWorkflowStatusLabel(status),
      value,
      fill: STATUS_COLORS[status] || '#9ca3af',
    }));
  }, [damages]);

  const typeData = useMemo(() => {
    const counts = {};
    damages.forEach((d) => {
      counts[d.damage_type] = (counts[d.damage_type] || 0) + 1;
    });
    return Object.entries(counts).map(([type, jumlah]) => ({
      name: getDamageTypeLabel(type),
      jumlah,
      fill: TYPE_COLORS[type] || '#9ca3af',
    }));
  }, [damages]);

  const trendData = useMemo(() => {
    const weeks = {};
    damages.forEach((d) => {
      const date = new Date(d.created_at);
      if (Number.isNaN(date.getTime())) return;
      const key = weekKey(date);
      if (!weeks[key]) weeks[key] = { minggu: key, masuk: 0, selesai: 0 };
      weeks[key].masuk += 1;
      if (['fixed', 'verified'].includes(d.workflow_status)) weeks[key].selesai += 1;
    });
    return Object.values(weeks).sort((a, b) => (a.minggu < b.minggu ? -1 : 1)).slice(-12);
  }, [damages]);

  if (damages.length === 0) return null;

  return (
    <section className="analytics" aria-label="Analitik laporan">
      <div className="analytics-head">
        <div>
          <p className="section-kicker">Analitik</p>
          <h2>Tren &amp; sebaran laporan</h2>
        </div>
      </div>
      <div className="analytics-grid">
        <article className="chart-card">
          <h3>Sebaran status</h3>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={80} label>
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="chart-card">
          <h3>Tipe kerusakan</h3>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="jumlah">
                  {typeData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="chart-card chart-wide">
          <h3>Tren mingguan (12 minggu terakhir)</h3>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="minggu" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="masuk" name="Masuk" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="selesai" name="Selesai" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
    </section>
  );
}
