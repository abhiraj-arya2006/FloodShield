import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sliders, BookOpen, RotateCcw } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface NavbarProps {
  onOpenWhatIf?: () => void;
  onOpenDocs?: () => void;
  onReplayIntro?: () => void;
}

const Mark: React.FC = () => (
  <svg width="20" height="24" viewBox="0 0 22 26" aria-hidden="true">
    <path d="M11 1C11 1 2 11 2 17a9 9 0 0 0 18 0C20 11 11 1 11 1Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M6.5 17.5c1.6-1.6 3.2-1.6 4.5 0s2.9 1.6 4.5 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export const Navbar: React.FC<NavbarProps> = ({ onOpenWhatIf, onOpenDocs, onReplayIntro }) => {
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();

  const navLinks = [
    { label: t('nav_dashboard'), path: '/' },
    { label: t('nav_alerts'), path: '/alerts' },
    { label: t('nav_model_info'), path: '/model-info' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-midnight/80 backdrop-blur-xl px-4 lg:px-8">
      <div className="max-w-7xl mx-auto h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 text-mist hover:text-white transition-colors shrink-0">
          <span className="text-silt">
            <Mark />
          </span>
          <span className="text-[1.15rem] font-medium tracking-tight">{t('brand_title')}</span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1 text-sm">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                aria-current={isActive ? 'page' : undefined}
                className={`relative px-3.5 py-2 rounded-full transition-colors ${
                  isActive ? 'text-white bg-white/[0.08]' : 'text-[#8FA9AB] hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            title="This dashboard replays model predictions for past dates. It is not a live forecast."
            className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs text-high border border-high/30 bg-high/[0.07]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-high" />
            {t('replay_badge')}
          </span>

          {onOpenWhatIf && (
            <button
              onClick={onOpenWhatIf}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-midnight bg-mist hover:bg-white rounded-full transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5" />
              What-If Sandbox
            </button>
          )}

          {onOpenDocs && (
            <button
              onClick={onOpenDocs}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm text-[#8FA9AB] hover:text-white rounded-full transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Specs
            </button>
          )}

          {onReplayIntro && (
            <button
              onClick={onReplayIntro}
              title="Replay the intro"
              aria-label="Replay the intro"
              className="inline-flex items-center justify-center w-9 h-9 text-[#8FA9AB] hover:text-white rounded-full transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center rounded-full bg-white/[0.06] p-0.5 text-xs">
            <button
              onClick={() => setLanguage('en')}
              className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                language === 'en' ? 'bg-mist text-midnight font-medium' : 'text-[#8FA9AB] hover:text-white'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('hi')}
              className={`px-2.5 py-1 rounded-full transition-colors font-devanagari cursor-pointer ${
                language === 'hi' ? 'bg-mist text-midnight font-medium' : 'text-[#8FA9AB] hover:text-white'
              }`}
            >
              हिन्दी
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
