import React, { useEffect, useRef, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { ArrowUp, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { addDays, useForecastStore, useNetwork, useText } from './store';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  source?: string;
}

/* Questions about the forecast on screen. Answers stream in as the server writes them. */
export const AskPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { L, date } = useText();
  const { language } = useLanguage();
  const { start, day } = useForecastStore();
  const { network } = useNetwork();
  const gaugeId = useMatch('/gauge/:id')?.params.id;
  const gaugeName = network?.gauges.find((g) => g.gauge_id === gaugeId)?.name;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      request.current?.abort();
    };
  }, [onClose]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns]);

  const suggestions = [
    ...(gaugeName ? [L(`Why is ${gaugeName} flagged?`, `${gaugeName} क्यों चिह्नित है?`)] : []),
    L('Which gauges are on warning?', 'कौन से गेज चेतावनी पर हैं?'),
    L('Which gauge is highest?', 'कौन सा गेज सबसे ऊपर है?'),
    L('How accurate is the model?', 'मॉडल कितना सटीक है?'),
    L('Is this a live forecast?', 'क्या यह लाइव पूर्वानुमान है?'),
  ];

  const ask = async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    setQuestion('');
    setBusy(true);
    const history = turns.filter((t) => t.content).slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 3000) }));
    setTurns((all) => [...all, { role: 'user', content: clean }, { role: 'assistant', content: '' }]);
    const update = (content: string, source?: string) =>
      setTurns((all) => [...all.slice(0, -1), { role: 'assistant', content, source }]);

    const controller = new AbortController();
    request.current = controller;
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: clean, start, day, gauge_id: gaugeId ?? null, lang: language, history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        update(res.status === 429
          ? L('Too many questions in a short time. Wait a minute, then ask again.', 'कम समय में बहुत सारे सवाल। एक मिनट रुककर फिर पूछें।')
          : res.status === 404
            ? L('No forecast was made for this date. Choose a date from 2009 to 2018.', 'इस तारीख का पूर्वानुमान नहीं है। 2009 से 2018 की कोई तारीख चुनें।')
            : L("The forecast service isn't responding. Start the backend, then ask again.", 'पूर्वानुमान सेवा जवाब नहीं दे रही। बैकएंड चालू करके फिर पूछें।'));
        return;
      }
      const source = res.headers.get('X-Answered-By') ?? 'built-in';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        update(answer, source);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        update(L("The forecast service isn't responding. Start the backend, then ask again.", 'पूर्वानुमान सेवा जवाब नहीं दे रही। बैकएंड चालू करके फिर पूछें।'));
      }
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="pf-ask-back" onClick={onClose}>
      <aside className="pf pf-ask" role="dialog" aria-modal="true" aria-labelledby="pf-ask-title" onClick={(e) => e.stopPropagation()}>
        <header className="pf-ask-head">
          <div>
            <h2 id="pf-ask-title">{L('Ask about this forecast', 'इस पूर्वानुमान के बारे में पूछें')}</h2>
            <p className="pf-sub">
              {gaugeName ? `${gaugeName}, ` : ''}{L(`day ${day}`, `दिन ${day}`)}, {date(addDays(start, day))}
            </p>
          </div>
          <button type="button" className="pf-modal-close" onClick={onClose} aria-label={L('Close', 'बंद करें')}><X size={20} /></button>
        </header>

        <div className="pf-ask-log" aria-live="polite">
          {turns.length === 0 && (
            <div className="pf-ask-start">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`pf-turn is-${t.role}`}>
              {t.content
                ? <p>{t.content}</p>
                : <p className="pf-thinking" role="status">{L('Reading the forecast', 'पूर्वानुमान पढ़ा जा रहा है')}</p>}
              {t.source && (
                <small>{t.source === 'claude' ? L('Answered by Claude from this forecast', 'इस पूर्वानुमान से Claude का उत्तर') : L('Built-in answer from this forecast', 'इस पूर्वानुमान से बिल्ट-इन उत्तर')}</small>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form className="pf-ask-form" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
          <textarea
            ref={inputRef}
            rows={1}
            maxLength={500}
            value={question}
            placeholder={L('Ask a question', 'सवाल पूछें')}
            aria-label={L('Your question', 'आपका सवाल')}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
          />
          <button type="submit" disabled={busy || !question.trim()} aria-label={L('Send question', 'सवाल भेजें')}><ArrowUp size={20} /></button>
        </form>
      </aside>
    </div>
  );
};
