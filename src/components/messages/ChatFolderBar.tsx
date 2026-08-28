import { useCallback, useEffect, useState } from 'react';
import { ChatFolderTabs, SystemTab } from './ChatFolderTabs';
import { ChatFolderManager } from './ChatFolderManager';
import { ChatFolderChatPicker, FolderPickerChat } from './ChatFolderChatPicker';
import { ArchivedChatsRow } from './ArchivedChatsRow';
import { useChatFolders } from '@/hooks/useChatFolders';
import { FolderChat, matchesChatFolder } from '@/lib/chatFolders';

export interface FolderBarChat extends FolderChat {
  name: string;
  avatarUrl?: string;
}

export type { SystemTab } from './ChatFolderTabs';

interface ChatFolderBarProps {
  /** Barcha chatlar (papka hisoblari va chat tanlash uchun) */
  chats: FolderBarChat[];
  /** Asosiy varaqlar - papkalar bilan bitta panelda ko'rinadi */
  systemTabs?: SystemTab[];
  activeSystemTabId?: string;
  onSelectSystemTab?: (id: string) => void;
  /** Aktiv papka o'zgarganda chat ro'yxatini filtrlash funksiyasi qaytariladi */
  onFilterChange: (predicate: ((chat: FolderChat) => boolean) | null) => void;
  /** "Hammasini sukut qilish" bosilganda papkadagi chat id'lari */
  onMuteChats?: (chatIds: string[]) => void;
  className?: string;
}

/**
 * Yakka varaq paneli - asosiy varaqlar + papkalar, butun mantiq shu komponentda.
 *
 * Panel ostida Telegramdek "Arxivlangan chatlar" qatori turadi: u chat
 * ro'yxatining eng boshida ko'rinadi va arxiv bo'sh bo'lsa avtomatik yashiriladi.
 */
export function ChatFolderBar({
  chats,
  systemTabs,
  activeSystemTabId,
  onSelectSystemTab,
  onFilterChange,
  onMuteChats,
  className,
}: ChatFolderBarProps) {
  const {
    folders,
    allFolders,
    activeFolder,
    activeFolderId,
    canAddFolder,
    setActiveFolderId,
    addFolder,
    addPreset,
    updateFolder,
    removeFolder,
    reorderFolder,
    toggleChatInFolder,
  } = useChatFolders();

  const [managerOpen, setManagerOpen] = useState(false);
  const [managerFolderId, setManagerFolderId] = useState<string | null>(null);
  const [pickerFolderId, setPickerFolderId] = useState<string | null>(null);

  // Aktiv papka o'zgarsa, tashqi ro'yxat filtri yangilanadi
  useEffect(() => {
    if (activeFolder.id === 'all') {
      onFilterChange(null);
      return;
    }
    onFilterChange((chat: FolderChat) => matchesChatFolder(chat, activeFolder));
  }, [activeFolder, onFilterChange]);

  const handleMuteFolder = useCallback(
    (folderId: string) => {
      const folder = folders.find((item) => item.id === folderId);
      if (!folder || !onMuteChats) return;
      const ids = chats
        .filter((chat) => matchesChatFolder(chat, folder) && !chat.isMuted)
        .map((chat) => chat.id);
      onMuteChats(ids);
    },
    [folders, chats, onMuteChats]
  );

  const pickerFolder = folders.find((folder) => folder.id === pickerFolderId) || null;
  const pickerChats: FolderPickerChat[] = chats.map((chat) => ({
    id: chat.id,
    name: chat.name,
    type: chat.type,
    avatarUrl: chat.avatarUrl,
  }));

  return (
    <>
      <ChatFolderTabs
        className={className}
        systemTabs={systemTabs}
        activeSystemTabId={activeSystemTabId}
        onSelectSystemTab={onSelectSystemTab}
        folders={allFolders}
        activeFolderId={activeFolderId}
        chats={chats}
        onSelect={setActiveFolderId}
        onEditFolder={(id) => {
          setManagerFolderId(id);
          setManagerOpen(true);
        }}
        onAddChats={(id) => setPickerFolderId(id)}
        onMuteFolder={handleMuteFolder}
        onRemoveFolder={removeFolder}
        onReorderFolders={() => {
          setManagerFolderId(null);
          setManagerOpen(true);
        }}
        onCreateFolder={() => {
          setManagerFolderId(null);
          setManagerOpen(true);
        }}
      />

      {/* Telegramdek: ro'yxat boshidagi "Arxivlangan chatlar" qatori */}
      {onSelectSystemTab && (
        <ArchivedChatsRow
          active={activeSystemTabId === 'archived'}
          onOpen={() =>
            onSelectSystemTab(activeSystemTabId === 'archived' ? 'all' : 'archived')
          }
        />
      )}

      <ChatFolderManager
        open={managerOpen}
        onOpenChange={(open) => {
          setManagerOpen(open);
          if (!open) setManagerFolderId(null);
        }}
        folders={folders}
        canAddFolder={canAddFolder}
        initialFolderId={managerFolderId}
        onAddPreset={addPreset}
        onAddEmpty={() => addFolder()}
        onUpdate={updateFolder}
        onRemove={removeFolder}
        onReorder={reorderFolder}
        onAddChats={(id) => {
          setManagerOpen(false);
          setPickerFolderId(id);
        }}
      />

      <ChatFolderChatPicker
        open={pickerFolderId !== null}
        onOpenChange={(open) => {
          if (!open) setPickerFolderId(null);
        }}
        folder={pickerFolder}
        chats={pickerChats}
        onToggle={(chatId, include) => {
          if (pickerFolderId) toggleChatInFolder(pickerFolderId, chatId, include);
        }}
      />
    </>
  );
}
