import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  ComposedChart, Area, PieChart, Pie, ResponsiveContainer, ReferenceLine, ReferenceDot, Tooltip,
} from 'recharts';
import { getDamageTypeLabel, getWorkflowStatusLabel } from '../../lib/roadDamage';
import { useLanguage } from '../common/language';
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
    tv: {
      grid: '#222834',
      axis: '#787b86',
      cross: '#5c6270',
      line: '#26a69a',
      areaTop: 'rgba(38, 166, 154, 0.30)',
      areaBottom: 'rgba(38, 166, 154, 0)',
      volume: '#2b3140',
      tooltipBg: '#1a1f2b',
      tooltipBorder: '#2a3140',
      text: '#d1d4dc',
      dim: '#787b86',
    },
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
    tv: {
      grid: '#eff1f4',
      axis: '#787b86',
      cross: '#9598a1',
      line: '#089981',
      areaTop: 'rgba(8, 153, 129, 0.22)',
      areaBottom: 'rgba(8, 153, 129, 0)',
      volume: '#e4e9f0',
      tooltipBg: '#ffffff',
      tooltipBorder: '#e0e3eb',
      text: '#131722',
      dim: '#787b86',
    },
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
  const palette = THEME_PALETTES.dark;
  const [timeRange, setTimeRange] = useState('30d');
  const [hoverIndex, setHoverIndex] = useState(null);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  const [pointer, setPointer] = useState(null);

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

  const typeTotal = useMemo(
    () => typeData.reduce((acc, curr) => acc + curr.jumlah, 0),
    [typeData],
  );

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

  // Ringkasan tren
  const trendSummary = useMemo(() => {
    const masuk = trendData.reduce((total, item) => total + item.masuk, 0);
    const selesai = trendData.reduce((total, item) => total + item.selesai, 0);
    return {
      masuk,
      selesai,
      completion: masuk > 0 ? Math.round((selesai / masuk) * 100) : 0,
    };
  }, [trendData]);

  const labelStep = Math.max(1, Math.ceil(trendData.length / 8));

  const trendChartData = useMemo(
    () => trendData.map((item) => ({
      ...item,
      rate: item.masuk > 0 ? (item.selesai / item.masuk) * 100 : 0,
    })),
    [trendData],
  );

  const volumeMax = useMemo(() => {
    const max = Math.max(1, ...trendChartData.map((item) => item.masuk));
    return max * 4.5;
  }, [trendChartData]);

  const crosshairIndex = hoverIndex ?? pinnedIndex;
  const activeTrend = crosshairIndex !== null
    ? trendChartData[crosshairIndex] ?? null
    : trendChartData[trendChartData.length - 1] ?? null;
  const showCrosshair = crosshairIndex !== null && activeTrend !== null;
  const isPinned = pinnedIndex !== null && hoverIndex === null;
  const tooltipTrend = hoverIndex !== null ? trendChartData[hoverIndex] ?? null : null;

  const handleChartMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const plotWidth = Math.max(1, rect.width - 42);
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x < 0 || x > plotWidth) {
      setHoverIndex(null);
      setPointer(null);
      return;
    }

    const index = Math.min(
      trendChartData.length - 1,
      Math.max(0, Math.floor((x / plotWidth) * trendChartData.length)),
    );
    if (index !== hoverIndex) setHoverIndex(index);
    setPointer({ x, y, width: rect.width, height: rect.height });
  };

  useEffect(() => {
    if (pinnedIndex === null) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') setPinnedIndex(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pinnedIndex]);

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
              onClick={() => {
                setTimeRange(r.key);
                setHoverIndex(null);
                setPinnedIndex(null);
              }}
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
                <Bar dataKey="jumlah" name={t('statTotal')} radius={[0, 4, 4, 0]} isAnimationActive={false}>
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
              {typeTotal} {lang === 'en' ? 'cases' : 'kasus'}
            </span>
          </div>
          <div className="chart-box">
            <div className="pie-chart-layout">
              <div className="pie-chart-wrap">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: palette.tooltipBg,
                        borderColor: palette.tooltipBorder,
                        color: 'var(--ink)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                      formatter={(value, name) => [value, name]}
                    />
                    <Pie
                      data={typeData.filter((entry) => entry.jumlah > 0)}
                      dataKey="jumlah"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={2}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {typeData.filter((entry) => entry.jumlah > 0).map((entry) => (
                        <Cell key={entry.typeKey} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pie-center" aria-hidden="true">
                  <strong>{typeTotal}</strong>
                  <span>{lang === 'en' ? 'cases' : 'kasus'}</span>
                </div>
              </div>

              <ul className="pie-legend">
                {typeData.map((entry) => {
                  const pct = typeTotal > 0 ? Math.round((entry.jumlah / typeTotal) * 100) : 0;
                  return (
                    <li key={entry.typeKey}>
                      <i style={{ background: entry.fill }} />
                      <span>{entry.name}</span>
                      <strong>{entry.jumlah}</strong>
                      <small>{pct}%</small>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </article>

        <article
          className="chart-card chart-wide trend-card"
          style={{
            '--tv-line': palette.tv.line,
            '--tv-volume': palette.tv.volume,
            '--tv-text': palette.tv.text,
            '--tv-dim': palette.tv.dim,
          }}
        >
          <div className="trend-head">
            <div className="trend-head-main">
              <h3>{t('chartTrend')}</h3>
              <p className="trend-subtitle">{t('trendSubtitle')}</p>
            </div>

            <div className="trend-summary" aria-label={t('chartTrend')}>
              <div className="trend-metric">
                <span className="trend-metric-label">{t('incomingReport')}</span>
                <strong className="trend-metric-value">{trendSummary.masuk}</strong>
              </div>
              <div className="trend-metric">
                <span className="trend-metric-label">{t('completedReport')}</span>
                <strong className="trend-metric-value">{trendSummary.selesai}</strong>
              </div>
              <div className="trend-metric trend-metric-accent" style={{ '--tv-line': palette.tv.line }}>
                <span className="trend-metric-label">{t('statCompletionRate')}</span>
                <strong className="trend-metric-value">{trendSummary.completion}%</strong>
              </div>
            </div>
          </div>

          <div className="tv-chart">
            {trendChartData.length === 0 ? (
              <div className="trend-empty">{t('trendEmpty')}</div>
            ) : (
              <>
                <div className="tv-legend" aria-live="polite">
                  <span className="tv-legend-date">{activeTrend?.periode ?? ''}</span>
                  {isPinned ? (
                    <span className="tv-pin">{t('trendPinned')}</span>
                  ) : null}
                  <span className="tv-legend-item">
                    <i className="tv-legend-mark tv-legend-mark-line" />
                    {t('statCompletionRate')}
                    <strong>{Math.round(activeTrend?.rate ?? 0)}%</strong>
                  </span>
                  <span className="tv-legend-item">
                    <i className="tv-legend-mark tv-legend-mark-bar" />
                    {t('incomingReport')}
                    <strong>{activeTrend?.masuk ?? 0}</strong>
                  </span>
                  <span className="tv-legend-item">
                    {t('completedReport')}
                    <strong>{activeTrend?.selesai ?? 0}</strong>
                  </span>
                </div>

                <div
                  className="tv-plot"
                  onMouseMove={handleChartMove}
                  onMouseLeave={() => {
                    setHoverIndex(null);
                    setPointer(null);
                  }}
                  onClick={() => {
                    if (hoverIndex !== null) {
                      setPinnedIndex((current) => (current === hoverIndex ? null : hoverIndex));
                    }
                  }}
                >
                {tooltipTrend && pointer ? (
                  <div
                    className="tv-tooltip"
                    style={{
                      left: Math.min(pointer.x + 16, Math.max(8, pointer.width - 178)),
                      top: Math.min(Math.max(pointer.y - 18, 8), Math.max(8, pointer.height - 150)),
                      background: palette.tv.tooltipBg,
                      borderColor: palette.tv.tooltipBorder,
                      color: palette.tv.text,
                    }}
                  >
                    <p className="tv-tooltip-date">{tooltipTrend.periode}</p>
                    <div className="tv-tooltip-row">
                      <span>{t('incomingReport')}</span>
                      <strong>{tooltipTrend.masuk}</strong>
                    </div>
                    <div className="tv-tooltip-row">
                      <span>{t('completedReport')}</span>
                      <strong>{tooltipTrend.selesai}</strong>
                    </div>
                    <div className="tv-tooltip-row">
                      <span>{t('statCompletionRate')}</span>
                      <strong style={{ color: palette.tv.line }}>
                        {Math.round(tooltipTrend.rate)}%
                      </strong>
                    </div>
                    <div className="tv-tooltip-row tv-tooltip-open">
                      <span>{t('trendOpen')}</span>
                      <strong>{Math.max(tooltipTrend.masuk - tooltipTrend.selesai, 0)}</strong>
                    </div>
                  </div>
                ) : null}

                <ResponsiveContainer width="100%" height={248}>
                  <ComposedChart
                    data={trendChartData}
                    margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="tvAreaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={palette.tv.line} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={palette.tv.line} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke={palette.tv.grid}
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="periode"
                      interval={labelStep - 1}
                      tickLine={false}
                      axisLine={{ stroke: palette.tv.grid }}
                      tickMargin={8}
                      minTickGap={12}
                      tick={{ fontSize: 10, fill: palette.tv.axis }}
                    />
                    <YAxis
                      yAxisId="rate"
                      orientation="right"
                      domain={[0, 100]}
                      ticks={[0, 50, 100]}
                      width={42}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={6}
                      tick={{ fontSize: 10, fill: palette.tv.axis }}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <YAxis yAxisId="volume" hide domain={[0, volumeMax]} />
                    {showCrosshair ? (
                      <>
                        <ReferenceLine
                          yAxisId="rate"
                          y={activeTrend.rate}
                          stroke={palette.tv.cross}
                          strokeDasharray="4 4"
                        />
                        <ReferenceLine
                          x={activeTrend.periode}
                          stroke={palette.tv.cross}
                          strokeDasharray="4 4"
                        />
                        <ReferenceDot
                          yAxisId="rate"
                          x={activeTrend.periode}
                          y={activeTrend.rate}
                          r={4}
                          fill={palette.tv.line}
                          stroke={palette.tv.tooltipBg}
                          strokeWidth={2}
                          isFront
                        />
                      </>
                    ) : null}
                    <Area
                      yAxisId="rate"
                      type="linear"
                      dataKey="rate"
                      stroke={palette.tv.line}
                      strokeWidth={2}
                      fill="url(#tvAreaFill)"
                      dot={false}
                      activeDot={{
                        r: 4,
                        fill: palette.tv.line,
                        stroke: palette.tv.tooltipBg,
                        strokeWidth: 2,
                      }}
                      isAnimationActive={false}
                    />
                    <Bar
                      yAxisId="volume"
                      dataKey="masuk"
                      fill={palette.tv.volume}
                      maxBarSize={9}
                      radius={[1, 1, 0, 0]}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                </div>
                <p className="trend-hint">{t('trendHint')}</p>
              </>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
