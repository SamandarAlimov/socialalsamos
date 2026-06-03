import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LanguageSwitcherProps {
  variant?: 'default' | 'compact';
}

export function LanguageSwitcher({ variant = 'default' }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();

  const handleChange = (value: string) => {
    i18n.changeLanguage(value);
    document.documentElement.lang = value;
  };

  if (variant === 'compact') {
    return (
      <Select value={i18n.language} onValueChange={handleChange}>
        <SelectTrigger className="h-9 w-[120px] rounded-full border-border/60">
          <Globe className="h-4 w-4 mr-1.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              <span className="mr-2">{lang.flag}</span>
              {lang.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-card">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-alsamos-orange/10 flex items-center justify-center">
          <Globe className="h-5 w-5 text-alsamos-orange" />
        </div>
        <div>
          <p className="font-medium">{t('settings.language')}</p>
          <p className="text-xs text-muted-foreground">{t('settings.languageDescription')}</p>
        </div>
      </div>
      <Select value={i18n.language} onValueChange={handleChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              <span className="mr-2">{lang.flag}</span>
              {lang.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
