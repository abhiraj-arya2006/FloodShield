import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { Pause, Play, Search } from 'lucide-react';
import { AlertStatus, GaugeForecastRow } from '../types';
import { DAYS, LAST_DAY, addDays, countStatus, flow, useForecastStore, useFourDays, useNetwork, useText } from '../platform/store';
import { LoadError } from '../platform/PlatformNav';

const COLORS: Record<AlertStatus, string> = { OK: '#D9A95C', WATCH: '#F5B921', WARNING: '#FF4D7D' };

/* Map views, in degrees of longitude and latitude. All share one shape, so the zoom never distorts. */
const VIEW_RATIO = 1.895;
const VIEWS: Record<string, { lon: number; lat: number; width: number }> = {
  ALL: { lon: 80.7, lat: 20.2, width: 22 },
  Godavari: { lon: 79.8, lat: 19.8, width: 15 },
  Mahanadi: { lon: 83, lat: 21.6, width: 10.5 },
};

export const DashboardPage: React.FC = () => {
  const { L, date, statusWord } = useText();
  const { start, day, setStart, setDay } = useForecastStore();
  const { network, error: netError, retry: retryNet } = useNetwork();
  const { rows, error, retry } = useFourDays(start);
  const [basin, setBasin] = useState('ALL');
  const [filter, setFilter] = useState<'ALL' | 'WARNING' | 'WATCH'>('ALL');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [unit, setUnit] = useState(0.02);
  const svgRef = useRef<SVGSVGElement>(null);
  const view = useRef({ ...VIEWS.ALL });

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
    const tween = gsap.to(view.current, { ...VIEWS[basin], duration: still ? 0 : 1.4, ease: 'power3.inOut', onUpdate: applyView });
    return () => { tween.kill(); };
  }, [basin]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const current = useForecastStore.getState().day;
      if (current >= LAST_DAY) setPlaying(false);
      else setDay(current + 1);
    }, 1300);
    return () => window.clearInterval(timer);
  }, [playing, setDay]);

  const shownDate = addDays(start, day);
  const today = rows?.[day];
  const warnings = countStatus(rows, day, 'WARNING');
  const watches = countStatus(rows, day, 'WATCH');
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

  /* With many warnings, only the most extreme are named, so the map stays readable. */
  const named = useMemo(() => {
    if (!today || window.innerWidth <= 760) return new Set<string>();
    return new Set([...today.values()]
      .filter((r) => r.status === 'WARNING')
      .sort((a, b) => b.predicted_m3s / b.q95_m3s - a.predicted_m3s / a.q95_m3s)
      .slice(0, 8)
      .map((r) => r.gauge_id));
  }, [today]);

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

      <section className="pf-float pf-left">
        <h1 aria-live="polite">
          {rows
            ? warnings
              ? L(`${warnings} ${warnings === 1 ? 'gauge' : 'gauges'} on flood warning`, `${warnings} गेज पर बाढ़ चेतावनी`)
              : L('No flood warnings', 'कोई बाढ़ चेतावनी नहीं')
            : L('Reading the rivers', 'नदियों को पढ़ा जा रहा है')}
        </h1>
        <p className="pf-sub">
          {date(shownDate)}. {L(`${watches} more on watch.`, `${watches} और निगरानी में।`)}
        </p>

        {loadError && <LoadError message={loadError} onRetry={() => { retry(); retryNet(); }} />}

        <div className="pf-days" role="group" aria-label={L('Forecast day', 'पूर्वानुमान का दिन')}>
          {DAYS.map((k) => {
            const count = countStatus(rows, k, 'WARNING');
            return (
              <button key={k} type="button" className={k === day ? 'is-on' : ''} aria-pressed={k === day} onClick={() => { setPlaying(false); setDay(k); }}>
                <span className="pf-day-bar"><i style={{ height: `${Math.min(100, 8 + count * 7)}%` }} /></span>
                <b>{count}</b>
                <span>{L(`Day ${k}`, `दिन ${k}`)}</span>
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
          <label className="pf-date">
            <span>{L('Forecast made on', 'पूर्वानुमान की तारीख')}</span>
            <input type="date" value={start} min={network?.min} max={network?.max} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </label>
        </div>

        <div className="pf-chips" role="group" aria-label={L('River basin', 'नदी बेसिन')}>
          {[['ALL', L('Both rivers', 'दोनों नदियाँ')], ['Godavari', L('Godavari', 'गोदावरी')], ['Mahanadi', L('Mahanadi', 'महानदी')]].map(([key, label]) => (
            <button key={key} type="button" className={basin === key ? 'is-on' : ''} aria-pressed={basin === key} onClick={() => setBasin(key)}>{label}</button>
          ))}
        </div>
        <p className="pf-disclaim">{L('STG-Mamba replay using recorded rain, not a live forecast. Research prototype, not an official flood warning.', 'दर्ज बारिश के साथ STG-Mamba रीप्ले, लाइव पूर्वानुमान नहीं। शोध प्रोटोटाइप, आधिकारिक बाढ़ चेतावनी नहीं।')}</p>
      </section>

      <aside className="pf-float pf-right">
        {selected ? (
          <div className="pf-detail">
            <div className="pf-detail-head">
              <h2>{selected.name}</h2>
              <span className={`pf-status is-${selected.status}`}>{statusWord(selected.status)}</span>
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
            <Link className="pf-link" to={`/gauge/${selected.gauge_id}`}>{L('Open four-day forecast', 'चार दिन का पूर्वानुमान खोलें')}</Link>
          </div>
        ) : (
          <p className="pf-sub pf-hint">{L('Point at any gauge on the map to read its forecast.', 'पूर्वानुमान पढ़ने के लिए नक्शे पर किसी गेज पर जाएँ।')}</p>
        )}

        <div className="pf-listhead">
          <label className="pf-search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L('Search 46 gauges', '46 गेज खोजें')} aria-label={L('Search gauges', 'गेज खोजें')} />
          </label>
          <div className="pf-chips is-small" role="group" aria-label={L('Filter by level', 'स्तर से छाँटें')}>
            {([['ALL', L('All', 'सभी')], ['WARNING', statusWord('WARNING')], ['WATCH', statusWord('WATCH')]] as const).map(([key, label]) => (
              <button key={key} type="button" className={filter === key ? 'is-on' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        </div>

        <ul className="pf-list">
          {list.map((r) => (
            <li key={r.gauge_id}>
              <button type="button" className={r.gauge_id === selectedId ? 'is-on' : ''} onClick={() => setSelectedId(r.gauge_id)}>
                <span className={`pf-dot is-${r.status}`} aria-hidden="true" />
                <span className="pf-list-name">{r.name}<small>{r.river}</small></span>
                <span className="pf-list-pct">{Math.round((r.predicted_m3s / r.q95_m3s) * 100)}%</span>
              </button>
            </li>
          ))}
          {rows && !list.length && <li className="pf-empty">{L('Nothing matches. Clear the search or choose another filter.', 'कुछ नहीं मिला। खोज हटाएँ या दूसरा फ़िल्टर चुनें।')}</li>}
        </ul>
      </aside>
    </main>
  );
};

export default DashboardPage;
