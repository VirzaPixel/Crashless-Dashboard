import { useMemo, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, Legend, ResponsiveContainer, Tooltip,
} from 'recharts';
import { getDamageTypeLabel, getWorkflowStatusLabel } from '../../lib/roadDamage';
import { useLanguage } from '../common/language';
import { useTheme } from '../common/theme';
import './AnalyticsCharts.css';

const WORKFLOW_ORDER = ['pending', 'in_progress', 'fixed', 'verified', 'rejected'];
const DAMAGE_TYPE_ORDER = ['pothole', 'crack', 'manhole'];

const THEME_PALETTES = {
  dark: {
    status: {
      pending: '#f87171',      // Merah cerah
      in_progress: '#fbbf24',  // Kuning/oranye
      fixed: '#60a5fa',        // Biru muda
      verified: '#34d399',     // Hijau cerah
      rejected: '#94a3b8',     // Abu-abu
    },
    types: {
      pothole: '#f87171',
      crack: '#60a5fa',
      manhole: '#a78bfa',
    },
    grid: '#262b33',
    axis: '#94a3b8',
    tooltipBg: '#14171c',
    tooltipBorder: '#374151',
    lineIncoming: '#f87171',
    lineResolved: '#34d399',
  },
  light: {
    status: {
      pending: '#ef4444',
      in_progress: '#f59e0b',
      fixed: '#3b82f6',
      verified: '#10b981',
      rejected: '#64748b',
    },
    types: {
      pothole: '#ef4444',
      crack: '#3b82f6',
      manhole: '#8b5cf6',
    },
    grid: '#e5e7eb',
    axis: '#475569',
    tooltipBg: '#ffffff',
    tooltipBorder: '#cbd5e1',
    lineIncoming: '#ef4444',
    lineResolved: '#10b981',
  },
};

const RANGES = [
  { key: 'today', labelKey: 'timeRangeToday' },
  { key: '7d', labelKey: 'timeRange7d' },
  { key: '30d', labelKey: 'timeRange30d' },
  { key: '90d', labelKey: 'timeRange90d' },
  { key: 'year', labelKey: 'timeRangeYear' },
  { key: 'all', labelKey: 'timeRangeAll' },
];

function formatPeriodKey(date, range) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (range === 'today') {
    const hour = String(date.getHours()).padStart(2, '0');
    return `${hour}:00`;
  }
  if (range === '7d' || range === '30d') {
    return `${day}/${month}`;
  }
  return `${year}-${month}`;
}

export function AnalyticsCharts({ damages }) {
  const { lang, t } = useLanguage();
  const { theme } = useTheme();
  const palette = THEME_PALETTES[theme === 'dark' ? 'dark' : 'light'];
  const [timeRange, setTimeRange] = useState('30d');

  const filteredByRange = useMemo(() => {
    if (timeRange === 'all') return damages;

    const now = new Date();
    const start = new Date();

    if (timeRange === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (timeRange === '7d') {
      start.setDate(now.getDate() - 7);
    } else if (timeRange === '30d') {
      start.setDate(now.getDate() - 30);
    } else if (timeRange === '90d') {
      start.setDate(now.getDate() - 90);
    } else if (timeRange === 'year') {
      start.setFullYear(now.getFullYear() - 1);
    }

    return damages.filter((d) => {
      const created = new Date(d.created_at);
      return !Number.isNaN(created.getTime()) && created >= start && created <= now;
    });
  }, [damages, timeRange]);

  // Sebaran status eksklusif 5 status workflow resmi
  const statusData = useMemo(() => {
    const counts = {
      pending: 0,
      in_progress: 0,
      fixed: 0,
      verified: 0,
      rejected: 0,
    };

    filteredByRange.forEach((d) => {
      // Abaikan item yang bukan kerusakan nyata
      if (d.damage_type === 'no_damage') return;
      if (counts[d.workflow_status] !== undefined) {
        counts[d.workflow_status] += 1;
      }
    });

    return WORKFLOW_ORDER.map((statusKey) => ({
      statusKey,
      name: getWorkflowStatusLabel(statusKey, lang),
      jumlah: counts[statusKey],
      fill: palette.status[statusKey] || '#9ca3af',
    }));
  }, [filteredByRange, lang, palette]);

  // Jenis Kerusakan
  const typeData = useMemo(() => {
    const counts = {
      pothole: 0,
      crack: 0,
      manhole: 0,
    };

    filteredByRange.forEach((d) => {
      if (counts[d.damage_type] !== undefined) {
        counts[d.damage_type] += 1;
      }
    });

    return DAMAGE_TYPE_ORDER.map((typeKey) => ({
      typeKey,
      name: getDamageTypeLabel(typeKey, lang),
      jumlah: counts[typeKey],
      fill: palette.types[typeKey] || '#9ca3af',
    }));
  }, [filteredByRange, lang, palette]);

  // Tren Masuk vs Selesai
  const trendData = useMemo(() => {
    const buckets = {};
    filteredByRange.forEach((d) => {
      if (d.damage_type === 'no_damage') return;
      const date = new Date(d.created_at);
      if (Number.isNaN(date.getTime())) return;
      const key = formatPeriodKey(date, timeRange);
      if (!buckets[key]) buckets[key] = { periode: key, masuk: 0, selesai: 0, rawTime: date.getTime() };
      buckets[key].masuk += 1;
      if (['fixed', 'verified'].includes(d.workflow_status)) {
        buckets[key].selesai += 1;
      }
    });

    return Object.values(buckets)
      .sort((a, b) => a.rawTime - b.rawTime)
      .map(({ periode, masuk, selesai }) => ({ periode, masuk, selesai }));
  }, [filteredByRange, timeRange]);

  if (damages.length === 0) return null;

  return (
    <section className="analytics" aria-label={t('tabAnalytics')}>
      <div className="analytics-head">
        <div>
          <p className="section-kicker">{t('tabAnalytics')}</p>
          <h2>{t('analyticsTitle')}</h2>
        </div>

        <div className="range-button-group" role="group" aria-label="Rentang Waktu">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`range-pill ${timeRange === r.key ? 'active' : ''}`}
              onClick={() => setTimeRange(r.key)}
            >
              {t(r.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="analytics-grid">
        <article className="chart-card">
          <div className="chart-card-header">
            <h3>{t('chartStatus')}</h3>
            <span className="chart-total-count">
              {statusData.reduce((acc, curr) => acc + curr.jumlah, 0)} {lang === 'en' ? 'reports' : 'laporan'}
            </span>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                layout="vertical"
                data={statusData}
                margin={{ top: 10, right: 24, left: 24, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={palette.grid} />
                <XAxis type="number" allowDecimals={false} stroke={palette.axis} tick={{ fontSize: 11, fill: palette.axis }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={palette.axis}
                  tick={{ fontSize: 12, fill: palette.axis, fontWeight: 500 }}
                  width={130}
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{
                    backgroundColor: palette.tooltipBg,
                    borderColor: palette.tooltipBorder,
                    color: 'var(--ink)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />
                <Bar dataKey="jumlah" name={t('statTotal')} radius={[0, 4, 4, 0]}>
                  {statusData.map((entry) => (
                    <Cell key={entry.statusKey} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="chart-card">
          <div className="chart-card-header">
            <h3>{t('chartType')}</h3>
            <span className="chart-total-count">
              {typeData.reduce((acc, curr) => acc + curr.jumlah, 0)} {lang === 'en' ? 'cases' : 'kasus'}
            </span>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                layout="vertical"
                data={typeData}
                margin={{ top: 10, right: 24, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={palette.grid} />
                <XAxis type="number" allowDecimals={false} stroke={palette.axis} tick={{ fontSize: 11, fill: palette.axis }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={palette.axis}
                  tick={{ fontSize: 12, fill: palette.axis, fontWeight: 500 }}
                  width={110}
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{
                    backgroundColor: palette.tooltipBg,
                    borderColor: palette.tooltipBorder,
                    color: 'var(--ink)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />
                <Bar dataKey="jumlah" name={t('statTotal')} radius={[0, 4, 4, 0]}>
                  {typeData.map((entry) => (
                    <Cell key={entry.typeKey} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="chart-card chart-wide">
          <div className="chart-card-header">
            <h3>{t('chartTrend')}</h3>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={270}>
              <AreaChart data={trendData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradientMasuk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={palette.lineIncoming} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={palette.lineIncoming} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradientSelesai" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={palette.lineResolved} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={palette.lineResolved} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis dataKey="periode" stroke={palette.axis} tick={{ fontSize: 11, fill: palette.axis }} />
                <YAxis allowDecimals={false} stroke={palette.axis} tick={{ fontSize: 11, fill: palette.axis }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: palette.tooltipBg,
                    borderColor: palette.tooltipBorder,
                    color: 'var(--ink)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />
                <Legend
                  wrapperStyle={{
                    color: 'var(--ink)',
                    paddingTop: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="masuk"
                  name={t('incomingReport')}
                  stroke={palette.lineIncoming}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#gradientMasuk)"
                  dot={{ r: 3.5, fill: palette.lineIncoming }}
                />
                <Area
                  type="monotone"
                  dataKey="selesai"
                  name={t('completedReport')}
                  stroke={palette.lineResolved}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#gradientSelesai)"
                  dot={{ r: 3.5, fill: palette.lineResolved }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
    </section>
  );
}
