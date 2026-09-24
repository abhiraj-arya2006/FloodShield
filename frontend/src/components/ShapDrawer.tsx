import React from 'react';
import { X, Sparkles, AlertCircle, Info } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { ZoneIntelligenceResponse } from '../types';

interface ShapDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: ZoneIntelligenceResponse | null;
}

export const ShapDrawer: React.FC<ShapDrawerProps> = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) return null;

  const expl = data.explanation;

  // Format chart data: sort by absolute contribution
  const chartData = expl.contributions.slice(0, 10).map((c) => ({
    name: c.display_name,
    rawName: c.feature_name,
    contribution: c.contribution,
    value: c.feature_value,
    unit: c.unit
  }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between shadow-2xl h-full overflow-y-auto">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-bold text-white">Explainable AI (XAI) Attribution</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Zone: <span className="font-semibold text-white">{data.name}</span> · Model: <span className="font-mono text-purple-300">{expl.model_name} (v{expl.model_version})</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Plain-Language Summary Box */}
          <div className="my-4 bg-purple-950/30 border border-purple-500/30 rounded-xl p-4">
            <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider font-mono">
              Diagnostic Summary
            </h4>
            <p className="text-sm text-slate-200 mt-1 font-medium">
              "{expl.summary_sentence}"
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {expl.top_factors.map((f, i) => (
                <span key={i} className="text-[11px] bg-purple-500/20 text-purple-200 px-2.5 py-0.5 rounded-full border border-purple-500/30 font-semibold">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* SHAP Waterfall / Contribution Bar Chart */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 my-4">
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="font-bold text-slate-200">Local Feature Attributions (SHAP Values)</span>
              <span className="text-[10px] text-slate-400 font-mono">Positive = Increases Flood Risk</span>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 120, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                    formatter={(val: any, _name: any, item: any) => [
                      `${val > 0 ? '+' : ''}${val} (Input: ${item.payload.value} ${item.payload.unit})`,
                      'SHAP Contribution'
                    ]}
                  />
                  <ReferenceLine x={0} stroke="#475569" strokeWidth={1.5} />
                  <Bar dataKey="contribution">
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.contribution > 0 ? '#ef4444' : '#10b981'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Contribution Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden my-4 text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-950/80 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Factor</th>
                  <th className="py-2 px-3">Observed Value</th>
                  <th className="py-2 px-3 text-right">Attribution Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {chartData.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-3 text-slate-200">{c.name}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">
                      {c.value} {c.unit}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono font-bold ${
                      c.contribution > 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}>
                      {c.contribution > 0 ? `+${c.contribution.toFixed(4)}` : c.contribution.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scientific Disclaimer Footer */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-start gap-2.5 text-[11px] text-slate-400 mt-4">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p>
            <strong className="text-slate-300">Methodological Note:</strong> SHAP (SHapley Additive exPlanations) values describe how individual input features shift the model's output relative to the baseline expectation. They reflect the model's learned dependencies on the synthetic dataset, not direct physical causation.
          </p>
        </div>
      </div>
    </div>
  );
};
