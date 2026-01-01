import { useState, useCallback, useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

  const searchMessages = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    const filtered = messages.filter(m => 
      m.content?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    setResults(filtered);
    setCurrentIndex(0);
    
    if (filtered.length > 0) {
      onHighlightMessage(filtered[0].id);
    }
  }, [messages, onHighlightMessage]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchMessages(query);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [query, searchMessages]);

  const goToNext = () => {
    if (results.length === 0) return;
    const newIndex = (currentIndex + 1) % results.length;
    setCurrentIndex(newIndex);
    onHighlightMessage(results[newIndex].id);
  };

  const goPrevious = () => {
    if (results.length === 0) return;
    const newIndex = currentIndex === 0 ? results.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
    onHighlightMessage(results[newIndex].id);
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-card border-b border-border">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in conversation..."
          className="pl-9 h-9"
          autoFocus
        />
      </div>
      
      {results.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {currentIndex + 1} of {results.length}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrevious}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNext}>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
