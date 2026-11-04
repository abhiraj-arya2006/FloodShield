import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDates, fetchEdges, fetchForecast, fetchGauges } from '../services/api';
import { AlertStatus, EdgeItem, GaugeForecastRow, GaugeItem } from '../types';
import './livingRiver.css';

/* Both rivers are drawn to one scale: x is real river distance to the sea. */
const VIEW_W = 1400;
const VIEW_H = 580;
const SEA_X = 1330;
const PX_PER_KM = 1.2;
const LANE_H = 64;
const TRUNK_Y: Record<string, number> = { Mahanadi: 185, Godavari: 450 };

/* Tributary lanes relative to the main stem. Negative is above it. */
const LANES: Record<string, number> = {
  Godavari: 0, Mahanadi: 0,
  Pravara: -1, Dudhna: -1, Wardha: -1, Pranhita: -1, Kanhan: -2, Wainganga: -2,
  Manjira: 1, Indravati: 1, Sabari: 1,
  Hasdeo: -1, Ib: -1, Mand: -2, Seonath: 1, Tel: 1,
};

const COLORS: Record<AlertStatus, string> = { OK: '#B08A4E', WATCH: '#E8A917', WARNING: '#EF3A6E' };
const STATUS_WORD: Record<AlertStatus, string> = { OK: 'Normal', WATCH: 'Watch', WARNING: 'Warning' };
const DAYS = [1, 2, 3, 4];
const LAST_DAY = 4;
const DEFAULT_START = '2010-06-18'; // Rises gradually over the four days in the replay data.
const SWEEP_MS = 6000;

type DayRows = Record<number, Map<string, GaugeForecastRow>>;
interface Point { gauge: GaugeItem; x: number; y: number; km: number; }

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const prettyDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function buildLayout(gauges: GaugeItem[], edges: EdgeItem[]): Map<string, Point> {
  const next = new Map(edges.map((e) => [e.from_gauge_id, e]));
  const kmToSea = (id: string): number => {
    let km = 0;
    let edge = next.get(id);
    while (edge) {
      km += edge.river_distance_km;
      edge = next.get(edge.to_gauge_id);
    }
    return km;
  };
  return new Map(
    gauges.map((gauge) => {
      const km = kmToSea(gauge.gauge_id);
      const lane = LANES[gauge.river] ?? 1;
      return [gauge.gauge_id, { gauge, km, x: SEA_X - km * PX_PER_KM, y: TRUNK_Y[gauge.basin] + lane * LANE_H }];
    })
  );
}

/* Forecast flow between two whole days, used only to animate the drag. */
function flowAt(rows: DayRows, id: string, day: number): number | null {
  const low = Math.floor(day);
  const high = Math.min(LAST_DAY, low + 1);
  const a = rows[low]?.get(id)?.predicted_m3s;
  const b = rows[high]?.get(id)?.predicted_m3s;
  if (a == null || b == null) return a ?? b ?? null;
  return a + (b - a) * (day - low);
}

const statusOf = (flow: number | null, g: GaugeItem): AlertStatus =>
  flow == null || flow < g.q90_m3s ? 'OK' : flow < g.q95_m3s ? 'WATCH' : 'WARNING';

/* Larger rivers are wider; a river swells against its own high-flow level. */
function halfWidth(flow: number | null, g: GaugeItem): number {
  const ratio = Math.min(2.5, (flow ?? 0) / g.q95_m3s);
  return ((2.5 + Math.sqrt(g.q95_m3s) / 7) * (0.3 + ratio)) / 2;
}

function ribbon(x1: number, y1: number, h1: number, x2: number, y2: number, h2: number): string {
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1 - h1}C${mx} ${y1 - h1} ${mx} ${y2 - h2} ${x2} ${y2 - h2}L${x2} ${y2 + h2}C${mx} ${y2 + h2} ${mx} ${y1 + h1} ${x1} ${y1 + h1}Z`;
}

export const LivingRiverPage: React.FC = () => {
  const [gauges, setGauges] = useState<GaugeItem[]>([]);
  const [edges, setEdges] = useState<EdgeItem[]>([]);
  const [range, setRange] = useState<{ min: string; max: string } | null>(null);
  const [start, setStart] = useState(DEFAULT_START);
  const [rows, setRows] = useState<DayRows | null>(null);
  const [day, setDay] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sweep = useRef<number | null>(null);

  const stopSweep = useCallback(() => {
    if (sweep.current != null) cancelAnimationFrame(sweep.current);
    sweep.current = null;
  }, []);

  const playSweep = useCallback(() => {
    stopSweep();
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / SWEEP_MS);
      setDay(1 + t * (LAST_DAY - 1));
      sweep.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    sweep.current = requestAnimationFrame(tick);
  }, [stopSweep]);

  useEffect(() => stopSweep, [stopSweep]);

  useEffect(() => {
    let live = true;
    setError(null);
    Promise.all([fetchGauges(), fetchEdges(), fetchDates()])
      .then(([g, e, d]) => {
        if (!live) return;
        setGauges(g.gauges);
        setEdges(e.edges);
        setRange({ min: addDays(d.min_date, -1), max: addDays(d.max_date, -LAST_DAY) });
      })
      .catch(() => live && setError("The river network didn't load. Start the backend on port 8000, then try again."));
    return () => { live = false; };
  }, [attempt]);

  /* `date` in the API is the day being forecast, so day k from a start date is (start + k) at lead k. */
  useEffect(() => {
    let live = true;
    stopSweep();
    setRows(null);
    Promise.all(DAYS.map((k) => fetchForecast(addDays(start, k), k)))
      .then((res) => {
        if (!live) return;
        const next: DayRows = {};
        res.forEach((r, i) => { next[DAYS[i]] = new Map(r.gauges.map((row) => [row.gauge_id, row])); });
        setRows(next);
        setDay(1);
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) playSweep();
      })
      .catch((err: Error) => live && setError(err.message || "This forecast didn't load. Choose another date."));
    return () => { live = false; };
  }, [start, attempt, playSweep, stopSweep]);

  const layout = useMemo(() => buildLayout(gauges, edges), [gauges, edges]);
  const points = useMemo(() => [...layout.values()], [layout]);

  /* Close neighbours on a lane take turns on a second label row so names don't collide. */
  const labelRow = useMemo(() => {
    const rows = new Map<string, number>();
    const lastX = new Map<string, number>();
    for (const p of [...points].sort((a, b) => a.x - b.x)) {
      const key = `${p.gauge.basin}${p.y}`;
      const prev = lastX.get(key);
      const prevId = `${key}-row`;
      const row = prev != null && p.x - prev < 95 ? 1 - (rows.get(prevId) ?? 0) : 0;
      rows.set(prevId, row);
      rows.set(p.gauge.gauge_id, row);
      lastX.set(key, p.x);
    }
    return rows;
  }, [points]);

  const live = useMemo(() => {
    const map = new Map<string, { flow: number | null; status: AlertStatus; h: number }>();
    if (!rows) return map;
    for (const { gauge } of points) {
      const flow = flowAt(rows, gauge.gauge_id, day);
      map.set(gauge.gauge_id, { flow, status: statusOf(flow, gauge), h: halfWidth(flow, gauge) });
    }
    return map;
  }, [rows, points, day]);

  const flagged = useMemo(
    () => points
      .filter((p) => live.get(p.gauge.gauge_id)?.status !== 'OK' && live.has(p.gauge.gauge_id))
      .sort((a, b) => (live.get(b.gauge.gauge_id)!.status === 'WARNING' ? 1 : 0) - (live.get(a.gauge.gauge_id)!.status === 'WARNING' ? 1 : 0) || a.km - b.km),
    [points, live]
  );
  const warnings = flagged.filter((p) => live.get(p.gauge.gauge_id)!.status === 'WARNING').length;
  const wholeDay = Math.round(day);
  const shownDate = addDays(start, wholeDay);

  const selected = selectedId ? layout.get(selectedId) : null;
  const selectedLive = selectedId ? live.get(selectedId) : null;

  const headline = warnings === 0
    ? 'No gauges above high flow'
    : `${warnings} ${warnings === 1 ? 'gauge' : 'gauges'} above high flow`;

  return (
    <div className="lr">
      <header className="lr-top">
        <Link to="/" className="lr-brand">FloodShield</Link>
        <nav aria-label="Main">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/alerts">Alerts</Link>
          <Link to="/model-info">Model</Link>
        </nav>
      </header>

      <main className="lr-stage">
        <div className="lr-intro">
          {/* The headline itself widens as more gauges cross their high-flow level. */}
          <h1 style={{ fontVariationSettings: `'wdth' ${Math.min(125, 78 + warnings * 4)}` }} aria-live="polite">{headline}</h1>
          <p>
            Day {wholeDay} of 4, {prettyDate(shownDate)}. Godavari and Mahanadi, drawn to scale by distance to the sea.
            A river swells as its forecast flow nears that gauge's own high-flow level.
          </p>
        </div>

        {error && (
          <div className="lr-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
          </div>
        )}

        <div className="lr-scroll">
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="group" aria-label="River diagram of 46 gauges flowing toward the Bay of Bengal">
            <defs>
              <linearGradient id="lr-sea" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#3D5A5E" stopOpacity="0" />
                <stop offset="1" stopColor="#3D5A5E" />
              </linearGradient>
              {edges.map((e) => {
                const a = layout.get(e.from_gauge_id);
                const b = layout.get(e.to_gauge_id);
                if (!a || !b) return null;
                return (
                  <linearGradient key={e.from_gauge_id} id={`lr-e${e.from_gauge_id}`} gradientUnits="userSpaceOnUse" x1={a.x} x2={b.x} y1="0" y2="0">
                    <stop offset="0" className="lr-stop" style={{ stopColor: COLORS[live.get(e.from_gauge_id)?.status ?? 'OK'] }} />
                    <stop offset="1" className="lr-stop" style={{ stopColor: COLORS[live.get(e.to_gauge_id)?.status ?? 'OK'] }} />
                  </linearGradient>
                );
              })}
            </defs>

            <rect x={SEA_X - 24} y="0" width={VIEW_W - SEA_X + 24} height={VIEW_H} fill="url(#lr-sea)" />
            <text className="lr-sea-name" transform={`translate(${VIEW_W - 24} ${VIEW_H / 2}) rotate(90)`} textAnchor="middle">Bay of Bengal</text>

            <text className="lr-script" x={SEA_X - 20} y="82" textAnchor="end" lang="or">ମହାନଦୀ</text>
            <text className="lr-script" x="52" y="566" lang="te">గోదావరి</text>
            <text className="lr-river-name" x={SEA_X - 22} y="108" textAnchor="end">Mahanadi</text>
            <text className="lr-river-name" x="56" y="500">Godavari</text>

            {edges.map((e) => {
              const a = layout.get(e.from_gauge_id);
              const b = layout.get(e.to_gauge_id);
              if (!a || !b) return null;
              const h1 = live.get(e.from_gauge_id)?.h ?? 1;
              const h2 = live.get(e.to_gauge_id)?.h ?? 1;
              return <path key={e.from_gauge_id} d={ribbon(a.x, a.y, h1, b.x, b.y, h2)} fill={`url(#lr-e${e.from_gauge_id})`} />;
            })}

            {points.map(({ gauge, x, y }) => {
              const id = gauge.gauge_id;
              const state = live.get(id);
              const status = state?.status ?? 'OK';
              const isSelected = id === selectedId;
              const showName = status !== 'OK' || isSelected;
              const ratio = state?.flow != null ? state.flow / gauge.q95_m3s : 0;
              const above = (LANES[gauge.river] ?? 1) <= 0;
              const lift = (labelRow.get(id) ?? 0) * 18;
              const labelY = above ? y - (state?.h ?? 0) - 9 - lift : y + (state?.h ?? 0) + 19 + lift;
              return (
                <g
                  key={id}
                  className="lr-gauge"
                  role="button"
                  tabIndex={0}
                  aria-label={`${gauge.name}, ${gauge.river}: ${STATUS_WORD[status]}`}
                  aria-pressed={isSelected}
                  onMouseEnter={() => setSelectedId(id)}
                  onFocus={() => setSelectedId(id)}
                  onClick={() => setSelectedId(id)}
                >
                  <circle cx={x} cy={y} r="15" fill="transparent" />
                  <circle
                    className="lr-ring"
                    cx={x}
                    cy={y}
                    r={Math.max(3.5, (state?.h ?? 0) + 1.5)}
                    fill={status === 'WARNING' ? COLORS.WARNING : '#26373D'}
                    stroke={isSelected ? '#E6ECE6' : status === 'WARNING' ? '#E6ECE6' : COLORS[status]}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  {showName && (
                    <text
                      className="lr-name"
                      x={x}
                      y={labelY}
                      textAnchor="middle"
                      /* Names physically widen with flow relative to high-flow level. */
                      style={{ fontVariationSettings: `'wdth' ${Math.round(75 + Math.min(1, Math.max(0, ratio - 0.6)) * 50)}` }}
                    >
                      {gauge.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="lr-controls">
          <div className="lr-scrub">
            <label htmlFor="lr-day">Forecast day</label>
            <input
              id="lr-day"
              type="range"
              min={1}
              max={LAST_DAY}
              step={0.01}
              value={day}
              disabled={!rows}
              aria-valuetext={`Day ${wholeDay}, ${prettyDate(shownDate)}, ${warnings} gauges above high flow`}
              onPointerDown={stopSweep}
              onKeyDown={stopSweep}
              onChange={(e) => setDay(Number(e.target.value))}
              onBlur={() => setDay((d) => Math.round(d))}
              onPointerUp={() => setDay((d) => Math.round(d))}
            />
            <div className="lr-ticks" aria-hidden="true">
              {DAYS.map((k) => (
                <button key={k} type="button" tabIndex={-1} className={k === wholeDay ? 'is-on' : ''} onClick={() => { stopSweep(); setDay(k); }}>
                  Day {k}
                </button>
              ))}
            </div>
          </div>
          <div className="lr-actions">
            <button type="button" onClick={() => { setDay(1); playSweep(); }} disabled={!rows}>Play four days</button>
            <label>
              Forecast made on
              <input
                type="date"
                value={start}
                min={range?.min}
                max={range?.max}
                onChange={(e) => e.target.value && setStart(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="lr-lower">
          <section className="lr-readout" aria-live="polite">
            {selected && selectedLive ? (
              <>
                <h2>{selected.gauge.name}</h2>
                <p>
                  {selected.gauge.river} river, {Math.round(selected.km)} km to the sea. {STATUS_WORD[selectedLive.status]} on day {wholeDay}.
                </p>
                <p className="lr-figure">
                  {selectedLive.flow != null
                    ? `${Math.round(selectedLive.flow).toLocaleString('en-IN')} m³/s forecast, ${Math.round((selectedLive.flow / selected.gauge.q95_m3s) * 100)}% of its high-flow level`
                    : 'No forecast for this gauge on this day'}
                </p>
                <Link to={`/gauge/${selected.gauge.gauge_id}`}>Open gauge forecast</Link>
              </>
            ) : (
              <p>Point at a gauge on the river to read its forecast.</p>
            )}
          </section>
          <section className="lr-flagged">
            <h2>{flagged.length ? `Flagged on day ${wholeDay}` : `Nothing flagged on day ${wholeDay}`}</h2>
            <ul>
              {flagged.map(({ gauge }) => (
                <li key={gauge.gauge_id}>
                  <button type="button" data-status={live.get(gauge.gauge_id)!.status} onClick={() => setSelectedId(gauge.gauge_id)}>
                    {gauge.name} <span>{STATUS_WORD[live.get(gauge.gauge_id)!.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <footer className="lr-note">
        Simulated demo data, not STG-Mamba output. FloodShield is a research prototype, not an official flood warning.
        High flow means above a gauge's own 95th-percentile flow, not a danger level.
      </footer>
    </div>
  );
};

export default LivingRiverPage;
