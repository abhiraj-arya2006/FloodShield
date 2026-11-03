import {
  HealthResponse,
  GaugesResponse,
  EdgesResponse,
  DatesResponse,
  ForecastResponse,
  SingleGaugeForecastResponse,
  AlertsResponse,
  ModelInfoResponse,
} from '../types';

const BASE_URL = '/api';

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error('Failed to fetch health status');
  return res.json();
}

export async function fetchGauges(): Promise<GaugesResponse> {
  const res = await fetch(`${BASE_URL}/gauges`);
  if (!res.ok) throw new Error('Failed to fetch gauges metadata');
  return res.json();
}

export async function fetchEdges(): Promise<EdgesResponse> {
  const res = await fetch(`${BASE_URL}/edges`);
  if (!res.ok) throw new Error('Failed to fetch river edges');
  return res.json();
}

export async function fetchDates(): Promise<DatesResponse> {
  const res = await fetch(`${BASE_URL}/dates`);
  if (!res.ok) throw new Error('Failed to fetch available dates');
  return res.json();
}

export async function fetchForecast(date: string, lead: number): Promise<ForecastResponse> {
  const res = await fetch(`${BASE_URL}/forecast?date=${encodeURIComponent(date)}&lead=${lead}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch forecast' }));
    throw new Error(err.detail || 'Failed to fetch forecast');
  }
  return res.json();
}

export async function fetchSingleGaugeForecast(
  gaugeId: string,
  date: string
): Promise<SingleGaugeForecastResponse> {
  const res = await fetch(
    `${BASE_URL}/gauges/${encodeURIComponent(gaugeId)}/forecast?date=${encodeURIComponent(date)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch gauge forecast' }));
    throw new Error(err.detail || 'Failed to fetch gauge forecast');
  }
  return res.json();
}

export async function fetchAlerts(date: string, lead: number): Promise<AlertsResponse> {
  const res = await fetch(`${BASE_URL}/alerts?date=${encodeURIComponent(date)}&lead=${lead}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch alerts' }));
    throw new Error(err.detail || 'Failed to fetch alerts');
  }
  return res.json();
}

export async function fetchModelInfo(): Promise<ModelInfoResponse> {
  const res = await fetch(`${BASE_URL}/model-info`);
  if (!res.ok) throw new Error('Failed to fetch model info');
  return res.json();
}

