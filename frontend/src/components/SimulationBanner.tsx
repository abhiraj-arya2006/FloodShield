import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

export const SimulationBanner: React.FC = () => {
  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-200 sticky top-0 z-50 backdrop-blur-md">
      <div className="flex items-center gap-2 font-medium tracking-wide">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="font-bold text-amber-300">SIMULATION / PROTOTYPE</span>
        <span className="hidden sm:inline text-amber-400/80">—</span>
        <span className="hidden sm:inline text-amber-200/90">
          NOT AN OFFICIAL EMERGENCY WARNING. ALL HYDROLOGICAL OUTPUTS ARE SYNTHETIC.
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-amber-300/80 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 font-mono">
          EPSG:4326 · Delhi NCR
        </span>
        <a
          href="https://mausam.imd.gov.in"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-white transition-colors text-[11px]"
        >
          Official IMD Data ↗
        </a>
      </div>
    </div>
  );
};
