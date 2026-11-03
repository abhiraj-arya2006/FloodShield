import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Waves, Bell, Database, LayoutDashboard, Globe, History } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export const Navbar: React.FC = () => {
  const { language, setLanguage, t } = useTranslation();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <header className="sticky top-0 z-50 bg-[#070d1a]/95 border-b border-slate-800/80 backdrop-blur-md px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand & Replay Badge */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              <Waves className="w-6 h-6 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-white tracking-tight">
                  {t('brand_title')}
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                  STG-Mamba
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {t('basins_label')}
              </p>
            </div>
          </Link>

          {/* Persistent Replay Mode Badge (Required by integrity rules) */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-sm"
            title="Model forecasts from the 2009-2012 historical validation dataset"
          >
            <History className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
            <span className="tracking-wide uppercase text-[11px] font-bold">
              {t('replay_badge')}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0" aria-label="Main Navigation">
          <Link
            to="/"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive('/')
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>{t('nav_dashboard')}</span>
          </Link>

          <Link
            to="/alerts"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive('/alerts')
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>{t('nav_alerts')}</span>
          </Link>

          <Link
            to="/model-info"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive('/model-info')
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>{t('nav_model_info')}</span>
          </Link>

          {/* Language Switcher */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
            className="ml-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-700/80 text-cyan-300 hover:bg-slate-800 transition-colors"
            title="Toggle between English and Hindi"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>{language === 'en' ? 'हिन्दी' : 'EN'}</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
