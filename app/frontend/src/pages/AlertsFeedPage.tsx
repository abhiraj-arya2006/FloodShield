import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { fetchAlerts } from '../services/api';
import { AlertItem, AlertsResponse } from '../types';
import { DAYS, addDays, flow, forecastError, useForecastStore, useShortDate, useSourceNote, useText } from '../platform/store';
import { LoadError } from '../platform/PlatformNav';

export const AlertsFeedPage: React.FC = () => {
  const { L, date, statusWord } = useText();
  const { start, day, setDay, ready, mode } = useForecastStore();
  const note = useSourceNote();
  const shortDate = useShortDate();
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<'ALL' | 'WARNING' | 'WATCH'>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const target = addDays(start, day);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    setData(null);
    setError(null);
    fetchAlerts(target, day)
      .then((d) => live && setData(d))
      .catch((err: Error) => live && setError(forecastError(err)));
    return () => { live = false; };
  }, [target, day, attempt, ready]);

  /* Because this is a replay, each alert can be checked against what the river went on to do. */
  const warned = data?.alerts.filter((a) => a.status === 'WARNING' && a.flood_day !== null) ?? [];
  const confirmed = warned.filter((a) => a.flood_day).length;

  const alerts = (data?.alerts ?? [])
    .filter((a) => filter === 'ALL' || a.status === filter)
    .sort((a, b) => Number(b.status === 'WARNING') - Number(a.status === 'WARNING') || b.exceedance_pct - a.exceedance_pct);

  /* Lead days only: a daily model can't say which hour a river crosses its level. */
  const draft = (a: AlertItem) =>
    `FloodShield research advisory: ${a.status} at ${a.name} (${a.river}, ${a.basin} basin) for ${date(target)}. ` +
    `Forecast flow ${flow(a.predicted_m3s)} m³/s, ${a.exceedance_pct}% above its ${flow(a.threshold_m3s)} m³/s alert level, forecast ${a.lead_day} day${a.lead_day === 1 ? '' : 's'} ahead. ` +
    'Not an official flood warning.';

  const copy = async (a: AlertItem) => {
    await navigator.clipboard.writeText(draft(a));
    setCopiedId(a.gauge_id);
    window.setTimeout(() => setCopiedId((id) => (id === a.gauge_id ? null : id)), 1800);
  };

  return (
    <main className="pf-page">
      <div className="pf-page-head">
        <div>
          <h1 aria-live="polite">
            {data
              ? data.total_alerts === 0
                ? L('No alerts for this day', 'इस दिन कोई अलर्ट नहीं')
                : L(`${data.warning_count} warnings, ${data.watch_count} on watch`, `${data.warning_count} चेतावनी, ${data.watch_count} निगरानी में`)
              : L('Reading the rivers', 'नदियों को पढ़ा जा रहा है')}
          </h1>
          <p className="pf-sub">
            {L(`Forecast for ${date(target)}, made ${day} day${day === 1 ? '' : 's'} ahead.`, `${date(target)} का पूर्वानुमान, ${day} दिन पहले बनाया गया।`)}
            {warned.length > 0 && ` ${L(`The river reached high flow at ${confirmed} of ${warned.length} warned gauges.`, `चेतावनी वाले ${warned.length} में से ${confirmed} गेज पर नदी उच्च प्रवाह तक पहुँची।`)}`}
          </p>
        </div>
        <div className="pf-controls">
          <div className="pf-chips" role="group" aria-label={L('Forecast day', 'पूर्वानुमान का दिन')}>
            {DAYS.map((k) => (
              <button key={k} type="button" className={k === day ? 'is-on' : ''} aria-pressed={k === day} onClick={() => setDay(k)}>{shortDate(addDays(start, k))}</button>
            ))}
          </div>
          <div className="pf-chips" role="group" aria-label={L('Filter by level', 'स्तर से छाँटें')}>
            {([['ALL', `${L('All', 'सभी')} ${data?.total_alerts ?? ''}`], ['WARNING', `${statusWord('WARNING')} ${data?.warning_count ?? ''}`], ['WATCH', `${statusWord('WATCH')} ${data?.watch_count ?? ''}`]] as const).map(([key, label]) => (
              <button key={key} type="button" className={filter === key ? 'is-on' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {error && <LoadError message={error} onRetry={() => setAttempt((a) => a + 1)} />}

      <ul className="pf-feed" aria-busy={!data && !error}>
        {!data && !error && Array.from({ length: 5 }, (_, i) => <li key={i} className="pf-shimmer is-tall" aria-hidden="true" />)}
        {alerts.map((a) => {
          const open = openId === a.gauge_id;
          const text = draft(a);
          return (
            <li key={a.gauge_id} className={`pf-alert is-${a.status}${open ? ' is-open' : ''}`}>
              <button type="button" className="pf-alert-row" aria-expanded={open} onClick={() => setOpenId(open ? null : a.gauge_id)}>
                <span className="pf-alert-name">
                  <b>{a.name}</b>
                  <small>{a.river === a.basin ? a.river : `${a.river}, ${a.basin}`}</small>
                  {a.flood_day !== null && (
                    <span className={`pf-outcome${a.flood_day ? ' is-hit' : ''}`}>
                      {a.flood_day ? L('River reached high flow', 'नदी उच्च प्रवाह तक पहुँची') : L('River stayed below high flow', 'नदी उच्च प्रवाह से नीचे रही')}
                    </span>
                  )}
                </span>
                <span className={`pf-status is-${a.status}`}>{statusWord(a.status)}</span>
                <span className="pf-alert-over">
                  <b>+{Math.round(a.exceedance_pct)}%</b>
                  <small>{L('over its level', 'स्तर से ऊपर')}</small>
                  <small className="pf-alert-flow">{flow(a.predicted_m3s)} m³/s</small>
                </span>
                <ChevronDown size={20} className="pf-chevron" aria-hidden="true" />
              </button>
              {open && (
                <div className="pf-alert-body">
                  <p>{text}</p>
                  <div className="pf-row">
                    <button type="button" className="pf-btn" onClick={() => copy(a)}>
                      {copiedId === a.gauge_id ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                      {copiedId === a.gauge_id ? L('Copied', 'कॉपी हो गया') : L('Copy advisory', 'सलाह कॉपी करें')}
                    </button>
                    <Link className="pf-link" viewTransition to={`/gauge/${a.gauge_id}`}>{L('Open four-day forecast', 'चार दिन का पूर्वानुमान खोलें')}</Link>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {data && !alerts.length && (
          <li className="pf-empty is-large">{data.total_alerts === 0 && mode === 'live' ? L('All 46 gauges are below their alert levels for this day.', 'इस दिन सभी 46 गेज अपने अलर्ट स्तर से नीचे हैं।') : L('No alerts match. Choose another day or filter.', 'कोई अलर्ट नहीं मिला। दूसरा दिन या फ़िल्टर चुनें।')}</li>
        )}
      </ul>
      <p className="pf-note">{note}</p>
    </main>
  );
};

export default AlertsFeedPage;
