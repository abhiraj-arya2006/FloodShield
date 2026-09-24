import {
  ZonesListResponse,
  FloodMapResponse,
  ZoneIntelligenceResponse,
  PrioritiesResponse,
  Alert,
  WhatIfRequest,
  WhatIfResponse,
  SimulationState,
  ScenarioItem
} from '../types';

const BASE_URL = '/api';

export async function fetchHealth(): Promise<any> {
  const res = await fetch(`${BASE_URL}/health`);
  return res.json();
}

export async function fetchZones(limit?: number): Promise<ZonesListResponse> {
  const url = limit ? `${BASE_URL}/zones?limit=${limit}` : `${BASE_URL}/zones`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchFloodMap(hour?: number): Promise<FloodMapResponse> {
  const url = hour !== undefined ? `${BASE_URL}/flood-map?hour=${hour}` : `${BASE_URL}/flood-map`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchZoneIntelligence(zoneId: string): Promise<ZoneIntelligenceResponse> {
  const res = await fetch(`${BASE_URL}/predictions/${zoneId}`);
  if (!res.ok) throw new Error(`Failed to load intelligence for zone ${zoneId}`);
  return res.json();
}

export async function fetchPriorities(top: number = 10): Promise<PrioritiesResponse> {
  const res = await fetch(`${BASE_URL}/priorities?top=${top}`);
  return res.json();
}

export async function fetchAlerts(): Promise<Alert[]> {
  const res = await fetch(`${BASE_URL}/alerts`);
  return res.json();
}

export async function triggerTestAlert(): Promise<Alert> {
  const res = await fetch(`${BASE_URL}/alerts/test`, { method: 'POST' });
  return res.json();
}

export async function acknowledgeAlert(alertId: string, notes?: string): Promise<Alert> {
  const res = await fetch(`${BASE_URL}/alerts/${alertId}/acknowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'analyst_operator', notes: notes || 'Acknowledged by operator' })
  });
  return res.json();
}

export async function resolveAlert(alertId: string, notes?: string): Promise<Alert> {
  const res = await fetch(`${BASE_URL}/alerts/${alertId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'analyst_operator', notes: notes || 'Resolved' })
  });
  return res.json();
}

export async function postWhatIf(request: WhatIfRequest): Promise<WhatIfResponse> {
  const res = await fetch(`${BASE_URL}/whatif`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  return res.json();
}

export async function fetchScenarios(): Promise<{ active_scenario_id: string; scenarios: ScenarioItem[] }> {
  const res = await fetch(`${BASE_URL}/scenarios`);
  return res.json();
}

export async function fetchSimulationState(): Promise<SimulationState> {
  const res = await fetch(`${BASE_URL}/simulation/state`);
  return res.json();
}

export async function controlSimulation(control: {
  action: 'play' | 'pause' | 'set_speed' | 'seek' | 'set_scenario';
  speed?: number;
  seek_seconds?: number;
  scenario_id?: string;
}): Promise<SimulationState> {
  const res = await fetch(`${BASE_URL}/simulation/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(control)
  });
  return res.json();
}

export async function fetchSatelliteExtent(): Promise<any> {
  const res = await fetch(`${BASE_URL}/satellite/flood-extent`);
  return res.json();
}

export async function fetchModelPerformance(): Promise<any> {
  const res = await fetch(`${BASE_URL}/models/performance`);
  return res.json();
}
