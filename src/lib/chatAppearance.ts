/**
 * Chat ko'rinishi sozlamalari (Telegramdagi "Message text size" va
 * "Message corners" kabi). Qiymatlar shu qurilmada localStorage'da saqlanadi.
 */

export interface ChatAppearance {
  /** Xabar matni o'lchami, px (13-22) */
  fontSize: number;
  /** Xabar puffagi burchaklari, px (2-22) */
  corners: number;
  /** Energiya tejash: animatsiyalar va o'tishlar cheklanadi */
  energySaver: boolean;
}

export const STORAGE_KEY_APPEARANCE = 'chat.appearance.v1';
export const CHAT_APPEARANCE_EVENT = 'chat-appearance-change';

export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  fontSize: 15,
  corners: 16,
  energySaver: false,
};

export const FONT_SIZE_MIN = 13;
export const FONT_SIZE_MAX = 22;
export const CORNERS_MIN = 2;
export const CORNERS_MAX = 22;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalize(value: Partial<ChatAppearance> | null | undefined): ChatAppearance {
  return {
    fontSize: clamp(value?.fontSize ?? DEFAULT_CHAT_APPEARANCE.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX),
    corners: clamp(value?.corners ?? DEFAULT_CHAT_APPEARANCE.corners, CORNERS_MIN, CORNERS_MAX),
    energySaver: Boolean(value?.energySaver),
  };
}

export function readChatAppearance(): ChatAppearance {
  if (typeof window === 'undefined') return DEFAULT_CHAT_APPEARANCE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_APPEARANCE);
    if (!raw) return DEFAULT_CHAT_APPEARANCE;
    return normalize(JSON.parse(raw) as Partial<ChatAppearance>);
  } catch {
    return DEFAULT_CHAT_APPEARANCE;
  }
}

export function writeChatAppearance(value: Partial<ChatAppearance>): ChatAppearance {
  const next = normalize({ ...readChatAppearance(), ...value });

  try {
    window.localStorage.setItem(STORAGE_KEY_APPEARANCE, JSON.stringify(next));
  } catch {
    // saqlash imkoni bo'lmasa ham UI ishlashda davom etadi
  }

  window.dispatchEvent(new CustomEvent<ChatAppearance>(CHAT_APPEARANCE_EVENT, { detail: next }));
  return next;
}

/** Standart holatga qaytarish */
export function resetChatAppearance(): ChatAppearance {
  return writeChatAppearance(DEFAULT_CHAT_APPEARANCE);
}

export function isAppearanceDefault(value: ChatAppearance): boolean {
  return (
    value.fontSize === DEFAULT_CHAT_APPEARANCE.fontSize &&
    value.corners === DEFAULT_CHAT_APPEARANCE.corners &&
    value.energySaver === DEFAULT_CHAT_APPEARANCE.energySaver
  );
}

/** CSS o'zgaruvchilari */
export function appearanceCssVars(value: ChatAppearance): Record<string, string> {
  return {
    '--chat-font-size': value.fontSize + 'px',
    '--chat-line-height': Math.round(value.fontSize * 1.35) + 'px',
    '--chat-corners': value.corners + 'px',
    '--chat-corners-tail': Math.max(4, Math.round(value.corners / 3)) + 'px',
  };
}

/** Preview uchun bitta puffak uslubi */
export function bubblePreviewStyle(value: ChatAppearance): React.CSSProperties {
  return {
    fontSize: value.fontSize + 'px',
    lineHeight: Math.round(value.fontSize * 1.35) + 'px',
    borderRadius: value.corners + 'px',
  };
}
