import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { addDays, useForecastStore, useFourDays, useText } from '../../platform/store';
import { LoadError } from '../../platform/PlatformNav';

interface WhatIfModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/* A stress test on the forecast: it scales predicted flow, it doesn't re-run the model. */
const StressTest: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { L, date } = useText();
  const { start, day } = useForecastStore();
  const { rows, error, retry } = useFourDays(start);
  const [change, setChange] = useState(25);
  const factor = 1 + change / 100;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const result = useMemo(() => {
    if (!rows) return null;
    const all = [...rows[day].values()];
    const crossed = all.filter((r) => r.status !== 'WARNING' && r.predicted_m3s * factor >= r.warning_m3s);
    const cleared = all.filter((r) => r.status === 'WARNING' && r.predicted_m3s * factor < r.warning_m3s);
    return {
      before: all.filter((r) => r.status === 'WARNING').length,
      after: all.filter((r) => r.predicted_m3s * factor >= r.warning_m3s).length,
      crossed,
      cleared,
    };
  }, [rows, day, factor]);

  return (
    <div className="pf-modal-back" onClick={onClose}>
      <div className="pf pf-modal" role="dialog" aria-modal="true" aria-labelledby="pf-whatif-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pf-modal-close" onClick={onClose} aria-label={L('Close', 'बंद करें')} autoFocus><X size={20} /></button>
        <h2 id="pf-whatif-title">{L('What if the rivers ran higher?', 'अगर नदियाँ और ऊँची बहें तो?')}</h2>
        <p className="pf-sub">{L(`Testing day ${day}, ${date(addDays(start, day))}. This scales the forecast to show how close each gauge is to its level. It doesn't re-run the model.`, `दिन ${day}, ${date(addDays(start, day))} की जाँच। यह पूर्वानुमान को बढ़ा-घटाकर दिखाता है कि हर गेज अपने स्तर के कितने करीब है। यह मॉडल दोबारा नहीं चलाता।`)}</p>

        {error && <LoadError message={error} onRetry={retry} />}

        <label className="pf-slider">
          <span>{L('Change in forecast flow', 'पूर्वानुमानित प्रवाह में बदलाव')}<b>{change > 0 ? '+' : ''}{change}%</b></span>
          <input type="range" min={-50} max={100} step={5} value={change} onChange={(e) => setChange(Number(e.target.value))} />
        </label>

        {result && (
          <>
            <div className="pf-compare">
              <div><b>{result.before}</b><span>{L('gauges on warning now', 'अभी चेतावनी पर गेज')}</span></div>
              <div className="is-after"><b>{result.after}</b><span>{L('with this change', 'इस बदलाव के साथ')}</span></div>
            </div>
            <p className="pf-tested">
              {result.crossed.length > 0 && <>{L('Newly above: ', 'नए ऊपर: ')}<b>{result.crossed.map((r) => r.name).join(', ')}</b>. </>}
              {result.cleared.length > 0 && <>{L('Back below: ', 'वापस नीचे: ')}<b>{result.cleared.map((r) => r.name).join(', ')}</b>.</>}
              {!result.crossed.length && !result.cleared.length && L('No gauge changes level with this change.', 'इस बदलाव से किसी गेज का स्तर नहीं बदलता।')}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export const WhatIfModal: React.FC<WhatIfModalProps> = ({ isOpen, onClose }) =>
  isOpen ? <StressTest onClose={onClose} /> : null;
