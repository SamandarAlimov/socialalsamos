import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALL_FOLDER,
  ALL_FOLDER_ID,
  CHAT_FOLDERS_EVENT,
  ChatFolder,
  DEFAULT_FILTERS,
  FOLDER_PRESETS,
  FolderChat,
  MAX_FOLDERS,
  STORAGE_KEY_FOLDERS,
  createFolderId,
  loadActiveFolderId,
  loadChatFolders,
  matchesChatFolder,
  saveActiveFolderId,
  saveChatFolders,
} from '@/lib/chatFolders';

/**
 * Chat papkalarini boshqarish hooki.
 * Barcha o'zgarishlar localStorage'ga yoziladi va boshqa oynalarga uzatiladi.
 */
export function useChatFolders() {
  const [folders, setFolders] = useState<ChatFolder[]>(() => loadChatFolders());
  const [activeFolderId, setActiveFolderIdState] = useState<string>(() =>
    loadActiveFolderId()
  );

  // Boshqa oyna yoki komponent papkalarni o'zgartirsa yangilanadi
  useEffect(() => {
    const handleChange = () => setFolders(loadChatFolders());
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === STORAGE_KEY_FOLDERS) handleChange();
    };
    window.addEventListener(CHAT_FOLDERS_EVENT, handleChange as EventListener);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(CHAT_FOLDERS_EVENT, handleChange as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const commit = useCallback((next: ChatFolder[]) => {
    setFolders(next);
    saveChatFolders(next);
  }, []);

  const setActiveFolderId = useCallback((id: string) => {
    setActiveFolderIdState(id);
    saveActiveFolderId(id);
  }, []);

  // O'chirilgan papka aktiv bo'lib qolmasligi uchun
  useEffect(() => {
    if (activeFolderId === ALL_FOLDER_ID) return;
    if (!folders.some((folder) => folder.id === activeFolderId)) {
      setActiveFolderId(ALL_FOLDER_ID);
    }
  }, [folders, activeFolderId, setActiveFolderId]);

  const addFolder = useCallback(
    (folder?: Partial<ChatFolder>) => {
      if (folders.length >= MAX_FOLDERS) return null;
      const created: ChatFolder = {
        id: createFolderId(),
        name: folder?.name || 'Yangi papka',
        icon: folder?.icon || 'custom',
        filters: { ...DEFAULT_FILTERS, ...(folder?.filters || {}) },
      };
      commit([...folders, created]);
      return created;
    },
    [folders, commit]
  );

  const addPreset = useCallback(
    (presetKey: string) => {
      const preset = FOLDER_PRESETS.find((item) => item.key === presetKey);
      if (!preset) return null;
      return addFolder({
        name: preset.name,
        icon: preset.icon,
        filters: { ...preset.filters },
      });
    },
    [addFolder]
  );

  const updateFolder = useCallback(
    (id: string, patch: Partial<ChatFolder>) => {
      commit(
        folders.map((folder) =>
          folder.id === id
            ? {
                ...folder,
                ...patch,
                filters: patch.filters
                  ? { ...folder.filters, ...patch.filters }
                  : folder.filters,
              }
            : folder
        )
      );
    },
    [folders, commit]
  );

  const removeFolder = useCallback(
    (id: string) => {
      commit(folders.filter((folder) => folder.id !== id));
      if (activeFolderId === id) setActiveFolderId(ALL_FOLDER_ID);
    },
    [folders, commit, activeFolderId, setActiveFolderId]
  );

  const reorderFolder = useCallback(
    (id: string, direction: -1 | 1) => {
      const index = folders.findIndex((folder) => folder.id === id);
      if (index < 0) return;
      const target = index + direction;
      if (target < 0 || target >= folders.length) return;
      const next = [...folders];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      commit(next);
    },
    [folders, commit]
  );

  /** Chatni papkaga qo'lda qo'shish yoki chiqarish */
  const toggleChatInFolder = useCallback(
    (folderId: string, chatId: string, include: boolean) => {
      const folder = folders.find((item) => item.id === folderId);
      if (!folder) return;
      const includedIds = folder.filters.includedIds.filter((id) => id !== chatId);
      const excludedIds = folder.filters.excludedIds.filter((id) => id !== chatId);
      if (include) includedIds.push(chatId);
      else excludedIds.push(chatId);
      updateFolder(folderId, { filters: { ...folder.filters, includedIds, excludedIds } });
    },
    [folders, updateFolder]
  );

  const reset = useCallback(() => {
    commit([]);
    setActiveFolderId(ALL_FOLDER_ID);
  }, [commit, setActiveFolderId]);

  const allFolders = useMemo(() => [ALL_FOLDER, ...folders], [folders]);

  const activeFolder = useMemo(
    () => allFolders.find((folder) => folder.id === activeFolderId) || ALL_FOLDER,
    [allFolders, activeFolderId]
  );

  const matches = useCallback(
    (chat: FolderChat) => matchesChatFolder(chat, activeFolder),
    [activeFolder]
  );

  return {
    folders,
    allFolders,
    activeFolder,
    activeFolderId,
    canAddFolder: folders.length < MAX_FOLDERS,
    hasFolders: folders.length > 0,
    setActiveFolderId,
    addFolder,
    addPreset,
    updateFolder,
    removeFolder,
    reorderFolder,
    toggleChatInFolder,
    reset,
    matches,
  };
}
