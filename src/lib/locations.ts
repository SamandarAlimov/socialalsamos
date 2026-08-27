/**
 * Location formatting helpers.
 *
 * Profiles store `location` as a short code (e.g. "UZ", "UZ-TK") or a free
 * text value ("Tashkent, UZ"). The UI must always show a human readable place
 * name in the user's current language instead of the raw code.
 */

export type LocaleCode = 'uz' | 'en' | 'ru';

const FALLBACK_LOCALE: LocaleCode = 'uz';

function normalizeLocale(lang?: string): LocaleCode {
  const base = (lang || '').toLowerCase().split('-')[0];
  if (base === 'en' || base === 'ru' || base === 'uz') return base;
  return FALLBACK_LOCALE;
}

/** ISO 3166-2 regions of Uzbekistan (Intl does not translate subdivisions). */
const UZ_REGIONS: Record<string, Record<LocaleCode, string>> = {
  'UZ-TK': { uz: "Toshkent shahri", en: 'Tashkent City', ru: 'город Ташкент' },
  'UZ-TO': { uz: 'Toshkent viloyati', en: 'Tashkent Region', ru: 'Ташкентская область' },
  'UZ-AN': { uz: 'Andijon', en: 'Andijan', ru: 'Андижан' },
  'UZ-BU': { uz: 'Buxoro', en: 'Bukhara', ru: 'Бухара' },
  'UZ-FA': { uz: "Farg'ona", en: 'Fergana', ru: 'Фергана' },
  'UZ-JI': { uz: 'Jizzax', en: 'Jizzakh', ru: 'Джизак' },
  'UZ-NG': { uz: 'Namangan', en: 'Namangan', ru: 'Наманган' },
  'UZ-NW': { uz: 'Navoiy', en: 'Navoiy', ru: 'Навои' },
  'UZ-QA': { uz: 'Qashqadaryo', en: 'Kashkadarya', ru: 'Кашкадарья' },
  'UZ-QR': { uz: "Qoraqalpog'iston", en: 'Karakalpakstan', ru: 'Каракалпакстан' },
  'UZ-SA': { uz: 'Samarqand', en: 'Samarkand', ru: 'Самарканд' },
  'UZ-SI': { uz: 'Sirdaryo', en: 'Sirdaryo', ru: 'Сырдарья' },
  'UZ-SU': { uz: 'Surxondaryo', en: 'Surkhandarya', ru: 'Сурхандарья' },
  'UZ-XO': { uz: 'Xorazm', en: 'Khorezm', ru: 'Хорезм' },
};

/** Uzbek country names (Intl has no complete uz region catalogue in browsers). */
const UZ_COUNTRY_NAMES: Record<string, string> = {
  UZ: "O'zbekiston",
  RU: 'Rossiya',
  KZ: "Qozog'iston",
  KG: "Qirg'iziston",
  TJ: 'Tojikiston',
  TM: 'Turkmaniston',
  AF: "Afg'oniston",
  AZ: 'Ozarbayjon',
  TR: 'Turkiya',
  US: 'AQSH',
  GB: 'Buyuk Britaniya',
  DE: 'Germaniya',
  FR: 'Fransiya',
  IT: 'Italiya',
  ES: 'Ispaniya',
  PL: 'Polsha',
  UA: 'Ukraina',
  BY: 'Belarus',
  AE: 'BAA',
  SA: 'Saudiya Arabistoni',
  QA: 'Qatar',
  KW: 'Quvayt',
  EG: 'Misr',
  IR: 'Iran',
  IQ: 'Iroq',
  PK: 'Pokiston',
  IN: 'Hindiston',
  CN: 'Xitoy',
  JP: 'Yaponiya',
  KR: 'Janubiy Koreya',
  MY: 'Malayziya',
  ID: 'Indoneziya',
  CA: 'Kanada',
  BR: 'Braziliya',
  AU: 'Avstraliya',
};

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
const SUBDIVISION_RE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

/** Translate an ISO 3166-1 alpha-2 country code into a readable name. */
export function getCountryName(code: string, lang?: string): string {
  const locale = normalizeLocale(lang);
  const upper = code.toUpperCase();

  if (locale === 'uz' && UZ_COUNTRY_NAMES[upper]) {
    return UZ_COUNTRY_NAMES[upper];
  }

  try {
    const intlLocale = locale === 'uz' ? 'en' : locale;
    const display = new Intl.DisplayNames([intlLocale], { type: 'region' });
    return display.of(upper) || UZ_COUNTRY_NAMES[upper] || upper;
  } catch {
    return UZ_COUNTRY_NAMES[upper] || upper;
  }
}

/** Translate an ISO 3166-2 subdivision code (e.g. "UZ-TK"). */
export function getRegionName(code: string, lang?: string): string | null {
  const locale = normalizeLocale(lang);
  const upper = code.toUpperCase();
  const region = UZ_REGIONS[upper];
  if (region) return region[locale];
  return null;
}

/**
 * Convert a stored profile location into a readable place name.
 *
 * "UZ"            -> "O'zbekiston"
 * "UZ-TK"         -> "Toshkent shahri"
 * "Chilonzor, UZ" -> "Chilonzor, O'zbekiston"
 *
 * Unknown free text is returned as-is so nothing is ever lost.
 */
export function formatLocation(value?: string | null, lang?: string): string | null {
  if (!value) return null;

  const raw = value.trim();
  if (!raw) return null;

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  const translated = parts.map((part) => {
    const upper = part.toUpperCase();

    if (SUBDIVISION_RE.test(upper)) {
      const region = getRegionName(upper, lang);
      if (region) return region;
      return getCountryName(upper.slice(0, 2), lang);
    }

    if (COUNTRY_CODE_RE.test(upper)) {
      return getCountryName(upper, lang);
    }

    return part;
  });

  // Remove duplicates such as "Toshkent shahri, Toshkent shahri".
  const unique = translated.filter(
    (item, index) => translated.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index,
  );

  return unique.join(', ');
}
