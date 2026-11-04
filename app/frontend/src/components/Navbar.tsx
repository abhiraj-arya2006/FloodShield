import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, Activity, Sliders, BookOpen, AlertOctagon, Globe } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface NavbarProps {
  onOpenWhatIf?: () => void;
  onOpenDocs?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenWhatIf, onOpenDocs }) => {
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const [latency, setLatency] = useState(48);
  const [istTime, setIstTime] = useState('');

  // Live telemetric latency & IST clock simulation
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstTime(now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST');
    };
    updateTime();

    const timer = setInterval(() => {
      setLatency(42 + Math.floor(Math.random() * 9));
      updateTime();
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const navLinks = [
    { label: t('nav_dashboard'), path: '/dashboard' },
    { label: t('nav_alerts'), path: '/alerts' },
    { label: t('nav_model_info'), path: '/model-info' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#070D1A]/95 border-b border-white/10 backdrop-blur-md px-4 lg:px-8 py-3 shadow-2xl transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand & Replay Badge */}
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 rounded-xl bg-[#00D9F5]/20 border border-[#00D9F5]/40 flex items-center justify-center text-[#00D9F5] shadow-[0_0_15px_rgba(0,217,245,0.25)] group-hover:border-[#00D9F5] group-hover:scale-105 transition-all">
              <Shield className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-extrabold text-lg text-white tracking-tight group-hover:text-[#00D9F5] transition-colors">
                  {t('brand_title')}
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#00D9F5]/10 text-[#00D9F5] border border-[#00D9F5]/25">
                  STG-Mamba v2.0
                </span>
              </div>
              <p className="text-[11px] font-mono text-[#91A2B8] tracking-tight">
                {t('basins_label')} • 46 River Gauges
              </p>
            </div>
          </Link>

          {/* Persistent Replay Mode Badge (Required by integrity rules) */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-semibold shadow-inner">
            <AlertOctagon className="w-3.5 h-3.5 animate-pulse text-amber-400" />
            <span>{t('replay_badge')}</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1 font-mono text-xs">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  isActive
                    ? 'bg-[#111C30] text-[#00D9F5] border border-[#00D9F5]/30 shadow-[0_0_12px_rgba(0,217,245,0.15)]'
                    : 'text-[#91A2B8] hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Action Tools: Live Telemetry, Simulator, Tech Specs, Language Toggle */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Live Telemetric Status */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111C30]/80 border border-white/10 text-xs font-mono text-[#91A2B8]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#13D6B0] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#13D6B0]"></span>
            </span>
            <span className="text-white/90 font-medium">Radar Active</span>
            <span className="opacity-40">•</span>
            <span className="text-[#00D9F5] tabular-nums">{latency}ms</span>
            <span className="opacity-40">•</span>
            <span className="text-slate-400 text-[11px]">{istTime}</span>
          </div>

          {/* What-If Simulator Trigger */}
          {onOpenWhatIf && (
            <button
              onClick={onOpenWhatIf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold font-mono text-[#070D1A] bg-[#00D9F5] hover:bg-[#13D6B0] rounded-lg transition-all duration-200 shadow-[0_0_15px_rgba(0,217,245,0.3)] hover:shadow-[0_0_20px_rgba(19,214,176,0.4)] cursor-pointer whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>What-If Sandbox</span>
            </button>
          )}

          {/* Tech Specs Trigger */}
          {onOpenDocs && (
            <button
              onClick={onOpenDocs}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-[#91A2B8] hover:text-white bg-[#111C30] hover:bg-[#16243E] border border-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#00D9F5]" />
              <span>Specs</span>
            </button>
          )}

          {/* Language Toggle: EN | HI */}
          <div className="flex items-center bg-[#111C30] border border-white/10 rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => setLanguage('en')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                language === 'en'
                  ? 'bg-[#00D9F5] text-[#070D1A] font-bold shadow-sm'
                  : 'text-[#91A2B8] hover:text-white'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('hi')}
              className={`px-2 py-1 rounded transition-colors font-devanagari cursor-pointer ${
                language === 'hi'
                  ? 'bg-[#00D9F5] text-[#070D1A] font-bold shadow-sm'
                  : 'text-[#91A2B8] hover:text-white'
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
