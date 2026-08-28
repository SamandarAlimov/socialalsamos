/**
 * Telegramdek bildirishnoma sozlamalari.
 *
 * Tovushlar WebAudio API bilan sintez qilinadi, shuning uchun hech qanday
 * audio fayl (assets) kerak emas - bu Vercel deploy uchun ham eng xavfsiz yo'l.
 */

export type NotificationTone = 'none' | 'standard' | 'signal' | 'soft' | 'pop' | 'chord';

export type NotificationSettings = {
  /** Kiruvchi xabar tovushi */
  messageTone: NotificationTone;
  /** Guruh/kanal xabarlari tovushi */
  groupTone: NotificationTone;
  /** Xabar yuborilganda eshitiladigan tovush */
  sentTone: NotificationTone;
  /** Chat ochiq bo'lganda ham tovush chiqarish */
  inAppSounds: boolean;
  /** Tebranish (mobil) */
  vibrate: boolean;
  /** Bildirishnomada xabar matnini ko'rsatish */
  showPreview: boolean;
  /** Faqat mening ismim eslatilganda bildirish (guruhlar) */
  mentionsOnly: boolean;
  /** Tungi jimlik jadvali */
  quietHoursEnabled: boolean;
  /** "HH:mm" */
  quietFrom: string;
  /** "HH:mm" */
  quietTo: string;
  /** Tovush balandligi 0..1 */
  volume: number;
};

export const STORAGE_KEY_NOTIFICATIONS = 'chat.notifications.v1';
export const NOTIFICATION_SETTINGS_EVENT = 'chat-notifications-change';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  messageTone: 'standard',
  groupTone: 'soft',
  sentTone: 'pop',
  inAppSounds: true,
  vibrate: true,
  showPreview: true,
  mentionsOnly: false,
  quietHoursEnabled: false,
  quietFrom: '23:00',
  quietTo: '07:00',
  volume: 0.6,
};

export const TONE_LABELS: Record<NotificationTone, string> = {
  none: "Yo\u2018q",
  standard: 'Standart',
  signal: 'Signal',
  soft: 'Yumshoq',
  pop: 'Pop',
  chord: 'Akkord',
};

export const TONE_ORDER: NotificationTone[] = ['standard', 'signal', 'soft', 'pop', 'chord', 'none'];

/* ------------------------------------------------------------------ *
 * Saqlash / o'qish
 * ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTone(value: unknown, fallback: NotificationTone): NotificationTone {
  return typeof value === 'string' && value in TONE_LABELS ? (value as NotificationTone) : fallback;
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  const base = DEFAULT_NOTIFICATION_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...base };
  const input = raw as Partial<NotificationSettings>;
  return {
    messageTone: normalizeTone(input.messageTone, base.messageTone),
    groupTone: normalizeTone(input.groupTone, base.groupTone),
    sentTone: normalizeTone(input.sentTone, base.sentTone),
    inAppSounds: typeof input.inAppSounds === 'boolean' ? input.inAppSounds : base.inAppSounds,
    vibrate: typeof input.vibrate === 'boolean' ? input.vibrate : base.vibrate,
    showPreview: typeof input.showPreview === 'boolean' ? input.showPreview : base.showPreview,
    mentionsOnly: typeof input.mentionsOnly === 'boolean' ? input.mentionsOnly : base.mentionsOnly,
    quietHoursEnabled:
      typeof input.quietHoursEnabled === 'boolean' ? input.quietHoursEnabled : base.quietHoursEnabled,
    quietFrom: normalizeTime(input.quietFrom, base.quietFrom),
    quietTo: normalizeTime(input.quietTo, base.quietTo),
    volume: typeof input.volume === 'number' ? clamp(input.volume, 0, 1) : base.volume,
  };
}

export function loadNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_NOTIFICATION_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    return normalizeNotificationSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function saveNotificationSettings(settings: NotificationSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(settings));
  } catch {
    // storage to'lgan bo'lishi mumkin - jim o'tamiz
  }
  window.dispatchEvent(new CustomEvent(NOTIFICATION_SETTINGS_EVENT, { detail: settings }));
}

export function isDefaultNotificationSettings(settings: NotificationSettings) {
  return JSON.stringify(settings) === JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS);
}

/* ------------------------------------------------------------------ *
 * Tungi jimlik
 * ------------------------------------------------------------------ */

function minutesOfDay(time: string) {
  const [h, m] = time.split(':').map((part) => Number.parseInt(part, 10));
  return h * 60 + m;
}

/** Hozir tungi jimlik oynasi ichidamizmi (yarim kechadan o'tishni ham hisoblaydi) */
export function isQuietHours(settings: NotificationSettings, now: Date = new Date()): boolean {
  if (!settings.quietHoursEnabled) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const from = minutesOfDay(settings.quietFrom);
  const to = minutesOfDay(settings.quietTo);
  if (from === to) return false;
  return from < to ? current >= from && current < to : current >= from || current < to;
}

/* ------------------------------------------------------------------ *
 * Per-chat sukut muddatlari (Telegramdek: 1 soat / 8 soat / 2 kun / abadiy)
 * ------------------------------------------------------------------ */

export type MuteDurationKey = '1h' | '8h' | '2d' | 'forever';

export const MUTE_DURATIONS: Array<{ key: MuteDurationKey; label: string; hours: number | null }> = [
  { key: '1h', label: '1 soat', hours: 1 },
  { key: '8h', label: '8 soat', hours: 8 },
  { key: '2d', label: '2 kun', hours: 48 },
  { key: 'forever', label: 'Abadiy', hours: null },
];

const STORAGE_KEY_MUTED_UNTIL = 'chat.mutedUntil.v1';

type MutedUntilMap = Record<string, string>;

function loadMutedMap(): MutedUntilMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_MUTED_UNTIL);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as MutedUntilMap) : {};
  } catch {
    return {};
  }
}

function saveMutedMap(map: MutedUntilMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_MUTED_UNTIL, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** Chatni belgilangan muddatga sukut qiladi. `null` -> abadiy. */
export function setChatMutedUntil(chatId: string, hours: number | null) {
  const map = loadMutedMap();
  if (hours === null) {
    delete map[chatId];
  } else {
    map[chatId] = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  }
  saveMutedMap(map);
}

export function clearChatMutedUntil(chatId: string) {
  const map = loadMutedMap();
  delete map[chatId];
  saveMutedMap(map);
}

/** Vaqtincha sukut tugagan bo'lsa `null` qaytaradi va yozuvni tozalaydi. */
export function getChatMutedUntil(chatId: string): Date | null {
  const map = loadMutedMap();
  const value = map[chatId];
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    delete map[chatId];
    saveMutedMap(map);
    return null;
  }
  return date;
}

/** Vaqtinchalik sukut hali kuchdami */
export function isChatTemporarilyMuted(chatId: string): boolean {
  return getChatMutedUntil(chatId) !== null;
}

/** "3 soat 20 daqiqa qoldi" ko'rinishidagi matn */
export function formatMuteRemaining(until: Date, now: Date = new Date()): string {
  const diffMinutes = Math.max(0, Math.round((until.getTime() - now.getTime()) / 60000));
  const days = Math.floor(diffMinutes / (60 * 24));
  const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
  const minutes = diffMinutes % 60;
  if (days > 0) return `${days} kun ${hours} soat qoldi`;
  if (hours > 0) return `${hours} soat ${minutes} daqiqa qoldi`;
  return `${minutes} daqiqa qoldi`;
}

/* ------------------------------------------------------------------ *
 * Tovush sintezi (WebAudio) - hech qanday fayl kerak emas
 * ------------------------------------------------------------------ */

type ToneStep = { freq: number; start: number; duration: number; gain?: number; type?: OscillatorType };

const TONE_RECIPES: Record<Exclude<NotificationTone, 'none'>, ToneStep[]> = {
  standard: [
    { freq: 880, start: 0, duration: 0.12 },
    { freq: 1320, start: 0.1, duration: 0.16 },
  ],
  signal: [
    { freq: 1568, start: 0, duration: 0.07, type: 'square', gain: 0.5 },
    { freq: 1568, start: 0.11, duration: 0.07, type: 'square', gain: 0.5 },
  ],
  soft: [
    { freq: 523.25, start: 0, duration: 0.22, type: 'sine', gain: 0.7 },
    { freq: 659.25, start: 0.08, duration: 0.26, type: 'sine', gain: 0.5 },
  ],
  pop: [{ freq: 1046.5, start: 0, duration: 0.08, type: 'triangle' }],
  chord: [
    { freq: 523.25, start: 0, duration: 0.3, type: 'sine' },
    { freq: 659.25, start: 0.04, duration: 0.3, type: 'sine' },
    { freq: 783.99, start: 0.08, duration: 0.32, type: 'sine' },
  ],
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume().catch(() => undefined);
  }
  return audioContext;
}

/** Berilgan tonni darhol chalish (preview yoki real bildirishnoma uchun) */
export function playNotificationTone(tone: NotificationTone, volume = 0.6) {
  if (tone === 'none' || volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const recipe = TONE_RECIPES[tone];
  if (!recipe) return;

  const master = ctx.createGain();
  master.gain.value = Math.min(1, Math.max(0, volume)) * 0.35;
  master.connect(ctx.destination);

  const now = ctx.currentTime;
  recipe.forEach((step) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = step.type ?? 'sine';
    osc.frequency.value = step.freq;

    const peak = step.gain ?? 1;
    const startAt = now + step.start;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + step.duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(startAt);
    osc.stop(startAt + step.duration + 0.02);
  });
}

export type IncomingSoundContext = {
  isGroup?: boolean;
  chatId?: string;
  isChatOpen?: boolean;
  isMention?: boolean;
};

/**
 * Kiruvchi xabar uchun tovush + tebranishni sozlamalarga muvofiq ijro etadi.
 * Sukut, tungi jimlik va "faqat eslatmalar" qoidalari shu yerda tekshiriladi.
 */
export function playIncomingMessageSound(
  settings: NotificationSettings,
  context: IncomingSoundContext = {}
): boolean {
  if (isQuietHours(settings)) return false;
  if (context.chatId && isChatTemporarilyMuted(context.chatId)) return false;
  if (context.isGroup && settings.mentionsOnly && !context.isMention) return false;
  if (context.isChatOpen && !settings.inAppSounds) return false;

  const tone = context.isGroup ? settings.groupTone : settings.messageTone;
  if (tone === 'none') return false;

  playNotificationTone(tone, settings.volume);
  if (settings.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate?.(context.isGroup ? 15 : 25);
    } catch {
      // ignore
    }
  }
  return true;
}

/** Xabar yuborilganda chalinadigan yengil tovush */
export function playSentMessageSound(settings: NotificationSettings) {
  if (!settings.inAppSounds || isQuietHours(settings)) return;
  playNotificationTone(settings.sentTone, settings.volume * 0.7);
}
