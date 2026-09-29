import React, { useEffect, useState } from 'react';
import { Download, FileJson, FileSpreadsheet, Layers, Share2 } from 'lucide-react';
import { FloodMap } from '../maps/FloodMap';
import { fetchZones, fetchFloodMap } from '../services/api';
import { ZoneStatic, CompactZoneDynamic } from '../types';
import { useSimulationStore } from '../store/useSimulationStore';

export const MapPage: React.FC = () => {
  const { activeLayer, setActiveLayer, selectedZoneId } = useSimulationStore();
  const [zones, setZones] = useState<ZoneStatic[]>([]);
  const [zoneData, setZoneData] = useState<Record<string, CompactZoneDynamic>>({});

  useEffect(() => {
    fetchZones()
      .then((res) => {
        if (res && res.zones) setZones(res.zones);
      })
      .catch(() => {});

    fetchFloodMap()
      .then((res) => {
        if (res && res.zone_data) setZoneData(res.zone_data);
      })
      .catch(() => {});
  }, []);

  const exportGeoJSON = () => {
    const geojson = {
      type: 'FeatureCollection',
      is_simulated: true,
      features: zones.map((z) => {
        const dyn = zoneData[z.zone_id];
        return {
          type: 'Feature',
          geometry: z.geometry,
          properties: {
            zone_id: z.zone_id,
            name: z.name,
            locality: z.locality,
            elevation_m: z.elevation_m,
            flood_probability: dyn ? dyn.p1 : 0.0,
            risk_level: dyn ? dyn.risk : 'LOW',
            rainfall_intensity_mm_h: dyn ? dyn.rf_current : 0.0,
            priority_score: dyn ? dyn.priority_score : 0.0
          }
        };
      })
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `floodshield_delhi_ncr_${Date.now()}.geojson`;
    a.click();
  };

  const exportCSV = () => {
    const headers = ['zone_id', 'name', 'locality', 'latitude', 'longitude', 'elevation_m', 'flood_probability', 'risk_level', 'rainfall_current_mm_h', 'priority_score', 'is_simulated'];
    const rows = zones.map((z) => {
      const dyn = zoneData[z.zone_id];
      return [
        z.zone_id,
        `"${z.name}"`,
        `"${z.locality}"`,
        z.centroid_lat,
        z.centroid_lon,
        z.elevation_m,
        dyn ? dyn.p1 : 0.0,
        dyn ? dyn.risk : 'LOW',
        dyn ? dyn.rf_current : 0.0,
        dyn ? dyn.priority_score : 0.0,
        'true'
      ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `floodshield_risk_data_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-[calc(100vh-140px)] min-h-[600px]">
      {/* Top Controls Bar */}
      <div className="glass-panel p-3 rounded-2xl flex items-center justify-between border shrink-0">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="text-sm font-extrabold text-white">Delhi NCR GIS Spatial Inundation Grid</h2>
            <p className="text-[11px] text-slate-400">Projected in EPSG:32643 (UTM Zone 43N) · Served in EPSG:4326 WGS84</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={exportGeoJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 transition-colors"
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>Export GeoJSON</span>
          </button>
        </div>
      </div>

      {/* Full-size Map Container */}
      <div className="flex-1 w-full h-full min-h-[480px]">
        <FloodMap zones={zones} zoneData={zoneData} />
      </div>
    </div>
  );
};
