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

const MUSIC_TAG = '[MUSIC]';

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
