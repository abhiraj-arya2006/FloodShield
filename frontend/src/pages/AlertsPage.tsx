import React, { useEffect, useState } from 'react';
import {
  BellRing,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  FileCode,
  ShieldAlert,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { fetchAlerts, triggerTestAlert, acknowledgeAlert, resolveAlert } from '../services/api';
import { Alert } from '../types';

export const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [expandedCapId, setExpandedCapId] = useState<string | null>(null);
  const [isInjecting, setIsInjecting] = useState(false);

  const loadAlerts = () => {
    fetchAlerts().then(setAlerts).catch(() => {});
  };

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleTestAlert = async () => {
    setIsInjecting(true);
    try {
      await triggerTestAlert();
      loadAlerts();
    } finally {
      setIsInjecting(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    await acknowledgeAlert(id, 'Acknowledged by operator');
    loadAlerts();
  };

  const handleResolve = async (id: string) => {
    await resolveAlert(id, 'Resolved after water recession');
    loadAlerts();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BellRing className="w-6 h-6 text-red-400" />
            <h2 className="text-xl font-black text-white tracking-tight">Automated Early Warning Feed</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Common Alerting Protocol (CAP) compliant flood warnings with stateful hysteresis, cooldowns, and operator audit trail.
          </p>
        </div>

        <button
          onClick={handleTestAlert}
          disabled={isInjecting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 transition-all shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isInjecting ? 'Injecting...' : 'Dispatch Test Alert'}</span>
        </button>
      </div>

      {/* Alerts Stream */}
      <div className="space-y-4">
        {alerts.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center border">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-white">Zero Active Flood Warnings</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Current simulation timestep indicates all urban zones are within normal drainage absorption margins. Click "Dispatch Test Alert" to test notification flows.
            </p>
          </div>
        ) : (
          alerts.map((alert) => {
            const isCapOpen = expandedCapId === alert.id;
            return (
              <div
                key={alert.id}
                className={`glass-panel rounded-2xl p-5 border transition-all ${
                  alert.risk_level === 'CRITICAL'
                    ? 'border-red-500/40 bg-red-950/10'
                    : 'border-orange-500/30'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">{alert.id}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          alert.risk_level === 'CRITICAL'
                            ? 'bg-red-500/20 text-red-400 border-red-500/40'
                            : 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                        }`}
                      >
                        {alert.risk_level}
                      </span>
                      <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded">
                        {alert.flood_type}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          alert.state === 'ISSUED'
                            ? 'bg-amber-500/20 text-amber-300'
                            : alert.state === 'ACKNOWLEDGED'
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        STATE: {alert.state}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white">{alert.zone_name}</h3>
                    <p className="text-xs text-slate-300">{alert.forecast_summary}</p>
                  </div>

                  {/* Actions & Timestamps */}
                  <div className="flex items-center gap-2 shrink-0">
                    {alert.state === 'ISSUED' && (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                    {alert.state === 'ACKNOWLEDGED' && (
                      <button
                        onClick={() => handleResolve(alert.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                      >
                        Resolve
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedCapId(isCapOpen ? null : alert.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5"
                    >
                      <FileCode className="w-3.5 h-3.5 text-purple-400" />
                      <span>CAP Payload</span>
                      {isCapOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Multilingual Messages Preview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-500 uppercase">English Dispatch</span>
                    <pre className="font-sans text-slate-200 mt-1 whitespace-pre-wrap leading-relaxed text-[11px]">
                      {alert.message_en}
                    </pre>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-500 uppercase">Hindi Dispatch (हिंदी)</span>
                    <pre className="font-sans text-slate-200 mt-1 whitespace-pre-wrap leading-relaxed text-[11px]">
                      {alert.message_hi}
                    </pre>
                  </div>
                </div>

                {/* Expanded CAP Payload & Audit Log */}
                {isCapOpen && (
                  <div className="mt-4 pt-4 border-t border-slate-800 space-y-3 animate-in fade-in duration-150">
                    <div>
                      <span className="text-[10px] font-mono text-purple-400 uppercase font-bold">
                        Common Alerting Protocol (CAP-v1.2 JSON Schema)
                      </span>
                      <pre className="bg-slate-950 p-3 rounded-xl text-[11px] font-mono text-slate-300 mt-1 overflow-x-auto border border-slate-800">
                        {JSON.stringify(alert.cap, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">
                        Immutable Operator Audit Trail
                      </span>
                      <div className="mt-1 space-y-1">
                        {alert.audit_trail.map((entry, idx) => (
                          <div
                            key={idx}
                            className="text-[11px] font-mono text-slate-400 bg-slate-900/60 px-3 py-1 rounded border border-slate-800 flex justify-between"
                          >
                            <span>
                              [{entry.timestamp}] <strong>{entry.action}</strong> by {entry.performed_by}
                            </span>
                            <span className="text-slate-500">{entry.notes}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
