import { Archive, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConversations } from '@/hooks/useMessages';

interface ArchivedChatsRowProps {
  /** Arxiv bo'limi ochilishi kerak bo'lganda chaqiriladi */
  onOpen: () => void;
  /** Arxiv bo'limi hozir ochiq bo'lsa, qator ajratib ko'rsatiladi */
  active?: boolean;
  className?: string;
}

/**
 * Telegramdek: chat ro'yxatining ENG BOSHIDA turadigan "Arxivlangan chatlar" qatori.
 *
 * - arxivda hech nima bo'lmasa, qator umuman ko'rinmaydi;
 * - o'ng tomonda o'qilmagan xabarlar soni (ovozsiz chatlar hisobga olinmaydi);
 * - pastda arxivdagi chat nomlari qisqa ko'rinishda chiqadi.
 */
export function ArchivedChatsRow({ onOpen, active, className }: ArchivedChatsRowProps) {
  const { conversations } = useConversations(undefined, true);

  if (!conversations || conversations.length === 0) return null;

  const unread = conversations.reduce(
    (sum, conv) => (conv.is_muted ? sum : sum + (conv.unread_count ?? 0)),
    0
  );

  const names = conversations
    .slice(0, 3)
    .map(
      (conv) =>
        conv.name ||
        conv.other_participant?.display_name ||
        conv.other_participant?.username ||
        'Foydalanuvchi'
    )
    .join(', ');

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'tg-transition flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left hover:bg-accent/60',
        active && 'bg-accent/70',
        className
      )}
      title="Arxivlangan chatlar"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Archive className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          Arxivlangan chatlar
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {conversations.length} ta chat{names ? ' \u00b7 ' + names : ''}
        </span>
      </span>

      {unread > 0 ? (
        <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-background">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

export default ArchivedChatsRow;
