import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Megaphone, Users, Share2, Settings, Send, Image, MoreVertical, Globe, Lock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Channel, useChannels } from '@/hooks/useChannels';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart } from 'lucide-react';

interface ChannelViewProps {
  channel: Channel;
  onBack: () => void;
}

export function ChannelView({ channel, onBack }: ChannelViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { fetchChannelPosts, createChannelPost, joinChannel, leaveChannel } = useChannels();
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin = channel.member_role === 'admin' || channel.member_role === 'moderator';
  const isMember = channel.is_member;

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchChannelPosts(channel.id);
    setPosts(data);
    setIsLoading(false);
  }, [channel.id, fetchChannelPosts]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Realtime posts subscription
  useEffect(() => {
    const sub = supabase
      .channel(`channel-posts-${channel.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
        filter: `channel_id=eq.${channel.id}`,
      }, async (payload) => {
        const { data } = await supabase
          .from('posts')
          .select(`*, profile:profiles!posts_user_id_fkey (id, username, display_name, avatar_url, is_verified)`)
          .eq('id', payload.new.id)
          .single();
        if (data) {
          setPosts(prev => [data, ...prev]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel.id]);

  const handleSendPost = async () => {
    if (!newPost.trim() || isSending) return;
    setIsSending(true);
    const result = await createChannelPost(channel.id, newPost.trim());
    if (result) {
      setNewPost('');
    }
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
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, is_liked: !isLiked, likes_count: isLiked ? (p.likes_count || 1) - 1 : (p.likes_count || 0) + 1 }
          : p
      ));
    } catch (e) {
      console.error('Like error:', e);
    }
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n?.toString() || '0';
  };

  const handleCopyInvite = () => {
    if (channel.invite_code) {
      navigator.clipboard.writeText(`${window.location.origin}/channels/join/${channel.invite_code}`);
      toast({ title: 'Havola nusxalandi!' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-md">
        <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={channel.avatar_url || ''} />
          <AvatarFallback className="bg-primary/10 text-primary">
            <Megaphone className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="font-semibold text-sm truncate">{channel.name}</h2>
            {channel.channel_type === 'private' ? (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Globe className="h-3.5 w-3.5 text-primary" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatCount(channel.subscriber_count)} obunachi
          </p>
        </div>

        <div className="flex items-center gap-1">
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
                  <Settings className="h-4 w-4 mr-2" />
                  Kanal sozlamalari
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Users className="h-4 w-4 mr-2" />
                  A'zolarni boshqarish
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Channel Info Banner */}
      {!isMember && (
        <div className="px-4 py-4 border-b border-border bg-muted/30">
          <p className="text-sm text-muted-foreground mb-3">{channel.description || 'Bu kanalda hozircha tavsif yo\'q.'}</p>
          <Button onClick={() => joinChannel(channel.id)} className="w-full">
            Kanalga obuna bo'lish
          </Button>
        </div>
      )}

      {/* Posts Feed */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Megaphone className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Hozircha postlar yo'q</p>
            </div>
          ) : (
            posts.map(post => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-4"
              >
                {/* Post Header */}
                <div className="flex items-center gap-2.5 mb-2">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={channel.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      <Megaphone className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <span className="font-semibold text-sm">{channel.name}</span>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {/* Content */}
                {post.content && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap mb-2">{post.content}</p>
                )}

                {/* Media */}
                {post.media_urls && post.media_urls.length > 0 && (
                  <div className="rounded-xl overflow-hidden mb-2">
                    {post.media_type === 'video' ? (
                      <video src={post.media_urls[0]} controls className="w-full max-h-80 object-cover" />
                    ) : (
                      <img src={post.media_urls[0]} alt="" className="w-full max-h-80 object-cover" />
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-4 mt-2">
                  <button
                    onClick={() => handleLikePost(post.id, post.is_liked)}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Heart className={cn("h-4 w-4", post.is_liked && "fill-destructive text-destructive")} />
                    <span className="text-xs">{formatCount(post.likes_count || 0)}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                    <Share2 className="h-4 w-4" />
                    <span className="text-xs">{formatCount(post.shares_count || 0)}</span>
                  </button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    👁 {formatCount(channel.subscriber_count)}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Post Input - Only for admins */}
      {isAdmin && (
        <div className="border-t border-border p-3 bg-background">
          <div className="flex items-end gap-2">
            <Textarea
              value={newPost}
              onChange={e => setNewPost(e.target.value)}
              placeholder="Kanalga post yozing..."
              className="min-h-[40px] max-h-32 resize-none text-sm"
              rows={1}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendPost();
                }
              }}
            />
            <Button
              size="icon"
              onClick={handleSendPost}
              disabled={!newPost.trim() || isSending}
              className="flex-shrink-0 h-10 w-10"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
