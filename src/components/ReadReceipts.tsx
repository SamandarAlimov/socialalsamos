import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';

interface ReadReceipt {
  user_id: string;
  read_at: string;
  profile?: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

interface ReadReceiptsProps {
  messageId: string;
  conversationId: string;
}

export function ReadReceipts({ messageId, conversationId }: ReadReceiptsProps) {
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
            read_at,
            profile:profiles!message_reads_user_id_fkey (
              display_name,
              username,
              avatar_url
            )
          `)
          .eq('message_id', messageId);

        if (error) throw error;
        setReceipts((data as any[]) || []);
      } catch (error) {
        console.error('Error fetching read receipts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReceipts();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`read-receipts:${messageId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
          filter: `message_id=eq.${messageId}`,
        },
        async (payload) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, username, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          setReceipts(prev => [
            ...prev,
            {
              user_id: payload.new.user_id,
              read_at: payload.new.read_at,
              profile,
            },
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId]);

  if (loading || receipts.length === 0) return null;

  const displayReceipts = receipts.slice(0, 3);
  const remainingCount = receipts.length - displayReceipts.length;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center -space-x-2 cursor-default">
            {displayReceipts.map((receipt) => (
              <Avatar key={receipt.user_id} className="h-4 w-4 border border-background">
                <AvatarImage src={receipt.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-[8px]">
                  {(receipt.profile?.display_name || receipt.profile?.username || 'U')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {remainingCount > 0 && (
              <div className="h-4 w-4 rounded-full bg-muted border border-background flex items-center justify-center text-[8px] text-muted-foreground">
                +{remainingCount}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <p className="text-xs font-medium mb-1">Seen by</p>
          <div className="space-y-1">
            {receipts.map((receipt) => (
              <div key={receipt.user_id} className="flex items-center gap-2 text-xs">
                <span className="truncate">
                  {receipt.profile?.display_name || receipt.profile?.username || 'User'}
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {format(new Date(receipt.read_at), 'HH:mm')}
                </span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
