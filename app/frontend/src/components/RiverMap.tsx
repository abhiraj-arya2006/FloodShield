import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Tooltip, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { GaugeItem, EdgeItem, GaugeForecastRow } from '../types';
import { StatusChip } from './StatusChip';
import { useTranslation } from '../i18n/LanguageContext';
import { ExternalLink, Navigation } from 'lucide-react';

interface RiverMapProps {
  gauges: GaugeItem[];
  edges: EdgeItem[];
  forecastRows: GaugeForecastRow[];
  selectedBasin?: string;
}

export const RiverMap: React.FC<RiverMapProps> = ({
  gauges,
  edges,
  forecastRows,
  selectedBasin
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Map forecast data by gauge_id
  const forecastMap = useMemo(() => {
    const map = new Map<string, GaugeForecastRow>();
    forecastRows.forEach((r) => map.set(r.gauge_id, r));
    return map;
  }, [forecastRows]);

  // Coordinates lookup by gauge_id
  const coordsMap = useMemo(() => {
    const map = new Map<string, [number, number]>();
    gauges.forEach((g) => map.set(g.gauge_id, [g.ghi_lat, g.ghi_lon]));
    return map;
  }, [gauges]);

  // River links polylines
  const polylineEdges = useMemo(() => {
    return edges
      .map((edge) => {
        const fromCoord = coordsMap.get(edge.from_gauge_id);
        const toCoord = coordsMap.get(edge.to_gauge_id);
        if (!fromCoord || !toCoord) return null;
        return {
          id: `${edge.from_gauge_id}-${edge.to_gauge_id}`,
          positions: [fromCoord, toCoord] as [number, number][],
          distanceKm: edge.river_distance_km,
        };
      })
      .filter(Boolean);
  }, [edges, coordsMap]);

  // Center between Godavari and Mahanadi basins
  const center: [number, number] = [19.8, 80.8];

  const getStatusColor = (status?: string) => {
    if (status === 'WARNING') return '#ef4444';
    if (status === 'WATCH') return '#f59e0b';
    return '#22c55e';
  };

  return (
    <div className="relative w-full h-[520px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-[#070d1a] flex flex-col">
      {/* Top Map HUD Overlay */}
      <div className="absolute top-3 left-3 z-[1000] bg-[#0c1424]/95 border border-slate-800 p-2.5 rounded-xl backdrop-blur-md shadow-xl text-xs space-y-1">
        <div className="flex items-center gap-2 font-bold text-slate-200">
          <Navigation className="w-4 h-4 text-cyan-400" />
          <span>{t('map_title')}</span>
        </div>
        <div className="text-[11px] text-slate-400 font-medium">
          46 Gauges · 44 Directed Reach Links
        </div>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-[#0c1424]/95 border border-slate-800 p-3 rounded-xl backdrop-blur-md shadow-xl text-xs space-y-2">
        <span className="font-bold text-[11px] uppercase tracking-wider text-slate-300">
          Status Legend
        </span>
        <div className="flex flex-col gap-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 border border-red-300 shrink-0" />
            <span className="text-slate-300 font-medium">WARNING (&ge; q95)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 border border-amber-300 shrink-0" />
            <span className="text-slate-300 font-medium">WATCH (q90 – q95)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-300 shrink-0" />
            <span className="text-slate-300 font-medium">OK (&lt; q90)</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
            <span className="w-4 h-0.5 bg-cyan-400 shrink-0" />
            <span className="text-slate-400 text-[10px]">River Network Reach</span>
          </div>
        </div>
      </div>

      <MapContainer
        center={center}
        zoom={6}
        minZoom={5}
        maxZoom={12}
        zoomControl={false}
        className="w-full h-full"
        style={{ height: '100%', width: '100%', backgroundColor: '#070d1a' }}
      >
        <ZoomControl position="bottomright" />

        {/* Free OpenStreetMap Basemap */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        {/* River Edges (Topological Upstream to Downstream Links) */}
        {polylineEdges.map((pe) => {
          if (!pe) return null;
          return (
            <Polyline
              key={pe.id}
              positions={pe.positions}
              pathOptions={{
                color: '#22d3ee',
                weight: 2,
                opacity: 0.65,
                dashArray: '3, 4',
              }}
            />
          );
        })}

        {/* 46 River Gauge Circle Markers */}
        {gauges.map((gauge) => {
          const forecast = forecastMap.get(gauge.gauge_id);
          const status = forecast?.status || 'OK';
          const color = getStatusColor(status);
          const predFlow = forecast ? forecast.predicted_m3s : null;

          return (
            <CircleMarker
              key={gauge.gauge_id}
              center={[gauge.ghi_lat, gauge.ghi_lon]}
              radius={status === 'WARNING' ? 8 : status === 'WATCH' ? 7 : 6}
              pathOptions={{
                fillColor: color,
                fillOpacity: 0.9,
                color: '#ffffff',
                weight: 1.5,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                <div className="text-xs">
                  <div className="font-bold text-white">{gauge.name}</div>
                  <div className="text-slate-300">
                    {gauge.river} River · {gauge.basin}
                  </div>
                  <div className="mt-1 font-mono font-bold text-cyan-300">
                    {predFlow !== null ? `${predFlow.toLocaleString()} m³/s` : 'No forecast'}
                  </div>
                </div>
              </Tooltip>

              <Popup className="floodshield-popup">
                <div className="p-1 space-y-2 text-slate-100 min-w-[220px]">
                  <div className="border-b border-slate-700/80 pb-1.5 flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-sm text-white">{gauge.name}</h4>
                      <p className="text-[11px] text-slate-400">
                        {gauge.river} River ({gauge.basin} Basin)
                      </p>
                    </div>
                    <StatusChip status={status} size="sm" />
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('gauge_id')}:</span>
                      <span className="font-mono text-cyan-300">{gauge.gauge_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('predicted_flow')}:</span>
                      <span className="font-mono font-bold text-white">
                        {predFlow !== null ? `${predFlow.toLocaleString()} m³/s` : 'No data'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('watch_threshold')}:</span>
                      <span className="font-mono text-amber-300">{gauge.q90_m3s.toLocaleString()} m³/s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('flood_threshold')}:</span>
                      <span className="font-mono text-red-300">{gauge.q95_m3s.toLocaleString()} m³/s</span>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/gauge/${gauge.gauge_id}`)}
                    className="w-full mt-2 py-1.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <span>{t('view_forecast')}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
};
