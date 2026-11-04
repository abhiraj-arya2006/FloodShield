import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AlertStatus } from '../types';
import { DAYS, addDays, flow, useForecastStore, useFourDays, useNetwork, useText } from '../platform/store';
import { LoadError } from '../platform/PlatformNav';

const COLORS: Record<AlertStatus, string> = { OK: '#D9A95C', WATCH: '#F5B921', WARNING: '#FF4D7D' };
const W = 960;
const H = 400;
const PAD = { l: 18, r: 18, t: 34, b: 44 };

export const GaugeForecastPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { L, date, statusWord } = useText();
  const { start } = useForecastStore();
  const { network, error: netError, retry: retryNet } = useNetwork();
  const { rows, error, retry } = useFourDays(start);

  const gauge = network?.gauges.find((g) => g.gauge_id === id);
  const series = useMemo(() => DAYS.map((k) => ({ day: k, row: rows?.[k].get(id ?? '') })), [rows, id]);
  const peak = series.reduce<typeof series[number] | null>(
    (best, s) => (s.row && (!best?.row || s.row.predicted_m3s > best.row.predicted_m3s) ? s : best),
    null
  );

  const links = useMemo(() => {
    if (!network || !id) return { up: [], down: undefined };
    const name = (gid: string) => network.gauges.find((g) => g.gauge_id === gid);
    return {
      up: network.edges.filter((e) => e.to_gauge_id === id).map((e) => ({ km: e.river_distance_km, gauge: name(e.from_gauge_id) })),
      down: network.edges.filter((e) => e.from_gauge_id === id).map((e) => ({ km: e.river_distance_km, gauge: name(e.to_gauge_id) }))[0],
    };
  }, [network, id]);

  const chart = useMemo(() => {
    if (!gauge || !rows) return null;
    const values = series.flatMap((s) => [s.row?.predicted_m3s ?? 0, s.row?.observed_m3s ?? 0]);
    const top = Math.max(gauge.q95_m3s * 1.3, ...values) * 1.08;
    const x = (k: number) => PAD.l + 50 + ((k - 1) / 3) * (W - PAD.l - PAD.r - 100);
    const y = (v: number) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
    const pts = series.filter((s) => s.row).map((s) => ({ x: x(s.day), y: y(s.row!.predicted_m3s), day: s.day, row: s.row! }));
    let line = '';
    pts.forEach((p, i) => {
      if (!i) { line = `M${p.x} ${p.y}`; return; }
      const mx = (pts[i - 1].x + p.x) / 2;
      line += `C${mx} ${pts[i - 1].y} ${mx} ${p.y} ${p.x} ${p.y}`;
    });
    const area = pts.length ? `${line}L${pts[pts.length - 1].x} ${H - PAD.b}L${pts[0].x} ${H - PAD.b}Z` : '';
    const actual = series.filter((s) => s.row?.observed_m3s != null).map((s) => `${x(s.day)} ${y(s.row!.observed_m3s!)}`);
    return { y, pts, line, area, actual: actual.length > 1 ? `M${actual.join('L')}` : '' };
  }, [gauge, rows, series]);

  const loadError = netError || error;

  return (
    <main className="pf-page">
      <Link className="pf-back" to="/dashboard"><ArrowLeft size={17} aria-hidden="true" />{L('Back to map', 'नक्शे पर वापस')}</Link>

      {loadError && <LoadError message={loadError} onRetry={() => { retry(); retryNet(); }} />}
      {network && !gauge && (
        <p className="pf-empty is-large">{L('This gauge is not in the network. Choose one from the map.', 'यह गेज नेटवर्क में नहीं है। नक्शे से कोई गेज चुनें।')}</p>
      )}

      {gauge && (
        <>
          <div className="pf-page-head">
            <div>
              <h1>{gauge.name}</h1>
              <p className="pf-sub">
                {gauge.river === gauge.basin ? gauge.river : `${gauge.river}, ${gauge.basin}`}.{' '}
                {peak?.row && L(
                  `Peaks on day ${peak.day} at ${flow(peak.row.predicted_m3s)} m³/s, ${statusWord(peak.row.status).toLowerCase()} level.`,
                  `दिन ${peak.day} पर ${flow(peak.row.predicted_m3s)} m³/s का शिखर, स्तर: ${statusWord(peak.row.status)}।`
                )}
              </p>
            </div>
            <p className="pf-sub pf-right-text">{L(`Forecast made on ${date(start)}`, `पूर्वानुमान की तारीख ${date(start)}`)}</p>
          </div>

          <section className="pf-chart" aria-label={L('Four-day flow forecast', 'चार दिन का प्रवाह पूर्वानुमान')}>
            {chart && (
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => `Day ${s.day}: ${s.row ? flow(s.row.predicted_m3s) : 'no forecast'} m³/s`).join(', ')}>
                <defs>
                  <linearGradient id="pf-area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#D9A95C" stopOpacity="0.42" />
                    <stop offset="1" stopColor="#D9A95C" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <rect x="0" y={PAD.t} width={W} height={chart.y(gauge.warning_m3s) - PAD.t} fill="#FF4D7D" opacity="0.1" />
                <rect x="0" y={chart.y(gauge.warning_m3s)} width={W} height={Math.max(0, chart.y(gauge.watch_m3s) - chart.y(gauge.warning_m3s))} fill="#F5B921" opacity="0.1" />
                <line x1="0" x2={W} y1={chart.y(gauge.warning_m3s)} y2={chart.y(gauge.warning_m3s)} stroke="#FF4D7D" strokeDasharray="5 6" />
                <text className="pf-axis" x={10} y={chart.y(gauge.warning_m3s) - 8} style={{ fill: '#ff8dab' }}>{L(`Warning level ${flow(gauge.warning_m3s)} m³/s`, `चेतावनी स्तर ${flow(gauge.warning_m3s)} m³/s`)}</text>
                <text className="pf-axis" x={10} y={chart.y(gauge.watch_m3s) - 8} style={{ fill: '#F5B921' }}>{L(`Watch level ${flow(gauge.watch_m3s)} m³/s`, `निगरानी स्तर ${flow(gauge.watch_m3s)} m³/s`)}</text>

                <path d={chart.area} fill="url(#pf-area)" />
                {chart.actual && <path d={chart.actual} fill="none" stroke="#eaf2ef" strokeOpacity="0.65" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />}
                <path d={chart.line} pathLength={1} className="pf-draw" fill="none" stroke="#f2cf8e" strokeWidth="4" strokeLinecap="round" />
                {chart.pts.map((p) => (
                  <g key={p.day}>
                    <circle cx={p.x} cy={p.y} r="9" fill={COLORS[p.row.status]} stroke="#0a2233" strokeWidth="3" />
                    <text className="pf-value" x={p.x} y={p.y - 19} textAnchor="middle">{flow(p.row.predicted_m3s)}</text>
                    <text className="pf-axis" x={p.x} y={H - 20} textAnchor="middle">{L(`Day ${p.day}`, `दिन ${p.day}`)}, {date(addDays(start, p.day)).split(' ').slice(0, 2).join(' ')}</text>
                  </g>
                ))}
              </svg>
            )}
            <div className="pf-legend">
              <span><i className="is-line" />{L('Forecast flow', 'पूर्वानुमानित प्रवाह')}</span>
              <span><i className="is-dots" />{L('What the river actually did', 'नदी में असल में क्या हुआ')}</span>
            </div>
          </section>

          <section className="pf-chain">
            <h2>{L('Along the river', 'नदी के साथ')}</h2>
            <div className="pf-chain-row">
              <div className="pf-chain-side">
                <span className="pf-sub">{L('Flows in from', 'यहाँ से आता है')}</span>
                {links.up.length
                  ? links.up.map((l) => l.gauge && <Link key={l.gauge.gauge_id} to={`/gauge/${l.gauge.gauge_id}`}>{l.gauge.name}<small>{Math.round(l.km)} km</small></Link>)
                  : <b>{L('Start of the gauged river', 'गेज वाली नदी की शुरुआत')}</b>}
              </div>
              <div className="pf-chain-here">{gauge.name}</div>
              <div className="pf-chain-side">
                <span className="pf-sub">{L('Flows on to', 'यहाँ जाता है')}</span>
                {links.down?.gauge
                  ? <Link to={`/gauge/${links.down.gauge.gauge_id}`}>{links.down.gauge.name}<small>{Math.round(links.down.km)} km</small></Link>
                  : <b>{L('Last gauge on this river', 'इस नदी का आखिरी गेज')}</b>}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
};

export default GaugeForecastPage;
