import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Tooltip, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { GaugeItem, EdgeItem, GaugeForecastRow } from '../types';
import { StatusChip } from './StatusChip';
import { useLanguage } from '../i18n/LanguageContext';
import { ExternalLink, Navigation, Compass, Layers } from 'lucide-react';

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
  selectedBasin,
}) => {
  const { t } = useLanguage();
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
    if (status === 'WARNING') return '#FF6A3D';
    if (status === 'WATCH') return '#E8B94A';
    return '#7CC4A4';
  };

  return (
    <div className="relative w-full h-130 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#07141C] flex flex-col group">
      {/* Top Map HUD Overlay */}
      <div className="absolute top-3 left-3 z-[1000] bg-[#0B1E26]/90 border border-white/10 p-3 rounded-xl backdrop-blur-md shadow-2xl text-xs space-y-1">
        <div className="flex items-center gap-2 font-heading font-bold text-white">
          <Navigation className="w-4 h-4 text-[#5CB8C4]" />
          <span>{t('map_title')}</span>
        </div>
        <div className="text-[11px] font-mono text-[#8FA9AB]">
          46 CAMELS-IND Stations • 44 River Reaches
        </div>
      </div>

      {/* Top Right Basin Indicator */}
      <div className="absolute top-3 right-3 z-[1000] hidden sm:flex items-center gap-2 bg-[#0B1E26]/90 border border-white/10 px-3 py-1.5 rounded-xl backdrop-blur-md shadow-2xl text-[11px] font-mono text-[#5CB8C4]">
        <Layers className="w-3.5 h-3.5" />
        <span>{selectedBasin ? `${selectedBasin} Focus` : 'Godavari & Mahanadi'}</span>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-[#0B1E26]/95 border border-white/10 p-3.5 rounded-xl backdrop-blur-md shadow-2xl text-xs space-y-2">
        <span className="font-heading font-bold text-[11px] uppercase tracking-wider text-white block">
          River Status Legend
        </span>
        <div className="flex flex-col gap-1.5 text-[11px] font-mono">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#FF6A3D] border border-red-300 shrink-0 shadow-[0_0_8px_rgba(255,106,61,0.5)]" />
            <span className="text-slate-200">WARNING (≥ q95)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#E8B94A] border border-amber-300 shrink-0 shadow-[0_0_8px_rgba(232,185,74,0.5)]" />
            <span className="text-slate-200">WATCH (q90 – q95)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#7CC4A4] border border-emerald-300 shrink-0 shadow-[0_0_8px_rgba(124,196,164,0.5)]" />
            <span className="text-slate-200">OK (&lt; q90)</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-white/10">
            <span className="w-4 h-0.5 bg-[#5CB8C4] shrink-0" />
            <span className="text-slate-400 text-[10px]">Reach Polyline Link</span>
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
        style={{ height: '100%', width: '100%', backgroundColor: '#07141C' }}
      >
        <ZoomControl position="bottomright" />

        {/* Esri World Dark Gray Canvas Basemap (Free, crisp, no API key required) */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
          maxZoom={16}
        />

        {/* River Links Polylines (Upstream to Downstream) */}
        {polylineEdges.map((edge) => (
          <Polyline
            key={edge!.id}
            positions={edge!.positions}
            pathOptions={{
              color: '#5CB8C4',
              weight: 2,
              opacity: 0.65,
              dashArray: '3, 6',
            }}
          >
            <Tooltip sticky>
              <span className="text-xs font-mono font-medium">
                Reach Distance: {edge!.distanceKm.toFixed(1)} km
              </span>
            </Tooltip>
          </Polyline>
        ))}

        {/* 46 Gauges as CircleMarkers */}
        {gauges.map((gauge) => {
          const forecast = forecastMap.get(gauge.gauge_id);
          const status = forecast?.status || 'OK';
          const color = getStatusColor(status);
          const isWarning = status === 'WARNING';
          const isWatch = status === 'WATCH';

          return (
            <CircleMarker
              key={gauge.gauge_id}
              center={[gauge.ghi_lat, gauge.ghi_lon]}
              radius={isWarning ? 9 : isWatch ? 7.5 : 6}
              pathOptions={{
                color: isWarning ? '#FF6A3D' : isWatch ? '#E8B94A' : '#5CB8C4',
                fillColor: color,
                fillOpacity: 0.9,
                weight: isWarning ? 2.5 : 1.5,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <div className="font-mono text-xs">
                  <div className="font-bold text-white">{gauge.name}</div>
                  <div className="text-slate-300">{gauge.river} ({gauge.basin})</div>
                  <div className="text-[#5CB8C4] mt-0.5">
                    Forecast: {forecast ? `${Math.round(forecast.predicted_m3s)} m³/s` : 'No data'}
                  </div>
                </div>
              </Tooltip>

              <Popup>
                <div className="p-2 space-y-2 font-mono text-xs text-slate-200 min-w-[210px]">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="font-heading font-bold text-white text-sm">
                      {gauge.name}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-white/10 px-1 rounded">
                      {gauge.gauge_id}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px]">
                    <div>River: <span className="text-white font-medium">{gauge.river}</span></div>
                    <div>Basin: <span className="text-white font-medium">{gauge.basin}</span></div>
                    <div>
                      Coords: <span className="text-slate-400">{gauge.ghi_lat.toFixed(2)}°N, {gauge.ghi_lon.toFixed(2)}°E</span>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Status:</span>
                    <StatusChip status={status} size="sm" />
                  </div>

                  {forecast && (
                    <div className="bg-[#07141C] p-2 rounded-lg border border-white/10 space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Predicted Flow:</span>
                        <span className="text-[#5CB8C4] font-bold">
                          {Math.round(forecast.predicted_m3s).toLocaleString()} m³/s
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">Threshold q95:</span>
                        <span className="text-red-400">{Math.round(gauge.q95_m3s).toLocaleString()} m³/s</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => navigate(`/gauge/${gauge.gauge_id}`)}
                    className="w-full mt-2 py-1.5 px-3 rounded-lg bg-[#5CB8C4] hover:bg-[#7CC4A4] text-[#07141C] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>View Hydrograph</span>
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
