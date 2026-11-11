import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  ComposedChart, Area, PieChart, Pie, ResponsiveContainer, Tooltip,
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
      pending: '#e9edf3',      // Putih terang
      in_progress: '#c2cad6',  // Abu terang
      fixed: '#8b95a5',        // Abu sedang
      verified: '#5c6675',     // Abu gelap
      rejected: '#3a414d',     // Abu sangat gelap
    },
    types: {
      pothole: '#e9edf3',
      crack: '#8b95a5',
      manhole: '#4a5260',
    },
    grid: '#262b33',
    axis: '#94a3b8',
    tooltipBg: '#14171c',
    tooltipBorder: '#374151',
    tv: {
      grid: '#222834',
      axis: '#787b86',
      cross: '#5c6270',
      chartLine: '#e9edf3',
      tooltipBg: '#1a1f2b',
      tooltipBorder: '#2a3140',
      text: '#d1d4dc',
    },
  },
  light: {
    status: {
      pending: '#111827',      // Abu gelap
      in_progress: '#374151',
      fixed: '#6b7280',
      verified: '#9ca3af',
      rejected: '#d1d5db',     // Abu sangat muda
    },
    types: {
      pothole: '#111827',
      crack: '#6b7280',
      manhole: '#9ca3af',
    },
    grid: '#e5e7eb',
    axis: '#6b7280',
    tooltipBg: '#ffffff',
    tooltipBorder: '#cbd5e1',
    tv: {
      grid: '#eef0f4',
      axis: '#787b86',
      cross: '#9598a1',
      chartLine: '#111827',
      tooltipBg: '#ffffff',
      tooltipBorder: '#e0e3eb',
      text: '#131722',
    },
  },
};

const PRESETS = [
  { key: '1d', labelKey: 'timeRange1d', days: 1, bucket: 'hour' },
  { key: '1w', labelKey: 'timeRange1w', days: 7, bucket: 'day' },
  { key: '1m', labelKey: 'timeRange1m', days: 30, bucket: 'day' },
  { key: '1y', labelKey: 'timeRange1y', days: 365, bucket: 'month' },
  { key: 'custom', labelKey: 'rangeCustom', bucket: null },
];

function toISODateInput(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatPeriodKey(date, bucket) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (bucket === 'hour') {
    const hour = String(date.getHours()).padStart(2, '0');
    return `${day}/${month} ${hour}:00`;
  }
  if (bucket === 'day') {
    return `${day}/${month}`;
  }
  return `${year}-${month}`;
}

export function AnalyticsCharts({ damages }) {
  const { lang, t } = useLanguage();
  const { theme } = useTheme();
  const palette = THEME_PALETTES[theme] || THEME_PALETTES.dark;
  const [timeRange, setTimeRange] = useState('1m');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const isCustom = timeRange === 'custom';

  // Indikator geser (thumb) untuk kontrol rentang waktu — ukur posisi tombol aktif.
  const groupRef = useRef(null);
  const thumbRef = useRef(null);
  const btnRefs = useRef({});

  const moveThumb = useCallback(() => {
    const thumb = thumbRef.current;
    const btn = btnRefs.current[timeRange];
    if (!thumb || !btn) return;
    thumb.style.width = `${btn.offsetWidth}px`;
    thumb.style.transform = `translateX(${btn.offsetLeft}px)`;
    thumb.style.opacity = '1';
  }, [timeRange]);

  useLayoutEffect(() => {
    moveThumb();
    const group = groupRef.current;
    if (!group || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(moveThumb);
    ro.observe(group);
    return () => ro.disconnect();
  }, [moveThumb]);

  // Saat pengguna pindah ke mode Custom dan tanggal belum diisi, isi default 7 hari terakhir.
  // Dipanggil dari event handler (bukan effect) agar tidak memicu re-render berantai.
  const prepareCustomDefaults = () => {
    if (!startDate || !endDate) {
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setUTCDate(now.getUTCDate() - 6);
      setStartDate(toISODateInput(weekAgo));
      setEndDate(toISODateInput(now));
    }
  };

  const handleRangeSelect = (key) => {
    if (key === 'custom') prepareCustomDefaults();
    setTimeRange(key);
  };

  // Rentang aktif dalam UTC agar konsisten dengan created_at dari Supabase (ISO UTC).
  // Mengembalikan null bila mode Custom aktif namun tanggal tidak valid → penyaringan kosong.
  const activeRange = useMemo(() => {
    if (isCustom) {
      if (!startDate || !endDate) return null;
      const start = new Date(`${startDate}T00:00:00Z`);
      const end = new Date(`${endDate}T23:59:59.999Z`);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        start > end
      ) {
        return null;
      }
      const spanDays = Math.max(1, Math.ceil((end - start) / 86400000));
      return {
        start,
        end,
        bucket: spanDays <= 2 ? 'hour' : spanDays <= 62 ? 'day' : 'month',
      };
    }
    const preset = PRESETS.find((p) => p.key === timeRange) || PRESETS[1];
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - (preset.days - 1));
    start.setUTCHours(0, 0, 0, 0);
    return { start, end, bucket: preset.bucket };
  }, [timeRange, startDate, endDate, isCustom]);

  const filteredByRange = useMemo(() => {
    if (!activeRange) return [];
    const { start, end } = activeRange;
    return damages.filter((d) => {
      const created = new Date(d.created_at);
      return (
        !Number.isNaN(created.getTime()) && created >= start && created <= end
      );
    });
  }, [damages, activeRange]);

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
      const key = formatPeriodKey(date, activeRange.bucket);
      if (!buckets[key]) buckets[key] = { periode: key, masuk: 0, selesai: 0, rawTime: date.getTime() };
      buckets[key].masuk += 1;
      if (['fixed', 'verified'].includes(d.workflow_status)) {
        buckets[key].selesai += 1;
      }
    });

    return Object.values(buckets)
      .sort((a, b) => a.rawTime - b.rawTime)
      .map(({ periode, masuk, selesai }) => ({ periode, masuk, selesai }));
  }, [filteredByRange, activeRange.bucket]);

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

  const trendChartData = useMemo(() => (
    trendData.map((item) => ({
      ...item,
      rate: item.masuk > 0 ? (item.selesai / item.masuk) * 100 : 0,
    }))
  ), [trendData]);

  // Nilai rata-rata rate + arah tren (banding ujung-ujung rate).
  const trendMeta = useMemo(() => {
    if (trendChartData.length === 0) return { avg: 0, rising: null };
    const avg = trendChartData.reduce((acc, item) => acc + item.rate, 0) / trendChartData.length;
    const first = trendChartData[0].rate ?? 0;
    const last = trendChartData[trendChartData.length - 1].rate ?? 0;
    return { avg, rising: last > first + 0.5 ? true : last < first - 0.5 ? false : null };
  }, [trendChartData]);

  if (damages.length === 0) return null;

  return (
    <section className="analytics" aria-label={t('tabAnalytics')}>
      <div className="analytics-head">
        <div>
          <p className="section-kicker">{t('tabAnalytics')}</p>
          <h2>{t('analyticsTitle')}</h2>
        </div>

        <div className="analytics-range">
          {isCustom && (
            <div className="custom-range-inline">
              <input
                type="date"
                aria-label={t('rangeFrom')}
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <input
                type="date"
                aria-label={t('rangeTo')}
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          )}

          <div
            className="range-button-group"
            role="group"
            aria-label={t('rangeGroupLabel')}
            ref={groupRef}
          >
            <span className="range-thumb" ref={thumbRef} aria-hidden="true" />
            {PRESETS.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={timeRange === r.key}
                ref={(el) => { btnRefs.current[r.key] = el; }}
                className={`range-pill ${timeRange === r.key ? 'active' : ''}`}
                onClick={() => handleRangeSelect(r.key)}
              >
                {t(r.labelKey)}
              </button>
            ))}
          </div>

          {isCustom && (!startDate || !endDate || startDate > endDate) ? (
            <span className="date-error">{t('rangeInvalid')}</span>
          ) : null}
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

        <article className="chart-card chart-wide trend-card">
          <div className="trend-head">
            <div className="trend-head-main">
              <p className="trend-eyebrow">
                <span className="trend-eyebrow-icon" aria-hidden="true">↗</span>
                {t('chartTrend')}
              </p>
              <div className="trend-hero">
                <strong className="trend-hero-value">{trendSummary.completion}%</strong>
                <span className={`trend-hero-badge ${trendMeta.rising === true ? 'up' : trendMeta.rising === false ? 'down' : 'flat'}`}>
                  {trendMeta.rising === true ? '▲' : trendMeta.rising === false ? '▼' : '—'}
                  {' '}
                  {Math.round(trendMeta.avg)}%
                </span>
              </div>
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
            </div>
          </div>

          <div className="tv-chart">
            {trendChartData.length === 0 ? (
              <div className="trend-empty">{t('trendEmpty')}</div>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                  <ComposedChart
                  data={trendChartData}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="tvAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette.tv.chartLine} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={palette.tv.chartLine} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={palette.tv.grid} vertical={false} />
                  <XAxis
                    dataKey="periode"
                    interval={labelStep - 1}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={12}
                    tick={{ fontSize: 11, fill: palette.tv.axis }}
                  />
                  <YAxis
                    yAxisId="rate"
                    orientation="right"
                    domain={[0, 120]}
                    ticks={[0, 50, 100]}
                    width={38}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: palette.tv.axis }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    cursor={{ stroke: palette.tv.cross, strokeDasharray: '4 4' }}
                    contentStyle={{
                      background: palette.tv.tooltipBg,
                      border: `1px solid ${palette.tv.tooltipBorder}`,
                      borderRadius: 8,
                      color: palette.tv.text,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: palette.tv.text, fontWeight: 700, marginBottom: 4 }}
                    formatter={(value, name) => {
                      if (name === 'rate') return [`${Math.round(value)}%`, t('statCompletionRate')];
                      return [value, name];
                    }}
                  />
                  <Area
                    yAxisId="rate"
                    type="monotone"
                    dataKey="rate"
                    name="rate"
                    stroke={palette.tv.chartLine}
                    strokeWidth={2.5}
                    fill="url(#tvAreaFill)"
                    dot={false}
                    activeDot={{ r: 5, fill: palette.tv.chartLine, stroke: palette.tv.tooltipBg, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

        </article>
      </div>
    </section>
  );
}
