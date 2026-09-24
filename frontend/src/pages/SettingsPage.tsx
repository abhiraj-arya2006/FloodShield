import React from 'react';
import { Settings, ShieldAlert, Sliders, ExternalLink, Database, Globe } from 'lucide-react';
import { useSimulationStore } from '../store/useSimulationStore';

export const SettingsPage: React.FC = () => {
  const { timezoneMode, setTimezoneMode } = useSimulationStore();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-black text-white tracking-tight">System Settings & Governance</h2>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Operational threshold parameters, authority integrations, and research configuration.
        </p>
      </div>

      {/* Official Authorities Disclaimer & External Links (Section 25) */}
      <div className="bg-linear-to-r from-amber-950/40 via-amber-900/20 to-slate-900 border border-amber-500/30 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <span>Official Emergency Authorities Notice</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          FloodGuard AI is a <strong>research prototype early warning framework</strong> operating on deterministic simulated atmospheric data. For real-life emergency response, evacuations, and official flood bulletins in the National Capital Region, refer strictly to the designated statutory authorities:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <a
            href="https://mausam.imd.gov.in"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 text-xs font-semibold text-slate-200 hover:text-white transition-all group"
          >
            <span>India Meteorological Dept (IMD)</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400" />
          </a>
          <a
            href="http://cwc.gov.in"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 text-xs font-semibold text-slate-200 hover:text-white transition-all group"
          >
            <span>Central Water Commission (CWC)</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400" />
          </a>
          <a
            href="https://ddma.delhi.gov.in"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 text-xs font-semibold text-slate-200 hover:text-white transition-all group"
          >
            <span>Delhi Disaster Mgmt Authority</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400" />
          </a>
        </div>
      </div>

      {/* Operational Thresholds Inspector (Section 15) */}
      <div className="glass-panel p-6 rounded-2xl border space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Risk Classification Thresholds (config/risk_thresholds.yaml)</h3>
          </div>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded border border-cyan-500/20">
            Role: Operator / Analyst
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="font-bold text-white">LOW RISK</span>
            </div>
            <div className="text-lg font-mono font-bold text-slate-300 mt-2">&lt; 25%</div>
            <p className="text-[10px] text-slate-500 mt-1">Routine monitoring</p>
          </div>

          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <span className="font-bold text-white">MODERATE</span>
            </div>
            <div className="text-lg font-mono font-bold text-slate-300 mt-2">25% – 50%</div>
            <p className="text-[10px] text-slate-500 mt-1">Inspect critical culverts</p>
          </div>

          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
              <span className="font-bold text-white">HIGH</span>
            </div>
            <div className="text-lg font-mono font-bold text-slate-300 mt-2">50% – 75%</div>
            <p className="text-[10px] text-slate-500 mt-1">Pre-position mobile pumps</p>
          </div>

          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span className="font-bold text-white">CRITICAL</span>
            </div>
            <div className="text-lg font-mono font-bold text-slate-300 mt-2">≥ 75%</div>
            <p className="text-[10px] text-slate-500 mt-1">Immediate intervention</p>
          </div>
        </div>

        <div className="text-xs text-slate-400 pt-2 flex items-center justify-between">
          <span>Hysteresis Stabilization Margin: <strong className="text-white font-mono">0.03 (3%)</strong></span>
          <span>River Warning / Danger: <strong className="text-white font-mono">204.5m / 205.33m</strong></span>
        </div>
      </div>

      {/* Preferences & Units */}
      <div className="glass-panel p-6 rounded-2xl border space-y-4">
        <h3 className="text-sm font-bold text-slate-200">Display Preferences</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-white">Temporal Reference Clock</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Timezone for operational timestamps</p>
            </div>
            <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800 font-mono">
              <button
                onClick={() => setTimezoneMode('IST')}
                className={`px-3 py-1 rounded ${timezoneMode === 'IST' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400'}`}
              >
                IST (UTC+5:30)
              </button>
              <button
                onClick={() => setTimezoneMode('UTC')}
                className={`px-3 py-1 rounded ${timezoneMode === 'UTC' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400'}`}
              >
                UTC
              </button>
            </div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-white">Units Standard</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Precipitation, elevation, and hydraulics</p>
            </div>
            <span className="font-mono text-cyan-300 font-semibold px-2.5 py-1 bg-cyan-500/10 rounded border border-cyan-500/20">
              Metric (mm, mm/h, m MSL)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
