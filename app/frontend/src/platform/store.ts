import { useCallback, useEffect, useState } from 'react';
import { create } from 'zustand';
import { fetchDates, fetchEdges, fetchForecast, fetchGauges } from '../services/api';
import { AlertStatus, EdgeItem, GaugeForecastRow, GaugeItem } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

export const DAYS = [1, 2, 3, 4];
export const LAST_DAY = 4;
/* A real monsoon rise from the held-back test years: 0, 3, 10, then 21 gauges on warning. */
export const DEFAULT_START = '2013-07-09';
const SERVICE_DOWN = "The forecast service isn't responding. Start the backend on port 8000, then try again.";
/* The model's archive has no forecast for some dates, which is different from the service being down. */
export const forecastError = (err: Error) =>
  err.message.startsWith('No forecast') ? 'No forecast was made for this date. Choose a date from 2009 to 2018.' : SERVICE_DOWN;

export type ForecastMode = 'live' | 'past';
export interface LiveInfo { made_on: string; generated_at: string; stale: boolean; weather: string; }

/* The forecast being looked at follows you from page to page. */
interface ForecastState {
  ready: boolean;
  mode: ForecastMode;
  live: LiveInfo | null;
  liveFailed: boolean;
  start: string;
  day: number;
  setStart: (start: string) => void;
  setDay: (day: number) => void;
  setMode: (mode: ForecastMode) => void;
  loadLive: () => Promise<void>;
}
export const useForecastStore = create<ForecastState>((set, get) => ({
  ready: false,
  mode: 'live',
  live: null,
  liveFailed: false,
  start: DEFAULT_START,
  day: 1,
  setStart: (start) => set({ start }),
  setDay: (day) => set({ day }),
  setMode: (mode) => {
    const { live } = get();
    if (mode === 'live' && live) set({ mode, start: live.made_on, day: 1 });
    else set({ mode: 'past', start: DEFAULT_START, day: 4 });
  },
  /* Runs the model on today's weather. If that fails, past years still work. */
  loadLive: async () => {
    try {
      const res = await fetch('/api/live');
      if (!res.ok) throw new Error('Live forecast unavailable');
      const live: LiveInfo = await res.json();
      set({ live, liveFailed: false, ready: true, mode: 'live', start: live.made_on, day: 1 });
    } catch {
      set({ live: null, liveFailed: true, ready: true, mode: 'past', start: DEFAULT_START, day: 4 });
    }
  },
}));

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* Inline English and Hindi pairs, so a string and its translation stay side by side. */
export function useText() {
  const { language } = useLanguage();
  const L = useCallback((en: string, hi: string) => (language === 'hi' ? hi : en), [language]);
  const date = useCallback(
    (iso: string) =>
      new Date(`${iso}T00:00:00Z`).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
      }),
    [language]
  );
  const statusWord = useCallback(
    (s: AlertStatus) =>
      language === 'hi'
        ? { OK: 'सामान्य', WATCH: 'निगरानी', WARNING: 'चेतावनी' }[s]
        : { OK: 'Normal', WATCH: 'Watch', WARNING: 'Warning' }[s],
    [language]
  );
  return { L, date, statusWord };
}

export const flow = (n: number) => Math.round(n).toLocaleString('en-IN');

interface Network { gauges: GaugeItem[]; edges: EdgeItem[]; min: string; max: string; }
let networkCache: Promise<Network> | null = null;

export function useNetwork() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    if (!networkCache) {
      networkCache = Promise.all([fetchGauges(), fetchEdges(), fetchDates()]).then(([g, e, d]) => ({
        gauges: g.gauges,
        edges: e.edges,
        min: addDays(d.min_date, -1),
        max: addDays(d.max_date, -LAST_DAY),
      }));
      networkCache.catch(() => { networkCache = null; });
    }
    networkCache.then((n) => live && setNetwork(n)).catch(() => live && setError(SERVICE_DOWN));
    return () => { live = false; };
  }, [attempt]);
  return { network, error, retry: () => setAttempt((a) => a + 1) };
}

export type DayRows = Record<number, Map<string, GaugeForecastRow>>;

/* In the API, `date` is the day being forecast, so day k from a start date is (start + k) at lead k. */
export function useFourDays(start: string) {
  const [rows, setRows] = useState<DayRows | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ready = useForecastStore((state) => state.ready);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setRows(null);
    setError(null);
    Promise.all(DAYS.map((k) => fetchForecast(addDays(start, k), k)))
      .then((res) => {
        if (!live) return;
        const next: DayRows = {};
        res.forEach((r, i) => { next[DAYS[i]] = new Map(r.gauges.map((row) => [row.gauge_id, row])); });
        setRows(next);
      })
      .catch((err: Error) => live && setError(forecastError(err)));
    return () => { live = false; };
  }, [start, attempt, ready]);
  return { rows, error, retry: () => setAttempt((a) => a + 1) };
}

export const countStatus = (rows: DayRows | null, day: number, status: AlertStatus) =>
  rows ? [...rows[day].values()].filter((r) => r.status === status).length : 0;

/* What the numbers on screen are, in the current mode. */
export function useSourceNote() {
  const { L } = useText();
  const mode = useForecastStore((state) => state.mode);
  return mode === 'live'
    ? L('Live STG-Mamba forecast on Open-Meteo weather, less accurate than the published scores. Research prototype, not an official flood warning. Weather data by Open-Meteo.com.', 'Open-Meteo मौसम पर लाइव STG-Mamba पूर्वानुमान, प्रकाशित स्कोर से कम सटीक। शोध प्रोटोटाइप, आधिकारिक बाढ़ चेतावनी नहीं। मौसम डेटा Open-Meteo.com से।')
    : L('Saved STG-Mamba replay from past years, using recorded rain. Research prototype, not an official flood warning.', 'पिछले वर्षों का सहेजा गया STG-Mamba रीप्ले, दर्ज बारिश के साथ। शोध प्रोटोटाइप, आधिकारिक बाढ़ चेतावनी नहीं।');
}

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/* Live-mode Day 1 is tomorrow, so a short date beside each day makes them easy to read. */
export function useShortDate() {
  const { date } = useText();
  return (iso: string) => date(iso).split(' ').slice(0, 2).join(' ');
}
