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
        className={`inline-flex items-center font-mono font-bold rounded-full bg-[#FF454F]/20 text-[#FF454F] border border-[#FF454F]/40 shadow-[0_0_10px_rgba(255,69,79,0.25)] ${sizeClasses}`}
        role="status"
        aria-label="Warning status"
      >
        <ShieldAlert className="w-3.5 h-3.5 text-[#FF454F] shrink-0" aria-hidden="true" />
        <span>{t('status_warning')}</span>
      </span>
    );
  }

  if (status === 'WATCH') {
    return (
      <span
        className={`inline-flex items-center font-mono font-bold rounded-full bg-[#FF9D28]/20 text-[#FF9D28] border border-[#FF9D28]/40 shadow-[0_0_10px_rgba(255,157,40,0.25)] ${sizeClasses}`}
        role="status"
        aria-label="Watch status"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-[#FF9D28] shrink-0" aria-hidden="true" />
        <span>{t('status_watch')}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-mono font-semibold rounded-full bg-[#13D6B0]/20 text-[#13D6B0] border border-[#13D6B0]/40 shadow-[0_0_10px_rgba(19,214,176,0.2)] ${sizeClasses}`}
      role="status"
      aria-label="Normal status"
    >
      <CheckCircle className="w-3.5 h-3.5 text-[#13D6B0] shrink-0" aria-hidden="true" />
      <span>{t('status_ok')}</span>
    </span>
  );
};
