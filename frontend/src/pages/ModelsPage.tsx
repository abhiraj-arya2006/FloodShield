import React from 'react';
import { Cpu, CheckCircle2, Clock, FileCode, ShieldAlert, Sparkles } from 'lucide-react';

const MODELS = [
  {
    id: 'xgboost-synthetic-v1',
    name: 'XGBoost Multi-Horizon Classifier',
    version: '1.0.0',
    status: 'ACTIVE',
    type: 'Gradient Boosted Decision Trees',
    trainedOn: 'synthetic',
    featuresCount: 21,
    leadTimes: '1h, 3h, 6h',
    explainability: 'SHAP TreeExplainer',
    summary: 'Trained on 189,880 synthetic simulation samples across multi-storm scenarios. Validates end-to-end engineering pipeline, feature ingestion, and local XAI attribution.'
  },
  {
    id: 'surrogate_logistic_v1',
    name: 'Hydrological Surrogate Baseline',
    version: '1.0.0',
    status: 'STANDBY',
    type: 'Physical Logistic Runoff Function',
    trainedOn: 'heuristic_physics',
    featuresCount: 6,
    leadTimes: '1h, 3h, 6h',
    explainability: 'Analytical Linear Weights',
    summary: 'Zero-dependency physical logistic formulation coupling Manning-based surface runoff with infiltration capacity and HAND elevation.'
  },
  {
    id: 'lstm_multihorizon_v1',
    name: 'Spatiotemporal LSTM Network',
    version: '0.1.0 (Stub)',
    status: 'SCHEDULED_M6',
    type: 'Recurrent Deep Neural Network',
    trainedOn: 'pending_real_data',
    featuresCount: 32,
    leadTimes: '1h, 3h, 6h',
    explainability: 'Integrated Gradients',
    summary: 'Sequential rolling window deep learning model capturing multi-timestep antecedent moisture memory.'
  },
  {
    id: 'spatial_gat_v1',
    name: 'Drainage Topology Graph Attention Network (GAT)',
    version: '0.1.0 (Stub)',
    status: 'SCHEDULED_M8',
    type: 'Geometric Graph Neural Network',
    trainedOn: 'pending_real_data',
    featuresCount: 40,
    leadTimes: '3h, 6h',
    explainability: 'Graph Edge Attention Weights',
    summary: 'Propagates backwater and runoff stress along the directed storm sewer and drainage connectivity network.'
  }
];

export const ModelsPage: React.FC = () => {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Cpu className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-black text-white tracking-tight">Model Registry & Model Cards</h2>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Versioned inventory of operational tabular, surrogate, and deep learning prediction models.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODELS.map((m) => (
          <div key={m.id} className="glass-panel p-5 rounded-2xl border space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-white">{m.name}</h3>
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                      v{m.version}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{m.type}</div>
                </div>

                <span
                  className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    m.status === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : m.status === 'STANDBY'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {m.status}
                </span>
              </div>

              <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                {m.summary}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800/80 text-[11px]">
              <div>
                <span className="text-slate-500 text-[10px] font-mono">Trained On</span>
                <div className="font-semibold text-purple-300">{m.trainedOn}</div>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] font-mono">Lead Times</span>
                <div className="font-semibold text-white">{m.leadTimes}</div>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] font-mono">Explainability</span>
                <div className="font-semibold text-cyan-400">{m.explainability}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Model Card Safety Rule (Section 9) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-start gap-3 text-xs text-slate-400">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-slate-200">Model Card Governance Note</h4>
          <p className="mt-1 leading-relaxed">
            The active XGBoost model carries metadata flag <code>trained_on: synthetic</code>. This validates the machine learning, data serialization, and SHAP explainability software architecture. As documented in <code>docs/MODEL_CARD.md</code>, synthetic training will learn the rules of the simulation engine and must never be utilized for real municipal flood dispatch without retraining on verified observed gauges.
          </p>
        </div>
      </div>
    </div>
  );
};
