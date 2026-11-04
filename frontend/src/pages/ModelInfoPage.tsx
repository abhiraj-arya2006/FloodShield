import React, { useEffect, useState } from 'react';
import { fetchModelInfo } from '../services/api';
import { ModelInfoResponse } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Database,
  Cpu,
  Layers,
  Calendar,
  AlertCircle,
  ExternalLink,
  BookOpen,
  ShieldCheck,
  Activity,
  Sliders,
} from 'lucide-react';

interface ModelInfoPageProps {
  onOpenDocs?: () => void;
}

export const ModelInfoPage: React.FC<ModelInfoPageProps> = ({ onOpenDocs }) => {
  const { t } = useLanguage();
  const [info, setInfo] = useState<ModelInfoResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModelInfo()
      .then((res) => {
        setInfo(res);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load model architecture data');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#5CB8C4]/10 border border-[#5CB8C4]/25 text-[10px] font-mono text-[#5CB8C4] mb-2">
            <Cpu className="w-3 h-3" />
            <span>Model Registry & Scientific Ground Truth</span>
          </div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-white flex items-center gap-2.5 tracking-tight">
            <span>{t('model_info_title')}</span>
          </h1>
          <p className="text-xs text-[#8FA9AB] mt-1 font-mono">
            {t('model_info_subtitle')}
          </p>
        </div>

        {onOpenDocs && (
          <button
            onClick={onOpenDocs}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5CB8C4] hover:bg-[#7CC4A4] text-[#07141C] font-mono font-bold text-xs transition-all shadow-[0_0_15px_rgba(92,184,196,0.3)] cursor-pointer shrink-0"
          >
            <BookOpen className="w-4 h-4" />
            <span>Open Technical Specs</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/50 text-red-300 text-xs font-mono">
          {error}
        </div>
      )}

      {info && (
        <div className="space-y-6">
          {/* Card 1: Core Forecaster & Architecture */}
          <div className="bg-[#0B1E26] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <div className="w-10 h-10 rounded-xl bg-[#5CB8C4]/10 border border-[#5CB8C4]/30 flex items-center justify-center text-[#5CB8C4] shadow-[0_0_15px_rgba(92,184,196,0.2)]">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-lg text-white">{info.model_name}</h3>
                <span className="text-xs text-[#5CB8C4] font-mono font-bold">{info.version}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {info.description}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-[#07141C] border border-white/10 space-y-1">
                <p className="text-[11px] font-mono text-[#5CB8C4] uppercase font-bold">
                  {t('forecaster_engine')}
                </p>
                <p className="text-xs text-white font-medium">{info.forecaster}</p>
              </div>

              <div className="p-4 rounded-xl bg-[#07141C] border border-white/10 space-y-1">
                <p className="text-[11px] font-mono text-[#7CC4A4] uppercase font-bold">
                  {t('correction_stage_title')}
                </p>
                <p className="text-xs text-white font-medium">{info.correction_stage}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-[#07141C] border border-white/10 text-xs">
                <span className="text-[11px] text-slate-400 block font-mono">{t('training_window')}</span>
                <span className="font-bold text-white font-mono mt-0.5 block">{info.training_years}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#07141C] border border-white/10 text-xs">
                <span className="text-[11px] text-slate-400 block font-mono">{t('validation_window')}</span>
                <span className="font-bold text-[#5CB8C4] font-mono mt-0.5 block">{info.validation_years}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#07141C] border border-white/10 text-xs">
                <span className="text-[11px] text-slate-400 block font-mono">Temporal Resolution</span>
                <span className="font-bold text-[#7CC4A4] font-mono mt-0.5 block">{info.time_step} Step</span>
              </div>
            </div>
          </div>

          {/* Card 2: Data Sources & Lineage */}
          <div className="bg-[#0B1E26] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <BookOpen className="w-5 h-5 text-[#5CB8C4]" />
              <h3 className="font-heading font-extrabold text-base text-white">{t('data_sources_title')}</h3>
            </div>

            <div className="space-y-3">
              {info.data_sources.map((src, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-[#07141C] border border-white/10 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-heading font-bold text-white text-sm">{src.name}</h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#0F2831] text-[#5CB8C4] border border-white/10">
                      Primary Source
                    </span>
                  </div>
                  <p className="text-slate-300 font-sans">{src.role}</p>
                  <p className="text-[11px] text-slate-500 font-mono pt-1">Citation: {src.citation}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Research Prototype Disclaimer */}
          <div className="bg-[#0B1E26] border border-[#E8B94A]/30 rounded-2xl p-5 shadow-2xl flex items-start gap-3 text-xs text-amber-200/90">
            <AlertCircle className="w-5 h-5 text-[#E8B94A] shrink-0 mt-0.5" />
            <div className="space-y-1 font-mono">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                System Integrity & Official Disclaimers
              </h4>
              <p className="text-[11px] leading-relaxed text-amber-200/80">
                {info.disclaimer}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
