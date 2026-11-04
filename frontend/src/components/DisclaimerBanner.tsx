import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const DisclaimerBanner: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="bg-[#0B1E26]/95 border-y border-[#E8B94A]/30 px-4 py-2 text-xs font-mono text-amber-200/90 flex items-center justify-center gap-2 text-center backdrop-blur-md">
      <AlertCircle className="w-4 h-4 text-[#E8B94A] shrink-0" aria-hidden="true" />
      <span className="font-medium max-w-5xl">
        {t('cwc_disclaimer')}
      </span>
    </div>
  );
};
