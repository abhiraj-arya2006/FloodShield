import React from 'react';
import { ExternalLink, Database, Cloud } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <footer className="mt-auto border-t border-slate-800/80 bg-[#070d1a] py-6 px-4 text-xs text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Attribution Notice */}
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span className="font-semibold">{t('footer_attribution')}</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <div className="flex items-center gap-1.5 text-slate-400">
            <Database className="w-3.5 h-3.5 text-slate-500" />
            <span>{t('footer_sources')}</span>
          </div>
        </div>

        {/* System & Integrity Note */}
        <div className="text-center md:text-right text-[11px] text-slate-500">
          <span>FloodShield India Phase 2 · Daily STG-Mamba Forecaster (2009–2012 Validation)</span>
        </div>
      </div>
    </footer>
  );
};

