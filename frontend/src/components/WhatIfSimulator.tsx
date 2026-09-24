import React, { useState, useEffect } from 'react';
import { X, SlidersHorizontal, CloudRain, AlertTriangle, ArrowUpRight, Check } from 'lucide-react';
import { useSimulationStore } from '../store/useSimulationStore';
import { postWhatIf } from '../services/api';
import { WhatIfResponse } from '../types';

export const WhatIfSimulator: React.FC = () => {
  const {
    isWhatIfOpen,
    setIsWhatIfOpen,
    selectedZoneId,
    whatIfRainMultiplier,
    whatIfDrainBlockage,
    setWhatIfParams
  } = useSimulationStore();

  const [rainMult, setRainMult] = useState(whatIfRainMultiplier);
  const [blockage, setBlockage] = useState(whatIfDrainBlockage);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runSimulation = async (r: number, b: number) => {
    setIsLoading(true);
    try {
      const res = await postWhatIf({
        rainfall_multiplier: r,
        drain_blockage_pct: b,
        selected_zone_id: selectedZoneId || undefined
      });
      setResult(res);
      setWhatIfParams(r, b);
    } catch {
      // Ignore in offline
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isWhatIfOpen) {
      runSimulation(rainMult, blockage);
    }
  }, [isWhatIfOpen, selectedZoneId]);

  if (!isWhatIfOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-purple-400" />
              <h2 className="text-base font-bold text-white">What-If Counterfactual Simulator</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Stress-test urban resilience against extreme precipitation and drainage infrastructure failures.
            </p>
          </div>
          <button
            onClick={() => setIsWhatIfOpen(false)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sliders */}
        <div className="space-y-4">
          {/* Rainfall Multiplier Slider */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <CloudRain className="w-4 h-4 text-cyan-400" />
                Rainfall Surge Multiplier
              </span>
              <span className="font-mono text-cyan-300 font-bold px-2 py-0.5 bg-cyan-500/10 rounded border border-cyan-500/20">
                {rainMult.toFixed(2)}× ({Math.round((rainMult - 1.0) * 100)}%)
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.1}
              value={rainMult}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setRainMult(val);
                runSimulation(val, blockage);
              }}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0.5× (-50%)</span>
              <span>1.0× (Baseline)</span>
              <span>2.5× (+150% Deluge)</span>
            </div>
          </div>

          {/* Drainage Blockage Slider */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Stormwater Drain Blockage / Siltation
              </span>
              <span className="font-mono text-amber-300 font-bold px-2 py-0.5 bg-amber-500/10 rounded border border-amber-500/20">
                {blockage.toFixed(0)}% Blocked
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={blockage}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setBlockage(val);
                runSimulation(rainMult, val);
              }}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0% (Clean Drains)</span>
              <span>45% (Moderate Siltation)</span>
              <span>90% (Severe Choking)</span>
            </div>
          </div>
        </div>

        {/* Counterfactual Impact Output */}
        {result && (
          <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800 space-y-3">
            <h4 className="text-xs font-mono uppercase text-slate-400 tracking-wider font-bold">
              Simulated Counterfactual Impact
            </h4>

            {/* Selected Zone Delta */}
            {result.selected_zone_delta ? (
              <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400">Selected Zone: </span>
                  <span className="font-bold text-white font-mono">{result.selected_zone_delta.zone_id}</span>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Baseline: {(result.selected_zone_delta.original_prob * 100).toFixed(0)}% ({result.selected_zone_delta.original_risk})
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-red-400 flex items-center gap-1 justify-end">
                    <span>{(result.selected_zone_delta.simulated_prob * 100).toFixed(0)}%</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <div className="text-[10px] font-mono text-amber-300">
                    Δ +{(result.selected_zone_delta.delta_prob * 100).toFixed(0)}% shift
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">
                (Click a specific zone on the map to see its individual delta)
              </div>
            )}

            {/* Regional Summary Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[11px]">Net Critical Increase</span>
                <div className="text-lg font-black text-red-400 mt-0.5">
                  +{result.affected_zones_summary.net_critical_increase} zones
                </div>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[11px]">Avg Probability Shift</span>
                <div className="text-lg font-black text-amber-400 mt-0.5">
                  +{(result.affected_zones_summary.avg_probability_increase * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={() => {
              setRainMult(1.0);
              setBlockage(0);
              runSimulation(1.0, 0);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800"
          >
            Reset to Baseline
          </button>
          <button
            onClick={() => setIsWhatIfOpen(false)}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
