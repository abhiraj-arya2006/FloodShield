import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchGauges,
  fetchEdges,
  fetchDates,
  fetchForecast,
} from '../services/api';
import {
  GaugeItem,
  EdgeItem,
  GaugeForecastRow,
  ForecastResponse,
} from '../types';
import { SummaryCards } from '../components/SummaryCards';
import { RiverMap } from '../components/RiverMap';
import { StatusChip } from '../components/StatusChip';
import { useTranslation } from '../i18n/LanguageContext';
import { Calendar, ChevronRight, ShieldAlert, AlertTriangle, Layers, Filter } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // State
  const [gauges, setGauges] = useState<GaugeItem[]>([]);
  const [edges, setEdges] = useState<EdgeItem[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('2010-08-15'); // Monsoon peak date
  const [selectedLead, setSelectedLead] = useState<number>(2); // Default to headline lead 2
  const [selectedBasin, setSelectedBasin] = useState<string>('ALL'); // ALL, Godavari, Mahanadi

  const [forecastData, setForecastData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load metadata on mount
  useEffect(() => {
    Promise.all([fetchGauges(), fetchEdges(), fetchDates()])
      .then(([gRes, eRes, dRes]) => {
        setGauges(gRes.gauges);
        setEdges(eRes.edges);
        setAvailableDates(dRes.dates);
        if (dRes.dates.length > 0 && !dRes.dates.includes(selectedDate)) {
          setSelectedDate(dRes.dates[0]);
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load initial metadata');
      });
  }, []);

  // Fetch forecast whenever date or lead changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    fetchForecast(selectedDate, selectedLead)
      .then((res) => {
        setForecastData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load forecast for selected date');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedDate, selectedLead]);

  // Filtered gauges and forecast rows based on basin filter
  const filteredGauges = useMemo(() => {
    if (selectedBasin === 'ALL') return gauges;
    return gauges.filter((g) => g.basin === selectedBasin);
  }, [gauges, selectedBasin]);

  const filteredForecastRows = useMemo(() => {
    if (!forecastData) return [];
    if (selectedBasin === 'ALL') return forecastData.gauges;
    return forecastData.gauges.filter((g) => g.basin === selectedBasin);
  }, [forecastData, selectedBasin]);

  // Highest peak gauge for KPI card
  const peakGauge = useMemo(() => {
    if (filteredForecastRows.length === 0) return null;
    return [...filteredForecastRows].sort((a, b) => b.predicted_m3s - a.predicted_m3s)[0];
  }, [filteredForecastRows]);

  // Active alerts list for the right panel
  const activeAlertGauges = useMemo(() => {
    return filteredForecastRows.filter((g) => g.status === 'WARNING' || g.status === 'WATCH');
  }, [filteredForecastRows]);

  const warningCount = useMemo(() => {
    return filteredForecastRows.filter((g) => g.status === 'WARNING').length;
  }, [filteredForecastRows]);

  const watchCount = useMemo(() => {
    return filteredForecastRows.filter((g) => g.status === 'WATCH').length;
  }, [filteredForecastRows]);

  return (
    <div className="space-y-6">
      {/* Control Bar: Lead Day Buttons + Date Picker + Basin Filter */}
      <div className="bg-[#0c1424] border border-slate-800/80 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        {/* Left: Lead Horizon Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
            {t('lead_day_label')}
          </span>
          {[
            { day: 1, label: t('nowcast'), isNowcast: true },
            { day: 2, label: t('headline_day2'), isNowcast: false },
            { day: 3, label: t('headline_day3'), isNowcast: false },
            { day: 4, label: t('headline_day4'), isNowcast: false },
          ].map((item) => (
            <button
              key={item.day}
              onClick={() => setSelectedLead(item.day)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedLead === item.day
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>{item.label}</span>
              {item.isNowcast && (
                <span className="text-[10px] uppercase font-mono px-1 rounded bg-slate-950/40">
                  Nowcast
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Right: Date Picker & Basin Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Basin Filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <select
              value={selectedBasin}
              onChange={(e) => setSelectedBasin(e.target.value)}
              className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer font-medium"
            >
              <option value="ALL" className="bg-slate-900">All Basins (46)</option>
              <option value="Godavari" className="bg-slate-900">Godavari Basin (27)</option>
              <option value="Mahanadi" className="bg-slate-900">Mahanadi Basin (19)</option>
            </select>
          </div>

          {/* Date Picker constrained to 2009-2012 validation period */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-400 hidden sm:inline">{t('date_label')}</span>
            <input
              type="date"
              min="2009-01-01"
              max="2012-12-31"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-white font-mono font-semibold focus:outline-none cursor-pointer text-xs"
            />
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/50 text-red-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <SummaryCards
        totalGauges={filteredGauges.length}
        warningCount={warningCount}
        watchCount={watchCount}
        peakGauge={peakGauge}
      />

      {/* Main Operations Grid: Map (8 cols) + Active Alerts (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* River Map View */}
        <div className="lg:col-span-8 flex flex-col min-h-130">
          <RiverMap
            gauges={filteredGauges}
            edges={edges}
            forecastRows={filteredForecastRows}
            selectedBasin={selectedBasin}
          />
        </div>

        {/* Active Alerts Side List */}
        <div className="lg:col-span-4 bg-[#0c1424] border border-slate-800/80 rounded-2xl p-4 shadow-xl flex flex-col h-130">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <h3 className="font-extrabold text-sm text-white">
                {t('active_alerts_title')}
              </h3>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {activeAlertGauges.length} Active
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 mt-3 pr-1">
            {activeAlertGauges.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                </div>
                <p className="font-semibold text-slate-400">{t('no_alerts_message')}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Try selecting a mid-August date (e.g. 2010-08-15) to inspect peak monsoon flood events.
                </p>
              </div>
            ) : (
              activeAlertGauges.map((alert) => (
                <div
                  key={alert.gauge_id}
                  onClick={() => navigate(`/gauge/${alert.gauge_id}`)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                    alert.status === 'WARNING'
                      ? 'bg-red-950/20 border-red-500/30 hover:border-red-500/60'
                      : 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-white">{alert.name}</h4>
                      <p className="text-[11px] text-slate-400">
                        {alert.river} River ({alert.basin})
                      </p>
                    </div>
                    <StatusChip status={alert.status} size="sm" />
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-xs">
                    <div>
                      <span className="text-slate-400 text-[11px]">Predicted: </span>
                      <span className="font-mono font-extrabold text-white">
                        {alert.predicted_m3s.toLocaleString()} m³/s
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-cyan-400 font-semibold">
                      <span>View</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

