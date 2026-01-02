import { useState, useEffect, useRef, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface UserSuggestion {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
}

interface MentionAutocompleteProps {
  query: string;
  onSelect: (username: string) => void;
  onClose: () => void;
  position?: { top: number; left: number };
  className?: string;
}

export function MentionAutocomplete({ 
  query, 
  onSelect, 
  onClose,
  position,
  className 
}: MentionAutocompleteProps) {
  const [users, setUsers] = useState<UserSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 1) {
      setUsers([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified')
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .limit(6);

      if (error) throw error;
      setUsers(data || []);
      setSelectedIndex(0);
    } catch (error) {
      console.error('Error fetching users for mention:', error);
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchUsers(query);
    }, 150);

    return () => clearTimeout(debounceTimer);
  }, [query, fetchUsers]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (users.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % users.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + users.length) % users.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (users[selectedIndex]?.username) {
            onSelect(users[selectedIndex].username);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [users, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!query || (users.length === 0 && !isLoading)) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden min-w-[200px] max-w-[280px]",
        className
      )}
      style={position ? { top: position.top, left: position.left } : undefined}
    >
      {isLoading ? (
        <div className="flex items-center justify-center p-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="py-1">
          {users.map((user, index) => (
            <li
              key={user.id}
              className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
              )}
              onClick={() => user.username && onSelect(user.username)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.avatar_url || ''} />
                <AvatarFallback className="text-xs">
                  {(user.display_name || user.username || 'U')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium truncate">
                    {user.display_name || user.username}
                  </span>
                  {user.is_verified && <VerifiedBadge size="sm" />}
                </div>
                {user.username && (
                  <span className="text-xs text-muted-foreground truncate block">
                    @{user.username}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
