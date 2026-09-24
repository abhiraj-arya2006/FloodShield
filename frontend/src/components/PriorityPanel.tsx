import React from 'react';
import { ShieldAlert, AlertTriangle, Users, Building, ArrowRight } from 'lucide-react';
import { PriorityItem } from '../types';
import { useSimulationStore } from '../store/useSimulationStore';

interface PriorityPanelProps {
  priorities: PriorityItem[];
}

export const PriorityPanel: React.FC<PriorityPanelProps> = ({ priorities }) => {
  const { setSelectedZoneId, selectedZoneId } = useSimulationStore();

  return (
    <div className="glass-panel rounded-2xl p-4 border flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-sm text-white">Priority Action Ranking</h3>
        </div>
        <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/20 font-semibold">
          Hazard × Exposure × Vulnerability
        </span>
      </div>

      <div className="divide-y divide-slate-800/60 overflow-y-auto max-h-80">
        {priorities.map((item) => {
          const isSelected = selectedZoneId === item.zone_id;
          return (
            <div
              key={item.zone_id}
              onClick={() => setSelectedZoneId(item.zone_id)}
              className={`py-2.5 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-between group ${
                isSelected
                  ? 'bg-cyan-500/15 border border-cyan-500/30'
                  : 'hover:bg-slate-900/60 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                    item.rank <= 3
                      ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {item.rank}
                </span>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white group-hover:text-cyan-300 transition-colors">
                      {item.name}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                        item.risk_level === 'CRITICAL'
                          ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                      }`}
                    >
                      {item.risk_level}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-500" />
                      {item.population_at_risk.toLocaleString()} at risk
                    </span>
                    <span>·</span>
                    <span className="font-mono text-cyan-400">
                      Score: {item.priority_score.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
};
