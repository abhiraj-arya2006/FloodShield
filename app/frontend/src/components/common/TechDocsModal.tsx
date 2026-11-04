import React from 'react';
import { X, BookOpen, Database, Cpu, ShieldCheck, Terminal, Layers, FileCode } from 'lucide-react';

interface TechDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TechDocsModal: React.FC<TechDocsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-[#0A1222] border border-white/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#06192A] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#6FF0E0]/20 text-[#6FF0E0] border border-[#6FF0E0]/40 shadow-[0_0_15px_rgba(111,240,224,0.25)]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-white text-base tracking-tight">
                FloodShield Technical Architecture & Specifications
              </h3>
              <span className="text-xs text-[#91A2B8]">
                STG-Mamba Fluvial Network Specification • Godavari & Mahanadi
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#0F2A3A] hover:bg-[#174560] text-[#91A2B8] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-[#91A2B8] font-sans">
          {/* Section 1: Spatial Graph Network */}
          <div className="space-y-2">
            <h4 className="font-heading font-bold text-white text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-[#6FF0E0]" />
              1. Fluvial Network Topology & River Reach Graph
            </h4>
            <p className="leading-relaxed">
              The river system represents 46 CAMELS-IND streamflow gauging stations across the Godavari (27 stations)
              and Mahanadi (19 stations) river basins connected via 44 directed upstream-to-downstream topological edges.
            </p>
            <div className="p-3.5 rounded-xl bg-[#06192A] border border-white/10 text-[11px] space-y-1.5">
              <div><strong className="text-white">Godavari Basin:</strong> 27 gauges, including the Wainganga, Wardha, Pranhita, Indravati, Manjira and Sabari, down to Polavaram.</div>
              <div><strong className="text-white">Mahanadi Basin:</strong> 19 gauges, including the Seonath, Hasdeo, Mand, Jonk, Ib, Ong and Tel, down to Tikarapara.</div>
              <div><strong className="text-white">Edge Weights:</strong> River distances in kilometres from HydroRIVERS.</div>
            </div>
          </div>

          {/* Section 2: STG-Mamba Forecaster */}
          <div className="space-y-2">
            <h4 className="font-heading font-bold text-white text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#6FF0E0]" />
              2. STG-Mamba Spatiotemporal Deep Learning Model
            </h4>
            <p className="leading-relaxed">
              The core forecasting engine fuses Graph Neural Networks (GNNs) with Mamba Selective State Space Models (SSMs):
            </p>
            <div className="p-3.5 rounded-xl bg-[#06192A] border border-white/10 text-[11px] space-y-1.5">
              <div><strong className="text-white">Spatial Layer:</strong> A graph layer passes information along the 44 upstream-to-downstream river links.</div>
              <div><strong className="text-white">Temporal Backbone:</strong> A Mamba block with weights shared across gauges reads each gauge's 94-day weather sequence, in linear time.</div>
              <div><strong className="text-white">Lead Horizons:</strong> Daily flow for lead days 1 to 4, averaged over three seeds. Lead days 2 to 4 are the scored horizon.</div>
            </div>
          </div>

          {/* Section 3: Thresholds & Honesty Policy */}
          <div className="space-y-2">
            <h4 className="font-heading font-bold text-white text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              3. Statistical Flood Thresholds & Integrity Policy
            </h4>
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200/90 leading-relaxed text-[11px] space-y-1">
              <div><strong className="text-white">WARNING (Red):</strong> Forecast flow &ge; 90% of the gauge's training-period 95th percentile (q95).</div>
              <div><strong className="text-white">WATCH (Amber):</strong> Forecast flow &ge; 90% of its 90th percentile (q90), below the warning level.</div>
              <div className="pt-1 text-slate-300">
                <strong>Important Notice:</strong> Flood statuses are statistical exceedance levels based on CAMELS-IND historical flow distributions. They do NOT represent official Central Water Commission (CWC) warning or danger stages.
              </div>
            </div>
          </div>

          {/* Section 4: Data Lineage & Attribution */}
          <div className="space-y-2">
            <h4 className="font-heading font-bold text-white text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              4. Data Lineage & Open Attribution
            </h4>
            <div className="p-3.5 rounded-xl bg-[#06192A] border border-white/10 text-[11px] space-y-1">
              <div><strong className="text-white">Meteorological Forcing:</strong> IMD rainfall and temperature, IMDAA and GLEAM, as supplied in CAMELS-IND v2.2.</div>
              <div><strong className="text-white">Hydrologic Validation:</strong> CAMELS-IND daily streamflow. Validation 2009 to 2012, held-back test 2013 to 2018.</div>
              <div><strong className="text-white">Topology:</strong> HydroSHEDS & HydroRIVERS fluvial network database.</div>
            </div>
          </div>

          {/* Section 5: REST API Specs */}
          <div className="space-y-2">
            <h4 className="font-heading font-bold text-white text-sm flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              5. REST API endpoints
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border border-white/10 rounded-lg overflow-hidden">
                <thead className="bg-[#06192A] text-slate-300 border-b border-white/10">
                  <tr>
                    <th className="p-2">Endpoint</th>
                    <th className="p-2">Method</th>
                    <th className="p-2">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-[#0A2233]">
                  <tr>
                    <td className="p-2 text-cyan-300">/api/health</td>
                    <td className="p-2 text-emerald-400">GET</td>
                    <td className="p-2">Health check & replay mode status</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-cyan-300">/api/gauges</td>
                    <td className="p-2 text-emerald-400">GET</td>
                    <td className="p-2">46 gauge metadata, coords, q90/q95</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-cyan-300">/api/edges</td>
                    <td className="p-2 text-emerald-400">GET</td>
                    <td className="p-2">44 directed river reach links & km distance</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-cyan-300">/api/forecast</td>
                    <td className="p-2 text-emerald-400">GET</td>
                    <td className="p-2">All gauges forecast for date & lead day</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-cyan-300">/api/gauges/&#123;id&#125;/forecast</td>
                    <td className="p-2 text-emerald-400">GET</td>
                    <td className="p-2">4 lead days + observed flow for gauge</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-cyan-300">/api/alerts</td>
                    <td className="p-2 text-emerald-400">GET</td>
                    <td className="p-2">Active WATCH/WARNING gauges & CAP bulletins</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-cyan-300">/api/model-info</td>
                    <td className="p-2 text-emerald-400">GET</td>
                    <td className="p-2">STG-Mamba model metadata & training years</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#06192A] border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
          <span>FloodShield Architecture v2.0 • Godavari & Mahanadi research prototype</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors cursor-pointer"
          >
            Close Documentation
          </button>
        </div>
      </div>
    </div>
  );
};

