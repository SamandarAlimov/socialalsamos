import type { PostLocation } from '@/hooks/usePostLocation';

/**
 * Post matni ichida maxsus markerlar saqlanadi, masalan:
 *   [MUSIC]{"title":"...","artist":"...","audio_url":"..."}
 *   [LOCATION]{"latitude":41.31,"longitude":69.24}
 *
 * Bundan tashqari juda eski postlarda joylashuv oddiy emoji qatori bo'lib
 * yozilgan: "\uD83D\uDCCD Current location". Bu modul har uchala shaklni ham
 * matndan ajratib, tuzilgan ma'lumot qaytaradi.
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

export interface LocationParseResult {
  /** Koordinatasi bor joylashuv (karta + xarita bilan chiziladi). */
  location: LegacyPostLocation | null;
  /** Koordinatasiz eski joylashuv nomi (faqat nom bilan karta chiziladi). */
  labelOnly: string | null;
  cleanContent: string;
}

const MUSIC_TAG = '[MUSIC]';
const LOCATION_TAG = '[LOCATION]';
/** \uD83D\uDCCD emojisi (round pushpin). */
const LOCATION_EMOJI = '\uD83D\uDCCD';
const LEGACY_LOCATION_PREFIX = 'LOCATION:';

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
    str(raw.title) ?? str(raw.name) ?? str(raw.track) ?? str(raw.song) ?? str(raw.fileName) ?? str(raw.file_name);
  const audioUrl =
    str(raw.audio_url) ?? str(raw.audioUrl) ?? str(raw.url) ?? str(raw.src) ?? str(raw.preview_url);

  if (!title && !audioUrl) return null;

  return {
    title: title ?? 'Audio',
    artist: str(raw.artist) ?? str(raw.author) ?? str(raw.singer) ?? null,
    coverUrl:
      str(raw.cover_url) ?? str(raw.coverUrl) ?? str(raw.cover) ?? str(raw.artwork) ?? str(raw.image) ?? null,
    audioUrl,
    durationSeconds:
      num(raw.duration) ?? num(raw.duration_seconds) ?? num(raw.durationSeconds) ?? null,
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

/** "41.31, 69.24" ko'rinishidagi koordinatani ajratadi. */
function parseCoordinatePair(text: string): { latitude: number; longitude: number } | null {
  const match = text.match(/(-?\d{1,3}(?:[.,]\d+)?)\s*[,;|]\s*(-?\d{1,3}(?:[.,]\d+)?)/);
  if (!match) return null;

  const latitude = Number(match[1].replace(',', '.'));
  const longitude = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return { latitude, longitude };
}

/** Ingliz tilidagi eski standart nomlarni tushunarli qilib beradi. */
function normalizeLegacyLabel(label: string | null): string | null {
  if (!label) return null;
  const lower = label.toLowerCase();
  if (lower === 'current location' || lower === 'my location' || lower === 'location') {
    return 'Joriy joylashuv';
  }
  return label;
}

/**
 * Eng eski postlarda joylashuv shunchaki emoji qatori edi:
 *   "\uD83D\uDCCD Current location"  yoki  "\uD83D\uDCCD LOCATION:41.31,69.24"
 * Bu funksiya shu qatorni matndan olib tashlab, tuzilgan holda qaytaradi.
 */
export function parseEmojiLocationFromContent(
  content: string | null | undefined,
): LocationParseResult {
  if (!content) return { location: null, labelOnly: null, cleanContent: '' };
  if (!content.includes(LOCATION_EMOJI)) {
    return { location: null, labelOnly: null, cleanContent: content };
  }

  const lines = content.split('\n');
  let raw: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const index = lines[i].indexOf(LOCATION_EMOJI);
    if (index === -1) continue;

    raw = lines[i].slice(index + LOCATION_EMOJI.length).trim();
    lines[i] = lines[i].slice(0, index).trimEnd();
    break;
  }

  const cleanContent = lines
    .filter((line, index) => line.trim().length > 0 || index === 0)
    .join('\n')
    .trim();

  if (raw == null) return { location: null, labelOnly: null, cleanContent };

  let text = raw;
  if (text.toUpperCase().startsWith(LEGACY_LOCATION_PREFIX)) {
    text = text.slice(LEGACY_LOCATION_PREFIX.length).trim();
  }

  const coords = parseCoordinatePair(text);
  if (coords) {
    const label = normalizeLegacyLabel(
      text.replace(/(-?\d{1,3}(?:[.,]\d+)?)\s*[,;|]\s*(-?\d{1,3}(?:[.,]\d+)?)/, '').trim() || null,
    );

    return {
      location: {
        mode: 'place',
        label,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyM: null,
        liveUntil: null,
        place: null,
      },
      labelOnly: null,
      cleanContent,
    };
  }

  const labelOnly = normalizeLegacyLabel(text || null) ?? 'Joylashuv';
  return { location: null, labelOnly, cleanContent };
}

export function parseLocationFromContent(
  content: string | null | undefined,
): LocationParseResult {
  if (!content) return { location: null, labelOnly: null, cleanContent: '' };

  const tagIndex = content.indexOf(LOCATION_TAG);

  // Yangi marker yo'q: eski emoji qatorini sinab ko'ramiz.
  if (tagIndex === -1) return parseEmojiLocationFromContent(content);

  const jsonStart = content.indexOf('{', tagIndex + LOCATION_TAG.length);
  const jsonEnd = jsonStart === -1 ? -1 : findObjectEnd(content, jsonStart);

  if (jsonStart === -1 || jsonEnd === -1) {
    const cleaned = (content.slice(0, tagIndex) + content.slice(tagIndex + LOCATION_TAG.length)).trim();
    return parseEmojiLocationFromContent(cleaned);
  }

  const cleaned = (content.slice(0, tagIndex) + content.slice(jsonEnd + 1)).trim();

  try {
    const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const location = normalizeLocation(parsed as Record<string, unknown>);
      if (location) {
        const rest = parseEmojiLocationFromContent(cleaned);
        return { location, labelOnly: null, cleanContent: rest.cleanContent };
      }

      // Koordinata yo'q, lekin nom bo'lishi mumkin.
      const raw = parsed as Record<string, unknown>;
      const rawPlace =
        raw.place && typeof raw.place === 'object' && !Array.isArray(raw.place)
          ? (raw.place as Record<string, unknown>)
          : null;
      const labelOnly = normalizeLegacyLabel(
        str(raw.label) ?? str(raw.name) ?? (rawPlace ? str(rawPlace.name) : null),
      );
      const rest = parseEmojiLocationFromContent(cleaned);

      return {
        location: rest.location,
        labelOnly: labelOnly ?? rest.labelOnly,
        cleanContent: rest.cleanContent,
      };
    }
  } catch {
    // Buzuq legacy marker foydalanuvchiga ko'rinmasin.
  }

  return parseEmojiLocationFromContent(cleaned);
}

export function legacyLocationToPostLocation(
  postId: string,
  location: LegacyPostLocation,
): PostLocation {
  return {
    id: 'legacy-location:' + postId,
    post_id: postId,
    place_id: null,
    // Legacy marker static snapshot: realtime DB jadvali mavjud bo'lmaganda
    // foydalanuvchiga noto'g'ri "Live" holatini ko'rsatmaymiz.
    mode: 'place',
    label: location.label,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy_m: location.accuracyM,
    live_until: null,
    updated_at: new Date(0).toISOString(),
    place: location.place
      ? {
          id: 'legacy-place:' + postId,
          name: location.place.name,
          address: location.place.address,
          category: location.place.category,
        }
      : null,
  };
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
