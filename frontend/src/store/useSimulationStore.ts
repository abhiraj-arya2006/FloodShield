import { create } from 'zustand';
import { MapLayerType, SimulationState } from '../types';

interface SimulationStore {
  selectedZoneId: string | null;
  activeLayer: MapLayerType;
  simulationState: SimulationState | null;
  selectedScenarioId: string;
  playbackSpeed: number;
  isPlaying: boolean;
  isShapDrawerOpen: boolean;
  isWhatIfOpen: boolean;
  whatIfRainMultiplier: number;
  whatIfDrainBlockage: number;
  timezoneMode: 'IST' | 'UTC';
  wsConnected: boolean;
  lastUpdateTimestamp: string | null;
  mapBasemap: 'osm' | 'carto_dark' | 'carto_light' | 'mapbox';
  mapboxToken: string;

  // Actions
  setSelectedZoneId: (id: string | null) => void;
  setActiveLayer: (layer: MapLayerType) => void;
  setSimulationState: (state: SimulationState) => void;
  setSelectedScenarioId: (id: string) => void;
  setPlaybackSpeed: (speed: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsShapDrawerOpen: (open: boolean) => void;
  setIsWhatIfOpen: (open: boolean) => void;
  setWhatIfParams: (rainMult: number, blockagePct: number) => void;
  setTimezoneMode: (mode: 'IST' | 'UTC') => void;
  setWsConnected: (connected: boolean) => void;
  setLastUpdateTimestamp: (ts: string) => void;
  setMapBasemap: (basemap: 'osm' | 'carto_dark' | 'carto_light' | 'mapbox') => void;
  setMapboxToken: (token: string) => void;
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  selectedZoneId: null,
  activeLayer: 'flood_probability',
  simulationState: null,
  selectedScenarioId: 'monsoon_continuous',
  playbackSpeed: 10,
  isPlaying: true,
  isShapDrawerOpen: false,
  isWhatIfOpen: false,
  whatIfRainMultiplier: 1.0,
  whatIfDrainBlockage: 0.0,
  timezoneMode: 'IST',
  wsConnected: false,
  lastUpdateTimestamp: null,
  mapBasemap: (localStorage.getItem('floodshield_basemap') as any) || 'osm',
  mapboxToken: localStorage.getItem('floodshield_mapbox_token') || '',

  setSelectedZoneId: (id) => set({ selectedZoneId: id }),
  setActiveLayer: (layer) => set({ activeLayer: layer }),
  setSimulationState: (state) => set({
    simulationState: state,
    selectedScenarioId: state.scenario_id,
    playbackSpeed: state.speed,
    isPlaying: state.is_running
  }),
  setSelectedScenarioId: (id) => set({ selectedScenarioId: id }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsShapDrawerOpen: (open) => set({ isShapDrawerOpen: open }),
  setIsWhatIfOpen: (open) => set({ isWhatIfOpen: open }),
  setWhatIfParams: (rainMult, blockagePct) => set({
    whatIfRainMultiplier: rainMult,
    whatIfDrainBlockage: blockagePct
  }),
  setTimezoneMode: (mode) => set({ timezoneMode: mode }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setLastUpdateTimestamp: (ts) => set({ lastUpdateTimestamp: ts }),
  setMapBasemap: (basemap) => {
    localStorage.setItem('floodshield_basemap', basemap);
    set({ mapBasemap: basemap });
  },
  setMapboxToken: (token) => {
    localStorage.setItem('floodshield_mapbox_token', token);
    set({ mapboxToken: token });
  }
}));
