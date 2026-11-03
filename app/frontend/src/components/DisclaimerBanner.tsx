import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export const DisclaimerBanner: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-amber-950/40 border-y border-amber-500/20 px-4 py-2 text-xs text-amber-200/90 flex items-center justify-center gap-2 text-center">
      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
      <span className="font-medium max-w-5xl">
        {t('cwc_disclaimer')}
      </span>
    </div>
  );
};

