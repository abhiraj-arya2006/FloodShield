import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, Send, CheckCircle2, Waves, Clock, Check, ChevronRight, Activity } from 'lucide-react';
import { AlertItem, GaugeForecastRow } from '../../types';
import { Link } from 'react-router-dom';

interface PriorityActionTerminalProps {
  alerts: AlertItem[];
  leadDay: number;
}

export const PriorityActionTerminal: React.FC<PriorityActionTerminalProps> = ({
  alerts,
  leadDay,
}) => {
  const [dispatchedIds, setDispatchedIds] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSimulateDispatch = (gaugeId: string, gaugeName: string, actionType: string) => {
    setDispatchedIds((prev) => ({ ...prev, [gaugeId]: true }));
    setToastMessage(`[SIMULATED DISPATCH] ${actionType} triggered for ${gaugeName} (${gaugeId}).`);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Sort priority: WARNING with highest exceedance ratio first, then WATCH
  const rankedItems = [...alerts].sort((a, b) => {
    if (a.status === 'WARNING' && b.status !== 'WARNING') return -1;
    if (b.status === 'WARNING' && a.status !== 'WARNING') return 1;
    const ratioA = a.predicted_m3s / (a.q95_m3s || 1);
    const ratioB = b.predicted_m3s / (b.q95_m3s || 1);
    return ratioB - ratioA;
  });

  return (
    <div className="bg-[#0B1E26] border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col space-y-4">
      {/* Terminal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FF6A3D]/20 border border-[#FF6A3D]/40 flex items-center justify-center text-[#FF6A3D] shadow-[0_0_15px_rgba(255,106,61,0.3)]">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-extrabold text-white text-base tracking-tight">
                Priority Action & Triage Terminal
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                Lead +{leadDay}d
              </span>
            </div>
            <p className="text-[11px] text-[#8FA9AB] font-mono">
              Fluvial Inundation Risk Ranking & Simulated Emergency Action Routing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400">Active Alerts:</span>
          <span className="px-2.5 py-0.5 rounded-md font-mono text-xs font-bold bg-[#FF6A3D]/20 text-[#FF6A3D] border border-[#FF6A3D]/30 shadow-[0_0_8px_rgba(255,106,61,0.2)]">
            {alerts.filter((a) => a.status === 'WARNING').length} WARNING
          </span>
          <span className="px-2.5 py-0.5 rounded-md font-mono text-xs font-bold bg-[#E8B94A]/20 text-[#E8B94A] border border-[#E8B94A]/30 shadow-[0_0_8px_rgba(232,185,74,0.2)]">
            {alerts.filter((a) => a.status === 'WATCH').length} WATCH
          </span>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Terminal List */}
      {rankedItems.length === 0 ? (
        <div className="py-8 text-center text-slate-400 font-mono text-xs space-y-2">
          <CheckCircle2 className="w-8 h-8 text-[#7CC4A4] mx-auto opacity-70" />
          <p className="text-white font-medium">All 46 Gauges Within Nominal Flow Baseline</p>
          <p className="text-slate-500 text-[11px]">No active WARNING or WATCH thresholds exceeded for this forecast horizon.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {rankedItems.map((item, idx) => {
            const isDispatched = dispatchedIds[item.gauge_id];
            const exceedRatio = ((item.predicted_m3s / item.q95_m3s) * 100 - 100).toFixed(0);
            const isHighSurge = item.predicted_m3s >= item.q95_m3s * 1.25;
            const actionLabel =
              item.status === 'WARNING'
                ? isHighSurge
                  ? 'Simulate Evacuation / Relief Staging'
                  : 'Simulate Embankment Patrol Order'
                : 'Simulate Sluice Gate Standby Order';

            return (
              <div
                key={item.gauge_id}
                className={`p-3.5 rounded-xl border transition-all duration-200 ${
                  item.status === 'WARNING'
                    ? 'bg-[#0F2831] border-[#FF6A3D]/30 hover:border-[#FF6A3D]/60'
                    : 'bg-[#0B1E26] border-[#E8B94A]/30 hover:border-[#E8B94A]/60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-xs font-bold text-slate-500 w-5 shrink-0 pt-0.5">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/gauge/${item.gauge_id}`}
                          className="font-heading font-bold text-white text-sm hover:text-[#5CB8C4] transition-colors flex items-center gap-1 group"
                        >
                          <span>{item.name}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#5CB8C4] transition-colors" />
                        </Link>
                        <span className="font-mono text-[10px] text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                          {item.gauge_id}
                        </span>
                        <span
                          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.status === 'WARNING'
                              ? 'bg-[#FF6A3D]/20 text-[#FF6A3D] border border-[#FF6A3D]/40'
                              : 'bg-[#E8B94A]/20 text-[#E8B94A] border border-[#E8B94A]/40'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-400 mt-1">
                        <span>River: <strong className="text-slate-200">{item.river}</strong></span>
                        <span>•</span>
                        <span>Basin: <strong className="text-slate-200">{item.basin}</strong></span>
                        <span>•</span>
                        <span>Predicted: <strong className="text-white font-bold">{Math.round(item.predicted_m3s).toLocaleString()} m³/s</strong></span>
                        <span>•</span>
                        <span className={item.status === 'WARNING' ? 'text-[#FF6A3D] font-bold' : 'text-[#E8B94A]'}>
                          {Number(exceedRatio) > 0 ? `+${exceedRatio}% above q95` : `Between q90 & q95`}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-cyan-300">
                          <Clock className="w-3 h-3" />
                          {item.approx_hours}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Simulated Action Dispatch Trigger */}
                  <div className="sm:shrink-0 flex items-center gap-2 pt-2 sm:pt-0">
                    <button
                      onClick={() => handleSimulateDispatch(item.gauge_id, item.name, actionLabel)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                        isDispatched
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(124,196,164,0.2)]'
                          : item.status === 'WARNING'
                          ? 'bg-[#FF6A3D]/20 hover:bg-[#FF6A3D]/30 text-[#FF6A3D] border border-[#FF6A3D]/40 shadow-[0_0_10px_rgba(255,106,61,0.2)]'
                          : 'bg-[#5CB8C4]/20 hover:bg-[#5CB8C4]/30 text-[#5CB8C4] border border-[#5CB8C4]/40 shadow-[0_0_10px_rgba(92,184,196,0.2)]'
                      }`}
                    >
                      {isDispatched ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Simulated</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>{item.status === 'WARNING' ? 'Simulate Order' : 'Simulate Standby'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal Notice */}
      <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between text-[10px] font-mono text-slate-500 gap-1">
        <span>Simulated Action Dispatch Only • Dispatches are routed to local browser state</span>
        <span>Based on STG-Mamba Lead +{leadDay}d Hydrologic Routing</span>
      </div>
    </div>
  );
};
