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

export function PinnedMessagesBar({
  pinnedMessages,
  onUnpin,
  onScrollToMessage,
  className,
}: PinnedMessagesBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (pinnedMessages.length === 0) return null;

  const currentPinned = pinnedMessages[currentIndex];

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentIndex(prev => (prev > 0 ? prev - 1 : pinnedMessages.length - 1));
    } else {
      setCurrentIndex(prev => (prev < pinnedMessages.length - 1 ? prev + 1 : 0));
    }
  };

  const truncateContent = (content: string | null, maxLength = 50) => {
    if (!content) return 'Media message';
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
  };

  return (
    <div className={cn('bg-card/80 backdrop-blur border-b border-border', className)}>
      {/* Collapsed View */}
      {!isExpanded && (
        <div 
          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => onScrollToMessage?.(currentPinned.message_id)}
        >
          <Pin className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              Pinned by {currentPinned.message?.sender?.display_name || 'Unknown'}
            </p>
            <p className="text-sm truncate">
              {truncateContent(currentPinned.message?.content)}
            </p>
          </div>
          
          {pinnedMessages.length > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); handleNavigate('prev'); }}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground min-w-[3ch] text-center">
                {currentIndex + 1}/{pinnedMessages.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); handleNavigate('next'); }}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <div className="p-2">
          <div className="flex items-center justify-between mb-2 px-2">
            <div className="flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Pinned Messages ({pinnedMessages.length})</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
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
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors group"
                  onClick={() => {
                    onScrollToMessage?.(pinned.message_id);
                    setIsExpanded(false);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {pinned.message?.sender?.display_name || 'Unknown'}
                    </p>
                    <p className="text-sm truncate">
                      {truncateContent(pinned.message?.content, 80)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); onUnpin(pinned.message_id); }}
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
