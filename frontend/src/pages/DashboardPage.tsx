import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchGauges,
  fetchEdges,
  fetchDates,
  fetchForecast,
  fetchAlerts,
} from '../services/api';
import {
  GaugeItem,
  EdgeItem,
  GaugeForecastRow,
  ForecastResponse,
  AlertItem,
} from '../types';
import { SummaryCards } from '../components/SummaryCards';
import { RiverMap } from '../components/RiverMap';
import { StatusChip } from '../components/StatusChip';
import { PriorityActionTerminal } from '../components/common/PriorityActionTerminal';
import { GlobalAtmosphericCanvas } from '../components/common/GlobalAtmosphericCanvas';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Calendar,
  ChevronRight,
  ShieldAlert,
  AlertTriangle,
  Layers,
  Filter,
  Play,
  Pause,
  Sliders,
  BookOpen,
  Search,
  Waves,
  Cpu,
  ArrowRight,
  Activity,
} from 'lucide-react';

interface DashboardPageProps {
  onOpenWhatIf?: () => void;
  onOpenDocs?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenWhatIf,
  onOpenDocs,
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  // State
  const [gauges, setGauges] = useState<GaugeItem[]>([]);
  const [edges, setEdges] = useState<EdgeItem[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('2010-08-15'); // Monsoon peak date
  const [selectedLead, setSelectedLead] = useState<number>(2); // Default to headline lead 2
  const [selectedBasin, setSelectedBasin] = useState<string>('ALL'); // ALL, Godavari, Mahanadi
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<string>('ALL'); // ALL, WARNING, WATCH, OK
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPlayingTimeline, setIsPlayingTimeline] = useState<boolean>(false);

  const [forecastData, setForecastData] = useState<ForecastResponse | null>(null);
  const [alertsData, setAlertsData] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial metadata on mount
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

  // Fetch forecast & alerts whenever date or lead changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    Promise.all([
      fetchForecast(selectedDate, selectedLead),
      fetchAlerts(selectedDate, selectedLead),
    ])
      .then(([fRes, aRes]) => {
        setForecastData(fRes);
        setAlertsData(aRes.alerts);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load forecast for selected date');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedDate, selectedLead]);

  // Timeline auto-play effect (advances lead days 1 -> 2 -> 3 -> 4 -> 1)
  useEffect(() => {
    let timer: any = null;
    if (isPlayingTimeline) {
      timer = setInterval(() => {
        setSelectedLead((prev) => (prev >= 4 ? 1 : prev + 1));
      }, 2400);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlayingTimeline]);

  // Filtered gauges and forecast rows
  const filteredGauges = useMemo(() => {
    if (selectedBasin === 'ALL') return gauges;
    return gauges.filter((g) => g.basin === selectedBasin);
  }, [gauges, selectedBasin]);

  const filteredForecastRows = useMemo(() => {
    if (!forecastData) return [];
    return forecastData.gauges.filter((g) => {
      const matchBasin = selectedBasin === 'ALL' || g.basin === selectedBasin;
      const matchRisk = selectedRiskFilter === 'ALL' || g.status === selectedRiskFilter;
      const matchSearch =
        searchQuery.trim() === '' ||
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.river.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.gauge_id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchBasin && matchRisk && matchSearch;
    });
  }, [forecastData, selectedBasin, selectedRiskFilter, searchQuery]);

  // Filtered alerts for the terminal
  const filteredAlerts = useMemo(() => {
    return alertsData.filter((a) => {
      if (selectedBasin === 'ALL') return true;
      return a.basin === selectedBasin;
    });
  }, [alertsData, selectedBasin]);

  // Highest peak gauge for KPI card
  const peakGauge = useMemo(() => {
    if (filteredForecastRows.length === 0) return null;
    return [...filteredForecastRows].sort((a, b) => b.predicted_m3s - a.predicted_m3s)[0];
  }, [filteredForecastRows]);

  // Active alerts list for the side panel
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
    <div className="space-y-8 relative">
      {/* Dynamic Atmospheric Canvas Background */}
      <GlobalAtmosphericCanvas />

      {/* Headline: states what the screen shows for the chosen date and lead time */}
      <header className="relative z-10 pt-6 pb-2 max-w-4xl">
        <h1 className="font-light tracking-[-0.03em] leading-[1.04] text-[clamp(2.2rem,5.2vw,4.4rem)] text-mist">
          {warningCount > 0 ? (
            <>
              {warningCount} {warningCount === 1 ? 'gauge is' : 'gauges are'} forecast to pass the flood line
              {' '}
              <span className="text-[#8FA9AB]">
                {selectedLead === 1 ? 'tomorrow' : `in ${selectedLead} days`}.
              </span>
            </>
          ) : (
            <>
              No gauge is forecast to pass the flood line{' '}
              <span className="text-[#8FA9AB]">{selectedLead === 1 ? 'tomorrow' : `in ${selectedLead} days`}.</span>
            </>
          )}
        </h1>
        <p className="mt-4 text-[#8FA9AB] text-base max-w-[58ch] leading-relaxed">
          Model predictions replayed for{' '}
          <span className="text-mist">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          , across 46 river gauges in the Godavari and Mahanadi basins. {watchCount} more {watchCount === 1 ? 'is' : 'are'} on watch.
        </p>
      </header>

      {/* Mission Control Bar: Lead Horizons + Timeline Auto-Play + Date + Filters */}
      <div className="relative z-10 bg-[#0B1E26]/95 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-md space-y-4">
        {/* Top Control Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Lead Day Buttons & Timeline Playback */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#8FA9AB] uppercase tracking-wider mr-1">
              {t('lead_day_label')}
            </span>

            {/* Play/Pause Timeline Auto-Play Button */}
            <button
              onClick={() => setIsPlayingTimeline(!isPlayingTimeline)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isPlayingTimeline
                  ? 'bg-[#7CC4A4] text-[#07141C] shadow-[0_0_15px_rgba(124,196,164,0.4)]'
                  : 'bg-[#0F2831] text-slate-300 border border-white/10 hover:border-[#5CB8C4]/40 hover:text-white'
              }`}
              title={isPlayingTimeline ? 'Pause Lead Timeline' : 'Auto-Play 4-Day Forecast Timeline'}
            >
              {isPlayingTimeline ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlayingTimeline ? 'Auto-Advancing' : 'Play Sequence'}</span>
            </button>

            {[
              { day: 1, label: t('nowcast'), isNowcast: true },
              { day: 2, label: t('headline_day2'), isNowcast: false },
              { day: 3, label: t('headline_day3'), isNowcast: false },
              { day: 4, label: t('headline_day4'), isNowcast: false },
            ].map((item) => (
              <button
                key={item.day}
                onClick={() => {
                  setIsPlayingTimeline(false);
                  setSelectedLead(item.day);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedLead === item.day
                    ? 'bg-[#5CB8C4] text-[#07141C] shadow-[0_0_15px_rgba(92,184,196,0.35)]'
                    : 'bg-[#0F2831] border border-white/10 text-[#8FA9AB] hover:text-white hover:bg-[#14343F]'
                }`}
              >
                <span>{item.label}</span>
                {item.isNowcast && (
                  <span className="text-[10px] uppercase font-mono px-1 rounded bg-[#07141C]/50">
                    Nowcast
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right: Date Picker & Basin Filter */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Basin Filter */}
            <div className="flex items-center gap-1.5 bg-[#0F2831] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono">
              <Filter className="w-3.5 h-3.5 text-[#5CB8C4]" />
              <select
                value={selectedBasin}
                onChange={(e) => setSelectedBasin(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-[#0B1E26]">All Basins (46)</option>
                <option value="Godavari" className="bg-[#0B1E26]">Godavari Basin (27)</option>
                <option value="Mahanadi" className="bg-[#0B1E26]">Mahanadi Basin (19)</option>
              </select>
            </div>

            {/* Date Picker (2009-2012) */}
            <div className="flex items-center gap-2 bg-[#0F2831] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono">
              <Calendar className="w-4 h-4 text-[#5CB8C4]" />
              <span className="text-slate-400 hidden sm:inline">{t('date_label')}</span>
              <input
                type="date"
                min="2009-01-01"
                max="2012-12-31"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white font-mono font-bold focus:outline-none cursor-pointer text-xs"
              />
            </div>
          </div>
        </div>

        {/* Secondary Filter Row: Search & Status Filter */}
        <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 flex-1 max-w-md bg-[#07141C] border border-white/10 rounded-xl px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search by gauge ID, name, or river (e.g., Dowleswaram, Pravara, Tel)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none w-full text-xs font-sans"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-500 hover:text-white cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Risk Filter:</span>
            {['ALL', 'WARNING', 'WATCH', 'OK'].map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRiskFilter(r)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                  selectedRiskFilter === r
                    ? 'bg-white/20 text-white font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="relative z-10 p-4 rounded-xl bg-red-950/50 border border-red-500/50 text-red-300 text-xs font-mono flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="relative z-10">
        <SummaryCards
          totalGauges={filteredGauges.length}
          warningCount={warningCount}
          watchCount={watchCount}
          peakGauge={peakGauge}
        />
      </div>

      {/* Main Operations Grid: River Map (8 cols) + Active Alerts Side Panel (4 cols) */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* River Map View */}
        <div className="lg:col-span-8 flex flex-col min-h-130">
          <RiverMap
            gauges={filteredGauges}
            edges={edges}
            forecastRows={filteredForecastRows}
            selectedBasin={selectedBasin}
          />
        </div>

        {/* Active Alerts Side Panel */}
        <div className="lg:col-span-4 bg-[#0B1E26] border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col h-130">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#5CB8C4]" />
              <h3 className="font-heading font-extrabold text-sm text-white">
                {t('active_alerts_title')}
              </h3>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-[#0F2831] text-slate-300 border border-white/10">
              {activeAlertGauges.length} Active
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 mt-3 pr-1">
            {activeAlertGauges.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs font-mono">
                <div className="w-10 h-10 rounded-full bg-[#7CC4A4]/10 border border-[#7CC4A4]/30 flex items-center justify-center mb-2">
                  <span className="text-[#7CC4A4] font-bold">✓</span>
                </div>
                <p className="font-semibold text-slate-300">{t('no_alerts_message')}</p>
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
                      ? 'bg-[#0F2831] border-[#FF6A3D]/30 hover:border-[#FF6A3D]/60'
                      : 'bg-[#0B1E26] border-[#E8B94A]/30 hover:border-[#E8B94A]/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-heading font-bold text-xs text-white">{alert.name}</h4>
                      <p className="text-[11px] font-mono text-slate-400">
                        {alert.river} River ({alert.basin})
                      </p>
                    </div>
                    <StatusChip status={alert.status} size="sm" />
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs font-mono">
                    <div>
                      <span className="text-slate-400 text-[11px]">Predicted: </span>
                      <span className="font-extrabold text-white">
                        {Math.round(alert.predicted_m3s).toLocaleString()} m³/s
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-[#5CB8C4] font-semibold">
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

      {/* Operational Priority Action Triage Terminal */}
      <div className="relative z-10">
        <PriorityActionTerminal
          alerts={filteredAlerts}
          leadDay={selectedLead}
        />
      </div>

      {/* Hydrologic Basin Dossier Cards */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Godavari Basin Card */}
        <div className="p-5 rounded-2xl bg-[#0B1E26] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-heading font-bold text-white text-sm flex items-center gap-2">
              <Waves className="w-4 h-4 text-[#5CB8C4]" />
              Godavari Fluvial System (27 Gauges)
            </h4>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#5CB8C4]/10 text-[#5CB8C4] border border-[#5CB8C4]/25">
              312,812 km² Basin
            </span>
          </div>
          <p className="text-xs text-[#8FA9AB] leading-relaxed">
            Spanning from the Western Ghats (Trimbakeshwar) through Maharashtra, Telangana, and Andhra Pradesh to Dowleswaram Barrage. Major tributaries monitored include Pravara, Indravati, Pranhita, and Manjra.
          </p>
        </div>

        {/* Mahanadi Basin Card */}
        <div className="p-5 rounded-2xl bg-[#0B1E26] border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-heading font-bold text-white text-sm flex items-center gap-2">
              <Waves className="w-4 h-4 text-[#7CC4A4]" />
              Mahanadi Fluvial System (19 Gauges)
            </h4>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#7CC4A4]/10 text-[#7CC4A4] border border-[#7CC4A4]/25">
              141,600 km² Basin
            </span>
          </div>
          <p className="text-xs text-[#8FA9AB] leading-relaxed">
            Originating in Chhattisgarh and flowing across Odisha into the Bay of Bengal. Monitored reaches include Hirakud Dam upstream inflows, Hasdeo, Ib, Seonath, and the Mundali/Cuttack delta head.
          </p>
        </div>
      </div>
    </div>
  );
};
