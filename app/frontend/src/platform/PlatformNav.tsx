import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Bell, GitBranch, Layers, Map as MapIcon, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { WhatIfModal } from '../components/common/WhatIfModal';
import { AskPanel } from './AskPanel';
import { clockTime, useForecastStore, useText } from './store';
import './platform.css';

export const PlatformNav: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { L } = useText();
  const { language, setLanguage } = useLanguage();
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const { mode, live, setMode } = useForecastStore();
  const links = [
    { to: '/dashboard', icon: MapIcon, label: L('Map', 'नक्शा') },
    { to: '/river', icon: GitBranch, label: L('Rivers', 'नदियाँ') },
    { to: '/alerts', icon: Bell, label: L('Alerts', 'अलर्ट') },
    { to: '/model-info', icon: Layers, label: L('How it works', 'यह कैसे काम करता है') },
  ];

  return (
    <>
      <header className={`pf-nav${embedded ? ' is-embedded' : ''}`}>
        <Link to="/" viewTransition className="pf-logo">FloodShield</Link>
        <nav aria-label="Main">
          {links.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} viewTransition className={({ isActive }) => (isActive ? 'is-on' : '')}>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="pf-nav-end">
          <div
            className="pf-mode"
            role="group"
            aria-label={L('Forecast source', 'पूर्वानुमान का स्रोत')}
            title={live ? L(`Updated ${clockTime(live.generated_at)} IST${live.stale ? ', refresh failed' : ''}`, `${clockTime(live.generated_at)} IST पर अपडेट${live.stale ? ', ताज़ा नहीं हो सका' : ''}`) : L('Live forecast unavailable', 'लाइव पूर्वानुमान उपलब्ध नहीं')}
          >
            <button type="button" className={mode === 'live' ? 'is-on' : ''} aria-pressed={mode === 'live'} disabled={!live} onClick={() => setMode('live')}>
              <i aria-hidden="true" />{L('Live', 'लाइव')}
            </button>
            <button type="button" className={mode === 'past' ? 'is-on' : ''} aria-pressed={mode === 'past'} onClick={() => setMode('past')}>
              {L('Past', 'पिछला')}
            </button>
          </div>
          <button type="button" className="pf-ask-open" onClick={() => setAskOpen(true)}>
            <MessageCircle size={16} aria-hidden="true" />
            {L('Ask', 'पूछें')}
          </button>
          <button type="button" className="pf-whatif" onClick={() => setWhatIfOpen(true)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            {L('What if', 'क्या होगा अगर')}
          </button>
          <button
            type="button"
            className="pf-lang"
            aria-label={language === 'hi' ? 'Switch to English' : 'हिन्दी में देखें'}
            onClick={() => setLanguage(language === 'hi' ? 'en' : 'hi')}
          >
            {language === 'hi' ? 'EN' : 'हिं'}
          </button>
        </div>
      </header>
      <WhatIfModal isOpen={whatIfOpen} onClose={() => setWhatIfOpen(false)} />
      {askOpen && <AskPanel onClose={() => setAskOpen(false)} />}
    </>
  );
};

/* A plain, actionable message for pages that can't load their data. */
export const LoadError: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => {
  const { L } = useText();
  return (
    <div className="pf-error" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>{L('Try again', 'फिर से कोशिश करें')}</button>
    </div>
  );
};
