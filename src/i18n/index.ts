import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import uz from './locales/uz.json';
import en from './locales/en.json';
import ru from './locales/ru.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'uz', label: "O'zbekcha", flag: '🇺🇿' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      uz: { translation: uz },
      en: { translation: en },
      ru: { translation: ru },
    },
    fallbackLng: 'uz',
    supportedLngs: ['uz', 'en', 'ru'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'alsamos-language',
    },
    returnEmptyString: false,
  });

// Sync <html lang> on init + on every language change so the entire app reflects it instantly.
const applyHtmlLang = (lng: string) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
  }
};
applyHtmlLang(i18n.language || 'uz');
i18n.on('languageChanged', applyHtmlLang);

export default i18n;
