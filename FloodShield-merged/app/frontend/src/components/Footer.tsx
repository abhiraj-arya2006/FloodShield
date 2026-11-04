import React from 'react';
import { ExternalLink, Database, Cloud, BookOpen, Shield } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface FooterProps {
  onOpenDocs?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenDocs }) => {
  const { t } = useLanguage();

  return (
    <footer className="mt-auto border-t border-white/10 bg-[#070D1A] py-8 px-4 text-xs font-mono text-[#91A2B8]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand & Attribution Notice */}
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
          <div className="flex items-center gap-2 text-white font-heading font-bold">
            <Shield className="w-4 h-4 text-[#00D9F5]" />
            <span>FloodShield v2.0 Operations</span>
          </div>

          <span className="text-slate-600 hidden sm:inline">•</span>

          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[#00D9F5] hover:text-[#13D6B0] transition-colors"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span className="font-semibold">{t('footer_attribution')}</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <span className="text-slate-600 hidden sm:inline">•</span>

          <div className="flex items-center gap-1.5 text-slate-400">
            <Database className="w-3.5 h-3.5 text-slate-500" />
            <span>{t('footer_sources')}</span>
          </div>
        </div>

        {/* Right Links & Ground-truth Note */}
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-4 text-[11px] text-slate-500">
          {onOpenDocs && (
            <button
              onClick={onOpenDocs}
              className="flex items-center gap-1 text-[#00D9F5] hover:text-white transition-colors cursor-pointer"
            >
              <BookOpen className="w-3 h-3" />
              <span>Technical Data Dictionary</span>
            </button>
          )}
          <span>Godavari & Mahanadi STG-Mamba Forecaster (2009–2012 Replay)</span>
        </div>
      </div>
    </footer>
  );
};
