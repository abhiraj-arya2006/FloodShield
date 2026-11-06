import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { Maximize2, Minus, Pause, Play, Plus, Search, X } from 'lucide-react';
import { AlertStatus, GaugeForecastRow } from '../types';
import { DAYS, LAST_DAY, REAL_FLOODS, addDays, clockTime, countStatus, flow, useForecastStore, useFourDays, useNetwork, useShortDate, useSourceNote, useText } from '../platform/store';
import { LoadError } from '../platform/PlatformNav';

const COLORS: Record<AlertStatus, string> = { OK: '#D9A95C', WATCH: '#F5B921', WARNING: '#FF4D7D' };

/* Map views, in degrees of longitude and latitude. All share one shape, so the zoom never distorts. */
/* Scored the same way as the published results: a flood day is recorded flow above the gauge's q95. */
type Outcome = 'hit' | 'false' | 'missed' | 'quiet' | 'unknown';
const outcomeOf = (r: GaugeForecastRow): Outcome => {
  const warned = r.status === 'WARNING';
  if (!r.mask || r.observed_m3s == null) return 'unknown';
  const flood = r.observed_m3s > r.q95_m3s;
  if (warned) return flood ? 'hit' : 'false';
  return flood ? 'missed' : 'quiet';
};

const VIEW_RATIO = 1.895;
const VIEWS: Record<string, { lon: number; lat: number; width: number }> = {
  ALL: { lon: 80.7, lat: 20.2, width: 22 },
  Godavari: { lon: 79.8, lat: 19.8, width: 15 },
  Mahanadi: { lon: 83, lat: 21.6, width: 10.5 },
};

export const DashboardPage: React.FC = () => {
  const { L, date, statusWord } = useText();
  const { start, day, setDay, mode, live, ready, liveFailed, openFlood } = useForecastStore();
  const note = useSourceNote();
  const shortDate = useShortDate();
  const { network, error: netError, retry: retryNet } = useNetwork();
  const { rows, error, retry } = useFourDays(start);
  const [basin, setBasin] = useState('ALL');
  const [filter, setFilter] = useState<'ALL' | 'WARNING' | 'WATCH'>('ALL');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [unit, setUnit] = useState(0.02);
  const svgRef = useRef<SVGSVGElement>(null);
  /* The map opens from high above and falls to the rivers, echoing the film's descent. */
  const view = useRef({ lon: 80.7, lat: 20.2, width: 110 });
  const firstView = useRef(true);
  const [zoom, setZoom] = useState(1);
  const [shownWarnings, setShownWarnings] = useState(0);
  const loaded = Boolean(rows);

  /* Replays a real rise from its first day, so the warnings can be watched building. */
  const playFlood = (floodStart: string) => {
    setSelectedId(null);
    setFilter('ALL');
    setQuery('');
    openFlood(floodStart);
    setPlaying(true);
  };

  /* Keep marks the same size on screen at any zoom. */
  const applyView = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const { lon, lat, width } = view.current;
    const height = width / VIEW_RATIO;
    svg.setAttribute('viewBox', `${lon - width / 2} ${-lat - height / 2} ${width} ${height}`);
    const scale = Math.max(svg.clientWidth / width, svg.clientHeight / height);
    if (scale) setUnit(1 / scale);
  };

  useEffect(() => {
    applyView();
    window.addEventListener('resize', applyView);
    return () => window.removeEventListener('resize', applyView);
  }, []);

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = VIEWS[basin];
    const tween = gsap.to(view.current, {
      lon: target.lon,
      lat: target.lat,
      width: target.width / zoom,
      duration: still ? 0 : firstView.current ? 2.6 : 1.2,
      ease: firstView.current ? 'power4.out' : 'power3.inOut',
      onUpdate: applyView,
    });
    firstView.current = false;
    return () => { tween.kill(); };
  }, [basin, zoom]);

  /* Left and right arrow keys change the day, unless someone is typing. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const current = useForecastStore.getState().day;
      if (e.key === 'ArrowRight' && current < LAST_DAY) { setPlaying(false); setDay(current + 1); }
      if (e.key === 'ArrowLeft' && current > 1) { setPlaying(false); setDay(current - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setDay]);

  useEffect(() => {
    if (!playing || !loaded) return;
    const timer = window.setInterval(() => {
      const current = useForecastStore.getState().day;
      if (current >= LAST_DAY) setPlaying(false);
      else setDay(current + 1);
    }, 1300);
    return () => window.clearInterval(timer);
  }, [playing, loaded, setDay]);

  const shownDate = addDays(start, day);
  const today = rows?.[day];
  const warnings = countStatus(rows, day, 'WARNING');
  const watches = countStatus(rows, day, 'WATCH');
  /* The headline's number counts to its new value when the day changes. */
  useEffect(() => {
    const counter = { value: shownWarnings };
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tween = gsap.to(counter, { value: warnings, duration: still ? 0 : 0.6, ease: 'power2.out', onUpdate: () => setShownWarnings(Math.round(counter.value)) });
    /* The animation stalls when a browser is short of frames, and the headline must still end up right. */
    const settle = window.setTimeout(() => { tween.kill(); setShownWarnings(warnings); }, 700);
    return () => { tween.kill(); window.clearTimeout(settle); };
    // eslint-disable-next-line
  }, [warnings]);

  const inBasin = (r: { basin: string }) => basin === 'ALL' || r.basin === basin;

  const list = useMemo(() => {
    if (!today) return [];
    const q = query.trim().toLowerCase();
    return [...today.values()]
      .filter((r) => inBasin(r))
      .filter((r) => (q ? `${r.name} ${r.river}`.toLowerCase().includes(q) : r.status !== 'OK'))
      .filter((r) => filter === 'ALL' || r.status === filter)
      .sort((a, b) => b.predicted_m3s / b.q95_m3s - a.predicted_m3s / a.q95_m3s);
  }, [today, query, filter, basin]);

  /* When nothing is flagged, show the gauges nearest their warning level instead of an empty list. */
  const closest = useMemo(() => {
    if (!today || list.length || query.trim() || filter !== 'ALL') return [];
    return [...today.values()].filter((r) => inBasin(r)).sort((a, b) => b.predicted_m3s / b.warning_m3s - a.predicted_m3s / a.warning_m3s).slice(0, 8);
    // eslint-disable-next-line
  }, [today, list, query, filter, basin]);
  const shownList = list.length ? list : closest;

  /* With many warnings, only the most extreme are named, so the map stays readable. */
  const named = useMemo(() => {
    if (!today || window.innerWidth <= 760) return new Set<string>();
    return new Set([...today.values()]
      .filter((r) => r.status === 'WARNING')
      .sort((a, b) => b.predicted_m3s / b.q95_m3s - a.predicted_m3s / a.q95_m3s)
      .slice(0, 8)
      .map((r) => r.gauge_id));
  }, [today]);

  /* In past years the real river is known, so every warning on the shown day can be checked. */
  const check = useMemo(() => {
    if (mode !== 'past' || !today) return null;
    const shown = [...today.values()].filter((r) => inBasin(r));
    const count = (o: Outcome) => shown.filter((r) => outcomeOf(r) === o);
    return {
      hit: count('hit').length,
      false: count('false').length,
      missed: count('missed'),
      unread: shown.filter((r) => r.status === 'WARNING' && outcomeOf(r) === 'unknown').length,
    };
    // eslint-disable-next-line
  }, [mode, today, basin]);
  const quietWeek = mode === 'live' && rows && DAYS.every((k) => countStatus(rows, k, 'WARNING') === 0);

  const selected: GaugeForecastRow | undefined = selectedId ? today?.get(selectedId) : undefined;
  const px = (n: number) => n * unit;

  const loadError = netError || error;

  return (
    <main className="pf-map-page">
      <div className="pf-map">
        <svg ref={svgRef} preserveAspectRatio="xMidYMid slice" role="group" aria-label={L('Satellite map of the Godavari and Mahanadi with 46 gauges', 'गोदावरी और महानदी का उपग्रह नक्शा, 46 गेज के साथ')}>
          <image href="/textures/earth-day.jpg" x="-180" y="-90" width="360" height="180" preserveAspectRatio="none" className="pf-sat" />
          {network?.edges.map((e) => {
            const a = network.gauges.find((g) => g.gauge_id === e.from_gauge_id);
            const b = network.gauges.find((g) => g.gauge_id === e.to_gauge_id);
            if (!a || !b) return null;
            const row = today?.get(a.gauge_id);
            const ratio = row ? Math.min(2.2, row.predicted_m3s / row.q95_m3s) : 0.5;
            const base = 1.6 + Math.sqrt(a.q95_m3s) / 26;
            const d = `M${a.ghi_lon} ${-a.ghi_lat}L${b.ghi_lon} ${-b.ghi_lat}`;
            const dim = !inBasin(a);
            return (
              <g key={e.from_gauge_id} opacity={dim ? 0.25 : 1}>
                <path d={d} className="pf-river" style={{ stroke: COLORS[row?.status ?? 'OK'], strokeWidth: px(base * (0.55 + ratio * 1.5)) }} />
                <path d={d} className="pf-flowline" style={{ strokeWidth: px(1.6), strokeDasharray: `${px(1)} ${px(26)}`, ['--dash' as string]: px(27) }} />
              </g>
            );
          })}
          {network?.gauges.map((g) => {
            const row = today?.get(g.gauge_id);
            const status = row?.status ?? 'OK';
            const isSelected = g.gauge_id === selectedId;
            const r = status === 'WARNING' ? 7 : status === 'WATCH' ? 5 : 3.5;
            return (
              <g
                key={g.gauge_id}
                className="pf-pin"
                opacity={inBasin(g) ? 1 : 0.25}
                role="button"
                tabIndex={0}
                aria-label={`${g.name}, ${statusWord(status)}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(g.gauge_id)}
                onFocus={() => setSelectedId(g.gauge_id)}
                onMouseEnter={() => setSelectedId(g.gauge_id)}
              >
                <circle cx={g.ghi_lon} cy={-g.ghi_lat} r={px(16)} fill="transparent" />
                {status === 'WARNING' && <circle className="pf-ping" cx={g.ghi_lon} cy={-g.ghi_lat} r={px(r)} style={{ strokeWidth: px(2) }} />}
                <circle
                  cx={g.ghi_lon}
                  cy={-g.ghi_lat}
                  r={px(isSelected ? r + 2 : r)}
                  fill={status === 'OK' ? '#0a2233' : COLORS[status]}
                  stroke={isSelected ? '#ffffff' : status === 'OK' ? COLORS.OK : '#ffffff'}
                  strokeWidth={px(isSelected ? 2.5 : 1.5)}
                />
                {(isSelected || named.has(g.gauge_id)) && (
                  <text x={g.ghi_lon} y={-g.ghi_lat - px(r + 7)} textAnchor="middle" className="pf-pin-name" style={{ fontSize: px(14), strokeWidth: px(4) }}>
                    {g.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="pf-map-tools" role="group" aria-label={L('Map zoom', 'नक्शा ज़ूम')}>
        <button type="button" aria-label={L('Zoom in', 'ज़ूम इन')} disabled={zoom >= 4} onClick={() => setZoom((z) => z * 1.5)}><Plus size={18} /></button>
        <button type="button" aria-label={L('Zoom out', 'ज़ूम आउट')} disabled={zoom <= 0.5} onClick={() => setZoom((z) => z / 1.5)}><Minus size={18} /></button>
        <button type="button" aria-label={L('Reset map', 'नक्शा रीसेट करें')} onClick={() => { setZoom(1); setBasin('ALL'); }}><Maximize2 size={16} /></button>
      </div>
      <div className="pf-legend-map" aria-hidden="true">
        <span><i className="pf-dot is-OK" />{statusWord('OK')}</span>
        <span><i className="pf-dot is-WATCH" />{statusWord('WATCH')}</span>
        <span><i className="pf-dot is-WARNING" />{statusWord('WARNING')}</span>
        <span className="pf-legend-line"><i />{L('Thicker river, higher flow', 'मोटी नदी, अधिक प्रवाह')}</span>
      </div>

      <section className="pf-float pf-left">
        {!ready && <p className="pf-reading" role="status">{L("Running the model on today's weather", 'आज के मौसम पर मॉडल चलाया जा रहा है')}</p>}
        {liveFailed && <p className="pf-reading" role="status">{L("Today's forecast couldn't be made. Showing past years.", 'आज का पूर्वानुमान नहीं बन सका। पिछले वर्ष दिखाए जा रहे हैं।')}</p>}
        <h1>
          {rows
            ? warnings
              ? L(`${shownWarnings} ${warnings === 1 ? 'gauge' : 'gauges'} on flood warning`, `${shownWarnings} गेज पर बाढ़ चेतावनी`)
              : L('No flood warnings', 'कोई बाढ़ चेतावनी नहीं')
            : L('Reading the rivers', 'नदियों को पढ़ा जा रहा है')}
        </h1>
        <p className="pf-sub">
          {date(shownDate)}. {watches === 0 ? L('None on watch.', 'कोई निगरानी में नहीं।') : warnings === 0 ? L(`${watches} on watch.`, `${watches} निगरानी में।`) : L(`${watches} more on watch.`, `${watches} और निगरानी में।`)}
        </p>

        {loadError && <LoadError message={loadError} onRetry={() => { retry(); retryNet(); }} />}

        {quietWeek && (
          <button type="button" className="pf-flood-cta" onClick={() => playFlood(REAL_FLOODS[0].start)}>
            <Play size={15} aria-hidden="true" />
            {L('The rivers are quiet. Watch it warn in a real flood', 'नदियाँ शांत हैं। असली बाढ़ में चेतावनी देखें')}
          </button>
        )}
        {mode === 'past' && (
          <div className="pf-floods" role="group" aria-label={L('Real floods', 'असली बाढ़')}>
            <span>{L('Real floods', 'असली बाढ़')}</span>
            {REAL_FLOODS.map((f) => (
              <button key={f.start} type="button" className={start === f.start ? 'is-on' : ''} aria-pressed={start === f.start} onClick={() => playFlood(f.start)}>
                <Play size={12} aria-hidden="true" />{L(f.en, f.hi)}
              </button>
            ))}
          </div>
        )}

        <div className="pf-days" role="group" aria-label={L('Forecast day', 'पूर्वानुमान का दिन')}>
          {DAYS.map((k) => {
            const count = countStatus(rows, k, 'WARNING');
            return (
              <button key={k} type="button" className={k === day ? 'is-on' : ''} aria-pressed={k === day} aria-label={L(`Day ${k}, ${date(addDays(start, k))}, ${count} warnings`, `दिन ${k}, ${date(addDays(start, k))}, ${count} चेतावनी`)} onClick={() => { setPlaying(false); setDay(k); }}>
                <span className="pf-day-bar"><i style={{ height: `${Math.min(100, 8 + count * 7)}%` }} /></span>
                <b>{count}</b>
                <span>{shortDate(addDays(start, k))}</span>
              </button>
            );
          })}
        </div>

        <div className="pf-row">
          <button
            type="button"
            className="pf-btn"
            disabled={!rows}
            onClick={() => {
              if (playing) { setPlaying(false); return; }
              setDay(1);
              setPlaying(true);
            }}
          >
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {playing ? L('Pause', 'रोकें') : L('Play four days', 'चार दिन चलाएँ')}
          </button>
          {mode === 'live' && live && (
            <p className="pf-updated">
              <b>{L(`Forecast made ${date(live.made_on)}`, `${date(live.made_on)} को बना पूर्वानुमान`)}</b>
              {live.stale ? L(`Refresh failed. Last updated ${clockTime(live.generated_at)} IST`, `ताज़ा नहीं हो सका। पिछला अपडेट ${clockTime(live.generated_at)} IST`) : L(`Updated ${clockTime(live.generated_at)} IST`, `${clockTime(live.generated_at)} IST पर अपडेट`)}
            </p>
          )}
        </div>

        <div className="pf-chips" role="group" aria-label={L('River basin', 'नदी बेसिन')}>
          {[['ALL', L('Both rivers', 'दोनों नदियाँ')], ['Godavari', L('Godavari', 'गोदावरी')], ['Mahanadi', L('Mahanadi', 'महानदी')]].map(([key, label]) => (
            <button key={key} type="button" className={basin === key ? 'is-on' : ''} aria-pressed={basin === key} onClick={() => setBasin(key)}>{label}</button>
          ))}
        </div>
        <p className="pf-disclaim">{note}</p>
      </section>

      <aside className="pf-float pf-right">
        {selected ? (
          <div className="pf-detail">
            <div className="pf-detail-head">
              <h2>{selected.name}</h2>
              <span className={`pf-status is-${selected.status}`}>{statusWord(selected.status)}</span>
              <button type="button" className="pf-detail-close" aria-label={L('Clear selection', 'चयन हटाएँ')} onClick={() => setSelectedId(null)}><X size={16} /></button>
            </div>
            <p className="pf-sub">{selected.river === selected.basin ? selected.river : `${selected.river}, ${selected.basin}`}</p>
            <p className="pf-big">{flow(selected.predicted_m3s)} <small>m³/s</small></p>
            <div className="pf-meter" aria-hidden="true">
              <i className={`is-${selected.status}`} style={{ width: `${Math.min(100, (selected.predicted_m3s / selected.q95_m3s) * 62.5)}%` }} />
              <em />
            </div>
            <p className="pf-sub">
              {L(`${Math.round((selected.predicted_m3s / selected.q95_m3s) * 100)}% of this gauge's high-flow level`, `इस गेज के उच्च प्रवाह स्तर का ${Math.round((selected.predicted_m3s / selected.q95_m3s) * 100)}%`)}
            </p>
            <Link className="pf-link" viewTransition to={`/gauge/${selected.gauge_id}`}>{L('Open four-day forecast', 'चार दिन का पूर्वानुमान खोलें')}</Link>
          </div>
        ) : (
          <p className="pf-sub pf-hint">{L('Point at any gauge on the map to read its forecast.', 'पूर्वानुमान पढ़ने के लिए नक्शे पर किसी गेज पर जाएँ।')}</p>
        )}

        {check && (
          <section className="pf-check" aria-label={L('Did the warnings come true?', 'क्या चेतावनियाँ सही निकलीं?')}>
            <h2>{L(`What the rivers really did on ${shortDate(shownDate)}`, `${shortDate(shownDate)} को नदियों में असल में क्या हुआ`)}</h2>
            <dl>
              <div className="is-hit"><dt>{L('Warnings that came true', 'सही निकली चेतावनियाँ')}</dt><dd>{check.hit}</dd></div>
              <div className="is-false"><dt>{L('False alerts', 'गलत अलर्ट')}</dt><dd>{check.false}</dd></div>
              <div className="is-missed"><dt>{L('Floods missed', 'चूकी हुई बाढ़')}</dt><dd>{check.missed.length}</dd></div>
            </dl>
            {check.missed.length > 0 && <p>{L('Missed:', 'चूके:')} {check.missed.map((r) => r.name).join(', ')}</p>}
            {check.unread > 0 && <p>{L(`${check.unread} more warned ${check.unread === 1 ? 'gauge has' : 'gauges have'} no river reading, so ${check.unread === 1 ? 'it isn\'t' : 'they aren\'t'} counted.`, `${check.unread} और चेतावनी वाले गेज का नदी माप नहीं है, इसलिए वे नहीं गिने गए।`)}</p>}
            <p>{L('One date, not the overall score. Across 2013 to 2018 the model caught about 74% of flood days, with about 38% of alerts false.', 'यह एक तारीख है, कुल स्कोर नहीं। 2013 से 2018 में मॉडल ने लगभग 74% बाढ़ दिन पकड़े, लगभग 38% अलर्ट गलत रहे।')}</p>
          </section>
        )}

        <div className="pf-listhead">
          <label className="pf-search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L('Search 46 gauges', '46 गेज खोजें')} aria-label={L('Search gauges', 'गेज खोजें')} />
          </label>
          <div className="pf-chips is-small" role="group" aria-label={L('Filter by level', 'स्तर से छाँटें')}>
            {([['ALL', `${L('All', 'सभी')} ${warnings + watches}`], ['WARNING', `${statusWord('WARNING')} ${warnings}`], ['WATCH', `${statusWord('WATCH')} ${watches}`]] as const).map(([key, label]) => (
              <button key={key} type="button" className={filter === key ? 'is-on' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        </div>

        <ul className="pf-list" aria-busy={!rows}>
          {!rows && Array.from({ length: 6 }, (_, i) => <li key={i} className="pf-shimmer" aria-hidden="true" />)}
          {closest.length > 0 && <li className="pf-list-note">{L('Nothing flagged. Closest to their high-flow level:', 'कुछ चिह्नित नहीं। अपने उच्च प्रवाह स्तर के सबसे करीब:')}</li>}
          {shownList.map((r) => (
            <li key={r.gauge_id}>
              <button type="button" className={r.gauge_id === selectedId ? 'is-on' : ''} onClick={() => setSelectedId(r.gauge_id)}>
                <span className={`pf-dot is-${r.status}`} aria-hidden="true" />
                <span className="pf-list-name">{r.name}<small>{r.river}</small></span>
                {mode === 'past' && r.status === 'WARNING' && outcomeOf(r) === 'hit' && <span className="pf-outcome is-hit">{L('Came true', 'सही')}</span>}
                {mode === 'past' && r.status === 'WARNING' && outcomeOf(r) === 'false' && <span className="pf-outcome is-false">{L('False alert', 'गलत')}</span>}
                {mode === 'past' && outcomeOf(r) === 'missed' && <span className="pf-outcome is-missed">{L('Missed', 'चूका')}</span>}
                <span className="pf-list-pct">{Math.round((r.predicted_m3s / r.q95_m3s) * 100)}%</span>
              </button>
            </li>
          ))}
          {rows && !shownList.length && (
            <li className="pf-empty">
              {L('Nothing matches. Clear the search or choose another filter.', 'कुछ नहीं मिला। खोज हटाएँ या दूसरा फ़िल्टर चुनें।')}
            </li>
          )}
        </ul>
      </aside>
    </main>
  );
};

export default DashboardPage;
