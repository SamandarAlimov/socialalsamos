import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALL_FOLDER,
  ALL_FOLDER_ID,
  CHAT_FOLDERS_EVENT,
  ChatFolder,
  FolderChat,
  MAX_FOLDERS,
  STORAGE_KEY_FOLDERS,
  createEmptyFolder,
  filterChatsByFolder,
  folderFromPreset,
  loadActiveFolderId,
  loadChatFolders,
  matchesChatFolder,
  moveFolder,
  saveActiveFolderId,
  saveChatFolders,
} from '@/lib/chatFolders';

/**
 * Chat papkalarini boshqarish. Papkalar barcha oynalar va tablar orasida
 * sinxron bo'ladi (custom event + storage event).
 */
export function useChatFolders() {
  const [folders, setFolders] = useState<ChatFolder[]>(() => loadChatFolders());
  const [activeFolderId, setActiveFolderIdState] = useState<string>(() => loadActiveFolderId());

  useEffect(() => {
    const sync = () => setFolders(loadChatFolders());

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<ChatFolder[]>).detail;
      if (Array.isArray(detail)) setFolders(detail);
      else sync();
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === STORAGE_KEY_FOLDERS) sync();
    };

    window.addEventListener(CHAT_FOLDERS_EVENT, onCustom as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHAT_FOLDERS_EVENT, onCustom as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const allFolders = useMemo<ChatFolder[]>(() => [ALL_FOLDER, ...folders], [folders]);

  const activeFolder = useMemo<ChatFolder>(
    () => allFolders.find((folder) => folder.id === activeFolderId) || ALL_FOLDER,
    [allFolders, activeFolderId]
  );

  const persist = useCallback((next: ChatFolder[]) => {
    setFolders(next);
    saveChatFolders(next);
  }, []);

  const setActiveFolderId = useCallback((id: string) => {
    setActiveFolderIdState(id);
    saveActiveFolderId(id);
  }, []);

  const addFolder = useCallback(
    (folder?: ChatFolder) => {
      const next = folder || createEmptyFolder();
      if (folders.length >= MAX_FOLDERS) return null;
      persist([...folders, next]);
      return next;
    },
    [folders, persist]
  );

  const addPreset = useCallback(
    (presetKey: string) => {
      const folder = folderFromPreset(presetKey);
      if (!folder) return null;
      return addFolder(folder);
    },
    [addFolder]
  );

  const updateFolder = useCallback(
    (id: string, patch: Partial<ChatFolder>) => {
      persist(
        folders.map((folder) =>
          folder.id === id
            ? {
                ...folder,
                ...patch,
                filters: patch.filters ? { ...folder.filters, ...patch.filters } : folder.filters,
              }
            : folder
        )
      );
    },
    [folders, persist]
  );

  const removeFolder = useCallback(
    (id: string) => {
      persist(folders.filter((folder) => folder.id !== id));
      if (activeFolderId === id) setActiveFolderId(ALL_FOLDER_ID);
    },
    [folders, persist, activeFolderId, setActiveFolderId]
  );

  const reorderFolder = useCallback(
    (id: string, direction: -1 | 1) => {
      persist(moveFolder(folders, id, direction));
    },
    [folders, persist]
  );

  /** Chatni papkaga qo'lda qo'shish yoki papkadan chiqarish */
  const toggleChatInFolder = useCallback(
    (folderId: string, chatId: string, include: boolean) => {
      const folder = folders.find((item) => item.id === folderId);
      if (!folder) return;
      const includedIds = new Set(folder.filters.includedIds);
      const excludedIds = new Set(folder.filters.excludedIds);
      if (include) {
        includedIds.add(chatId);
        excludedIds.delete(chatId);
      } else {
        includedIds.delete(chatId);
        excludedIds.add(chatId);
      }
      updateFolder(folderId, {
        filters: {
          ...folder.filters,
          includedIds: Array.from(includedIds),
          excludedIds: Array.from(excludedIds),
        },
      });
    },
    [folders, updateFolder]
  );

  const reset = useCallback(() => {
    persist([]);
    setActiveFolderId(ALL_FOLDER_ID);
  }, [persist, setActiveFolderId]);

  const filterChats = useCallback(
    <T extends FolderChat>(chats: T[], folder: ChatFolder = activeFolder) =>
      filterChatsByFolder(chats, folder),
    [activeFolder]
  );

  return {
    folders,
    allFolders,
    activeFolder,
    activeFolderId: activeFolder.id,
    hasFolders: folders.length > 0,
    canAddFolder: folders.length < MAX_FOLDERS,
    setActiveFolderId,
    addFolder,
    addPreset,
    updateFolder,
    removeFolder,
    reorderFolder,
    toggleChatInFolder,
    reset,
    filterChats,
    matches: matchesChatFolder,
  };
}
