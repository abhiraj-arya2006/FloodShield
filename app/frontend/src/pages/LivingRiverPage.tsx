import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDates, fetchEdges, fetchForecast, fetchGauges } from '../services/api';
import { AlertStatus, EdgeItem, GaugeForecastRow, GaugeItem } from '../types';
import { PlatformNav } from '../platform/PlatformNav';
import { clockTime, forecastError, useForecastStore, useSourceNote, useText } from '../platform/store';
import './livingRiver.css';

/* Both rivers are drawn to one scale: x is real river distance to the sea. */
export const VIEW_W = 1400;
export const VIEW_H = 640;
const SEA_X = 1330;
/* Each basin keeps its own band of the diagram, so tributaries can't collide across rivers. */
const BANDS: Record<string, [number, number]> = { Mahanadi: [34, 276], Godavari: [322, 604] };
const MAX_LANE_H = 58;

const COLORS: Record<AlertStatus, string> = { OK: '#B08A4E', WATCH: '#E8A917', WARNING: '#EF3A6E' };
const DAYS = [1, 2, 3, 4];
const LAST_DAY = 4;
const SWEEP_MS = 6000;

type DayRows = Record<number, Map<string, GaugeForecastRow>>;
export interface RiverPoint { gauge: GaugeItem; x: number; y: number; km: number; lane: number; }

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/*
  Lays out any river tree. x is real river distance to the lowest gauge. The longest path
  becomes the straight main stem, and each side branch takes the nearest free lane above or
  below it, so branches of the same stretch of river never sit on top of each other.
*/
export function buildLayout(gauges: GaugeItem[], edges: EdgeItem[]): Map<string, RiverPoint> {
  const down = new Map(edges.map((e) => [e.from_gauge_id, e]));
  const ups = new Map<string, string[]>();
  edges.forEach((e) => ups.set(e.to_gauge_id, [...(ups.get(e.to_gauge_id) ?? []), e.from_gauge_id]));

  const kmOf = (id: string): number => {
    const e = down.get(id);
    return e ? e.river_distance_km + kmOf(e.to_gauge_id) : 0;
  };
  const km = new Map(gauges.map((g) => [g.gauge_id, kmOf(g.gauge_id)]));
  const tipKm = (id: string): number => Math.max(km.get(id) ?? 0, ...(ups.get(id) ?? []).map(tipKm));
  const maxKm = Math.max(1, ...km.values());
  const pxPerKm = (SEA_X - 60) / maxKm;

  /* Follow the farthest-reaching upstream link from a gauge, up to its source. */
  const stemFrom = (id: string): string[] => {
    const next = [...(ups.get(id) ?? [])].sort((a, b) => tipKm(b) - tipKm(a))[0];
    return next ? [id, ...stemFrom(next)] : [id];
  };

  const points = new Map<string, RiverPoint>();
  for (const [basin, [top, bottom]] of Object.entries(BANDS)) {
    const inBasin = gauges.filter((g) => g.basin === basin);
    const outlet = inBasin.find((g) => !down.has(g.gauge_id));
    if (!outlet) continue;
    const lanes = new Map<string, number>();
    const taken = new Map<number, [number, number][]>();
    const queue: { from: string; junction: string; parentLane: number }[] = [];
    const addStem = (stem: string[], lane: number) => {
      stem.forEach((id) => lanes.set(id, lane));
      stem.forEach((id) => {
        (ups.get(id) ?? []).filter((u) => !stem.includes(u)).forEach((u) => queue.push({ from: u, junction: id, parentLane: lane }));
      });
    };
    addStem(stemFrom(outlet.gauge_id), 0);
    let nextSide = -1;
    while (queue.length) {
      queue.sort((a, b) => tipKm(b.from) - tipKm(a.from));
      const { from, junction, parentLane } = queue.shift()!;
      const stem = stemFrom(from);
      const low = km.get(junction)! - 10;
      const high = tipKm(from) + 26;
      const side = parentLane ? Math.sign(parentLane) : nextSide;
      if (!parentLane) nextSide = -nextSide;
      const free = (lane: number) => !(taken.get(lane) ?? []).some(([a, b]) => low < b && high > a);
      let lane = 0;
      for (let step = Math.abs(parentLane) + 1; !lane; step++) {
        if (free(side * step)) lane = side * step;
        else if (!parentLane && free(-side * step)) lane = -side * step;
      }
      taken.set(lane, [...(taken.get(lane) ?? []), [low, high]]);
      addStem(stem, lane);
    }
    const above = -Math.min(0, ...lanes.values());
    const below = Math.max(0, ...lanes.values());
    const laneH = Math.min(MAX_LANE_H, (bottom - top) / Math.max(1, above + below));
    const trunkY = (top + bottom) / 2 + ((above - below) * laneH) / 2;
    inBasin.forEach((gauge) => {
      const id = gauge.gauge_id;
      const lane = lanes.get(id) ?? 0;
      points.set(id, { gauge, km: km.get(id)!, lane, x: SEA_X - km.get(id)! * pxPerKm, y: trunkY + lane * laneH });
    });
  }
  return points;
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
  flow == null || flow < g.watch_m3s ? 'OK' : flow < g.warning_m3s ? 'WATCH' : 'WARNING';

/* Larger rivers are wider; a river swells against its own high-flow level. */
function halfWidth(flow: number | null, g: GaugeItem): number {
  const ratio = Math.min(1.5, (flow ?? 0) / g.q95_m3s);
  return ((2 + Math.sqrt(g.q95_m3s) / 9) * (0.3 + ratio)) / 2;
}

function ribbon(x1: number, y1: number, h1: number, x2: number, y2: number, h2: number): string {
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1 - h1}C${mx} ${y1 - h1} ${mx} ${y2 - h2} ${x2} ${y2 - h2}L${x2} ${y2 + h2}C${mx} ${y2 + h2} ${mx} ${y1 + h1} ${x1} ${y1 + h1}Z`;
}

export const LivingRiverPage: React.FC<{ hold?: boolean; embedded?: boolean }> = ({ hold = false, embedded = false }) => {
  const { L, date, statusWord } = useText();
  const [gauges, setGauges] = useState<GaugeItem[]>([]);
  const [edges, setEdges] = useState<EdgeItem[]>([]);
  const [range, setRange] = useState<{ min: string; max: string } | null>(null);
  const { start, setStart, ready, mode, live: liveInfo } = useForecastStore();
  const note = useSourceNote();
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
      .catch(() => live && setError(L("The river network didn't load. Start the backend on port 8000, then try again.", 'नदी नेटवर्क लोड नहीं हुआ। पोर्ट 8000 पर बैकएंड चालू करें और फिर कोशिश करें।')));
    return () => { live = false; };
    // eslint-disable-next-line
  }, [attempt]);

  /* `date` in the API is the day being forecast, so day k from a start date is (start + k) at lead k. */
  useEffect(() => {
    if (!ready) return;
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
      })
      .catch((err: Error) => live && setError(forecastError(err)));
    return () => { live = false; };
  }, [start, attempt, playSweep, stopSweep, ready]);

  /* Play the four days once whenever a forecast is ready and on screen. */
  useEffect(() => {
    if (hold || !rows) return;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) playSweep();
  }, [hold, rows, playSweep]);

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

  /* Keep the Ask panel on the same forecast as this diagram. */
  useEffect(() => {
    useForecastStore.setState({ day: wholeDay });
  }, [wholeDay]);
  const shownDate = addDays(start, wholeDay);

  const selected = selectedId ? layout.get(selectedId) : null;
  const selectedLive = selectedId ? live.get(selectedId) : null;

  const headline = warnings === 0
    ? L('No flood warnings', 'कोई बाढ़ चेतावनी नहीं')
    : L(`${warnings} ${warnings === 1 ? 'gauge' : 'gauges'} on flood warning`, `${warnings} गेज पर बाढ़ चेतावनी`);

  return (
    <div className="lr">
      <PlatformNav embedded={embedded} />

      <main className="lr-stage">
        <div className="lr-intro">
          <h1 aria-live="polite">{headline}</h1>
          <p>
            {L(`Day ${wholeDay} of 4, ${date(shownDate)}. The Godavari and Mahanadi, drawn to scale by river distance. A river swells as its forecast flow nears that gauge's own high-flow level.`, `दिन ${wholeDay}/4, ${date(shownDate)}। गोदावरी और महानदी, नदी की दूरी के पैमाने पर। जब पूर्वानुमानित प्रवाह गेज के उच्च प्रवाह स्तर के करीब आता है तो नदी फूलती है।`)}
          </p>
        </div>

        {error && (
          <div className="lr-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setAttempt((a) => a + 1)}>{L('Try again', 'फिर से कोशिश करें')}</button>
          </div>
        )}

        <div className="lr-scroll">
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="group" aria-label={L('River diagram of 46 gauges flowing toward the Bay of Bengal', 'बंगाल की खाड़ी की ओर बहती नदियों के 46 गेज का आरेख')}>
            <defs>
              <linearGradient id="lr-sea" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#1f6a8c" stopOpacity="0" />
                <stop offset="1" stopColor="#1f6a8c" />
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
            <text className="lr-sea-name" transform={`translate(${VIEW_W - 24} ${VIEW_H / 2}) rotate(90)`} textAnchor="middle">{L('Bay of Bengal', 'बंगाल की खाड़ी')}</text>

            <text className="lr-script" x={SEA_X - 20} y="268" textAnchor="end" lang="or">ମହାନଦୀ</text>
            <text className="lr-script" x="52" y="626" lang="te">గోదావరి</text>
            <text className="lr-river-name" x={SEA_X - 22} y="208" textAnchor="end">{L('Mahanadi', 'महानदी')}</text>
            <text className="lr-river-name" x="56" y="556">{L('Godavari', 'गोदावरी')}</text>

            {edges.map((e) => {
              const a = layout.get(e.from_gauge_id);
              const b = layout.get(e.to_gauge_id);
              if (!a || !b) return null;
              const h1 = live.get(e.from_gauge_id)?.h ?? 1;
              const h2 = live.get(e.to_gauge_id)?.h ?? 1;
              const mx = (a.x + b.x) / 2;
              return (
                <g key={e.from_gauge_id}>
                  <path d={ribbon(a.x, a.y, h1, b.x, b.y, h2)} fill={`url(#lr-e${e.from_gauge_id})`} />
                  <path className="lr-flow" d={`M${a.x} ${a.y}C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`} />
                </g>
              );
            })}

            {points.map(({ gauge, x, y, lane }) => {
              const id = gauge.gauge_id;
              const state = live.get(id);
              const status = state?.status ?? 'OK';
              const isSelected = id === selectedId;
              const showName = status !== 'OK' || isSelected;
              const ratio = state?.flow != null ? state.flow / gauge.q95_m3s : 0;
              const above = lane <= 0;
              const lift = (labelRow.get(id) ?? 0) * 18;
              const labelY = above ? y - (state?.h ?? 0) - 9 - lift : y + (state?.h ?? 0) + 19 + lift;
              return (
                <g
                  key={id}
                  className="lr-gauge"
                  role="button"
                  tabIndex={0}
                  aria-label={`${gauge.name}, ${gauge.river}: ${statusWord(status)}`}
                  aria-pressed={isSelected}
                  onMouseEnter={() => setSelectedId(id)}
                  onFocus={() => setSelectedId(id)}
                  onClick={() => setSelectedId(id)}
                >
                  <circle cx={x} cy={y} r="15" fill="transparent" />
                  {status === 'WARNING' && <circle className="lr-pulse" cx={x} cy={y} r={Math.max(3.5, (state?.h ?? 0) + 1.5)} />}
                  <circle
                    className="lr-ring"
                    cx={x}
                    cy={y}
                    r={Math.max(3.5, (state?.h ?? 0) + 1.5)}
                    fill={status === 'WARNING' ? COLORS.WARNING : '#0F2A3A'}
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
            <label htmlFor="lr-day">{L('Forecast day', 'पूर्वानुमान का दिन')}</label>
            <input
              id="lr-day"
              type="range"
              min={1}
              max={LAST_DAY}
              step={0.01}
              value={day}
              disabled={!rows}
              aria-valuetext={`${wholeDay}, ${date(shownDate)}, ${headline}`}
              onPointerDown={stopSweep}
              onKeyDown={stopSweep}
              onChange={(e) => setDay(Number(e.target.value))}
              onBlur={() => setDay((d) => Math.round(d))}
              onPointerUp={() => setDay((d) => Math.round(d))}
            />
            <div className="lr-ticks" aria-hidden="true">
              {DAYS.map((k) => (
                <button key={k} type="button" tabIndex={-1} className={k === wholeDay ? 'is-on' : ''} onClick={() => { stopSweep(); setDay(k); }}>
                  {L(`Day ${k}`, `दिन ${k}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="lr-actions">
            <button type="button" onClick={() => { setDay(1); playSweep(); }} disabled={!rows}>{L('Play four days', 'चार दिन चलाएँ')}</button>
            {mode === 'past' ? (
            <label>
              {L('Forecast made on', 'पूर्वानुमान की तारीख')}
              <input
                type="date"
                value={start}
                min={range?.min}
                max={range?.max}
                onChange={(e) => e.target.value && setStart(e.target.value)}
              />
            </label>
            ) : liveInfo && (
              <p className="lr-updated">{L(`Forecast made ${date(liveInfo.made_on)}, updated ${clockTime(liveInfo.generated_at)} IST`, `${date(liveInfo.made_on)} को बना, ${clockTime(liveInfo.generated_at)} IST पर अपडेट`)}</p>
            )}
          </div>
        </div>

        <div className="lr-lower">
          <section className="lr-readout" aria-live="polite">
            {selected && selectedLive ? (
              <>
                <h2>{selected.gauge.name}</h2>
                <p>
                  {L(`${selected.gauge.river} river. ${selected.km ? `${Math.round(selected.km)} km above the last gauge.` : 'The last gauge on this river.'} ${statusWord(selectedLive.status)} on day ${wholeDay}.`, `${selected.gauge.river} नदी। ${selected.km ? `आखिरी गेज से ${Math.round(selected.km)} किमी ऊपर।` : 'इस नदी का आखिरी गेज।'} दिन ${wholeDay}: ${statusWord(selectedLive.status)}।`)}
                </p>
                <p className="lr-figure">
                  {selectedLive.flow != null
                    ? L(`${Math.round(selectedLive.flow).toLocaleString('en-IN')} m³/s forecast, ${Math.round((selectedLive.flow / selected.gauge.q95_m3s) * 100)}% of its high-flow level`, `${Math.round(selectedLive.flow).toLocaleString('en-IN')} m³/s पूर्वानुमान, उच्च प्रवाह स्तर का ${Math.round((selectedLive.flow / selected.gauge.q95_m3s) * 100)}%`)
                    : L('No forecast for this gauge on this day', 'इस दिन इस गेज का पूर्वानुमान नहीं है')}
                </p>
                <Link viewTransition to={`/gauge/${selected.gauge.gauge_id}`}>{L('Open four-day forecast', 'चार दिन का पूर्वानुमान खोलें')}</Link>
              </>
            ) : (
              <p>{L('Point at a gauge on the river to read its forecast.', 'पूर्वानुमान पढ़ने के लिए नदी पर किसी गेज पर जाएँ।')}</p>
            )}
          </section>
          <section className="lr-flagged">
            <h2>{flagged.length ? L(`Flagged on day ${wholeDay}`, `दिन ${wholeDay} पर चिह्नित`) : L(`Nothing flagged on day ${wholeDay}`, `दिन ${wholeDay} पर कुछ चिह्नित नहीं`)}</h2>
            <ul>
              {flagged.map(({ gauge }) => (
                <li key={gauge.gauge_id}>
                  <button type="button" data-status={live.get(gauge.gauge_id)!.status} onClick={() => setSelectedId(gauge.gauge_id)}>
                    {gauge.name} <span>{statusWord(live.get(gauge.gauge_id)!.status)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <footer className="lr-note">
        {note}
      </footer>
    </div>
  );
};

export default LivingRiverPage;
