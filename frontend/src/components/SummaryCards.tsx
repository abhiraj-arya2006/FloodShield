import React from 'react';
import { Gauge, ShieldAlert, AlertTriangle, TrendingUp, Waves } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { GaugeForecastRow } from '../types';

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
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Gauges Monitored */}
      <div className="bg-[#0B1E26] border border-white/10 hover:border-[#5CB8C4]/40 rounded-2xl p-5 shadow-xl transition-all duration-200 group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-[#8FA9AB] uppercase tracking-wider">
            {t('kpi_gauges_monitored')}
          </span>
          <div className="w-9 h-9 rounded-xl bg-[#5CB8C4]/10 border border-[#5CB8C4]/30 flex items-center justify-center text-[#5CB8C4] shadow-[0_0_12px_rgba(92,184,196,0.2)] group-hover:scale-105 transition-transform">
            <Gauge className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-heading font-black text-3xl text-white tracking-tight">
            {totalGauges}
          </span>
          <span className="text-xs font-mono text-[#7CC4A4] font-semibold">
            All Telemetry Active
          </span>
        </div>
        <div className="mt-2 text-[11px] font-mono text-slate-400">
          27 Godavari • 19 Mahanadi reaches
        </div>
      </div>

      {/* 2. Gauges at WARNING */}
      <div className={`bg-[#0B1E26] rounded-2xl p-5 shadow-xl transition-all duration-200 group ${
        warningCount > 0
          ? 'border border-[#FF6A3D]/40 shadow-[0_0_20px_rgba(255,106,61,0.15)] bg-gradient-to-br from-[#0B1E26] to-[#FF6A3D]/5'
          : 'border border-white/10 hover:border-[#FF6A3D]/30'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-[#8FA9AB] uppercase tracking-wider">
            {t('kpi_warning_alerts')}
          </span>
          <div className="w-9 h-9 rounded-xl bg-[#FF6A3D]/10 border border-[#FF6A3D]/30 flex items-center justify-center text-[#FF6A3D] shadow-[0_0_12px_rgba(255,106,61,0.2)] group-hover:scale-105 transition-transform">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-heading font-black text-3xl text-[#FF6A3D] tracking-tight">
            {warningCount}
          </span>
          <span className="text-xs font-mono font-bold text-[#FF6A3D] bg-[#FF6A3D]/10 px-2 py-0.5 rounded-full border border-[#FF6A3D]/30">
            ≥ q95 Level
          </span>
        </div>
        <div className="mt-2 text-[11px] font-mono text-slate-400">
          High flood exceedance probability
        </div>
      </div>

      {/* 3. Gauges at WATCH */}
      <div className={`bg-[#0B1E26] rounded-2xl p-5 shadow-xl transition-all duration-200 group ${
        watchCount > 0
          ? 'border border-[#E8B94A]/40 shadow-[0_0_20px_rgba(232,185,74,0.15)] bg-gradient-to-br from-[#0B1E26] to-[#E8B94A]/5'
          : 'border border-white/10 hover:border-[#E8B94A]/30'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-[#8FA9AB] uppercase tracking-wider">
            {t('kpi_watch_alerts')}
          </span>
          <div className="w-9 h-9 rounded-xl bg-[#E8B94A]/10 border border-[#E8B94A]/30 flex items-center justify-center text-[#E8B94A] shadow-[0_0_12px_rgba(232,185,74,0.2)] group-hover:scale-105 transition-transform">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-heading font-black text-3xl text-[#E8B94A] tracking-tight">
            {watchCount}
          </span>
          <span className="text-xs font-mono font-bold text-[#E8B94A] bg-[#E8B94A]/10 px-2 py-0.5 rounded-full border border-[#E8B94A]/30">
            q90 to q95
          </span>
        </div>
        <div className="mt-2 text-[11px] font-mono text-slate-400">
          Elevated river stage vigilance
        </div>
      </div>

      {/* 4. Peak Expected Flow */}
      <div className="bg-[#0B1E26] border border-white/10 hover:border-[#5CB8C4]/40 rounded-2xl p-5 shadow-xl transition-all duration-200 group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-[#8FA9AB] uppercase tracking-wider">
            {t('kpi_next_peak')}
          </span>
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.2)] group-hover:scale-105 transition-transform">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-heading font-black text-3xl text-white tracking-tight">
            {peakGauge ? Math.round(peakGauge.predicted_m3s).toLocaleString() : '—'}
          </span>
          <span className="text-xs font-mono text-slate-400">m³/s</span>
        </div>
        <div className="mt-2 text-[11px] font-mono text-cyan-300 truncate">
          {peakGauge ? `${peakGauge.name} (${peakGauge.river})` : 'No forecast selected'}
        </div>
      </div>
    </div>
  );
};
