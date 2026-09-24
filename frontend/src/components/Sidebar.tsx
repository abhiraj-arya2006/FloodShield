import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  TrendingUp,
  History,
  Satellite,
  Cpu,
  FlaskConical,
  BellRing,
  Settings
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/map', label: 'GIS Map', icon: Map },
  { to: '/forecast', label: '6h Forecast', icon: TrendingUp },
  { to: '/historical', label: 'Historical', icon: History },
  { to: '/satellite', label: 'SAR Satellite', icon: Satellite },
  { to: '/models', label: 'Model Registry', icon: Cpu },
  { to: '/research', label: 'Research & XAI', icon: FlaskConical },
  { to: '/alerts', label: 'Early Warnings', icon: BellRing },
  { to: '/settings', label: 'Policy & Agency', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-60 bg-slate-950/80 border-r border-slate-800/80 flex flex-col justify-between p-3 shrink-0 backdrop-blur-md">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
          Navigation
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 text-[11px] space-y-1.5 text-slate-400">
        <div className="flex items-center justify-between text-slate-300 font-medium">
          <span>Active Model</span>
          <span className="text-cyan-400 font-mono text-[10px]">XGB-v1.0</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Explainability</span>
          <span className="text-purple-400 font-mono text-[10px]">SHAP</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Simulation</span>
          <span className="text-emerald-400 font-mono text-[10px]">Deterministic</span>
        </div>
      </div>
    </aside>
  );
};
