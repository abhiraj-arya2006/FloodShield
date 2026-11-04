import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Bell, GitBranch, Layers, Map as MapIcon, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { WhatIfModal } from '../components/common/WhatIfModal';
import { AskPanel } from './AskPanel';
import { useText } from './store';
import './platform.css';

export const PlatformNav: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { L } = useText();
  const { language, setLanguage } = useLanguage();
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const links = [
    { to: '/dashboard', icon: MapIcon, label: L('Map', 'नक्शा') },
    { to: '/river', icon: GitBranch, label: L('Rivers', 'नदियाँ') },
    { to: '/alerts', icon: Bell, label: L('Alerts', 'अलर्ट') },
    { to: '/model-info', icon: Layers, label: L('How it works', 'यह कैसे काम करता है') },
  ];

  return (
    <>
      <header className={`pf-nav${embedded ? ' is-embedded' : ''}`}>
        <Link to="/" className="pf-logo">FloodShield</Link>
        <nav aria-label="Main">
          {links.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'is-on' : '')}>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="pf-nav-end">
          <span className="pf-demo" title={L('Real STG-Mamba forecasts for 2009 to 2018, using recorded rain. Not live.', '2009 से 2018 के असली STG-Mamba पूर्वानुमान, दर्ज बारिश के साथ। लाइव नहीं।')}>
            {L('STG-Mamba replay', 'STG-Mamba रीप्ले')}
          </span>
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
