import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { ZoneStatic, CompactZoneDynamic, MapLayerType, RiskLevel } from '../types';
import { useSimulationStore } from '../store/useSimulationStore';

interface FloodMapProps {
  zones: ZoneStatic[];
  zoneData: Record<string, CompactZoneDynamic>;
}

// Colorblind-safe color maps
function getLayerColor(
  zone: ZoneStatic,
  dynamic: CompactZoneDynamic | undefined,
  activeLayer: MapLayerType
): { fillColor: string; fillOpacity: number; color: string; weight: number } {
  if (!dynamic) {
    return { fillColor: '#334155', fillOpacity: 0.2, color: '#1e293b', weight: 0.5 };
  }

  if (activeLayer === 'flood_probability') {
    const p = dynamic.p1;
    if (p >= 0.75) {
      return { fillColor: '#ef4444', fillOpacity: 0.85, color: '#f87171', weight: 1.5 }; // Critical Red
    } else if (p >= 0.50) {
      return { fillColor: '#f97316', fillOpacity: 0.75, color: '#fb923c', weight: 0.8 }; // High Orange
    } else if (p >= 0.25) {
      return { fillColor: '#eab308', fillOpacity: 0.65, color: '#facc15', weight: 0.5 }; // Moderate Amber
    } else {
      return { fillColor: '#10b981', fillOpacity: 0.40, color: '#34d399', weight: 0.3 }; // Low Green
    }
  }

  if (activeLayer === 'rainfall_intensity') {
    const rf = dynamic.rf_current;
    if (rf > 50) return { fillColor: '#7c3aed', fillOpacity: 0.85, color: '#a78bfa', weight: 1.0 }; // Deep Purple
    if (rf > 30) return { fillColor: '#2563eb', fillOpacity: 0.80, color: '#60a5fa', weight: 0.8 }; // Blue
    if (rf > 10) return { fillColor: '#06b6d4', fillOpacity: 0.65, color: '#22d3ee', weight: 0.5 }; // Cyan
    if (rf > 1) return { fillColor: '#14b8a6', fillOpacity: 0.45, color: '#2dd4bf', weight: 0.3 };
    return { fillColor: '#1e293b', fillOpacity: 0.2, color: '#0f172a', weight: 0.2 };
  }

  if (activeLayer === 'priority_score') {
    const score = dynamic.priority_score;
    if (score >= 0.7) return { fillColor: '#dc2626', fillOpacity: 0.85, color: '#fca5a5', weight: 1.5 };
    if (score >= 0.45) return { fillColor: '#d97706', fillOpacity: 0.75, color: '#fcd34d', weight: 0.8 };
    return { fillColor: '#059669', fillOpacity: 0.4, color: '#6ee7b7', weight: 0.3 };
  }

  if (activeLayer === 'elevation') {
    const e = zone.elevation_m;
    // 200m to 310m
    const norm = Math.min(1.0, Math.max(0.0, (e - 202.0) / 100.0));
    // Lowlands (Yamuna) dark cyan -> Highlands (Aravalli) golden amber
    const r = Math.round(15 + norm * 200);
    const g = Math.round(140 - norm * 40);
    const b = Math.round(180 - norm * 140);
    return { fillColor: `rgb(${r},${g},${b})`, fillOpacity: 0.6, color: '#0f172a', weight: 0.3 };
  }

  if (activeLayer === 'slope') {
    const s = zone.slope_deg;
    const norm = Math.min(1.0, s / 4.0);
    return { fillColor: `rgb(${Math.round(40 + norm * 180)}, ${Math.round(80 + norm * 50)}, 120)`, fillOpacity: 0.6, color: '#0f172a', weight: 0.3 };
  }

  if (activeLayer === 'impervious_surface') {
    const imp = zone.impervious_ratio;
    return { fillColor: `rgb(${Math.round(50 + imp * 180)}, 60, ${Math.round(180 - imp * 100)})`, fillOpacity: 0.6, color: '#0f172a', weight: 0.3 };
  }

  if (activeLayer === 'drainage_density') {
    const dd = zone.drainage_density_km_km2;
    const norm = Math.min(1.0, dd / 3.5);
    return { fillColor: `rgb(30, ${Math.round(100 + norm * 140)}, 200)`, fillOpacity: 0.6, color: '#0f172a', weight: 0.3 };
  }

  if (activeLayer === 'satellite_flood_extent') {
    const isFlooded = dynamic.p1 > 0.65;
    if (isFlooded) {
      return { fillColor: '#0ea5e9', fillOpacity: 0.85, color: '#38bdf8', weight: 1.5 };
    }
    return { fillColor: '#0f172a', fillOpacity: 0.15, color: '#1e293b', weight: 0.2 };
  }

  if (activeLayer === 'exposure') {
    const pop = zone.population;
    const norm = Math.min(1.0, pop / 3000);
    return { fillColor: `rgb(${Math.round(80 + norm * 160)}, ${Math.round(40 + norm * 80)}, 200)`, fillOpacity: 0.65, color: '#0f172a', weight: 0.3 };
  }

  // Default fallback
  return { fillColor: '#38bdf8', fillOpacity: 0.4, color: '#0284c7', weight: 0.5 };
}

// Canvas renderer singleton for high-fps Leaflet polygon rendering
const canvasRenderer = L.canvas({ padding: 0.5 });

export const FloodMap: React.FC<FloodMapProps> = ({ zones, zoneData }) => {
  const { selectedZoneId, activeLayer, setSelectedZoneId, setActiveLayer } = useSimulationStore();

  const center: [number, number] = [28.62, 77.15]; // Delhi NCR center

  return (
    <div className="relative w-full h-full min-h-125 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
      {/* Layer Switcher HUD Bar */}
      <div className="absolute top-4 left-4 z-400 flex flex-wrap items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-700/80 backdrop-blur-md shadow-lg text-xs font-medium">
        <span className="text-[11px] font-mono text-slate-400 px-2 uppercase font-bold">Active Layer:</span>
        {[
          { id: 'flood_probability', label: 'Flood Risk' },
          { id: 'rainfall_intensity', label: 'Rain Intensity' },
          { id: 'priority_score', label: 'Priority Impact' },
          { id: 'elevation', label: 'Elevation' },
          { id: 'impervious_surface', label: 'Impervious %' },
          { id: 'drainage_density', label: 'Drainage' },
          { id: 'satellite_flood_extent', label: 'SAR Extent' },
          { id: 'exposure', label: 'Population' }
        ].map((layer) => (
          <button
            key={layer.id}
            onClick={() => setActiveLayer(layer.id as MapLayerType)}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              activeLayer === layer.id
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            {layer.label}
          </button>
        ))}
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-6 left-4 z-400 bg-slate-900/90 border border-slate-800 p-3 rounded-xl backdrop-blur-md shadow-xl text-xs space-y-2 max-w-55">
        <div className="font-bold text-slate-200 text-[11px] uppercase tracking-wider font-mono">
          {activeLayer === 'flood_probability' && 'Risk Probability Scale'}
          {activeLayer === 'rainfall_intensity' && 'Rainfall Rate (mm/h)'}
          {activeLayer === 'priority_score' && 'Impact Priority Index'}
          {activeLayer === 'elevation' && 'Topography Elevation (m)'}
          {activeLayer === 'satellite_flood_extent' && 'Sentinel-1 SAR Inundation'}
          {activeLayer !== 'flood_probability' &&
           activeLayer !== 'rainfall_intensity' &&
           activeLayer !== 'priority_score' &&
           activeLayer !== 'elevation' &&
           activeLayer !== 'satellite_flood_extent' && 'Metric Gradient'}
        </div>

        {activeLayer === 'flood_probability' ? (
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-red-500 border border-red-300 shrink-0" />
              <span className="text-slate-300">CRITICAL (≥ 75%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-orange-500 border border-orange-300 shrink-0" />
              <span className="text-slate-300">HIGH (50%–75%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-amber-500 border border-amber-300 shrink-0" />
              <span className="text-slate-300">MODERATE (25%–50%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-500 border border-emerald-300 shrink-0" />
              <span className="text-slate-300">LOW (&lt; 25%)</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-[11px]">
            <div className="h-2 w-full rounded bg-linear-to-r from-emerald-500 via-amber-500 to-red-500" />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>Low</span>
              <span>Mid</span>
              <span>Peak</span>
            </div>
          </div>
        )}

        <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
          Click any grid cell to view intelligence & SHAP explanation.
        </div>
      </div>

      <MapContainer
        center={center}
        zoom={11}
        minZoom={9}
        maxZoom={15}
        preferCanvas={true}
        className="w-full h-full dark-tiles"
        style={{ height: '100%', width: '100%' }}
      >
        {/* CARTO Dark Matter Open Tiles with fallback */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />

        {/* Polygons rendered via Leaflet Canvas */}
        {zones.map((zone) => {
          const dynamic = zoneData[zone.zone_id];
          const style = getLayerColor(zone, dynamic, activeLayer);
          const isSelected = selectedZoneId === zone.zone_id;

          // Convert GeoJSON coordinates [ [lon, lat], ... ] to Leaflet [ [lat, lon], ... ]
          const positions: [number, number][] = zone.geometry.coordinates[0].map(([lon, lat]) => [lat, lon]);

          return (
            <Polygon
              key={zone.zone_id}
              positions={positions}
              renderer={canvasRenderer}
              pathOptions={{
                fillColor: style.fillColor,
                fillOpacity: isSelected ? 0.95 : style.fillOpacity,
                color: isSelected ? '#38bdf8' : style.color,
                weight: isSelected ? 3.0 : style.weight
              }}
              eventHandlers={{
                click: () => setSelectedZoneId(zone.zone_id)
              }}
            >
              <Tooltip sticky>
                <div className="text-xs p-1 font-sans">
                  <div className="font-bold text-white">{zone.name}</div>
                  <div className="text-slate-300 text-[11px] mt-0.5">Locality: {zone.locality}</div>
                  {dynamic && (
                    <div className="mt-1 space-y-0.5 text-[11px]">
                      <div className="text-cyan-400 font-semibold">
                        Flood Probability: {(dynamic.p1 * 100).toFixed(0)}%
                      </div>
                      <div className="text-slate-400">Risk: {dynamic.risk} ({dynamic.flood_type})</div>
                      <div className="text-slate-400">Rainfall: {dynamic.rf_current.toFixed(1)} mm/h</div>
                      <div className="text-amber-400">Priority Score: {dynamic.priority_score.toFixed(2)}</div>
                    </div>
                  )}
                </div>
              </Tooltip>
            </Polygon>
          );
        })}
      </MapContainer>
    </div>
  );
};
