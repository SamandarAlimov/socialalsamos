export type ChatAccent = 'green' | 'blue' | 'violet' | 'rose' | 'graphite' | 'custom';

export const CHAT_ACCENT_STORAGE_KEY = 'alsamos.chat-accent';
export const CHAT_ACCENT_CUSTOM_COLOR_KEY = 'alsamos.chat-accent.custom-color';
export const DEFAULT_CUSTOM_CHAT_COLOR = '#16a34a';

export const CHAT_ACCENTS: Array<{
  id: Exclude<ChatAccent, 'custom'>;
  label: string;
  description: string;
  swatchClass: string;
}> = [
  {
    id: 'green',
    label: 'Yashil',
    description: 'Standart — chuqur va professional',
    swatchClass: 'bg-emerald-700 dark:bg-emerald-600',
  },
  {
    id: 'blue',
    label: "Ko'k",
    description: 'Klassik messenjer uslubi',
    swatchClass: 'bg-sky-500',
  },
  {
    id: 'violet',
    label: 'Binafsha',
    description: 'Yumshoq shaxsiy aksent',
    swatchClass: 'bg-violet-500',
  },
  {
    id: 'rose',
    label: 'Pushti',
    description: 'Iliq shaxsiy aksent',
    swatchClass: 'bg-rose-500',
  },
  {
    id: 'graphite',
    label: 'Grafit',
    description: "To'liq neytral variant",
    swatchClass: 'bg-zinc-600 dark:bg-zinc-400',
  },
];

export function normalizeChatAccent(value: string | null | undefined): ChatAccent {
  return [...CHAT_ACCENTS.map((item) => item.id), 'custom'].includes(value as ChatAccent)
    ? (value as ChatAccent)
    : 'green';
}

function normalizeHex(value: string | null | undefined): string {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return DEFAULT_CUSTOM_CHAT_COLOR;
  return value.toLowerCase();
}

function hexToHue(hex: string): number {
  const clean = normalizeHex(hex).slice(1);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 220;

  let hue = 0;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);

  return Math.round(hue < 0 ? hue + 360 : hue);
}

export function getStoredCustomChatColor(): string {
  if (typeof window === 'undefined') return DEFAULT_CUSTOM_CHAT_COLOR;
  return normalizeHex(window.localStorage.getItem(CHAT_ACCENT_CUSTOM_COLOR_KEY));
}

export function applyChatAccent(accent: ChatAccent) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.chatAccent = accent;
  if (accent === 'custom') {
    root.style.setProperty('--chat-custom-hue', String(hexToHue(getStoredCustomChatColor())));
  } else {
    root.style.removeProperty('--chat-custom-hue');
  }
}

export function getStoredChatAccent(): ChatAccent {
  if (typeof window === 'undefined') return 'green';
  return normalizeChatAccent(window.localStorage.getItem(CHAT_ACCENT_STORAGE_KEY));
}

export function setStoredChatAccent(accent: ChatAccent) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CHAT_ACCENT_STORAGE_KEY, accent);
  }
  applyChatAccent(accent);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('alsamos:chat-accent', { detail: accent }));
  }
}

export function setStoredCustomChatColor(color: string) {
  const normalized = normalizeHex(color);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CHAT_ACCENT_CUSTOM_COLOR_KEY, normalized);
    window.localStorage.setItem(CHAT_ACCENT_STORAGE_KEY, 'custom');
  }
  applyChatAccent('custom');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('alsamos:chat-accent', { detail: 'custom' as ChatAccent }));
  }
}
