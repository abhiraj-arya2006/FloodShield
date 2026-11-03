import React from 'react';
import { AlertStatus } from '../types';
import { ShieldAlert, AlertTriangle, CheckCircle } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

interface StatusChipProps {
  status: AlertStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, size = 'md' }) => {
  const { t } = useTranslation();

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3.5 py-1.5 text-sm gap-2'
  }[size];

  if (status === 'WARNING') {
    return (
      <span
        className={`inline-flex items-center font-bold rounded-full bg-red-950/80 text-red-400 border border-red-500/50 shadow-sm shadow-red-950 ${sizeClasses}`}
        role="status"
        aria-label="Warning status"
      >
        <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" aria-hidden="true" />
        <span>{t('status_warning')}</span>
      </span>
    );
  }

  if (status === 'WATCH') {
    return (
      <span
        className={`inline-flex items-center font-bold rounded-full bg-amber-950/80 text-amber-400 border border-amber-500/50 shadow-sm shadow-amber-950 ${sizeClasses}`}
        role="status"
        aria-label="Watch status"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        <span>{t('status_watch')}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 shadow-sm shadow-emerald-950 ${sizeClasses}`}
      role="status"
      aria-label="Normal status"
    >
      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
      <span>{t('status_ok')}</span>
    </span>
  );
};
