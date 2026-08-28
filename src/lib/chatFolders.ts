/**
 * Telegramdek chat papkalari (Chat Folders).
 *
 * Papkalar brauzerda saqlanadi va barcha oynalarda darhol yangilanadi.
 * Har bir papka chat turlari va holatlari bo'yicha filtr to'plamidan iborat.
 */

export type ChatFolderIcon =
  | 'all'
  | 'unread'
  | 'personal'
  | 'groups'
  | 'channels'
  | 'favorites'
  | 'work'
  | 'archive'
  | 'custom';

export interface ChatFolderFilters {
  /** Shaxsiy suhbatlar kirsinmi */
  includePrivate: boolean;
  /** Guruhlar kirsinmi */
  includeGroups: boolean;
  /** Kanallar kirsinmi */
  includeChannels: boolean;
  /** Faqat o'qilmagan chatlar */
  onlyUnread: boolean;
  /** Ovozi o'chirilgan chatlar chiqmasin */
  excludeMuted: boolean;
  /** Doim shu papkada ko'rinadigan chatlar */
  includedIds: string[];
  /** Bu papkadan chiqarib tashlangan chatlar */
  excludedIds: string[];
}

export interface ChatFolder {
  id: string;
  name: string;
  icon: ChatFolderIcon;
  filters: ChatFolderFilters;
}

/** Filtrlanmagan "Barchasi" papkasi - u hech qachon o'chirilmaydi */
export const ALL_FOLDER_ID = 'all';

export const STORAGE_KEY_FOLDERS = 'chat.folders.v1';
export const STORAGE_KEY_ACTIVE_FOLDER = 'chat.folders.active.v1';
export const CHAT_FOLDERS_EVENT = 'chat-folders-change';

/** Telegramda bepul foydalanuvchida 10 ta papka bo'ladi */
export const MAX_FOLDERS = 10;
export const MAX_FOLDER_NAME = 24;

export const DEFAULT_FOLDER_FILTERS: ChatFolderFilters = {
  includePrivate: true,
  includeGroups: true,
  includeChannels: true,
  onlyUnread: false,
  excludeMuted: false,
  includedIds: [],
  excludedIds: [],
};

export const ALL_FOLDER: ChatFolder = {
  id: ALL_FOLDER_ID,
  name: 'Barchasi',
  icon: 'all',
  filters: { ...DEFAULT_FOLDER_FILTERS },
};

/** Tayyor shablonlar - foydalanuvchi bir bosishda qo'shadi */
export const FOLDER_PRESETS: Array<{
  key: string;
  name: string;
  icon: ChatFolderIcon;
  filters: Partial<ChatFolderFilters>;
}> = [
  {
    key: 'unread',
    name: "O'qilmagan",
    icon: 'unread',
    filters: { onlyUnread: true },
  },
  {
    key: 'personal',
    name: 'Shaxsiy',
    icon: 'personal',
    filters: { includeGroups: false, includeChannels: false },
  },
  {
    key: 'groups',
    name: 'Guruhlar',
    icon: 'groups',
    filters: { includePrivate: false, includeChannels: false },
  },
  {
    key: 'channels',
    name: 'Kanallar',
    icon: 'channels',
    filters: { includePrivate: false, includeGroups: false },
  },
];

export const FOLDER_ICON_OPTIONS: ChatFolderIcon[] = [
  'custom',
  'unread',
  'personal',
  'groups',
  'channels',
  'favorites',
  'work',
  'archive',
];

/** Papka filtrlash uchun chatning yengil ko'rinishi */
export interface FolderChat {
  id: string;
  type: 'private' | 'group' | 'channel';
  unreadCount: number;
  isMuted?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
}

function normalizeFolder(input: unknown): ChatFolder | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  if (raw.id === ALL_FOLDER_ID) return null;

  const rawFilters = (raw.filters || {}) as Record<string, unknown>;
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;
  const ids = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

  return {
    id: raw.id,
    name: raw.name.slice(0, MAX_FOLDER_NAME),
    icon: (FOLDER_ICON_OPTIONS.includes(raw.icon as ChatFolderIcon)
      ? raw.icon
      : 'custom') as ChatFolderIcon,
    filters: {
      includePrivate: bool(rawFilters.includePrivate, true),
      includeGroups: bool(rawFilters.includeGroups, true),
      includeChannels: bool(rawFilters.includeChannels, true),
      onlyUnread: bool(rawFilters.onlyUnread, false),
      excludeMuted: bool(rawFilters.excludeMuted, false),
      includedIds: ids(rawFilters.includedIds),
      excludedIds: ids(rawFilters.excludedIds),
    },
  };
}

export function loadChatFolders(): ChatFolder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_FOLDERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeFolder)
      .filter((folder): folder is ChatFolder => folder !== null)
      .slice(0, MAX_FOLDERS);
  } catch {
    return [];
  }
}

export function saveChatFolders(folders: ChatFolder[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_FOLDERS,
      JSON.stringify(folders.slice(0, MAX_FOLDERS))
    );
    window.dispatchEvent(new CustomEvent(CHAT_FOLDERS_EVENT, { detail: folders }));
  } catch {
    // Xotira to'lgan bo'lsa ham ilova ishlashda davom etadi
  }
}

export function loadActiveFolderId(): string {
  if (typeof window === 'undefined') return ALL_FOLDER_ID;
  try {
    return window.localStorage.getItem(STORAGE_KEY_ACTIVE_FOLDER) || ALL_FOLDER_ID;
  } catch {
    return ALL_FOLDER_ID;
  }
}

export function saveActiveFolderId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_ACTIVE_FOLDER, id);
  } catch {
    // e'tiborsiz
  }
}

export function createFolderId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `folder-${Date.now().toString(36)}-${random}`;
}

export function folderFromPreset(presetKey: string): ChatFolder | null {
  const preset = FOLDER_PRESETS.find((item) => item.key === presetKey);
  if (!preset) return null;
  return {
    id: createFolderId(),
    name: preset.name,
    icon: preset.icon,
    filters: { ...DEFAULT_FOLDER_FILTERS, ...preset.filters },
  };
}

export function createEmptyFolder(name = 'Yangi papka'): ChatFolder {
  return {
    id: createFolderId(),
    name,
    icon: 'custom',
    filters: { ...DEFAULT_FOLDER_FILTERS },
  };
}

/** Papkada kamida bitta chat turi tanlangan bo'lishi kerak */
export function isFolderValid(folder: ChatFolder) {
  const { includePrivate, includeGroups, includeChannels, includedIds } = folder.filters;
  if (!folder.name.trim()) return false;
  return includePrivate || includeGroups || includeChannels || includedIds.length > 0;
}

export function matchesChatFolder(chat: FolderChat, folder: ChatFolder): boolean {
  if (folder.id === ALL_FOLDER_ID) return true;
  const f = folder.filters;

  if (f.excludedIds.includes(chat.id)) return false;
  if (f.includedIds.includes(chat.id)) return true;

  if (chat.type === 'private' && !f.includePrivate) return false;
  if (chat.type === 'group' && !f.includeGroups) return false;
  if (chat.type === 'channel' && !f.includeChannels) return false;

  if (f.onlyUnread && chat.unreadCount <= 0) return false;
  if (f.excludeMuted && chat.isMuted) return false;

  return true;
}

export function filterChatsByFolder<T extends FolderChat>(chats: T[], folder: ChatFolder): T[] {
  return chats.filter((chat) => matchesChatFolder(chat, folder));
}

/** Papka yonida ko'rinadigan o'qilmagan chatlar soni */
export function folderUnreadCount(chats: FolderChat[], folder: ChatFolder): number {
  return chats.reduce((total, chat) => {
    if (!matchesChatFolder(chat, folder)) return total;
    return chat.unreadCount > 0 ? total + 1 : total;
  }, 0);
}

export function moveFolder(folders: ChatFolder[], id: string, direction: -1 | 1): ChatFolder[] {
  const index = folders.findIndex((folder) => folder.id === id);
  if (index < 0) return folders;
  const target = index + direction;
  if (target < 0 || target >= folders.length) return folders;
  const next = [...folders];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
