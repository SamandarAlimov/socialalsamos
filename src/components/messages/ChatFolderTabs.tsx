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

/** Sahifaning asosiy varaqlari (Barchasi, Shaxsiy, Guruhlar, ...) */
export type SystemTab = {
  id: string;
  label: string;
  count?: number;
};

interface ChatFolderTabsProps {
  /** Asosiy varaqlar - papkalar bilan bitta qatorda ko'rinadi */
  systemTabs?: SystemTab[];
  activeSystemTabId?: string;
  onSelectSystemTab?: (id: string) => void;
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
 * Telegramdek YAKKA varaq paneli.
 *
 * - Asosiy varaqlar va papkalar bitta gorizontal qatorda (ikkita panel yo'q).
 * - Aktiv varaq yumshoq oq "pill" ichida (to'q sariq rang emas).
 * - Papka qo'shish faqat uzoq bosish menyusi va sozlamalar orqali -
 *   panelda ortiqcha "+" tugmasi yo'q.
 */
export function ChatFolderTabs({
  systemTabs,
  activeSystemTabId,
  onSelectSystemTab,
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
  const hasSystemTabs = !!systemTabs && systemTabs.length > 0;
  // Asosiy varaqlar bo'lsa, "Barchasi" papkasi takrorlanmasligi uchun chiqarib tashlanadi
  const visibleFolders = hasSystemTabs
    ? folders.filter((folder) => folder.id !== ALL_FOLDER_ID)
    : folders;
  const folderSelected = activeFolderId !== ALL_FOLDER_ID;

  return (
    <div className={cn('px-2 py-1.5', className)}>
      <div className="scrollbar-hide flex items-center gap-0.5 overflow-x-auto rounded-full bg-muted/60 p-1">
        {hasSystemTabs &&
          systemTabs!.map((tab) => {
            const isActive = !folderSelected && tab.id === activeSystemTabId;
            return (
              <SystemTabButton
                key={tab.id}
                tab={tab}
                isActive={isActive}
                onSelect={() => {
                  onSelectSystemTab?.(tab.id);
                  // Asosiy varaq tanlanganda papka filtri bekor qilinadi
                  if (folderSelected) onSelect(ALL_FOLDER_ID);
                }}
                onCreate={onCreateFolder}
                onReorder={onReorderFolders}
              />
            );
          })}

        {visibleFolders.map((folder) => (
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
    </div>
  );
}

/** Uzoq bosishni kontekst menyusiga aylantiruvchi umumiy yordamchi */
function useLongPressContextMenu() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const open = (target: HTMLElement) => {
    firedRef.current = true;
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.bottom,
      })
    );
  };

  const start = (event: React.TouchEvent<HTMLButtonElement>) => {
    const target = event.currentTarget;
    firedRef.current = false;
    timerRef.current = setTimeout(() => open(target), 420);
  };

  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  /** Uzoq bosishdan keyin oddiy "click" bajarilmasligi kerak */
  const consumedClick = () => {
    if (firedRef.current) {
      firedRef.current = false;
      return true;
    }
    return false;
  };

  return { start, cancel, consumedClick };
}

const TAB_BASE =
  'tg-transition relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm chat-no-select';
const TAB_ACTIVE = 'bg-background font-semibold text-foreground shadow-sm';
const TAB_IDLE = 'font-medium text-muted-foreground hover:text-foreground';

function TabBadge({ value, isActive }: { value: number; isActive: boolean }) {
  if (value <= 0) return null;
  return (
    <span
      className={cn(
        'flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
        isActive ? 'bg-muted-foreground/25 text-foreground' : 'bg-muted-foreground/20 text-muted-foreground'
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

interface SystemTabButtonProps {
  tab: SystemTab;
  isActive: boolean;
  onSelect: () => void;
  onCreate: () => void;
  onReorder: () => void;
}

function SystemTabButton({ tab, isActive, onSelect, onCreate, onReorder }: SystemTabButtonProps) {
  const longPress = useLongPressContextMenu();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={() => {
            if (longPress.consumedClick()) return;
            onSelect();
          }}
          onTouchStart={longPress.start}
          onTouchEnd={longPress.cancel}
          onTouchMove={longPress.cancel}
          onTouchCancel={longPress.cancel}
          title={tab.label}
          className={cn(TAB_BASE, isActive ? TAB_ACTIVE : TAB_IDLE)}
        >
          <span className="max-w-[140px] truncate">{tab.label}</span>
          <TabBadge value={tab.count ?? 0} isActive={isActive} />
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56 rounded-2xl">
        <ContextMenuItem onClick={onCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Papka qo'shish
        </ContextMenuItem>
        <ContextMenuItem onClick={onReorder} className="gap-2">
          <ListOrdered className="h-4 w-4" />
          Papkalarni qayta tartiblash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
  const longPress = useLongPressContextMenu();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={() => {
            if (longPress.consumedClick()) return;
            onSelect();
          }}
          onTouchStart={longPress.start}
          onTouchEnd={longPress.cancel}
          onTouchMove={longPress.cancel}
          onTouchCancel={longPress.cancel}
          title={folder.name}
          className={cn(TAB_BASE, isActive ? TAB_ACTIVE : TAB_IDLE)}
        >
          {showIcon && <Icon className="h-4 w-4 shrink-0" />}
          <span className="max-w-[140px] truncate">{folder.name}</span>
          <TabBadge value={unread} isActive={isActive} />
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
