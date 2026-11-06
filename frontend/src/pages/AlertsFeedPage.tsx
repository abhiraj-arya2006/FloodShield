import React, { useEffect, useState } from 'react';
import { fetchAlerts } from '../services/api';
import { AlertItem, AlertsResponse } from '../types';
import { StatusChip } from '../components/StatusChip';
import { useLanguage } from '../i18n/LanguageContext';
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
  Send,
  CheckCircle2,
} from 'lucide-react';

export const AlertsFeedPage: React.FC = () => {
  const { t } = useLanguage();

  const [date, setDate] = useState<string>('2010-08-15');
  const [lead, setLead] = useState<number>(2);
  const [alertsData, setAlertsData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [simulatedSentId, setSimulatedSentId] = useState<string | null>(null);

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

  const handleSimulateBroadcast = (gaugeId: string) => {
    setSimulatedSentId(gaugeId);
    setTimeout(() => {
      setSimulatedSentId(null);
    }, 3000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#5CB8C4]/10 border border-[#5CB8C4]/25 text-[10px] font-mono text-[#5CB8C4] mb-2">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>Operational Broadcast Telemetry</span>
          </div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-white flex items-center gap-2.5 tracking-tight">
            <span>{t('alerts_feed_title')}</span>
          </h1>
          <p className="text-xs text-[#8FA9AB] mt-1 font-mono">
            {t('alerts_feed_subtitle')}
          </p>
        </div>

        {/* Lead Selector & Date Picker */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#0B1E26] border border-white/10 p-1 rounded-xl">
            {[1, 2, 3, 4].map((ld) => (
              <button
                key={ld}
                onClick={() => setLead(ld)}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  lead === ld
                    ? 'bg-[#5CB8C4] text-[#07141C] shadow-[0_0_15px_rgba(92,184,196,0.3)]'
                    : 'text-[#8FA9AB] hover:text-white'
                }`}
              >
                {ld === 1 ? 'Day 1 (Nowcast)' : `+${ld}d`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-[#0B1E26] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono">
            <Calendar className="w-4 h-4 text-[#5CB8C4]" />
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
      </div>

      {/* Simulation Integrity Alert Banner */}
      <div className="p-4 rounded-2xl bg-[#0B1E26] border border-cyan-500/30 text-xs text-cyan-200 flex items-start gap-3 shadow-lg">
        <Info className="w-4 h-4 text-[#5CB8C4] shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-heading font-bold text-white">{t('simulated_notice')}</span>
          <p className="text-[11px] text-[#8FA9AB] font-mono leading-relaxed">
            {t('approx_time_hint')}. Messages are pre-formatted for demonstration using standard Common Alerting Protocol (CAP-v1.2) structure. No real external credentials or SMS gateways are utilized.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/50 text-red-300 text-xs font-mono flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Chips */}
      {alertsData && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-[#0B1E26] border border-white/10 text-xs font-mono font-bold text-white flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-[#5CB8C4]" />
            <span>Total Active Alerts: {alertsData.total_alerts}</span>
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-[#0B1E26] border border-[#FF6A3D]/40 text-xs font-mono font-bold text-[#FF6A3D] flex items-center gap-1.5 shadow-[0_0_10px_rgba(255,106,61,0.15)]">
            <ShieldAlert className="w-3.5 h-3.5 text-[#FF6A3D]" />
            <span>Warnings: {alertsData.warning_count}</span>
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-[#0B1E26] border border-[#E8B94A]/40 text-xs font-mono font-bold text-[#E8B94A] flex items-center gap-1.5 shadow-[0_0_10px_rgba(232,185,74,0.15)]">
            <AlertTriangle className="w-3.5 h-3.5 text-[#E8B94A]" />
            <span>Watches: {alertsData.watch_count}</span>
          </div>
        </div>
      )}

      {/* Alert Feed Cards */}
      {alertsData && alertsData.alerts.length === 0 ? (
        <div className="bg-[#0B1E26] border border-white/10 rounded-2xl p-12 text-center text-slate-500 text-xs space-y-2">
          <div className="w-12 h-12 rounded-full bg-[#7CC4A4]/10 border border-[#7CC4A4]/30 mx-auto flex items-center justify-center">
            <Check className="w-6 h-6 text-[#7CC4A4]" />
          </div>
          <h3 className="font-heading font-bold text-sm text-slate-200">{t('no_active_alerts')}</h3>
          <p className="text-[11px] font-mono text-slate-400 max-w-sm mx-auto">
            All 46 gauges in Godavari and Mahanadi basins are projected below the watch threshold (q90) for this date and lead horizon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alertsData?.alerts.map((alert) => (
            <div
              key={alert.gauge_id}
              className={`bg-[#0B1E26] border rounded-2xl p-5 shadow-2xl space-y-3.5 transition-all ${
                alert.status === 'WARNING'
                  ? 'border-[#FF6A3D]/30 hover:border-[#FF6A3D]/60'
                  : 'border-[#E8B94A]/30 hover:border-[#E8B94A]/60'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading font-extrabold text-base text-white">{alert.name}</h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-[#0F2831] border border-white/10 text-[#5CB8C4]">
                      {alert.gauge_id}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    {alert.river} River • {alert.basin} Basin
                  </p>
                </div>
                <StatusChip status={alert.status} size="md" />
              </div>

              {/* Timing & Magnitude Readouts */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-[#07141C] p-3 rounded-xl border border-white/10 font-mono">
                <div>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#5CB8C4]" />
                    <span>{t('approx_time_label')}</span>
                  </span>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {alert.approx_hours}{' '}
                    <span className="text-[10px] text-slate-400 font-normal">
                      (Lead Day {alert.lead_day})
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400">Predicted Flow:</span>
                  <div className="text-sm font-extrabold text-white mt-0.5">
                    {Math.round(alert.predicted_m3s).toLocaleString()} m³/s{' '}
                    <span
                      className={`text-[11px] font-bold ${
                        alert.status === 'WARNING' ? 'text-[#FF6A3D]' : 'text-[#E8B94A]'
                      }`}
                    >
                      (+{alert.exceedance_pct}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Drafted CAP / SMS Message Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span className="font-semibold uppercase tracking-wider text-slate-300">
                    {t('drafted_sms_title')}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleSimulateBroadcast(alert.gauge_id)}
                      className="flex items-center gap-1 text-[#7CC4A4] hover:text-white transition-colors cursor-pointer"
                    >
                      {simulatedSentId === alert.gauge_id ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Simulated Sent</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Simulate Send</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleCopy(alert.gauge_id, alert.drafted_message)}
                      className="flex items-center gap-1 text-[#5CB8C4] hover:text-white transition-colors cursor-pointer"
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
                </div>

                <div className="p-3 rounded-xl bg-[#07141C] border border-white/10 text-[11px] font-mono text-slate-200 leading-relaxed wrap-break-words select-all">
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
