import React from 'react';
import { AlertStatus } from '../types';
import { ShieldAlert, AlertTriangle, CheckCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface StatusChipProps {
  status: AlertStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, size = 'md' }) => {
  const { t } = useLanguage();

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3.5 py-1.5 text-sm gap-2',
  }[size];

  if (status === 'WARNING') {
    return (
      <span
        className={`inline-flex items-center font-mono font-bold rounded-full bg-[#FF6A3D]/20 text-[#FF6A3D] border border-[#FF6A3D]/40 shadow-[0_0_10px_rgba(255,106,61,0.25)] ${sizeClasses}`}
        role="status"
        aria-label="Warning status"
      >
        <ShieldAlert className="w-3.5 h-3.5 text-[#FF6A3D] shrink-0" aria-hidden="true" />
        <span>{t('status_warning')}</span>
      </span>
    );
  }

  if (status === 'WATCH') {
    return (
      <span
        className={`inline-flex items-center font-mono font-bold rounded-full bg-[#E8B94A]/20 text-[#E8B94A] border border-[#E8B94A]/40 shadow-[0_0_10px_rgba(232,185,74,0.25)] ${sizeClasses}`}
        role="status"
        aria-label="Watch status"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-[#E8B94A] shrink-0" aria-hidden="true" />
        <span>{t('status_watch')}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-mono font-semibold rounded-full bg-[#7CC4A4]/20 text-[#7CC4A4] border border-[#7CC4A4]/40 shadow-[0_0_10px_rgba(124,196,164,0.2)] ${sizeClasses}`}
      role="status"
      aria-label="Normal status"
    >
      <CheckCircle className="w-3.5 h-3.5 text-[#7CC4A4] shrink-0" aria-hidden="true" />
      <span>{t('status_ok')}</span>
    </span>
  );
};
