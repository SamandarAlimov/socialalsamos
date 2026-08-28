/**
 * Bosqich D: interaktiv story/reel stikerlari uchun turlar va xavfsiz parser.
 *
 * Bazadan keladigan `config` — JSONB, ya’ni ishonchsiz ma’lumot. Shu sababli
 * har bir maydon shu yerda tekshiriladi va noto‘g‘ri yozuv jim tashlanadi
 * (UI hech qachon `undefined.map` ga urilmasligi kerak).
 */

export type StoryStickerType =
  | 'poll'
  | 'question'
  | 'quiz'
  | 'slider'
  | 'location'
  | 'music'
  | 'mention'
  | 'hashtag'
  | 'link'
  | 'countdown';

/** Javob qabul qiladigan turlar. */
export const INTERACTIVE_TYPES: StoryStickerType[] = ['poll', 'question', 'quiz', 'slider'];

export const MAX_STORY_STICKERS = 12;
export const MAX_OPTIONS = 4;
export const MAX_OPTION_LENGTH = 40;
export const MAX_PROMPT_LENGTH = 120;
export const MAX_ANSWER_LENGTH = 280;

export interface StoryStickerConfig {
  /** Poll, quiz, slider, question uchun savol/sarlavha matni. */
  prompt?: string;
  /** Poll va quiz variantlari. */
  options?: string[];
  /** Quiz uchun to‘g‘ri variant indeksi. */
  correctIndex?: number;
  /** Slayder uchun emoji va chegara yozuvlari. */
  emoji?: string;
  leftLabel?: string;
  rightLabel?: string;
  /** Joylashuv stikeri. */
  placeId?: string;
  placeName?: string;
  latitude?: number;
  longitude?: number;
  /** Musiqa stikeri. */
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  trackCoverUrl?: string;
  /** Mention / hashtag / link. */
  userId?: string;
  username?: string;
  hashtag?: string;
  url?: string;
  /** Countdown. */
  endsAt?: string;
  /** Ko‘rinish uslubi (light, dark, gradient...). */
  theme?: string;
}

export interface StorySticker {
  id: string;
  postId: string;
  mediaId: string | null;
  type: StoryStickerType;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z: number;
  /** Reel uchun ko‘rinish oynasi; `null` — doim ko‘rinadi. */
  startSeconds: number | null;
  endSeconds: number | null;
  config: StoryStickerConfig;
}

export interface StoryStickerResults {
  type: StoryStickerType;
  total: number;
  counts?: Record<string, number>;
  myChoice?: number | null;
  correctIndex?: number | null;
  average?: number;
  myValue?: number | null;
  answers?: Array<{ userId: string; text: string; createdAt: string }>;
}

const TYPES = new Set<string>([
  'poll',
  'question',
  'quiz',
  'slider',
  'location',
  'music',
  'mention',
  'hashtag',
  'link',
  'countdown',
]);

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function trimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > 0 ? text.slice(0, maxLength) : undefined;
}

/** `config` JSONB ni tozalab, faqat kutilgan maydonlarni qoldiradi. */
export function parseStickerConfig(raw: unknown): StoryStickerConfig {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;

  const options = Array.isArray(source.options)
    ? source.options
        .map((option) => trimmedString(option, MAX_OPTION_LENGTH))
        .filter((option): option is string => Boolean(option))
        .slice(0, MAX_OPTIONS)
    : undefined;

  const config: StoryStickerConfig = {
    prompt: trimmedString(source.prompt, MAX_PROMPT_LENGTH),
    options,
    correctIndex: optionalNumber(source.correctIndex) ?? undefined,
    emoji: trimmedString(source.emoji, 8),
    leftLabel: trimmedString(source.leftLabel, MAX_OPTION_LENGTH),
    rightLabel: trimmedString(source.rightLabel, MAX_OPTION_LENGTH),
    placeId: trimmedString(source.placeId, 64),
    placeName: trimmedString(source.placeName, 120),
    latitude: optionalNumber(source.latitude) ?? undefined,
    longitude: optionalNumber(source.longitude) ?? undefined,
    trackId: trimmedString(source.trackId, 64),
    trackTitle: trimmedString(source.trackTitle, 120),
    trackArtist: trimmedString(source.trackArtist, 120),
    trackCoverUrl: trimmedString(source.trackCoverUrl, 500),
    userId: trimmedString(source.userId, 64),
    username: trimmedString(source.username, 64),
    hashtag: trimmedString(source.hashtag, 64),
    url: trimmedString(source.url, 500),
    endsAt: trimmedString(source.endsAt, 40),
    theme: trimmedString(source.theme, 32),
  };

  // Bo‘sh maydonlarni tashlaymiz — JSONB toza qolsin.
  (Object.keys(config) as Array<keyof StoryStickerConfig>).forEach((key) => {
    if (config[key] === undefined) delete config[key];
  });

  return config;
}

/** Bazadan kelgan qatorni `StorySticker` ga aylantiradi; buzuq bo‘lsa `null`. */
export function parseStorySticker(raw: unknown): StorySticker | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const id = typeof row.id === 'string' ? row.id : null;
  const postId = typeof row.post_id === 'string' ? row.post_id : null;
  const type = typeof row.type === 'string' && TYPES.has(row.type) ? row.type : null;

  if (!id || !postId || !type) return null;

  return {
    id,
    postId,
    mediaId: typeof row.media_id === 'string' ? row.media_id : null,
    type: type as StoryStickerType,
    x: finiteNumber(Number(row.x), 0.5),
    y: finiteNumber(Number(row.y), 0.5),
    scale: finiteNumber(Number(row.scale), 0.6),
    rotation: finiteNumber(Number(row.rotation), 0),
    z: Math.trunc(finiteNumber(Number(row.z), 0)),
    startSeconds: optionalNumber(Number(row.start_seconds)),
    endSeconds: optionalNumber(Number(row.end_seconds)),
    config: parseStickerConfig(row.config),
  };
}

export function parseStoryStickers(rows: unknown): StorySticker[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(parseStorySticker)
    .filter((sticker): sticker is StorySticker => sticker !== null)
    .sort((a, b) => a.z - b.z);
}

/**
 * Reel uchun: stiker berilgan vaqtda ko‘rinadimi?
 * Oyna belgilanmagan bo‘lsa stiker doim ko‘rinadi.
 */
export function isVisibleAt(sticker: StorySticker, seconds: number): boolean {
  if (sticker.startSeconds !== null && seconds < sticker.startSeconds) return false;
  if (sticker.endSeconds !== null && seconds >= sticker.endSeconds) return false;
  return true;
}

/** Tahrirlashda ishlatiladigan bo‘sh konfiguratsiya shablonlari. */
export function defaultConfigFor(type: StoryStickerType): StoryStickerConfig {
  switch (type) {
    case 'poll':
      return { prompt: '', options: ['Ha', 'Yo‘q'] };
    case 'quiz':
      return { prompt: '', options: ['', ''], correctIndex: 0 };
    case 'slider':
      return { prompt: '', emoji: '❤️', leftLabel: '', rightLabel: '' };
    case 'question':
      return { prompt: 'Menga savol bering' };
    case 'countdown':
      return { prompt: '', endsAt: new Date(Date.now() + 86400000).toISOString() };
    default:
      return {};
  }
}

/** Saqlashdan oldingi tekshiruv: xato matnini qaytaradi yoki `null`. */
export function validateSticker(sticker: {
  type: StoryStickerType;
  config: StoryStickerConfig;
}): string | null {
  const { type, config } = sticker;

  if (type === 'poll' || type === 'quiz') {
    const options = (config.options ?? []).filter((option) => option.trim().length > 0);
    if (options.length < 2) return 'Kamida 2 ta variant kerak';
    if (options.length > MAX_OPTIONS) return `Ko‘pi bilan ${MAX_OPTIONS} ta variant`;

    if (type === 'quiz') {
      const index = config.correctIndex;
      if (index === undefined || index < 0 || index >= options.length) {
        return 'To‘g‘ri javobni belgilang';
      }
    }
  }

  if (type === 'question' && !(config.prompt ?? '').trim()) {
    return 'Savol matnini yozing';
  }

  if (type === 'link' && !(config.url ?? '').trim()) {
    return 'Havolani kiriting';
  }

  if (type === 'hashtag' && !(config.hashtag ?? '').trim()) {
    return 'Hashtag kiriting';
  }

  if (type === 'mention' && !(config.username ?? '').trim()) {
    return 'Foydalanuvchini tanlang';
  }

  if (type === 'location' && config.latitude === undefined) {
    return 'Joylashuvni tanlang';
  }

  if (type === 'music' && !(config.trackId ?? '').trim()) {
    return 'Musiqani tanlang';
  }

  if (type === 'countdown' && !config.endsAt) {
    return 'Tugash vaqtini belgilang';
  }

  return null;
}
