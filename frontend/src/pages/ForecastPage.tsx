import React, { useEffect, useState } from 'react';
import { TrendingUp, Clock, CloudRain, ShieldCheck, ArrowRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fetchFloodMap } from '../services/api';
import { CompactZoneDynamic } from '../types';

export const ForecastPage: React.FC = () => {
  const [zoneData, setZoneData] = useState<Record<string, CompactZoneDynamic>>({});

  useEffect(() => {
    fetchFloodMap().then((res) => {
      if (res && res.zone_data) setZoneData(res.zone_data);
    });
  }, []);

  const cells = Object.values(zoneData);
  const p1Avg = cells.length ? Math.round(cells.reduce((a, b) => a + b.p1, 0) / cells.length * 100) : 18;
  const p3Avg = cells.length ? Math.round(cells.reduce((a, b) => a + b.p3, 0) / cells.length * 100) : 32;
  const p6Avg = cells.length ? Math.round(cells.reduce((a, b) => a + b.p6, 0) / cells.length * 100) : 48;

  const horizonTimeline = [
    { time: 'T0 (Now)', avgProb: p1Avg * 0.7, rain: 22, criticalCount: 12 },
    { time: '+1h', avgProb: p1Avg, rain: 35, criticalCount: 38 },
    { time: '+2h', avgProb: (p1Avg + p3Avg) / 2, rain: 48, criticalCount: 74 },
    { time: '+3h', avgProb: p3Avg, rain: 52, criticalCount: 110 },
    { time: '+4h', avgProb: (p3Avg + p6Avg) / 2, rain: 44, criticalCount: 95 },
    { time: '+5h', avgProb: p6Avg * 0.9, rain: 30, criticalCount: 65 },
    { time: '+6h', avgProb: p6Avg * 0.8, rain: 18, criticalCount: 42 }
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-black text-white tracking-tight">Spatiotemporal Multi-Horizon Forecast</h2>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Predictive hydrological inundation modeling across 1-hour, 3-hour, and 6-hour operational warning horizons.
        </p>
      </div>

      {/* Horizon Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono font-bold text-cyan-300">Horizon +1 Hour</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-black text-white">{p1Avg}%</div>
            <p className="text-xs text-slate-400 mt-1">Regional flood likelihood within 60 minutes.</p>
          </div>
          <div className="text-[11px] text-cyan-400 font-medium bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/20">
            Rapid pluvial response · High confidence
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono font-bold text-amber-300">Horizon +3 Hours</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-black text-amber-300">{p3Avg}%</div>
            <p className="text-xs text-slate-400 mt-1">Sub-basin stormwater accumulation & drainage stress.</p>
          </div>
          <div className="text-[11px] text-amber-400 font-medium bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
            Urban drainage saturation · Emergency staging window
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono font-bold text-orange-300">Horizon +6 Hours</span>
            <Clock className="w-4 h-4 text-orange-400" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-black text-orange-300">{p6Avg}%</div>
            <p className="text-xs text-slate-400 mt-1">Catchment-scale routing and river stage dynamics.</p>
          </div>
          <div className="text-[11px] text-orange-400 font-medium bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/20">
            Yamuna backwater propagation · Evacuation lead time
          </div>
        </div>
      </div>

      {/* Regional Trajectory Timeline Chart */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800">
        <h3 className="text-sm font-bold text-slate-200 mb-1">Regional Precipitation & Risk Evolution</h3>
        <p className="text-xs text-slate-400 mb-4">Simulated trajectory over the full 6-hour forecast window</p>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={horizonTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} domain={[0, 80]} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
              />
              <Area type="monotone" dataKey="avgProb" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#probGrad)" name="Average Prob %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
