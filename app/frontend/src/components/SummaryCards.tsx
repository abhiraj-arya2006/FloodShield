import React from 'react';
import { GaugeForecastRow } from '../types';
import { Activity, ShieldAlert, AlertTriangle, TrendingUp } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

interface SummaryCardsProps {
  totalGauges: number;
  warningCount: number;
  watchCount: number;
  peakGauge: GaugeForecastRow | null;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  totalGauges,
  warningCount,
  watchCount,
  peakGauge,
}) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Gauges Monitored */}
      <div className="bg-[#0c1424] border border-slate-800/80 rounded-2xl p-4 shadow-lg shadow-black/20 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('kpi_gauges_monitored')}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold text-white font-mono">
              {totalGauges}
            </span>
            <span className="text-xs text-cyan-400 font-medium">
              (27 Godavari · 19 Mahanadi)
            </span>
          </div>
        </div>
        <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
          <Activity className="w-6 h-6 text-cyan-400" />
        </div>
      </div>

      {/* 2. WARNING Alerts */}
      <div className="bg-[#0c1424] border border-slate-800/80 rounded-2xl p-4 shadow-lg shadow-black/20 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-red-400">
            {t('kpi_warning_alerts')}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold text-red-400 font-mono">
              {warningCount}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              gauges at high flow
            </span>
          </div>
        </div>
        <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-6 h-6 text-red-400" />
        </div>
      </div>

      {/* 3. WATCH Alerts */}
      <div className="bg-[#0c1424] border border-slate-800/80 rounded-2xl p-4 shadow-lg shadow-black/20 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            {t('kpi_watch_alerts')}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold text-amber-400 font-mono">
              {watchCount}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              gauges elevated
            </span>
          </div>
        </div>
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
      </div>

      {/* 4. Next Expected Peak */}
      <div className="bg-[#0c1424] border border-slate-800/80 rounded-2xl p-4 shadow-lg shadow-black/20 flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
            {t('kpi_next_peak')}
          </p>
          {peakGauge ? (
            <div className="mt-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-white font-mono truncate">
                  {peakGauge.predicted_m3s.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-slate-400">m³/s</span>
              </div>
              <p className="text-xs text-slate-300 truncate font-medium">
                {t('kpi_peak_at')} <span className="text-cyan-300 font-semibold">{peakGauge.name}</span> ({peakGauge.basin})
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400 mt-2 font-mono">no data</p>
          )}
        </div>
        <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
          <TrendingUp className="w-6 h-6 text-cyan-400" />
        </div>
      </div>
    </div>
  );
};

