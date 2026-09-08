import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Megaphone,
  Users,
  Share2,
  Settings,
  Send,
  MoreVertical,
  Globe,
  Lock,
  Radio,
  Heart,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Channel, useChannels } from '@/hooks/useChannels';
import { useWebRTC } from '@/hooks/useWebRTC';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { ChannelLiveOverlay } from '@/components/channels/ChannelLiveOverlay';

interface ChannelViewProps {
  channel: Channel;
  onBack: () => void;
}

type LivePresence = {
  role?: string;
  online_at?: string;
  topology?: string;
};

export function ChannelView({ channel, onBack }: ChannelViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { fetchChannelPosts, createChannelPost, joinChannel } = useChannels();
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [liveHostId, setLiveHostId] = useState<string | null>(null);
  const [isHostingLive, setIsHostingLive] = useState(false);
  const [isWatchingLive, setIsWatchingLive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin =
    channel.owner_id === user?.id ||
    channel.member_role === 'admin' ||
    channel.member_role === 'moderator';
  const isMember = channel.is_member || channel.owner_id === user?.id;
  const liveRoomId = `channel-live:${channel.id}`;
  const effectiveHostId = isHostingLive ? user?.id ?? null : liveHostId;

  const live = useWebRTC(liveRoomId, {
    topology: 'broadcast',
    hostId: effectiveHostId,
    persistSignals: false,
    publishMedia: isHostingLive,
  });

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchChannelPosts(channel.id);
    setPosts(data);
    setIsLoading(false);
  }, [channel.id, fetchChannelPosts]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const sub = supabase
      .channel(`channel-posts-${channel.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
          filter: `channel_id=eq.${channel.id}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('posts')
            .select(`*, profile:profiles!posts_user_id_fkey (id, username, display_name, avatar_url, is_verified)`)
            .eq('id', payload.new.id)
            .single();
          if (data) setPosts((prev) => [data, ...prev]);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(sub);
    };
  }, [channel.id]);

  // Passive presence watcher: no camera/mic and no signaling writes. It lets
  // late viewers discover an already-running native channel broadcast.
  useEffect(() => {
    const watcher = supabase.channel(`webrtc:${liveRoomId}`, {
      config: { presence: { key: `watcher:${user?.id ?? 'guest'}:${channel.id}` } },
    });

    const syncLiveHost = () => {
      const state = watcher.presenceState() as Record<string, LivePresence[]>;
      let broadcaster: string | null = null;
      for (const [presenceKey, presences] of Object.entries(state)) {
        if (presenceKey.startsWith('watcher:')) continue;
        if (presences.some((presence) => presence.role === 'broadcaster')) {
          broadcaster = presenceKey;
          break;
        }
      }
      setLiveHostId(broadcaster);
      if (!broadcaster && isWatchingLive) {
        live.leaveRoom();
        setIsWatchingLive(false);
        toast({ title: 'Jonli efir tugadi' });
      }
    };

    watcher
      .on('presence', { event: 'sync' }, syncLiveHost)
      .on('presence', { event: 'join' }, syncLiveHost)
      .on('presence', { event: 'leave' }, syncLiveHost)
      .subscribe();

    return () => {
      void supabase.removeChannel(watcher);
    };
  }, [channel.id, isWatchingLive, live.leaveRoom, liveRoomId, toast, user?.id]);

  useEffect(() => {
    if (!isHostingLive) return;
    void live.joinRoom(true);
  }, [isHostingLive, live.joinRoom]);

  useEffect(() => {
    if (!isWatchingLive || !liveHostId) return;
    void live.joinRoom(true);
  }, [isWatchingLive, live.joinRoom, liveHostId]);

  const handleStartLive = () => {
    if (!user || !isAdmin) return;
    if (liveHostId && liveHostId !== user.id) {
      toast({
        title: 'Jonli efir allaqachon davom etmoqda',
        description: 'Avval mavjud efirni tugatish kerak.',
        variant: 'destructive',
      });
      return;
    }
    setIsWatchingLive(false);
    setIsHostingLive(true);
  };

  const handleJoinLive = () => {
    if (!liveHostId || liveHostId === user?.id) return;
    setIsHostingLive(false);
    setIsWatchingLive(true);
  };

  const handleLeaveLive = () => {
    live.leaveRoom();
    setIsHostingLive(false);
    setIsWatchingLive(false);
  };

  const handleSendPost = async () => {
    if (!newPost.trim() || isSending) return;
    setIsSending(true);
    const result = await createChannelPost(channel.id, newPost.trim());
    if (result) setNewPost('');
    setIsSending(false);
  };

  const handleLikePost = async (postId: string, isLiked: boolean) => {
    if (!user) return;
    try {
      if (isLiked) {
        await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
      } else {
        await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
      }
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                is_liked: !isLiked,
                likes_count: isLiked ? (post.likes_count || 1) - 1 : (post.likes_count || 0) + 1,
              }
            : post
        )
      );
    } catch (error) {
      console.error('Like error:', error);
    }
  };

  const formatCount = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value?.toString() || '0';
  };

  const handleCopyInvite = () => {
    if (!channel.invite_code) return;
    void navigator.clipboard.writeText(`${window.location.origin}/channels/join/${channel.invite_code}`);
    toast({ title: 'Havola nusxalandi!' });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-md">
        <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={channel.avatar_url || ''} />
          <AvatarFallback className="bg-primary/10 text-primary">
            <Megaphone className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-sm font-semibold">{channel.name}</h2>
            {channel.channel_type === 'private' ? (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Globe className="h-3.5 w-3.5 text-primary" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">{formatCount(channel.subscriber_count)} obunachi</p>
        </div>

        <div className="flex items-center gap-1">
          {liveHostId && liveHostId !== user?.id && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleJoinLive}
              className="h-9 gap-1.5 rounded-full px-3"
            >
              <Radio className="h-4 w-4 animate-pulse" />
              <span className="hidden sm:inline">Jonli efir</span>
            </Button>
          )}

          {isAdmin && !liveHostId && !isHostingLive && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartLive}
              className="h-9 gap-1.5 rounded-full px-3"
            >
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline">Jonli efir</span>
            </Button>
          )}

          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleCopyInvite}>
            <Share2 className="h-4 w-4" />
          </Button>

          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Kanal sozlamalari
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Users className="mr-2 h-4 w-4" />
                  A'zolarni boshqarish
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {liveHostId && !isWatchingLive && !isHostingLive && (
        <button
          type="button"
          onClick={liveHostId === user?.id ? undefined : handleJoinLive}
          className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-4 py-2.5 text-left transition hover:bg-red-500/15"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white">
            <Radio className="h-4 w-4" />
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-red-600 dark:text-red-300">Kanal jonli efirda</span>
            <span className="block text-xs text-muted-foreground">Real vaqt audio/video streamga kirish</span>
          </span>
          {liveHostId !== user?.id && <span className="text-xs font-medium text-red-600 dark:text-red-300">Kirish</span>}
        </button>
      )}

      {!isMember && (
        <div className="border-b border-border bg-muted/30 px-4 py-4">
          <p className="mb-3 text-sm text-muted-foreground">
            {channel.description || "Bu kanalda hozircha tavsif yo'q."}
          </p>
          <Button onClick={() => joinChannel(channel.id)} className="w-full">
            Kanalga obuna bo'lish
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Megaphone className="mb-3 h-12 w-12 opacity-30" />
              <p className="text-sm">Hozircha postlar yo'q</p>
            </div>
          ) : (
            posts.map((post) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-4"
              >
                <div className="mb-2 flex items-center gap-2.5">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={channel.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/10 text-xs text-primary">
                      <Megaphone className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <span className="text-sm font-semibold">{channel.name}</span>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {post.content && <p className="mb-2 whitespace-pre-wrap text-sm leading-relaxed">{post.content}</p>}

                {post.media_urls && post.media_urls.length > 0 && (
                  <div className="mb-2 overflow-hidden rounded-xl">
                    {post.media_type === 'video' ? (
                      <video src={post.media_urls[0]} controls className="max-h-80 w-full object-cover" />
                    ) : (
                      <img src={post.media_urls[0]} alt="" className="max-h-80 w-full object-cover" />
                    )}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-4">
                  <button
                    onClick={() => handleLikePost(post.id, post.is_liked)}
                    className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Heart className={cn('h-4 w-4', post.is_liked && 'fill-destructive text-destructive')} />
                    <span className="text-xs">{formatCount(post.likes_count || 0)}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
                    <Share2 className="h-4 w-4" />
                    <span className="text-xs">{formatCount(post.shares_count || 0)}</span>
                  </button>
                  <span className="ml-auto text-xs text-muted-foreground">👁 {formatCount(channel.subscriber_count)}</span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </ScrollArea>

      {isAdmin && (
        <div className="border-t border-border bg-background p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={newPost}
              onChange={(event) => setNewPost(event.target.value)}
              placeholder="Kanalga post yozing..."
              className="min-h-[40px] max-h-32 resize-none text-sm"
              rows={1}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendPost();
                }
              }}
            />
            <Button
              size="icon"
              onClick={() => void handleSendPost()}
              disabled={!newPost.trim() || isSending}
              className="h-10 w-10 flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {(isHostingLive || isWatchingLive) && (
        <ChannelLiveOverlay
          channelName={channel.name}
          localStream={live.localStream}
          participants={live.participants}
          isBroadcaster={isHostingLive}
          isConnected={live.isConnected}
          isReconnecting={live.isReconnecting}
          isMuted={live.isMuted}
          isVideoOn={live.isVideoOn}
          isScreenSharing={live.isScreenSharing}
          error={live.error}
          onToggleMute={live.toggleMute}
          onToggleVideo={live.toggleVideo}
          onToggleScreenShare={live.toggleScreenShare}
          onLeave={handleLeaveLive}
        />
      )}
    </div>
  );
}
