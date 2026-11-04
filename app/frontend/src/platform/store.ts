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

/* The forecast being looked at follows you from page to page. */
interface ForecastState {
  start: string;
  day: number;
  setStart: (start: string) => void;
  setDay: (day: number) => void;
}
export const useForecastStore = create<ForecastState>((set) => ({
  start: DEFAULT_START,
  day: 4,
  setStart: (start) => set({ start }),
  setDay: (day) => set({ day }),
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
  useEffect(() => {
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
  }, [start, attempt]);
  return { rows, error, retry: () => setAttempt((a) => a + 1) };
}

export const countStatus = (rows: DayRows | null, day: number, status: AlertStatus) =>
  rows ? [...rows[day].values()].filter((r) => r.status === status).length : 0;
