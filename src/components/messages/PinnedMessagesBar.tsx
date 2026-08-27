import { useState } from 'react';
import { Pin, ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PinnedMessage } from '@/hooks/usePinnedMessages';

interface PinnedMessagesBarProps {
  pinnedMessages: PinnedMessage[];
  onUnpin: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  className?: string;
}

/** Telegramdek media xabarlar uchun tushunarli preview matni */
function previewText(content: string | null | undefined, maxLength = 60) {
  const text = (content || '').trim();
  if (!text) return 'Media xabar';
  if (text.startsWith('\ud83d\udccd LOCATION:')) return 'Joylashuv';
  if (text.startsWith('[POLL]')) return "So'rov";
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

export function PinnedMessagesBar({
  pinnedMessages,
  onUnpin,
  onScrollToMessage,
  className,
}: PinnedMessagesBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (pinnedMessages.length === 0) return null;

  const safeIndex = Math.min(currentIndex, pinnedMessages.length - 1);
  const currentPinned = pinnedMessages[safeIndex];

  const handleNavigate = (direction: 'prev' | 'next') => {
    setCurrentIndex((prev) =>
      direction === 'prev'
        ? prev > 0
          ? prev - 1
          : pinnedMessages.length - 1
        : prev < pinnedMessages.length - 1
          ? prev + 1
          : 0
    );
  };

  return (
    <div className={cn('border-b border-border bg-card/80 backdrop-blur', className)}>
      {!isExpanded ? (
        <div
          className="flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50"
          onClick={() => onScrollToMessage?.(currentPinned.message_id)}
        >
          {/* Telegramdek chapdagi vertikal indikator chiziqlari */}
          <div className="flex h-8 flex-col justify-between gap-[2px]">
            {pinnedMessages.slice(0, 4).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'w-[2px] flex-1 rounded-full',
                  i === safeIndex % Math.min(pinnedMessages.length, 4)
                    ? 'bg-primary'
                    : 'bg-border'
                )}
              />
            ))}
          </div>

          <Pin className="h-4 w-4 shrink-0 text-primary" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-primary">
              Qadalgan xabar
              {pinnedMessages.length > 1 ? ` #${safeIndex + 1}` : ''}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {previewText(currentPinned.message?.content)}
            </p>
          </div>

          {pinnedMessages.length > 1 && (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-muted"
                aria-label="Oldingi"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNavigate('prev');
                }}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <span className="min-w-[3ch] text-center text-xs tabular-nums text-muted-foreground">
                {safeIndex + 1}/{pinnedMessages.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-muted"
                aria-label="Keyingi"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNavigate('next');
                }}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full hover:bg-muted"
            aria-label="Barchasini ko'rish"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="p-2">
          <div className="mb-2 flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                Qadalgan xabarlar ({pinnedMessages.length})
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full hover:bg-muted"
              aria-label="Yopish"
              onClick={() => setIsExpanded(false)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="max-h-48">
            <div className="space-y-1">
              {pinnedMessages.map((pinned) => (
                <div
                  key={pinned.id}
                  className="group flex cursor-pointer items-center gap-2 rounded-xl p-2 transition-colors hover:bg-muted/60"
                  onClick={() => {
                    onScrollToMessage?.(pinned.message_id);
                    setIsExpanded(false);
                  }}
                >
                  <span className="h-8 w-[2px] shrink-0 rounded-full bg-primary/60" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-primary">
                      {pinned.message?.sender?.display_name || "Noma'lum"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {previewText(pinned.message?.content, 80)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                    aria-label="Qadashni bekor qilish"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnpin(pinned.message_id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
