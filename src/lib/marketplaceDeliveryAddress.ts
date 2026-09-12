export interface MarketplaceCheckoutAddressPatch {
  street: string;
  city: string;
  region: string;
}

const EMPTY_PATCH: MarketplaceCheckoutAddressPatch = {
  street: '',
  city: '',
  region: '',
};

const REGION_HINT = /\b(province|region|state|oblast|viloyat(?:i)?|respublika|republic|autonomous|shahri)\b|\bsh\.?$/i;
const COUNTRY_HINT = /\b(uzbekistan|o['ʻʼ’‘`]?zbekiston|kazakhstan|qozog['ʻʼ’‘`]?iston|kyrgyzstan|qirg['ʻʼ’‘`]?iziston|tajikistan|tojikiston|turkmenistan|turkmaniston|russia|rossiya|china|xitoy|turkey|turkiya|afghanistan|afg['ʻʼ’‘`]?oniston)\b/i;
const COORDINATE_LABEL = /^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$/;

function cleanParts(label: string) {
  const parts = label
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  // Some geocoders return `name + full address`, which can duplicate the
  // first street segment. Remove only that obvious duplicate; repeated city /
  // region names (for example Toshkent, Toshkent) are still meaningful.
  if (
    parts.length >= 4 &&
    parts[0].localeCompare(parts[1], undefined, { sensitivity: 'accent' }) === 0
  ) {
    parts.splice(1, 1);
  }

  if (parts.length >= 2 && COUNTRY_HINT.test(parts[parts.length - 1])) {
    parts.pop();
  }

  return parts;
}

/**
 * Converts the human-readable label produced by MarketplaceLocationPicker into
 * checkout form fields. The picker label is already reverse-geocoded, so this
 * stays instant/offline when checkout reacts to a newly selected map point.
 */
export function checkoutAddressFromLocationLabel(label: string | null | undefined): MarketplaceCheckoutAddressPatch {
  const raw = label?.trim() ?? '';
  if (!raw || COORDINATE_LABEL.test(raw)) return { ...EMPTY_PATCH };

  const parts = cleanParts(raw);
  if (parts.length === 0) return { ...EMPTY_PATCH };
  if (parts.length === 1) {
    return { street: parts[0], city: '', region: '' };
  }

  let regionIndex = -1;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (REGION_HINT.test(parts[index])) {
      regionIndex = index;
      break;
    }
  }

  if (regionIndex > 0) {
    const cityIndex = regionIndex - 1;
    return {
      street: parts.slice(0, cityIndex).join(', '),
      city: parts[cityIndex] ?? '',
      region: parts[regionIndex] ?? '',
    };
  }

  if (parts.length === 2) {
    return {
      street: parts[0],
      city: parts[1],
      region: '',
    };
  }

  return {
    street: parts.slice(0, -2).join(', '),
    city: parts[parts.length - 2] ?? '',
    region: parts[parts.length - 1] ?? '',
  };
}
