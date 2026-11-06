import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchSingleGaugeForecast,
  fetchEdges,
  fetchGauges,
} from '../services/api';
import {
  SingleGaugeForecastResponse,
  EdgeItem,
  GaugeItem,
} from '../types';
import { StatusChip } from '../components/StatusChip';
import { useLanguage } from '../i18n/LanguageContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Waves,
  TrendingUp,
  GitBranch,
  ShieldAlert,
} from 'lucide-react';

export const GaugeForecastPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();

  const [date, setDate] = useState<string>('2010-08-15');
  const [forecast, setForecast] = useState<SingleGaugeForecastResponse | null>(null);
  const [edges, setEdges] = useState<EdgeItem[]>([]);
  const [gauges, setGauges] = useState<GaugeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchEdges(), fetchGauges()])
      .then(([eRes, gRes]) => {
        setEdges(eRes.edges);
        setGauges(gRes.gauges);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchSingleGaugeForecast(id, date)
      .then((res) => {
        setForecast(res);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load gauge forecast');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, date]);

  // Name map
  const gaugeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    gauges.forEach((g) => map.set(g.gauge_id, `${g.name} (${g.river})`));
    return map;
  }, [gauges]);

  // Upstream & Downstream neighbors
  const upstreamReaches = useMemo(() => {
    if (!id) return [];
    return edges.filter((e) => e.to_gauge_id === id);
  }, [edges, id]);

  const downstreamReaches = useMemo(() => {
    if (!id) return [];
    return edges.filter((e) => e.from_gauge_id === id);
  }, [edges, id]);

  // Chart dataset formatted for Recharts
  const chartData = useMemo(() => {
    if (!forecast) return [];
    return forecast.lead_days.map((ld) => {
      const label =
        ld.lead_day === 1
          ? t('lead_day_1')
          : ld.lead_day === 2
          ? t('lead_day_2')
          : ld.lead_day === 3
          ? t('lead_day_3')
          : t('lead_day_4');

      return {
        name: label,
        leadDay: ld.lead_day,
        predicted: ld.predicted_m3s,
        status: ld.status,
        observed: forecast.observed_m3s,
      };
    });
  }, [forecast, t]);

  // Headline status
  const maxStatus = useMemo(() => {
    if (!forecast) return 'OK';
    const hasWarn = forecast.lead_days.some((ld) => ld.status === 'WARNING');
    if (hasWarn) return 'WARNING';
    const hasWatch = forecast.lead_days.some((ld) => ld.status === 'WATCH');
    if (hasWatch) return 'WATCH';
    return 'OK';
  }, [forecast]);

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B1E26] border border-white/10 text-xs font-mono font-semibold text-slate-300 hover:text-white hover:bg-[#14343F] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('back_to_dashboard')}</span>
        </Link>

        {/* Date Selector */}
        <div className="flex items-center gap-2 bg-[#0B1E26] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono">
          <Calendar className="w-4 h-4 text-[#5CB8C4]" />
          <span className="text-slate-400">{t('date_label')}</span>
          <input
            type="date"
            min="2009-01-01"
            max="2012-12-31"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-white font-mono font-bold focus:outline-none cursor-pointer text-xs"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/50 text-red-300 text-xs font-mono flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {forecast && (
        <>
          {/* Header Card: Gauge Details & Status */}
          <div className="bg-[#0B1E26] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#5CB8C4]/10 border border-[#5CB8C4]/30 flex items-center justify-center text-[#5CB8C4] shadow-[0_0_15px_rgba(92,184,196,0.2)]">
                  <Waves className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="font-heading font-extrabold text-2xl text-white">{forecast.name}</h1>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-[#0F2831] text-[#5CB8C4] border border-white/10 font-bold">
                      {forecast.gauge_id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                    <span>{forecast.river} River</span>
                    <span>•</span>
                    <span className="text-slate-200 font-semibold">{forecast.basin} Basin</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-500">
                      <MapPin className="w-3 h-3 text-[#5CB8C4]" />
                      {forecast.ghi_lat.toFixed(2)}°N, {forecast.ghi_lon.toFixed(2)}°E
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Threshold Indicators & Status Chip */}
            <div className="flex flex-wrap items-center gap-4 bg-[#07141C] border border-white/10 p-3.5 rounded-xl font-mono">
              <div>
                <p className="text-[10px] text-slate-400 uppercase">{t('watch_threshold')}</p>
                <p className="text-sm font-bold text-[#E8B94A]">
                  {forecast.q90_m3s.toLocaleString()} m³/s
                </p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase">{t('flood_threshold')}</p>
                <p className="text-sm font-bold text-[#FF6A3D]">
                  {forecast.q95_m3s.toLocaleString()} m³/s
                </p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-400 uppercase mb-0.5">Overall Status</span>
                <StatusChip status={maxStatus} size="md" />
              </div>
            </div>
          </div>

          {/* Hydrograph Chart Section */}
          <div className="bg-[#0B1E26] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-heading font-extrabold text-base text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#5CB8C4]" />
                  <span>{t('hydrograph_title')}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  {t('hydrograph_subtitle')}
                </p>
              </div>

              {forecast.observed_m3s !== null && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-slate-300">Observed Flow: </span>
                  <span className="font-bold text-emerald-400">
                    {forecast.observed_m3s.toLocaleString()} m³/s
                  </span>
                </div>
              )}
            </div>

            {/* Recharts Bar Chart Container */}
            <div className="w-full h-95 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#14343F" />
                  <XAxis
                    dataKey="name"
                    stroke="#8FA9AB"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#8FA9AB"
                    fontSize={12}
                    tickFormatter={(val) => `${val.toLocaleString()} m³/s`}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B1E26',
                      borderColor: 'rgba(255,255,255,0.15)',
                      borderRadius: '0.875rem',
                      color: '#D8E6E4',
                      fontFamily: 'monospace',
                    }}
                    formatter={(value: any, name: any) => [
                      `${Number(value).toLocaleString()} m³/s`,
                      name === 'predicted' ? 'Predicted Flow' : 'Observed Flow',
                    ]}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontFamily: 'monospace' }} />

                  {/* Threshold Reference Lines */}
                  <ReferenceLine
                    y={forecast.q95_m3s}
                    stroke="#FF6A3D"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    label={{
                      value: `Flood Warning (q95): ${forecast.q95_m3s.toLocaleString()} m³/s`,
                      fill: '#FF6A3D',
                      position: 'top',
                      fontSize: 11,
                    }}
                  />
                  <ReferenceLine
                    y={forecast.q90_m3s}
                    stroke="#E8B94A"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Flood Watch (q90): ${forecast.q90_m3s.toLocaleString()} m³/s`,
                      fill: '#E8B94A',
                      position: 'top',
                      fontSize: 11,
                    }}
                  />

                  {/* Predicted Flow Bar */}
                  <Bar
                    dataKey="predicted"
                    name="STG-Mamba Predicted Flow"
                    fill="#5CB8C4"
                    radius={[6, 6, 0, 0]}
                  />

                  {/* Observed Bar if available */}
                  {forecast.observed_m3s !== null && (
                    <Bar
                      dataKey="observed"
                      name="Observed Streamflow"
                      fill="#7CC4A4"
                      radius={[6, 6, 0, 0]}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="text-[11px] font-mono text-slate-500 pt-2 border-t border-white/5 flex items-center justify-between">
              <span>* Lead Day 1 is treated as a Nowcast. Headline flood forecasts are Lead Days 2 to 4.</span>
              <span className="text-[#5CB8C4]">Replay Period: 2009–2012 Validation Set</span>
            </div>
          </div>

          {/* River Network Connectivity: Upstream & Downstream Neighbors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upstream Gauges */}
            <div className="bg-[#0B1E26] border border-white/10 rounded-2xl p-5 shadow-2xl space-y-3">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <GitBranch className="w-4 h-4 text-[#5CB8C4] rotate-180" />
                <h4 className="font-heading font-bold text-sm text-white">{t('upstream_gauges')}</h4>
              </div>

              {upstreamReaches.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2 font-mono">{t('no_upstream')}</p>
              ) : (
                <div className="space-y-2">
                  {upstreamReaches.map((reach) => (
                    <Link
                      key={reach.from_gauge_id}
                      to={`/gauge/${reach.from_gauge_id}`}
                      className="p-3 rounded-xl bg-[#07141C] border border-white/10 hover:border-[#5CB8C4]/50 flex items-center justify-between transition-colors text-xs font-mono"
                    >
                      <div>
                        <span className="font-bold text-white">
                          {gaugeNameMap.get(reach.from_gauge_id) || reach.from_gauge_id}
                        </span>
                        <p className="text-[11px] text-slate-400">ID: {reach.from_gauge_id}</p>
                      </div>
                      <span className="text-[#5CB8C4] font-bold">
                        {reach.river_distance_km} km upstream
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Downstream Gauges */}
            <div className="bg-[#0B1E26] border border-white/10 rounded-2xl p-5 shadow-2xl space-y-3">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <GitBranch className="w-4 h-4 text-[#5CB8C4]" />
                <h4 className="font-heading font-bold text-sm text-white">{t('downstream_gauges')}</h4>
              </div>

              {downstreamReaches.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2 font-mono">{t('no_downstream')}</p>
              ) : (
                <div className="space-y-2">
                  {downstreamReaches.map((reach) => (
                    <Link
                      key={reach.to_gauge_id}
                      to={`/gauge/${reach.to_gauge_id}`}
                      className="p-3 rounded-xl bg-[#07141C] border border-white/10 hover:border-[#5CB8C4]/50 flex items-center justify-between transition-colors text-xs font-mono"
                    >
                      <div>
                        <span className="font-bold text-white">
                          {gaugeNameMap.get(reach.to_gauge_id) || reach.to_gauge_id}
                        </span>
                        <p className="text-[11px] text-slate-400">ID: {reach.to_gauge_id}</p>
                      </div>
                      <span className="text-[#5CB8C4] font-bold">
                        {reach.river_distance_km} km downstream
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
