import React from 'react';
import {
  X,
  Sparkles,
  Layers,
  Thermometer,
  Wind,
  Droplets,
  Mountain,
  Building2,
  Users,
  ShieldCheck,
  Compass,
  AlertCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area
} from 'recharts';

import { ZoneIntelligenceResponse } from '../types';
import { useSimulationStore } from '../store/useSimulationStore';

interface ZoneIntelligenceProps {
  data: ZoneIntelligenceResponse | null;
  onClose: () => void;
}

export const ZoneIntelligence: React.FC<ZoneIntelligenceProps> = ({ data, onClose }) => {
  const { setIsShapDrawerOpen } = useSimulationStore();

  if (!data) {
    return (
      <div className="glass-panel rounded-2xl p-6 border flex flex-col items-center justify-center text-center h-full min-h-100">
        <AlertCircle className="w-10 h-10 text-slate-600 mb-3" />
        <h3 className="text-base font-bold text-slate-300">No Zone Selected</h3>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          Click any 500m grid cell on the map or select a critical zone from the Priority List to view detailed hydrological intelligence.
        </p>
      </div>
    );
  }

  // Chart data formatting
  const chartData = data.forecast_timeline.map((point) => ({
    hour: `+${point.hour}h`,
    probability: Math.round(point.probability * 100),
    low: Math.round(point.interval_low * 100),
    high: Math.round(point.interval_high * 100),
    rain: point.forecast_rain_mm_h
  }));

  const riskBadgeColor =
    data.risk_level === 'CRITICAL'
      ? 'bg-red-500/20 text-red-400 border-red-500/40'
      : data.risk_level === 'HIGH'
      ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
      : data.risk_level === 'MODERATE'
      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';

  return (
    <div className="glass-panel-elevated rounded-2xl p-4 border flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-white">{data.name}</h2>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskBadgeColor}`}>
              {data.risk_level}
            </span>
            <span className="text-[10px] font-mono bg-slate-800 text-cyan-300 px-2 py-0.5 rounded border border-slate-700">
              {data.flood_type}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <span>Locality: {data.locality}</span>
            <span>·</span>
            <span className="font-mono text-[11px] text-slate-500">
              {data.latitude.toFixed(4)}°N, {data.longitude.toFixed(4)}°E
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Multi-horizon Prediction Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        {data.predictions.map((p) => (
          <div key={p.horizon_hours} className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800 text-center">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">+{p.horizon_hours} Hour</span>
            <div className="text-lg font-black text-white mt-0.5">
              {(p.probability * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {(p.interval_low * 100).toFixed(0)}%–{(p.interval_high * 100).toFixed(0)}%
            </div>
          </div>
        ))}
      </div>

      {/* 6-Hour Forecast Chart with Uncertainty Band & Rainfall */}
      <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-bold text-slate-200">6-Hour Early Warning Forecast</span>
          <span className="text-[10px] text-slate-400 font-mono">Uncertainty Band (10th–90th percentile)</span>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="hour" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis yAxisId="left" stroke="#64748b" fontSize={10} domain={[0, 100]} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" fontSize={10} domain={[0, 60]} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="high"
                stroke="transparent"
                fill="#0284c7"
                fillOpacity={0.15}
              />
              <Bar yAxisId="right" dataKey="rain" fill="#38bdf8" fillOpacity={0.4} barSize={12} name="Rain (mm/h)" />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="probability"
                stroke="#f97316"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#f97316' }}
                name="Flood Prob %"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Explainable AI Trigger Banner */}
      <div className="bg-linear-to-r from-purple-950/40 via-purple-900/20 to-slate-900 border border-purple-500/30 rounded-xl p-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Why is this area at risk? (SHAP Analysis)</span>
          </div>
          <p className="text-[11px] text-slate-300 mt-0.5 max-w-sm">
            {data.explanation.summary_sentence}
          </p>
        </div>
        <button
          onClick={() => setIsShapDrawerOpen(true)}
          className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg shadow-purple-600/20 transition-all shrink-0 ml-2"
        >
          View SHAP Attributions
        </button>
      </div>

      {/* Detailed Diagnostics Tabs: Weather, Terrain, Urban, Exposure */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* Weather Observations */}
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-slate-200 border-b border-slate-800 pb-1 text-[11px]">
            <Droplets className="w-3.5 h-3.5 text-cyan-400" />
            <span>Atmospheric Diagnostics</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Instant Rain:</span>
            <span className="text-white font-mono">{data.weather.current_rainfall_mm_h} mm/h</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>1h / 3h Accum:</span>
            <span className="text-white font-mono">{data.weather.rainfall_1h_mm} / {data.weather.rainfall_3h_mm} mm</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Temp & Humid:</span>
            <span className="text-white font-mono">{data.weather.temperature_c}°C · {data.weather.humidity_pct}%</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Soil Saturation:</span>
            <span className="text-white font-mono">{(data.weather.soil_moisture * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Topography & Hydrology */}
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-slate-200 border-b border-slate-800 pb-1 text-[11px]">
            <Mountain className="w-3.5 h-3.5 text-amber-400" />
            <span>Terrain & Elevation</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Elevation:</span>
            <span className="text-white font-mono">{data.terrain.elevation_m} m</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>HAND:</span>
            <span className="text-white font-mono">{data.terrain.hand_m} m</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Dist to Yamuna:</span>
            <span className="text-white font-mono">{data.terrain.dist_to_river_m.toFixed(0)} m</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Slope / TWI:</span>
            <span className="text-white font-mono">{data.terrain.slope_deg}° · {data.terrain.twi}</span>
          </div>
        </div>

        {/* Urbanization & Drainage */}
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-slate-200 border-b border-slate-800 pb-1 text-[11px]">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Urban Drainage Network</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Impervious Area:</span>
            <span className="text-white font-mono">{data.urban.impervious_pct}%</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Drainage Density:</span>
            <span className="text-white font-mono">{data.urban.drainage_density} km/km²</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Drain Blockage:</span>
            <span className="text-white font-mono">{data.urban.drain_blockage_pct}%</span>
          </div>
        </div>

        {/* Exposure & Vulnerability */}
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-slate-200 border-b border-slate-800 pb-1 text-[11px]">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exposure & Assets</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Population:</span>
            <span className="text-white font-mono">{data.exposure.population.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Critical Facilities:</span>
            <span className="text-white font-mono">{data.exposure.critical_facilities.length || 'None'}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Road Importance:</span>
            <span className="text-white font-mono">{(data.exposure.road_importance_score * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
