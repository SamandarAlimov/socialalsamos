import { useState, useCallback, useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Message {
  id: string;
  content: string | null;
  created_at: string;
  sender?: {
    display_name: string | null;
    username: string | null;
  };
}

interface MessageSearchProps {
  messages: Message[];
  onHighlightMessage: (messageId: string) => void;
  onClose: () => void;
}

export function MessageSearch({ messages, onHighlightMessage, onClose }: MessageSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const searchMessages = useCallback(
    (searchQuery: string) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) {
        setResults([]);
        return;
      }

      // Telegramdek: eng yangi natijalar birinchi ko'rsatiladi
      const filtered = messages
        .filter((m) => m.content?.toLowerCase().includes(q))
        .slice()
        .reverse();

      setResults(filtered);
      setCurrentIndex(0);

      if (filtered.length > 0) {
        onHighlightMessage(filtered[0].id);
      }
    },
    [messages, onHighlightMessage]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => searchMessages(query), 250);
    return () => clearTimeout(timeoutId);
  }, [query, searchMessages]);

  const goToNext = useCallback(() => {
    if (results.length === 0) return;
    const newIndex = (currentIndex + 1) % results.length;
    setCurrentIndex(newIndex);
    onHighlightMessage(results[newIndex].id);
  }, [results, currentIndex, onHighlightMessage]);

  const goPrevious = useCallback(() => {
    if (results.length === 0) return;
    const newIndex = currentIndex === 0 ? results.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
    onHighlightMessage(results[newIndex].id);
  }, [results, currentIndex, onHighlightMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) goPrevious();
      else goToNext();
    }
  };

  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-card p-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Chat ichida qidirish..."
          className="h-9 rounded-full pl-9 pr-9"
          autoFocus
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Tozalash"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {hasQuery && (
        <div className="flex items-center gap-0.5">
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {results.length > 0
              ? `${currentIndex + 1} / ${results.length}`
              : 'Natija topilmadi'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-muted"
            onClick={goPrevious}
            disabled={results.length === 0}
            aria-label="Oldingi natija"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-muted"
            onClick={goToNext}
            disabled={results.length === 0}
            aria-label="Keyingi natija"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full hover:bg-muted"
        onClick={onClose}
        aria-label="Qidiruvni yopish"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
