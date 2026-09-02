import { useMemo, useState } from 'react';
import { Check, Search, Users, Megaphone, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ChatFolder } from '@/lib/chatFolders';

export interface FolderPickerChat {
  id: string;
  name: string;
  type: 'private' | 'group' | 'channel';
  avatarUrl?: string;
}

interface ChatFolderChatPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: ChatFolder | null;
  chats: FolderPickerChat[];
  onToggle: (chatId: string, include: boolean) => void;
}

const TYPE_ICON = {
  private: User,
  group: Users,
  channel: Megaphone,
};

/**
 * "Chatlarni qo'shish" oynasi: papkaga chatlarni qo'lda qo'shish yoki chiqarish.
 * Telegramda ham papka filtridan tashqari alohida chatlarni qo'shish mumkin.
 */
export function ChatFolderChatPicker({
  open,
  onOpenChange,
  folder,
  chats,
  onToggle,
}: ChatFolderChatPickerProps) {
  const [query, setQuery] = useState('');

  const included = useMemo(
    () => new Set(folder?.filters.includedIds || []),
    [folder]
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return chats;
    return chats.filter((chat) => chat.name.toLowerCase().includes(term));
  }, [chats, query]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col p-0">
        <SheetHeader className="border-b border-border px-4 py-3 text-left">
          <SheetTitle>Chatlarni qo'shish</SheetTitle>
          <SheetDescription>
            {folder ? `"${folder.name}" papkasiga qo'shiladigan chatlarni tanlang` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chat qidirish..."
              className="h-10 bg-muted/50 pl-9"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Chat topilmadi
            </p>
          ) : (
            filtered.map((chat) => {
              const Icon = TYPE_ICON[chat.type] || User;
              const isIncluded = included.has(chat.id);
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => onToggle(chat.id, !isIncluded)}
                  className="tg-transition flex w-full items-center gap-3 border-b border-border/40 px-4 py-2.5 text-left hover:bg-muted/60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                    {chat.avatarUrl ? (
                      <img
                        src={chat.avatarUrl}
                        alt=""
                        className="no-drag h-full w-full object-cover"
                      />
                    ) : (
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{chat.name}</span>
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border tg-transition',
                      isIncluded
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-transparent'
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-3">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Tayyor
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
