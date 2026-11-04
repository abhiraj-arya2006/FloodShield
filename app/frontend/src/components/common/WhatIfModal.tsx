import React, { useState } from 'react';
import { X, Sliders, AlertTriangle, ShieldCheck, Waves, CloudRain, Cpu, RefreshCw, Send, CheckCircle2 } from 'lucide-react';

interface WhatIfModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatIfModal: React.FC<WhatIfModalProps> = ({ isOpen, onClose }) => {
  const [monsoonAnomaly, setMonsoonAnomaly] = useState(35); // % above normal
  const [sriramSagarDischarge, setSriramSagarDischarge] = useState(7500); // m3/s
  const [hirakudDischarge, setHirakudDischarge] = useState(14000); // m3/s
  const [soilMoisture, setSoilMoisture] = useState(72); // % saturation
  const [dispatchToast, setDispatchToast] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real-time hydrologic hydrodynamic approximations for Godavari & Mahanadi
  const godavariStageDelta = (
    0.4 +
    (sriramSagarDischarge / 25000) * 3.2 +
    (monsoonAnomaly / 100) * 1.8 +
    (soilMoisture / 100) * 0.9
  ).toFixed(2);

  const mahanadiPeakDischarge = Math.round(
    hirakudDischarge * 1.15 + (monsoonAnomaly * 95) + (soilMoisture * 45)
  );

  const simulatedWarningGauges = Math.min(
    46,
    Math.round(
      4 +
      (monsoonAnomaly > 20 ? (monsoonAnomaly - 20) * 0.18 : 0) +
      (sriramSagarDischarge / 4000) * 1.4 +
      (hirakudDischarge / 6000) * 1.6 +
      (soilMoisture > 70 ? (soilMoisture - 70) * 0.25 : 0)
    )
  );

  const simulatedWatchGauges = Math.min(
    46 - simulatedWarningGauges,
    Math.round(8 + (monsoonAnomaly * 0.15) + (soilMoisture * 0.1))
  );

  const requiredNDRFUnits = Math.round(simulatedWarningGauges * 1.5 + 2);
  const isCritical = Number(godavariStageDelta) >= 3.0 || mahanadiPeakDischarge >= 22000;

  const handleSimulateDispatch = (actionTitle: string) => {
    setDispatchToast(`[SIMULATED DISPATCH] Order "${actionTitle}" queued to CWC/SDMA Control Room.`);
    setTimeout(() => setDispatchToast(null), 4500);
  };

  const resetDefaults = () => {
    setMonsoonAnomaly(35);
    setSriramSagarDischarge(7500);
    setHirakudDischarge(14000);
    setSoilMoisture(72);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-[#09111E] border border-white/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#0D1628] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#00D9F5]/20 text-[#00D9F5] border border-[#00D9F5]/40 shadow-[0_0_15px_rgba(0,217,245,0.25)]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-white text-base tracking-tight">
                Atmospheric & Hydrologic "What-If" Scenario Sandbox
              </h3>
              <span className="text-xs font-mono text-[#91A2B8]">
                Real-Time STG-Mamba Inflow Stress Simulator • Godavari & Mahanadi
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#111C30] hover:bg-[#16243E] text-[#91A2B8] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-[#91A2B8] font-sans">
          {/* Toast Notification */}
          {dispatchToast && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono text-xs animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{dispatchToast}</span>
            </div>
          )}

          {/* Controls Sliders */}
          <div className="p-4 rounded-xl bg-[#070D1A] border border-white/10 space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white font-bold uppercase tracking-wider font-heading flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-[#00D9F5]" />
                1. Adjust Atmospheric & Upstream Hydrologic Parameters
              </span>
              <button
                onClick={resetDefaults}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] font-mono text-slate-300 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Reset Defaults
              </button>
            </div>

            {/* Slider 1: Monsoon Anomaly */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-white font-medium">Monsoon Precipitation Anomaly:</span>
                <span className="font-mono text-[#00D9F5] font-bold">+{monsoonAnomaly}% above normal</span>
              </div>
              <input
                type="range"
                min="0"
                max="120"
                step="5"
                value={monsoonAnomaly}
                onChange={(e) => setMonsoonAnomaly(Number(e.target.value))}
                className="w-full accent-[#00D9F5] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>0% (Climatological normal)</span>
                <span>+60% (Severe depression)</span>
                <span>+120% (Extreme cloudburst)</span>
              </div>
            </div>

            {/* Slider 2: Sriram Sagar Dam Release */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-white font-medium">Sriram Sagar Dam Outflow (Godavari):</span>
                <span className="font-mono text-[#13D6B0] font-bold">{sriramSagarDischarge.toLocaleString()} m³/s</span>
              </div>
              <input
                type="range"
                min="500"
                max="25000"
                step="500"
                value={sriramSagarDischarge}
                onChange={(e) => setSriramSagarDischarge(Number(e.target.value))}
                className="w-full accent-[#13D6B0] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>500 m³/s (Base)</span>
                <span>12,000 m³/s (High spill)</span>
                <span>25,000 m³/s (Maximum flood gates)</span>
              </div>
            </div>

            {/* Slider 3: Hirakud Dam Release */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-white font-medium">Hirakud Dam Outflow (Mahanadi):</span>
                <span className="font-mono text-[#FF9D28] font-bold">{hirakudDischarge.toLocaleString()} m³/s</span>
              </div>
              <input
                type="range"
                min="1000"
                max="35000"
                step="500"
                value={hirakudDischarge}
                onChange={(e) => setHirakudDischarge(Number(e.target.value))}
                className="w-full accent-[#FF9D28] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>1,000 m³/s (Controlled)</span>
                <span>18,000 m³/s (Delta alert)</span>
                <span>35,000 m³/s (Maximum emergency spill)</span>
              </div>
            </div>

            {/* Slider 4: Catchment Soil Moisture Saturation */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-white font-medium">Antecedent Catchment Soil Moisture:</span>
                <span className="font-mono text-purple-400 font-bold">{soilMoisture}% saturation</span>
              </div>
              <input
                type="range"
                min="30"
                max="100"
                step="2"
                value={soilMoisture}
                onChange={(e) => setSoilMoisture(Number(e.target.value))}
                className="w-full accent-purple-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>30% (Dry baseline)</span>
                <span>65% (Wet monsoon)</span>
                <span>100% (Fully saturated run-off)</span>
              </div>
            </div>
          </div>

          {/* Real-Time Hydrodynamic Feedback Grid */}
          <div className="space-y-2">
            <span className="text-xs text-white font-bold uppercase tracking-wider font-heading flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#13D6B0]" />
              2. Simulated Fluvial Response & Hydraulic Impact
            </span>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-[#0D1628] border border-white/10">
                <span className="text-[10px] text-slate-400 font-mono uppercase block">Godavari Stage Rise</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black font-heading text-white">+{godavariStageDelta}</span>
                  <span className="text-xs font-mono text-slate-400">m</span>
                </div>
                <span className="text-[10px] text-cyan-400 font-mono mt-1 block">Dowleswaram reach</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0D1628] border border-white/10">
                <span className="text-[10px] text-slate-400 font-mono uppercase block">Mahanadi Peak Flow</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black font-heading text-white">{mahanadiPeakDischarge.toLocaleString()}</span>
                  <span className="text-xs font-mono text-slate-400">m³/s</span>
                </div>
                <span className="text-[10px] text-orange-400 font-mono mt-1 block">Mundali/Cuttack barrage</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0D1628] border border-red-500/30 bg-red-950/20">
                <span className="text-[10px] text-red-300 font-mono uppercase block">Projected WARNING</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black font-heading text-red-400">{simulatedWarningGauges}</span>
                  <span className="text-xs font-mono text-slate-400">/ 46</span>
                </div>
                <span className="text-[10px] text-red-400 font-mono mt-1 block">&gt;= q95 threshold</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0D1628] border border-amber-500/30 bg-amber-950/20">
                <span className="text-[10px] text-amber-300 font-mono uppercase block">Projected WATCH</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black font-heading text-amber-400">{simulatedWatchGauges}</span>
                  <span className="text-xs font-mono text-slate-400">/ 46</span>
                </div>
                <span className="text-[10px] text-amber-400 font-mono mt-1 block">q90 to q95 threshold</span>
              </div>
            </div>
          </div>

          {/* Simulated Decision & Action Dispatch Terminal */}
          <div className="p-4 rounded-xl bg-[#070D1A] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white font-bold uppercase tracking-wider font-heading flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                3. Simulated Emergency Dispatch Actions ({requiredNDRFUnits} Units Recommended)
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                isCritical ? 'bg-red-900/60 text-red-300 border border-red-500/40' : 'bg-amber-900/60 text-amber-300 border border-amber-500/40'
              }`}>
                {isCritical ? 'RED ALERT LEVEL' : 'ORANGE WATCH LEVEL'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Dispatch actions are strictly simulated test signals to verify telemetry routing. No real-world alerts or notifications are dispatched.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={() => handleSimulateDispatch('Simulate Sluice Gate Pre-Release Buffer')}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#0D1628] hover:bg-[#16243E] border border-cyan-500/30 text-cyan-300 text-xs font-mono transition-colors text-left cursor-pointer group"
              >
                <span>Prime Sluice Gate Pre-Release</span>
                <Send className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => handleSimulateDispatch('Simulate Embankment Patrol Advisory Broadcast')}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#0D1628] hover:bg-[#16243E] border border-amber-500/30 text-amber-300 text-xs font-mono transition-colors text-left cursor-pointer group"
              >
                <span>Trigger Embankment Inspection</span>
                <Send className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-[#070D1A] border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Sandbox Mode • Offline Hydrodynamic Approximation</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors cursor-pointer"
          >
            Close Sandbox
          </button>
        </div>
      </div>
    </div>
  );
};

