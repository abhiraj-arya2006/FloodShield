import React from 'react';
import {
  CloudRain,
  AlertOctagon,
  AlertTriangle,
  Percent,
  CheckCircle2,
  ShieldAlert
} from 'lucide-react';
import { CompactZoneDynamic } from '../types';

interface MetricCardsProps {
  zoneData: Record<string, CompactZoneDynamic>;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ zoneData }) => {
  const cells = Object.values(zoneData);
  const total = cells.length;

  // Aggregate stats
  let criticalCount = 0;
  let highCount = 0;
  let sumProb = 0;
  let sumRain = 0;
  let maxRain = 0;
  let sumConf = 0;

  for (const c of cells) {
    if (c.risk === 'CRITICAL') criticalCount++;
    else if (c.risk === 'HIGH') highCount++;
    sumProb += c.p1;
    sumRain += c.rf_current;
    if (c.rf_current > maxRain) maxRain = c.rf_current;
    sumConf += c.confidence;
  }

  const avgProb = total > 0 ? Math.round((sumProb / total) * 100) : 0;
  const avgRain = total > 0 ? (sumRain / total).toFixed(1) : '0.0';
  const avgConf = total > 0 ? Math.round(sumConf / total) : 85;

  let warningLevel = 'NORMAL';
  let warningColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (criticalCount > 50) {
    warningLevel = 'RED ALERT (CRITICAL)';
    warningColor = 'text-red-400 border-red-500/30 bg-red-500/10 pulse-critical';
  } else if (criticalCount > 0 || highCount > 100) {
    warningLevel = 'ORANGE ALERT (SEVERE)';
    warningColor = 'text-orange-400 border-orange-500/30 bg-orange-500/10';
  } else if (highCount > 0) {
    warningLevel = 'YELLOW ALERT (WATCH)';
    warningColor = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* Current Rainfall */}
      <div className="glass-panel rounded-2xl p-3 border flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>Max / Avg Rain</span>
          <CloudRain className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="mt-2">
          <div className="text-xl font-extrabold text-white tracking-tight">
            {maxRain.toFixed(1)} <span className="text-xs font-normal text-slate-400">mm/h</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Avg: {avgRain} mm/h</div>
        </div>
      </div>

      {/* Critical Zones */}
      <div className="glass-panel rounded-2xl p-3 border flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>Critical Zones</span>
          <AlertOctagon className="w-4 h-4 text-red-400" />
        </div>
        <div className="mt-2">
          <div className="text-xl font-extrabold text-red-400 tracking-tight">
            {criticalCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Prob ≥ 75%</div>
        </div>
      </div>

      {/* High-Risk Zones */}
      <div className="glass-panel rounded-2xl p-3 border flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>High-Risk Zones</span>
          <AlertTriangle className="w-4 h-4 text-orange-400" />
        </div>
        <div className="mt-2">
          <div className="text-xl font-extrabold text-orange-400 tracking-tight">
            {highCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Prob 50%–75%</div>
        </div>
      </div>

      {/* Average Flood Probability */}
      <div className="glass-panel rounded-2xl p-3 border flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>Regional Likelihood</span>
          <Percent className="w-4 h-4 text-yellow-400" />
        </div>
        <div className="mt-2">
          <div className="text-xl font-extrabold text-white tracking-tight">
            {avgProb}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Across {total} cells</div>
        </div>
      </div>

      {/* Model Confidence */}
      <div className="glass-panel rounded-2xl p-3 border flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>Model Confidence</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="mt-2">
          <div className="text-xl font-extrabold text-emerald-400 tracking-tight">
            {avgConf}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Ensemble spread score</div>
        </div>
      </div>

      {/* Warning Level */}
      <div className="glass-panel rounded-2xl p-3 border flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>Warning Level</span>
          <ShieldAlert className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="mt-2">
          <div className={`text-xs font-bold px-2 py-1 rounded-lg border text-center ${warningColor}`}>
            {warningLevel}
          </div>
          <div className="text-[10px] text-slate-400 text-center mt-1">Impact-weighted</div>
        </div>
      </div>
    </div>
  );
};
