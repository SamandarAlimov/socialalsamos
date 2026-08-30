/**
 * Post matni ichida maxsus markerlar saqlanadi, masalan:
 *   [MUSIC]{"title":"...","artist":"...","audio_url":"..."}
 *
 * Ilgari bu marker foydalanuvchiga xom JSON ko'rinishida chiqib ketardi.
 * Bu modul markerni matndan ajratib, tuzilgan ma'lumot qaytaradi.
 */

export interface PostMusic {
  title: string;
  artist: string | null;
  coverUrl: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
}

export interface LegacyPostLocation {
  mode: 'place' | 'live';
  label: string | null;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  liveUntil: string | null;
  place: {
    name: string;
    address: string | null;
    category: string | null;
  } | null;
}

const MUSIC_TAG = '[MUSIC]';
const LOCATION_TAG = '[LOCATION]';

/** JSON obyektining yopiluvchi qavsini topadi (satr ichidagi qavslarni hisobga olmaydi). */
function findObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function normalizeMusic(raw: Record<string, unknown>): PostMusic | null {
  const title =
    str(raw.title) ?? str(raw.name) ?? str(raw.track) ?? str(raw.song);
  const audioUrl =
    str(raw.audio_url) ?? str(raw.audioUrl) ?? str(raw.url) ?? str(raw.src) ?? str(raw.preview_url);

  if (!title && !audioUrl) return null;

  return {
    title: title ?? 'Audio',
    artist: str(raw.artist) ?? str(raw.author) ?? str(raw.singer) ?? null,
    coverUrl:
      str(raw.cover_url) ?? str(raw.coverUrl) ?? str(raw.cover) ?? str(raw.artwork) ?? str(raw.image) ?? null,
    audioUrl,
    durationSeconds: num(raw.duration) ?? num(raw.duration_seconds) ?? null,
  };
}

/**
 * Matndan `[MUSIC]{...}` markerini ajratadi.
 * Marker buzuq bo'lsa ham xom JSON foydalanuvchiga ko'rinmaydi.
 */
export function parseMusicFromContent(content: string | null | undefined): {
  music: PostMusic | null;
  cleanContent: string;
} {
  if (!content) return { music: null, cleanContent: '' };

  const tagIndex = content.indexOf(MUSIC_TAG);
  if (tagIndex === -1) return { music: null, cleanContent: content };

  const jsonStart = content.indexOf('{', tagIndex + MUSIC_TAG.length);
  const jsonEnd = jsonStart === -1 ? -1 : findObjectEnd(content, jsonStart);

  // Marker bor, lekin JSON topilmadi yoki buzuq: markerni olib tashlaymiz.
  if (jsonStart === -1 || jsonEnd === -1) {
    const cleaned = (content.slice(0, tagIndex) + content.slice(tagIndex + MUSIC_TAG.length)).trim();
    return { music: null, cleanContent: cleaned };
  }

  const cleaned = (content.slice(0, tagIndex) + content.slice(jsonEnd + 1)).trim();

  try {
    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { music: normalizeMusic(parsed as Record<string, unknown>), cleanContent: cleaned };
    }
  } catch {
    // buzuq JSON: pastda faqat tozalangan matn qaytadi
  }

  return { music: null, cleanContent: cleaned };
}


function normalizeLocation(raw: Record<string, unknown>): LegacyPostLocation | null {
  const latitude = num(raw.latitude ?? raw.lat);
  const longitude = num(raw.longitude ?? raw.lng ?? raw.lon);
  if (latitude == null || longitude == null) return null;

  const rawPlace =
    raw.place && typeof raw.place === 'object' && !Array.isArray(raw.place)
      ? (raw.place as Record<string, unknown>)
      : null;

  const placeName = rawPlace ? str(rawPlace.name) : null;
  const place = rawPlace && placeName
    ? {
        name: placeName,
        address: str(rawPlace.address),
        category: str(rawPlace.category),
      }
    : null;

  return {
    mode: raw.mode === 'live' ? 'live' : 'place',
    label: str(raw.label) ?? place?.name ?? null,
    latitude,
    longitude,
    accuracyM: num(raw.accuracyM ?? raw.accuracy_m),
    liveUntil: str(raw.liveUntil ?? raw.live_until),
    place,
  };
}

export function parseLocationFromContent(content: string | null | undefined): {
  location: LegacyPostLocation | null;
  cleanContent: string;
} {
  if (!content) return { location: null, cleanContent: '' };

  const tagIndex = content.indexOf(LOCATION_TAG);
  if (tagIndex === -1) return { location: null, cleanContent: content };

  const jsonStart = content.indexOf('{', tagIndex + LOCATION_TAG.length);
  const jsonEnd = jsonStart === -1 ? -1 : findObjectEnd(content, jsonStart);

  if (jsonStart === -1 || jsonEnd === -1) {
    const cleaned = (content.slice(0, tagIndex) + content.slice(tagIndex + LOCATION_TAG.length)).trim();
    return { location: null, cleanContent: cleaned };
  }

  const cleaned = (content.slice(0, tagIndex) + content.slice(jsonEnd + 1)).trim();

  try {
    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        location: normalizeLocation(parsed as Record<string, unknown>),
        cleanContent: cleaned,
      };
    }
  } catch {
    // Buzuq legacy marker foydalanuvchiga ko'rinmasin.
  }

  return { location: null, cleanContent: cleaned };
}

export function appendLocationMarker(
  content: string,
  input: {
    mode: 'place' | 'live';
    latitude: number;
    longitude: number;
    label?: string | null;
    accuracyM?: number | null;
    liveUntil?: string | null;
    place?: {
      name: string;
      address?: string | null;
      category?: string | null;
    } | null;
  },
): string {
  const { cleanContent } = parseLocationFromContent(content);

  const marker = LOCATION_TAG + JSON.stringify({
    mode: input.mode,
    latitude: input.latitude,
    longitude: input.longitude,
    label: input.label ?? input.place?.name ?? null,
    accuracyM: input.accuracyM ?? null,
    liveUntil: input.liveUntil ?? null,
    place: input.place
      ? {
          name: input.place.name,
          address: input.place.address ?? null,
          category: input.place.category ?? null,
        }
      : null,
  });

  return cleanContent ? cleanContent + '\n' + marker : marker;
}

/** Sekundni `3:07` ko'rinishiga aylantiradi. */
export function formatTrackDuration(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/** Katta sonlarni qisqartiradi: 12 400 -> 12.4K */
export function formatCompactCount(count: number | null | undefined): string {
  const value = typeof count === 'number' && Number.isFinite(count) ? count : 0;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace('.0', '')}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace('.0', '')}K`;
  return String(value);
}
