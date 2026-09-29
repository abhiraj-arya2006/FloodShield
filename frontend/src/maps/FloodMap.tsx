import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Key, ExternalLink, X, MapPin, Droplets, ShieldAlert, Sparkles } from 'lucide-react';

import { ZoneStatic, CompactZoneDynamic, MapLayerType } from '../types';
import { useSimulationStore } from '../store/useSimulationStore';

// Fix Leaflet marker icon asset resolution for Vite bundler
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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
    return { fillColor: '#334155', fillOpacity: 0.25, color: '#1e293b', weight: 0.5 };
  }

  if (activeLayer === 'flood_probability') {
    const p = dynamic.p1;
    if (p >= 0.75) {
      return { fillColor: '#ef4444', fillOpacity: 0.85, color: '#b91c1c', weight: 1.5 }; // Critical Red
    } else if (p >= 0.50) {
      return { fillColor: '#f97316', fillOpacity: 0.75, color: '#c2410c', weight: 0.8 }; // High Orange
    } else if (p >= 0.25) {
      return { fillColor: '#eab308', fillOpacity: 0.65, color: '#a16207', weight: 0.5 }; // Moderate Amber
    } else {
      return { fillColor: '#10b981', fillOpacity: 0.40, color: '#047857', weight: 0.3 }; // Low Green
    }
  }

  if (activeLayer === 'rainfall_intensity') {
    const rf = dynamic.rf_current;
    if (rf > 50) return { fillColor: '#7c3aed', fillOpacity: 0.85, color: '#6d28d9', weight: 1.0 }; // Deep Purple
    if (rf > 30) return { fillColor: '#2563eb', fillOpacity: 0.80, color: '#1d4ed8', weight: 0.8 }; // Blue
    if (rf > 10) return { fillColor: '#06b6d4', fillOpacity: 0.65, color: '#0e7490', weight: 0.5 }; // Cyan
    if (rf > 1) return { fillColor: '#14b8a6', fillOpacity: 0.45, color: '#0f766e', weight: 0.3 };
    return { fillColor: '#1e293b', fillOpacity: 0.2, color: '#0f172a', weight: 0.2 };
  }

  if (activeLayer === 'priority_score') {
    const score = dynamic.priority_score;
    if (score >= 0.7) return { fillColor: '#dc2626', fillOpacity: 0.85, color: '#991b1b', weight: 1.5 };
    if (score >= 0.45) return { fillColor: '#d97706', fillOpacity: 0.75, color: '#b45309', weight: 0.8 };
    return { fillColor: '#059669', fillOpacity: 0.4, color: '#047857', weight: 0.3 };
  }

  if (activeLayer === 'elevation') {
    const e = zone.elevation_m;
    const norm = Math.min(1.0, Math.max(0.0, (e - 202.0) / 100.0));
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
      return { fillColor: '#0ea5e9', fillOpacity: 0.85, color: '#0284c7', weight: 1.5 };
    }
    return { fillColor: '#0f172a', fillOpacity: 0.15, color: '#1e293b', weight: 0.2 };
  }

  if (activeLayer === 'exposure') {
    const pop = zone.population;
    const norm = Math.min(1.0, pop / 3000);
    return { fillColor: `rgb(${Math.round(80 + norm * 160)}, ${Math.round(40 + norm * 80)}, 200)`, fillOpacity: 0.65, color: '#0f172a', weight: 0.3 };
  }

  return { fillColor: '#38bdf8', fillOpacity: 0.4, color: '#0284c7', weight: 0.5 };
}

// Canvas renderer singleton for 60-fps Leaflet polygon rendering
const canvasRenderer = L.canvas({ padding: 0.5 });

// Auto-resizer component to ensure map invalidates size upon layout shifts
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const handleResize = () => {
      map.invalidateSize();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  return null;
}

// High-Performance Memoized Polygon component
interface ZonePolygonProps {
  zone: ZoneStatic;
  positions: [number, number][];
  dynamic?: CompactZoneDynamic;
  isSelected: boolean;
  activeLayer: MapLayerType;
  onSelect: (zoneId: string) => void;
  onHover: (zone: ZoneStatic, dynamic?: CompactZoneDynamic) => void;
  onUnhover: () => void;
}

const ZonePolygon = React.memo<ZonePolygonProps>(
  ({ zone, positions, dynamic, isSelected, activeLayer, onSelect, onHover, onUnhover }) => {
    const style = getLayerColor(zone, dynamic, activeLayer);

    return (
      <Polygon
        positions={positions}
        renderer={canvasRenderer}
        pathOptions={{
          fillColor: style.fillColor,
          fillOpacity: isSelected ? 0.95 : style.fillOpacity,
          color: isSelected ? '#38bdf8' : style.color,
          weight: isSelected ? 3.0 : style.weight
        }}
        eventHandlers={{
          click: () => onSelect(zone.zone_id),
          mouseover: () => onHover(zone, dynamic),
          mouseout: onUnhover
        }}
      />
    );
  },
  (prev, next) => {
    return (
      prev.isSelected === next.isSelected &&
      prev.activeLayer === next.activeLayer &&
      prev.dynamic === next.dynamic &&
      prev.positions === next.positions
    );
  }
);

ZonePolygon.displayName = 'ZonePolygon';

// Basemap Provider Definitions - OpenStreetMap is primary default
interface BasemapConfig {
  id: 'osm' | 'carto_dark' | 'carto_light' | 'mapbox';
  name: string;
  url: (token?: string) => string;
  attribution: string;
  maxZoom: number;
  requiresKey: boolean;
  notes: string;
}

const BASEMAP_CONFIGS: Record<string, BasemapConfig> = {
  osm: {
    id: 'osm',
    name: 'OpenStreetMap (Default)',
    url: () => 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    requiresKey: false,
    notes: 'Official OpenStreetMap tiles. 100% free and open-source.'
  },
  carto_dark: {
    id: 'carto_dark',
    name: 'CARTO Dark Matter',
    url: () => 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
    requiresKey: false,
    notes: 'Zero API Key needed. Dark operations UI.'
  },
  carto_light: {
    id: 'carto_light',
    name: 'CARTO Positron (Light)',
    url: () => 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19,
    requiresKey: false,
    notes: 'Zero API Key needed. High-contrast clean light mode.'
  },
  mapbox: {
    id: 'mapbox',
    name: 'Mapbox Dark v11',
    url: (token?: string) =>
      token
        ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${token}`
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.mapbox.com/">Mapbox</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 20,
    requiresKey: true,
    notes: 'Requires Mapbox Public Access Token (pk.eyJ...).'
  }
};

export const FloodMap: React.FC<FloodMapProps> = ({ zones, zoneData }) => {
  const {
    selectedZoneId,
    activeLayer,
    setSelectedZoneId,
    setActiveLayer,
    mapBasemap,
    setMapBasemap,
    mapboxToken,
    setMapboxToken
  } = useSimulationStore();

  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState(mapboxToken);
  const [hoveredZone, setHoveredZone] = useState<{ zone: ZoneStatic; dynamic?: CompactZoneDynamic } | null>(null);

  const center: [number, number] = [28.62, 77.15]; // Delhi NCR center

  // Pre-convert and cache GeoJSON coordinates into Leaflet positions once
  const zonePositions = useMemo(() => {
    const map = new Map<string, [number, number][]>();
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      map.set(
        z.zone_id,
        z.geometry.coordinates[0].map(([lon, lat]) => [lat, lon])
      );
    }
    return map;
  }, [zones]);

  // Callbacks for memoized polygon clicks and hover
  const handleSelect = useCallback((id: string) => setSelectedZoneId(id), [setSelectedZoneId]);
  const handleHover = useCallback((zone: ZoneStatic, dynamic?: CompactZoneDynamic) => {
    setHoveredZone({ zone, dynamic });
  }, []);
  const handleUnhover = useCallback(() => setHoveredZone(null), []);

  const activeBasemapKey = mapBasemap in BASEMAP_CONFIGS ? mapBasemap : 'osm';
  const currentBasemap = BASEMAP_CONFIGS[activeBasemapKey] || BASEMAP_CONFIGS.osm;
  const tileUrl = currentBasemap.url(mapboxToken);

  const handleSaveToken = () => {
    setMapboxToken(tokenInput.trim());
    if (tokenInput.trim()) {
      setMapBasemap('mapbox');
    }
    setIsKeyModalOpen(false);
  };

  return (
    <div className="relative w-full h-full min-h-[500px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 flex flex-col">
      {/* Top HUD Bar: Layer Switcher & Basemap / Key Selector */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Layer Switcher HUD Bar */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-900/95 p-1.5 rounded-xl border border-slate-700/80 backdrop-blur-md shadow-xl text-xs font-medium pointer-events-auto">
          <span className="text-[11px] font-mono text-slate-400 px-2 uppercase font-bold">Layer:</span>
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

        {/* Basemap & API Key Control */}
        <div className="flex items-center gap-1.5 bg-slate-900/95 p-1.5 rounded-xl border border-slate-700/80 backdrop-blur-md shadow-xl text-xs pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-cyan-400 font-semibold pl-1 hidden sm:inline">Basemap:</span>
            <select
              value={activeBasemapKey}
              onChange={(e) => setMapBasemap(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1 font-medium focus:outline-none focus:border-cyan-500"
              title="Select Basemap Provider"
            >
              <option value="osm">🗺️ OpenStreetMap (Default)</option>
              <option value="carto_dark">CARTO Dark Matter</option>
              <option value="carto_light">CARTO Positron</option>
              <option value="mapbox">Mapbox Dark (Key)</option>
            </select>
          </div>

          <button
            onClick={() => setIsKeyModalOpen(true)}
            className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 font-semibold ${
              mapboxToken
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Configure Map API Key"
          >
            <Key className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] hidden sm:inline">
              {mapboxToken ? 'Key Active' : 'API Key'}
            </span>
          </button>
        </div>
      </div>

      {/* Floating Fast Inspection Card (Zero Leaflet Tooltip DOM overhead) */}
      {hoveredZone && (
        <div className="absolute top-16 right-4 z-[1000] bg-slate-900/95 border border-slate-700 p-3 rounded-xl backdrop-blur-md shadow-2xl text-xs max-w-[280px] pointer-events-none animate-in fade-in duration-100">
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate text-white">{hoveredZone.zone.name}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{hoveredZone.zone.locality}</div>

          {hoveredZone.dynamic ? (
            <div className="mt-2 space-y-1.5 pt-2 border-t border-slate-800 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Flood Likelihood:</span>
                <span className="font-extrabold text-cyan-400 font-mono">
                  {(hoveredZone.dynamic.p1 * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Risk Assessment:</span>
                <span
                  className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                    hoveredZone.dynamic.risk === 'CRITICAL'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : hoveredZone.dynamic.risk === 'HIGH'
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : hoveredZone.dynamic.risk === 'MODERATE'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {hoveredZone.dynamic.risk} ({hoveredZone.dynamic.flood_type})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Instant Rain:</span>
                <span className="text-white font-mono">{hoveredZone.dynamic.rf_current.toFixed(1)} mm/h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Priority Score:</span>
                <span className="text-amber-400 font-mono font-bold">
                  {hoveredZone.dynamic.priority_score.toFixed(2)}
                </span>
              </div>
              <div className="text-[10px] text-cyan-400/80 pt-1 text-center font-medium">
                👉 Click zone to open full Hydrology & SHAP panel
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 mt-1">Elev: {hoveredZone.zone.elevation_m}m · Pop: {hoveredZone.zone.population}</div>
          )}
        </div>
      )}

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/95 border border-slate-800 p-3 rounded-xl backdrop-blur-md shadow-xl text-xs space-y-2 max-w-[240px]">
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
              <span className="text-slate-300 font-medium">CRITICAL (≥ 75%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-orange-500 border border-orange-300 shrink-0" />
              <span className="text-slate-300 font-medium">HIGH (50%–75%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-amber-500 border border-amber-300 shrink-0" />
              <span className="text-slate-300 font-medium">MODERATE (25%–50%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-500 border border-emerald-300 shrink-0" />
              <span className="text-slate-300 font-medium">LOW (&lt; 25%)</span>
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

        <div className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-800 leading-tight">
          Hover any zone for instant metrics · Click for detailed SHAP explanation.
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 w-full h-full min-h-[480px]">
        <MapContainer
          center={center}
          zoom={11}
          minZoom={9}
          maxZoom={18}
          zoomControl={false}
          preferCanvas={true}
          className="w-full h-full"
          style={{ height: '100%', width: '100%' }}
        >
          {/* Zoom controls placed at bottom right to avoid HUD collision */}
          <ZoomControl position="bottomright" />

          {/* Active Tile Provider */}
          <TileLayer
            key={`${activeBasemapKey}-${mapboxToken ? 'auth' : 'free'}`}
            attribution={currentBasemap.attribution}
            url={tileUrl}
            maxZoom={currentBasemap.maxZoom}
          />

          <MapController center={center} />

          {/* High-Performance Polygons rendered via Leaflet Canvas */}
          {zones.map((zone) => {
            const positions = zonePositions.get(zone.zone_id);
            if (!positions) return null;
            const dynamic = zoneData[zone.zone_id];
            const isSelected = selectedZoneId === zone.zone_id;

            return (
              <ZonePolygon
                key={zone.zone_id}
                zone={zone}
                positions={positions}
                dynamic={dynamic}
                isSelected={isSelected}
                activeLayer={activeLayer}
                onSelect={handleSelect}
                onHover={handleHover}
                onUnhover={handleUnhover}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* Map API Key & Basemap Info Modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Basemap & Key Management</h3>
              </div>
              <button
                onClick={() => setIsKeyModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 text-cyan-200">
                <span className="font-bold">🗺️ Active Basemap: OpenStreetMap</span>
                <p className="mt-1 text-[11px] leading-relaxed">
                  OpenStreetMap provides authentic, free, public mapping with no API key or usage limits. All roads, landmarks, and waterways across Delhi NCR are visible natively.
                </p>
              </div>

              <div>
                <label className="block text-slate-200 font-semibold mb-1">
                  Optional: Mapbox Public Access Token
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  If you ever wish to try Mapbox Dark v11 tiles, paste your public token below (starts with <code className="text-cyan-300">pk.eyJ...</code>):
                </p>
                <input
                  type="text"
                  placeholder="pk.eyJ1Ijo..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-1.5 text-[11px]">
                <div className="font-semibold text-slate-200">Available Basemaps:</div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60 font-semibold text-cyan-300">
                  <span>1. OpenStreetMap (OSM)</span>
                  <span className="font-mono text-emerald-400">Active (Free)</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-white font-medium">2. CARTO Dark Matter</span>
                  <span className="text-emerald-400 font-mono">No Key (Included)</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-white font-medium">3. CARTO Positron Light</span>
                  <span className="text-emerald-400 font-mono">No Key (Included)</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-white font-medium">4. Mapbox Studio Dark v11</span>
                  <a
                    href="https://account.mapbox.com/access-tokens/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 underline flex items-center gap-1 hover:text-cyan-300"
                  >
                    <span>Get Free Mapbox Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setTokenInput('');
                  setMapboxToken('');
                  setMapBasemap('osm');
                  setIsKeyModalOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800"
              >
                Reset to OpenStreetMap
              </button>
              <button
                onClick={handleSaveToken}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors"
              >
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
