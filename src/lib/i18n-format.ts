import { formatDistanceToNow, formatDistanceToNowStrict, format as fmt } from 'date-fns';
import { uz, enUS, ru } from 'date-fns/locale';
import type { Locale } from 'date-fns';

const LOCALES: Record<string, Locale> = { uz, en: enUS, ru };

export function getDateLocale(lang?: string): Locale {
  const code = (lang || 'uz').split('-')[0];
  return LOCALES[code] || uz;
}

/** Relative time with proper uz/en/ru plural rules (handled by date-fns locale data). */
export function formatRelative(date: Date | string | number, lang?: string, addSuffix = true) {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix, locale: getDateLocale(lang) });
}

export function formatRelativeStrict(date: Date | string | number, lang?: string, addSuffix = true) {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return formatDistanceToNowStrict(d, { addSuffix, locale: getDateLocale(lang) });
}

export function formatDate(date: Date | string | number, pattern: string, lang?: string) {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return fmt(d, pattern, { locale: getDateLocale(lang) });
}

/** Locale-aware number formatting + compact (1.2K, 3.4M). */
export function formatNumber(value: number, lang?: string) {
  try {
    return new Intl.NumberFormat(lang || 'uz').format(value);
  } catch {
    return String(value);
  }
}

export function formatCompact(value: number, lang?: string) {
  try {
    return new Intl.NumberFormat(lang || 'uz', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  } catch {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return String(value);
  }
}

/** Plural-aware count using Intl.PluralRules + a translations map. */
export function pluralize(
  count: number,
  forms: { zero?: string; one: string; few?: string; many?: string; other: string },
  lang?: string
) {
  const code = (lang || 'uz').split('-')[0];
  try {
    const rule = new Intl.PluralRules(code).select(count);
    return (forms as Record<string, string>)[rule] || forms.other;
  } catch {
    return count === 1 ? forms.one : forms.other;
  }
}
