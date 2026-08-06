import { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Pin,
  PinOff,
  Trash2,
  Pencil,
  MoreHorizontal,
  PanelLeftClose,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Settings,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AIConversation } from './types';

interface Props {
  conversations: AIConversation[];
  loading: boolean;
  activeId: string | null;
  isMobile: boolean;
  profile: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
  onNew: () => void;
  onSelect: (conv: AIConversation) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onClose: () => void;
}

type Group = { key: string; label: string; items: AIConversation[] };

function groupByDate(items: AIConversation[]): Group[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;

  const buckets: Record<string, AIConversation[]> = {
    today: [],
    yesterday: [],
    week: [],
    month: [],
    older: [],
  };

  for (const c of items) {
    const t = c.updatedAt.getTime();
    if (t >= startOfToday) buckets.today.push(c);
    else if (t >= startOfToday - day) buckets.yesterday.push(c);
    else if (t >= startOfToday - 7 * day) buckets.week.push(c);
    else if (t >= startOfToday - 30 * day) buckets.month.push(c);
    else buckets.older.push(c);
  }

  return [
    { key: 'today', label: 'Bugun', items: buckets.today },
    { key: 'yesterday', label: 'Kecha', items: buckets.yesterday },
    { key: 'week', label: "Oxirgi 7 kun", items: buckets.week },
    { key: 'month', label: 'Oxirgi 30 kun', items: buckets.month },
    { key: 'older', label: 'Eskiroq', items: buckets.older },
  ].filter((g) => g.items.length > 0);
}

export function AISidebar({
  conversations,
  loading,
  activeId,
  isMobile,
  profile,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    // Fuzzy-ish: match title OR any message content
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [conversations, query]);

  const pinned = filtered.filter((c) => c.pinned);
  const groups = groupByDate(filtered.filter((c) => !c.pinned));

  const snippetFor = (conv: AIConversation) => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hit = conv.messages.find((m) => m.content.toLowerCase().includes(q));
    if (!hit) return null;
    const i = hit.content.toLowerCase().indexOf(q);
    return `…${hit.content.slice(Math.max(0, i - 24), i + 48).trim()}…`;
  };

  const renderItem = (conv: AIConversation) => (
    <div
      key={conv.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(conv)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(conv)}
      className={cn(
        'group flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-colors',
        'hover:bg-muted/60',
        activeId === conv.id && 'bg-muted',
      )}
    >
      <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        {conv.pinned ? (
          <Pin className="h-3.5 w-3.5 text-primary" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        {renamingId === conv.id ? (
          <Input
            autoFocus
            value={renameValue}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => {
              onRename(conv.id, renameValue.trim() || conv.title);
              setRenamingId(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                onRename(conv.id, renameValue.trim() || conv.title);
                setRenamingId(null);
              }
              if (e.key === 'Escape') setRenamingId(null);
            }}
            className="h-7 text-xs"
          />
        ) : (
          <>
            <p className="text-[13px] font-medium truncate leading-tight">{conv.title}</p>
            {snippetFor(conv) && (
              <p className="text-[10px] text-muted-foreground truncate">{snippetFor(conv)}</p>
            )}
          </>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100"
            onClick={(e) => e.stopPropagation()}
            aria-label="Suhbat amallari"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setRenamingId(conv.id);
              setRenameValue(conv.title);
            }}
          >
            <Pencil className="h-3.5 w-3.5 mr-2" /> Nomini o'zgartirish
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(conv.id);
            }}
          >
            {conv.pinned ? (
              <>
                <PinOff className="h-3.5 w-3.5 mr-2" /> Mahkamlashni bekor qilish
              </>
            ) : (
              <>
                <Pin className="h-3.5 w-3.5 mr-2" /> Mahkamlash
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(conv.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" /> O'chirish
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-alsamos-orange to-alsamos-orange-dark flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-display font-bold text-sm">Alsamos AI</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-lg"
            onClick={onClose}
            aria-label="Yon panelni yopish"
          >
            {isMobile ? <ChevronLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <Button
          className="w-full gap-2 h-10 rounded-xl bg-gradient-to-r from-alsamos-orange to-alsamos-orange-dark text-white border-0 hover:opacity-90"
          onClick={onNew}
        >
          <Plus className="h-4 w-4" />
          Yangi suhbat
        </Button>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suhbatlarda qidirish..."
            className="pl-9 h-9 text-xs rounded-xl bg-muted/50 border-border/50"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="pb-4 space-y-3">
          {loading ? (
            <div className="space-y-2 px-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-1.5 py-2">
                  <Skeleton className="h-7 w-7 rounded-lg" />
                  <Skeleton className="h-3.5 flex-1 rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-xs">
                {query ? 'Natija topilmadi' : "Hali suhbatlar yo'q — yangi suhbat boshlang"}
              </p>
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <div>
                  <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Mahkamlangan
                  </p>
                  <div className="space-y-0.5">{pinned.map(renderItem)}</div>
                </div>
              )}

              <div>
                <button
                  onClick={() => setRecentsOpen((v) => !v)}
                  className="flex w-full items-center gap-1 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  {recentsOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  So'nggilar
                </button>
                {recentsOpen &&
                  groups.map((g) => (
                    <div key={g.key} className="mb-2">
                      <p className="px-2.5 py-1 text-[10px] text-muted-foreground/70">{g.label}</p>
                      <div className="space-y-0.5">{g.items.map(renderItem)}</div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border/30">
        <div className="flex items-center gap-2.5 px-1">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url || ''} />
            <AvatarFallback className="text-xs">
              {(profile?.display_name || profile?.username || 'A').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">
              {profile?.display_name || profile?.username || 'Foydalanuvchi'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">Alsamos AI</p>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" aria-label="Sozlamalar" asChild>
            <a href="/settings">
              <Settings className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
