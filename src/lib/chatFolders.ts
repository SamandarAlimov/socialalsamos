/**
 * Chat papkalari (Telegramdagi "Folders" / "Jildlar").
 *
 * Papkalar brauzerda saqlanadi va barcha oynalar bilan event orqali
 * sinxronlanadi. Har bir papkada turlar bo'yicha filtr, o'qilmaganlar
 * filtri va qo'lda qo'shilgan/chiqarilgan chatlar bo'lishi mumkin.
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
  includePrivate: boolean;
  includeGroups: boolean;
  includeChannels: boolean;
  onlyUnread: boolean;
  excludeMuted: boolean;
  /** Filtrdan qat'i nazar papkaga majburan kiradigan chatlar */
  includedIds: string[];
  /** Papkadan majburan chiqarilgan chatlar */
  excludedIds: string[];
}

export interface ChatFolder {
  id: string;
  name: string;
  icon: ChatFolderIcon;
  filters: ChatFolderFilters;
}

export interface FolderChat {
  id: string;
  type: 'private' | 'group' | 'channel';
  unreadCount: number;
  isMuted?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
}

export const ALL_FOLDER_ID = 'all';
export const STORAGE_KEY_FOLDERS = 'chat.folders.v1';
export const STORAGE_KEY_ACTIVE_FOLDER = 'chat.folders.active.v1';
export const CHAT_FOLDERS_EVENT = 'chat-folders-change';
export const MAX_FOLDERS = 10;
export const MAX_FOLDER_NAME = 24;

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

export const DEFAULT_FILTERS: ChatFolderFilters = {
  includePrivate: true,
  includeGroups: true,
  includeChannels: true,
  onlyUnread: false,
  excludeMuted: false,
  includedIds: [],
  excludedIds: [],
};

/** "Barchasi" - o'chirilmaydigan asosiy varaq */
export const ALL_FOLDER: ChatFolder = {
  id: ALL_FOLDER_ID,
  name: 'Barchasi',
  icon: 'all',
  filters: { ...DEFAULT_FILTERS },
};

export interface FolderPreset {
  key: string;
  name: string;
  icon: ChatFolderIcon;
  filters: ChatFolderFilters;
}

export const FOLDER_PRESETS: FolderPreset[] = [
  {
    key: 'unread',
    name: "O'qilmagan",
    icon: 'unread',
    filters: { ...DEFAULT_FILTERS, onlyUnread: true },
  },
  {
    key: 'personal',
    name: 'Shaxsiy',
    icon: 'personal',
    filters: {
      ...DEFAULT_FILTERS,
      includeGroups: false,
      includeChannels: false,
    },
  },
  {
    key: 'groups',
    name: 'Guruhlar',
    icon: 'groups',
    filters: {
      ...DEFAULT_FILTERS,
      includePrivate: false,
      includeChannels: false,
    },
  },
  {
    key: 'channels',
    name: 'Kanallar',
    icon: 'channels',
    filters: {
      ...DEFAULT_FILTERS,
      includePrivate: false,
      includeGroups: false,
    },
  },
  {
    key: 'favorites',
    name: 'Muhim',
    icon: 'favorites',
    filters: {
      ...DEFAULT_FILTERS,
      includePrivate: false,
      includeGroups: false,
      includeChannels: false,
    },
  },
];

export function createFolderId(): string {
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeFilters(input: unknown): ChatFolderFilters {
  const raw = (input || {}) as Partial<ChatFolderFilters>;
  return {
    includePrivate: raw.includePrivate !== false,
    includeGroups: raw.includeGroups !== false,
    includeChannels: raw.includeChannels !== false,
    onlyUnread: raw.onlyUnread === true,
    excludeMuted: raw.excludeMuted === true,
    includedIds: Array.isArray(raw.includedIds) ? raw.includedIds.filter(Boolean) : [],
    excludedIds: Array.isArray(raw.excludedIds) ? raw.excludedIds.filter(Boolean) : [],
  };
}

function normalizeFolder(input: unknown): ChatFolder | null {
  const raw = (input || {}) as Partial<ChatFolder>;
  if (!raw.id || raw.id === ALL_FOLDER_ID) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Papka';
  const icon = (FOLDER_ICON_OPTIONS.includes(raw.icon as ChatFolderIcon)
    ? raw.icon
    : 'custom') as ChatFolderIcon;
  return {
    id: raw.id,
    name: name.slice(0, MAX_FOLDER_NAME),
    icon,
    filters: normalizeFilters(raw.filters),
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

export function saveChatFolders(folders: ChatFolder[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_FOLDERS,
      JSON.stringify(folders.slice(0, MAX_FOLDERS))
    );
    window.dispatchEvent(new CustomEvent(CHAT_FOLDERS_EVENT, { detail: folders }));
  } catch {
    // saqlash imkoni bo'lmasa jimgina davom etamiz
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

export function saveActiveFolderId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_ACTIVE_FOLDER, id);
  } catch {
    // e'tibor bermaymiz
  }
}

/** Chat papkaga tushadimi? */
export function matchesChatFolder(chat: FolderChat, folder: ChatFolder): boolean {
  if (!folder || folder.id === ALL_FOLDER_ID) return true;

  const filters = folder.filters;
  if (filters.excludedIds.includes(chat.id)) return false;
  if (filters.includedIds.includes(chat.id)) return true;

  if (chat.type === 'private' && !filters.includePrivate) return false;
  if (chat.type === 'group' && !filters.includeGroups) return false;
  if (chat.type === 'channel' && !filters.includeChannels) return false;

  if (filters.onlyUnread && (chat.unreadCount ?? 0) <= 0) return false;
  if (filters.excludeMuted && chat.isMuted) return false;

  // Faqat qo'lda tanlangan chatlar papkasi (hech qanday tur yoqilmagan)
  const noTypes =
    !filters.includePrivate && !filters.includeGroups && !filters.includeChannels;
  if (noTypes) return false;

  return true;
}

/** Papkadagi chatlar soni */
export function countFolderChats(chats: FolderChat[], folder: ChatFolder): number {
  return chats.filter((chat) => matchesChatFolder(chat, folder)).length;
}

/** Papkadagi o'qilmagan xabarlar soni (varaq ustidagi badge) */
export function folderUnreadCount(chats: FolderChat[], folder: ChatFolder): number {
  return chats.reduce((total, chat) => {
    if (!matchesChatFolder(chat, folder)) return total;
    if (chat.isMuted) return total;
    return total + (chat.unreadCount ?? 0);
  }, 0);
}
