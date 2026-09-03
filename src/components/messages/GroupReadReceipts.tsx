import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Eye } from 'lucide-react';

interface ReadReceipt {
  user_id: string;
  read_at: string;
  profile?: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

interface GroupReadReceiptsProps {
  messageId: string;
  senderId: string | null;
  isMine: boolean;
}

export function GroupReadReceipts({ messageId, senderId, isMine }: GroupReadReceiptsProps) {
  const [receipts, setReceipts] = useState<ReadReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReceipts = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('message_reads')
          .select(`
            user_id,
            read_at
          `)
          .eq('message_id', messageId)
          .neq('user_id', senderId || '');

        if (error) throw error;

        // Fetch profiles for each user
        if (data && data.length > 0) {
          const userIds = data.map(r => r.user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', userIds);

          const receiptsWithProfiles = data.map(receipt => ({
            ...receipt,
            profile: profiles?.find(p => p.id === receipt.user_id),
          }));

          setReceipts(receiptsWithProfiles);
        } else {
          setReceipts([]);
        }
      } catch (error) {
        console.error('Error fetching read receipts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReceipts();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`group-read-receipts:${messageId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
          filter: `message_id=eq.${messageId}`,
        },
        async (payload) => {
          if (payload.new.user_id === senderId) return;
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          setReceipts(prev => {
            // Check if already exists
            if (prev.some(r => r.user_id === payload.new.user_id)) {
              return prev;
            }
            return [
              ...prev,
              {
                user_id: payload.new.user_id,
                read_at: payload.new.read_at,
                profile,
              },
            ];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, senderId]);

  if (loading || receipts.length === 0) return null;

  const sortedReceipts = [...receipts].sort(
    (a, b) => new Date(b.read_at).getTime() - new Date(a.read_at).getTime()
  );
  const displayReceipts = sortedReceipts.slice(0, 4);
  const remainingCount = sortedReceipts.length - displayReceipts.length;

  const formatReadTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'HH:mm dd/MM/yyyy');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${receipts.length} kishi ko‘rdi`}
          className={cn(
            "mt-1 flex items-center gap-1 rounded-full px-1 py-0.5 transition-colors hover:bg-muted/70",
            isMine ? "justify-end" : "justify-start"
          )}
        >
          <div className="flex items-center -space-x-2">
            {displayReceipts.map((receipt) => (
              <Avatar key={receipt.user_id} className="h-5 w-5 border-2 border-background">
                <AvatarImage src={receipt.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-[8px] bg-muted">
                  {(receipt.profile?.display_name || receipt.profile?.username || 'U')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {remainingCount > 0 && (
              <div className="h-5 w-5 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[9px] text-muted-foreground font-medium">
                +{remainingCount}
              </div>
            )}
          </div>
          <Eye className="h-3 w-3 text-muted-foreground ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align={isMine ? "end" : "start"}
        sideOffset={8}
        collisionPadding={16}
        sticky="always"
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-2xl border-border/80 p-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="h-4 w-4 text-muted-foreground" />
            Ko‘rganlar
          </h4>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {receipts.length}
          </span>
        </div>
        <ScrollArea className="max-h-[min(320px,55vh)]">
          <div className="space-y-0.5 p-2">
            {sortedReceipts.map((receipt) => (
              <div 
                key={receipt.user_id} 
                className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={receipt.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-sm">
                    {(receipt.profile?.display_name || receipt.profile?.username || 'U')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {receipt.profile?.display_name || receipt.profile?.username || 'Foydalanuvchi'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatReadTime(receipt.read_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
