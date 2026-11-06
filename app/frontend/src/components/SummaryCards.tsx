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
      <div className="bg-[#0D1628] border border-white/10 hover:border-[#00D9F5]/40 rounded-2xl p-5 shadow-xl transition-all duration-200 group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-[#91A2B8] uppercase tracking-wider">
            {t('kpi_gauges_monitored')}
          </span>
          <div className="w-9 h-9 rounded-xl bg-[#00D9F5]/10 border border-[#00D9F5]/30 flex items-center justify-center text-[#00D9F5] shadow-[0_0_12px_rgba(0,217,245,0.2)] group-hover:scale-105 transition-transform">
            <Gauge className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-heading font-black text-3xl text-white tracking-tight">
            {totalGauges}
          </span>
          <span className="text-xs font-mono text-[#13D6B0] font-semibold">
            All Telemetry Active
          </span>
        </div>
        <div className="mt-2 text-[11px] font-mono text-slate-400">
          27 Godavari • 19 Mahanadi reaches
        </div>
      </div>

      {/* 2. Gauges at WARNING */}
      <div className={`bg-[#0D1628] rounded-2xl p-5 shadow-xl transition-all duration-200 group ${
        warningCount > 0
          ? 'border border-[#FF454F]/40 shadow-[0_0_20px_rgba(255,69,79,0.15)] bg-gradient-to-br from-[#0D1628] to-[#FF454F]/5'
          : 'border border-white/10 hover:border-[#FF454F]/30'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-[#91A2B8] uppercase tracking-wider">
            {t('kpi_warning_alerts')}
          </span>
          <div className="w-9 h-9 rounded-xl bg-[#FF454F]/10 border border-[#FF454F]/30 flex items-center justify-center text-[#FF454F] shadow-[0_0_12px_rgba(255,69,79,0.2)] group-hover:scale-105 transition-transform">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-heading font-black text-3xl text-[#FF454F] tracking-tight">
            {warningCount}
          </span>
          <span className="text-xs font-mono font-bold text-[#FF454F] bg-[#FF454F]/10 px-2 py-0.5 rounded-full border border-[#FF454F]/30">
            ≥ q95 Level
          </span>
        </div>
        <div className="mt-2 text-[11px] font-mono text-slate-400">
          High flood exceedance probability
        </div>
      </div>

      {/* 3. Gauges at WATCH */}
      <div className={`bg-[#0D1628] rounded-2xl p-5 shadow-xl transition-all duration-200 group ${
        watchCount > 0
          ? 'border border-[#FF9D28]/40 shadow-[0_0_20px_rgba(255,157,40,0.15)] bg-gradient-to-br from-[#0D1628] to-[#FF9D28]/5'
          : 'border border-white/10 hover:border-[#FF9D28]/30'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-[#91A2B8] uppercase tracking-wider">
            {t('kpi_watch_alerts')}
          </span>
          <div className="w-9 h-9 rounded-xl bg-[#FF9D28]/10 border border-[#FF9D28]/30 flex items-center justify-center text-[#FF9D28] shadow-[0_0_12px_rgba(255,157,40,0.2)] group-hover:scale-105 transition-transform">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-heading font-black text-3xl text-[#FF9D28] tracking-tight">
            {watchCount}
          </span>
          <span className="text-xs font-mono font-bold text-[#FF9D28] bg-[#FF9D28]/10 px-2 py-0.5 rounded-full border border-[#FF9D28]/30">
            q90 to q95
          </span>
        </div>
        <div className="mt-2 text-[11px] font-mono text-slate-400">
          Elevated river stage vigilance
        </div>
      </div>

      {/* 4. Peak Expected Flow */}
      <div className="bg-[#0D1628] border border-white/10 hover:border-[#00D9F5]/40 rounded-2xl p-5 shadow-xl transition-all duration-200 group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-medium text-[#91A2B8] uppercase tracking-wider">
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
