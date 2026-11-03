import React, { useEffect, useState } from 'react';
import { fetchAlerts } from '../services/api';
import { AlertItem, AlertsResponse } from '../types';
import { StatusChip } from '../components/StatusChip';
import { useTranslation } from '../i18n/LanguageContext';
import {
  Bell,
  Calendar,
  Clock,
  Copy,
  Check,
  ShieldAlert,
  AlertTriangle,
  Info,
  Radio,
} from 'lucide-react';

export const AlertsFeedPage: React.FC = () => {
  const { t } = useTranslation();

  const [date, setDate] = useState<string>('2010-08-15');
  const [lead, setLead] = useState<number>(2);
  const [alertsData, setAlertsData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchAlerts(date, lead)
      .then((res) => {
        setAlertsData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch alerts');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [date, lead]);

  const handleCopy = (gaugeId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(gaugeId);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-cyan-400 animate-pulse" />
            <span>{t('alerts_feed_title')}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t('alerts_feed_subtitle')}
          </p>
        </div>

        {/* Lead Selector & Date Picker */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#0c1424] border border-slate-800/80 p-1 rounded-xl">
            {[1, 2, 3, 4].map((ld) => (
              <button
                key={ld}
                onClick={() => setLead(ld)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  lead === ld
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {ld === 1 ? 'Day 1 (Nowcast)' : `+${ld}d`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-[#0c1424] border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <input
              type="date"
              min="2009-01-01"
              max="2012-12-31"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-white font-mono font-semibold focus:outline-none cursor-pointer text-xs"
            />
          </div>
        </div>
      </div>

      {/* Simulation Integrity Alert Banner */}
      <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 text-xs text-cyan-200 flex items-start gap-3">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">{t('simulated_notice')}</span>
          <p className="text-[11px] text-slate-400">
            {t('approx_time_hint')}. Messages are pre-formatted for demonstration using standard Common Alerting Protocol (CAP-v1.2) structure.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/50 text-red-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Chips */}
      {alertsData && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-[#0c1424] border border-slate-800 text-xs font-mono font-bold text-white flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-cyan-400" />
            <span>Total Active Alerts: {alertsData.total_alerts}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs font-mono font-bold text-red-400 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>Warnings: {alertsData.warning_count}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Watches: {alertsData.watch_count}</span>
          </div>
        </div>
      )}

      {/* Alert Feed Cards */}
      {alertsData && alertsData.alerts.length === 0 ? (
        <div className="bg-[#0c1424] border border-slate-800/80 rounded-2xl p-12 text-center text-slate-500 text-xs space-y-2">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 mx-auto flex items-center justify-center">
            <Check className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="font-bold text-sm text-slate-300">{t('no_active_alerts')}</h3>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            All 46 gauges in Godavari and Mahanadi basins are projected below the watch threshold (q90) for this date and lead horizon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alertsData?.alerts.map((alert) => (
            <div
              key={alert.gauge_id}
              className={`bg-[#0c1424] border rounded-2xl p-5 shadow-xl space-y-3.5 transition-all ${
                alert.status === 'WARNING'
                  ? 'border-red-500/30 hover:border-red-500/60'
                  : 'border-amber-500/30 hover:border-amber-500/60'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white">{alert.name}</h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300">
                      {alert.gauge_id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {alert.river} River · {alert.basin} Basin
                  </p>
                </div>
                <StatusChip status={alert.status} size="md" />
              </div>

              {/* Timing & Magnitude Readouts */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                <div>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-cyan-400" />
                    <span>{t('approx_time_label')}</span>
                  </span>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">
                    {alert.approx_hours}{' '}
                    <span className="text-[10px] text-slate-400 font-normal">
                      (Lead Day {alert.lead_day})
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400">Predicted Flow:</span>
                  <div className="text-sm font-extrabold text-white font-mono mt-0.5">
                    {alert.predicted_m3s.toLocaleString()} m³/s{' '}
                    <span
                      className={`text-[11px] font-bold ${
                        alert.status === 'WARNING' ? 'text-red-400' : 'text-amber-400'
                      }`}
                    >
                      (+{alert.exceedance_pct}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Drafted CAP / SMS Message Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-semibold uppercase tracking-wider font-mono">
                    {t('drafted_sms_title')}
                  </span>
                  <button
                    onClick={() => handleCopy(alert.gauge_id, alert.drafted_message)}
                    className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    {copiedId === alert.gauge_id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">{t('copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{t('copy_message')}</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200 leading-relaxed break-words select-all">
                  {alert.drafted_message}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

