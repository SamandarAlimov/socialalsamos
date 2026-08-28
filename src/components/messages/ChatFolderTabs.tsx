import { useRef } from 'react';
import {
  Archive,
  BellOff,
  Briefcase,
  Folder,
  Layers,
  ListOrdered,
  Mail,
  Megaphone,
  Pencil,
  Plus,
  Star,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { ALL_FOLDER_ID, ChatFolder, ChatFolderIcon, FolderChat, folderUnreadCount } from '@/lib/chatFolders';

const ICONS: Record<ChatFolderIcon, typeof Folder> = {
  all: Layers,
  unread: Mail,
  personal: User,
  groups: Users,
  channels: Megaphone,
  favorites: Star,
  work: Briefcase,
  archive: Archive,
  custom: Folder,
};

interface ChatFolderTabsProps {
  folders: ChatFolder[];
  activeFolderId: string;
  chats: FolderChat[];
  onSelect: (id: string) => void;
  onEditFolder: (id: string) => void;
  onAddChats: (id: string) => void;
  onMuteFolder: (id: string) => void;
  onRemoveFolder: (id: string) => void;
  onReorderFolders: () => void;
  onCreateFolder: () => void;
  showIcons?: boolean;
  className?: string;
}

/**
 * Telegramdek papka paneli.
 *
 * - Aktiv papka yumshoq kulrang "pill" ichida ko'rinadi (to'q sariq emas).
 * - O'ng tugma yoki uzoq bosish orqali papka menyusi ochiladi:
 *   tahrirlash, chat qo'shish, hammasini sukut qilish, olib tashlash, tartiblash.
 */
export function ChatFolderTabs({
  folders,
  activeFolderId,
  chats,
  onSelect,
  onEditFolder,
  onAddChats,
  onMuteFolder,
  onRemoveFolder,
  onReorderFolders,
  onCreateFolder,
  showIcons = false,
  className,
}: ChatFolderTabsProps) {
  return (
    <div className={cn('px-2 py-1.5', className)}>
      <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
        <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {folders.map((folder) => (
            <FolderTab
              key={folder.id}
              folder={folder}
              isActive={folder.id === activeFolderId}
              unread={folderUnreadCount(chats, folder)}
              showIcon={showIcons}
              onSelect={() => onSelect(folder.id)}
              onEdit={() => onEditFolder(folder.id)}
              onAddChats={() => onAddChats(folder.id)}
              onMute={() => onMuteFolder(folder.id)}
              onRemove={() => onRemoveFolder(folder.id)}
              onReorder={onReorderFolders}
              onCreate={onCreateFolder}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onCreateFolder}
          aria-label="Papka qo'shish"
          title="Papka qo'shish"
          className="tg-transition flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface FolderTabProps {
  folder: ChatFolder;
  isActive: boolean;
  unread: number;
  showIcon: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onAddChats: () => void;
  onMute: () => void;
  onRemove: () => void;
  onReorder: () => void;
  onCreate: () => void;
}

function FolderTab({
  folder,
  isActive,
  unread,
  showIcon,
  onSelect,
  onEdit,
  onAddChats,
  onMute,
  onRemove,
  onReorder,
  onCreate,
}: FolderTabProps) {
  const Icon = ICONS[folder.icon] || Folder;
  const isAll = folder.id === ALL_FOLDER_ID;
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  /** Mobil qurilmada uzoq bosish kontekst menyusini ochadi */
  const openContextMenu = (target: HTMLElement) => {
    longPressFiredRef.current = true;
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.bottom,
      })
    );
  };

  const startLongPress = (event: React.TouchEvent<HTMLButtonElement>) => {
    const target = event.currentTarget;
    longPressFiredRef.current = false;
    longPressRef.current = setTimeout(() => openContextMenu(target), 420);
  };

  const cancelLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = null;
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={() => {
            if (longPressFiredRef.current) {
              longPressFiredRef.current = false;
              return;
            }
            onSelect();
          }}
          onTouchStart={startLongPress}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          onTouchCancel={cancelLongPress}
          title={folder.name}
          className={cn(
            'tg-transition relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm chat-no-select',
            isActive
              ? 'bg-background font-semibold text-foreground shadow-sm'
              : 'font-medium text-muted-foreground hover:text-foreground'
          )}
        >
          {showIcon && <Icon className="h-4 w-4 shrink-0" />}
          <span className="max-w-[140px] truncate">{folder.name}</span>
          {unread > 0 && (
            <span
              className={cn(
                'flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                isActive
                  ? 'bg-muted-foreground/25 text-foreground'
                  : 'bg-muted-foreground/20 text-muted-foreground'
              )}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56 rounded-2xl">
        {isAll ? (
          <>
            <ContextMenuItem onClick={onCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Papka qo'shish
            </ContextMenuItem>
            <ContextMenuItem onClick={onReorder} className="gap-2">
              <ListOrdered className="h-4 w-4" />
              Papkalarni qayta tartiblash
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onClick={onEdit} className="gap-2">
              <Pencil className="h-4 w-4" />
              Jildni tahrirlash
            </ContextMenuItem>
            <ContextMenuItem onClick={onAddChats} className="gap-2">
              <Plus className="h-4 w-4" />
              Chatlarni qo'shish
            </ContextMenuItem>
            <ContextMenuItem onClick={onMute} className="gap-2">
              <BellOff className="h-4 w-4" />
              Hammasini sukut qilish
            </ContextMenuItem>
            <ContextMenuItem
              onClick={onRemove}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Olib tashlash
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onReorder} className="gap-2">
              <ListOrdered className="h-4 w-4" />
              Varaqlarni qayta tartiblash
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
