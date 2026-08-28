import {
  Archive,
  Briefcase,
  Folder,
  Layers,
  Mail,
  Megaphone,
  Plus,
  Settings2,
  Star,
  User,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ChatFolder,
  ChatFolderIcon,
  FolderChat,
  folderUnreadCount,
} from '@/lib/chatFolders';

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
  onManage: () => void;
  className?: string;
}

/**
 * Telegramdek gorizontal papka tablari.
 * Har bir papka yonida o'qilmagan chatlar soni ko'rinadi.
 */
export function ChatFolderTabs({
  folders,
  activeFolderId,
  chats,
  onSelect,
  onManage,
  className,
}: ChatFolderTabsProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 border-b border-border/60 px-2 py-1.5',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-hide">
        {folders.map((folder) => {
          const Icon = ICONS[folder.icon] || Folder;
          const unread = folderUnreadCount(chats, folder);
          const isActive = folder.id === activeFolderId;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => onSelect(folder.id)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm tg-transition',
                isActive
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
              title={folder.name}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="max-w-[120px] truncate">{folder.name}</span>
              {unread > 0 && (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onManage}
        aria-label="Papkalarni boshqarish"
        title="Papkalarni boshqarish"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground tg-transition hover:bg-muted hover:text-foreground"
      >
        {folders.length > 1 ? <Settings2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
    </div>
  );
}
