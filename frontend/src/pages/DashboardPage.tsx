import React, { useEffect, useState } from 'react';
import { MetricCards } from '../components/MetricCards';
import { FloodMap } from '../maps/FloodMap';
import { ZoneIntelligence } from '../components/ZoneIntelligence';
import { PriorityPanel } from '../components/PriorityPanel';
import { ShapDrawer } from '../components/ShapDrawer';
import { WhatIfSimulator } from '../components/WhatIfSimulator';
import { useSimulationStore } from '../store/useSimulationStore';
import {
  fetchZones,
  fetchFloodMap,
  fetchZoneIntelligence,
  fetchPriorities
} from '../services/api';
import {
  ZoneStatic,
  CompactZoneDynamic,
  ZoneIntelligenceResponse,
  PriorityItem
} from '../types';

export const DashboardPage: React.FC = () => {
  const {
    selectedZoneId,
    setSelectedZoneId,
    isShapDrawerOpen,
    setIsShapDrawerOpen,
    selectedScenarioId,
    lastUpdateTimestamp
  } = useSimulationStore();

  const [zones, setZones] = useState<ZoneStatic[]>([]);
  const [zoneData, setZoneData] = useState<Record<string, CompactZoneDynamic>>({});
  const [selectedIntelligence, setSelectedIntelligence] = useState<ZoneIntelligenceResponse | null>(null);
  const [priorities, setPriorities] = useState<PriorityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load static zones once
  useEffect(() => {
    fetchZones()
      .then((res) => {
        if (res && res.zones) {
          setZones(res.zones);
        }
      })
      .catch(() => {});
  }, []);

  // Poll or refresh dynamic data on scenario change and relaxed timer
  useEffect(() => {
    let isMounted = true;
    const loadDynamic = async () => {
      try {
        const [mapRes, prioRes] = await Promise.all([
          fetchFloodMap(),
          fetchPriorities(10)
        ]);
        if (!isMounted) return;
        if (mapRes && mapRes.zone_data) {
          setZoneData(mapRes.zone_data);
        }
        if (prioRes && prioRes.top_zones) {
          setPriorities(prioRes.top_zones);
        }
        setIsLoading(false);
      } catch {
        // Handle gracefully
      }
    };

    loadDynamic();
    // Relaxed 8s polling to keep the browser main thread at a smooth 60 FPS
    const timer = setInterval(loadDynamic, 8000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [selectedScenarioId]);

  // Load selected zone intelligence
  useEffect(() => {
    if (selectedZoneId) {
      fetchZoneIntelligence(selectedZoneId)
        .then((res) => {
          setSelectedIntelligence(res);
        })
        .catch(() => {
          setSelectedIntelligence(null);
        });
    } else {
      setSelectedIntelligence(null);
    }
  }, [selectedZoneId, selectedScenarioId]);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-[1700px] mx-auto w-full">
      {/* KPI Cards Row */}
      <MetricCards zoneData={zoneData} />

      {/* Main Operations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:h-[calc(100vh-250px)] lg:min-h-[640px]">
        {/* Main Map View (8 cols) */}
        <div className="lg:col-span-8 h-[520px] lg:h-full flex flex-col min-h-[500px]">
          <FloodMap zones={zones} zoneData={zoneData} />
        </div>

        {/* Intelligence / Priorities Side Panel (4 cols) */}
        <div className="lg:col-span-4 h-full flex flex-col gap-4 overflow-hidden">
          {selectedZoneId ? (
            <ZoneIntelligence
              data={selectedIntelligence}
              onClose={() => setSelectedZoneId(null)}
            />
          ) : (
            <div className="flex flex-col gap-4 h-full">
              <PriorityPanel priorities={priorities} />
              <div className="glass-panel rounded-2xl p-4 border flex-1 flex flex-col justify-center items-center text-center">
                <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-2">
                  <span className="text-cyan-400 font-bold text-sm">i</span>
                </div>
                <h4 className="text-xs font-bold text-slate-300">Spatial Intelligence Ready</h4>
                <p className="text-[11px] text-slate-500 max-w-xs mt-1">
                  Click any 500m cell on the Delhi NCR map to inspect localized hydrology, 6h forecast, and SHAP attribution.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SHAP Explanation Drawer */}
      <ShapDrawer
        isOpen={isShapDrawerOpen}
        onClose={() => setIsShapDrawerOpen(false)}
        data={selectedIntelligence}
      />

      {/* What-If Simulator Modal */}
      <WhatIfSimulator />
    </div>
  );
};
