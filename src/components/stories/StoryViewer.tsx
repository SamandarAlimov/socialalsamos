import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Send,
  Heart,
  Share2,
  Smile,
  Eye,
  Trash2,
  MoreHorizontal,
  Pause,
  Play,
  Bookmark,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddToHighlightDialog } from './AddToHighlightDialog';

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  views_count: number;
  expires_at: string;
  created_at: string;
}

interface StoryGroup {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  stories: Story[];
  all_story_ids: string[];
}

interface StoryViewer {
  id: string;
  viewer_id: string;
  viewed_at: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface StoryViewerProps {
  storyGroup: StoryGroup;
  allGroups: StoryGroup[];
  initialIndex?: number;
  onClose: () => void;
  onMarkAsViewed?: (storyId: string) => void;
  onDelete?: (storyId: string) => void;
}

export function StoryViewer({
  storyGroup,
  allGroups,
  initialIndex = 0,
  onClose,
  onMarkAsViewed,
  onDelete,
}: StoryViewerProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  const [activeGroup, setActiveGroup] = useState(storyGroup);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [storyReply, setStoryReply] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<StoryViewer[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [showAddToHighlight, setShowAddToHighlight] = useState(false);
  
  const storyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const currentStory = activeGroup.stories[activeIndex];
  const isOwnStory = user?.id === activeGroup.user_id;

  // Mark story as viewed
  useEffect(() => {
    if (currentStory && user && !isOwnStory) {
      markAsViewed(currentStory.id);
      onMarkAsViewed?.(currentStory.id);
    }
  }, [currentStory?.id, user, isOwnStory]);

  // Fetch viewers for own story with realtime updates
  useEffect(() => {
    if (!isOwnStory || !currentStory) return;

    // Initial fetch
    fetchViewers(currentStory.id);

    // Set up realtime subscription for story views
    const channel = supabase
      .channel(`story-views-${currentStory.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'story_views',
          filter: `story_id=eq.${currentStory.id}`,
        },
        async (payload) => {
          // Fetch the new viewer's profile
          const { data: viewerProfile } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .eq('id', payload.new.viewer_id)
            .single();

          if (viewerProfile) {
            const newViewer: StoryViewer = {
              id: payload.new.id,
              viewer_id: payload.new.viewer_id,
              viewed_at: payload.new.viewed_at,
              profile: viewerProfile,
            };
            setViewers(prev => [newViewer, ...prev.filter(v => v.viewer_id !== newViewer.viewer_id)]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOwnStory, currentStory?.id]);

  // Auto-advance timer
  useEffect(() => {
    if (isPaused || showViewers) return;
    
    if (currentStory?.media_type !== 'video') {
      storyTimerRef.current = setTimeout(() => {
        nextStory();
      }, 5000);
    }

    return () => {
      if (storyTimerRef.current) {
        clearTimeout(storyTimerRef.current);
      }
    };
  }, [activeGroup, activeIndex, isPaused, showViewers]);

  const markAsViewed = async (storyId: string) => {
    if (!user) return;
    
    try {
      await supabase
        .from('story_views')
        .upsert({
          story_id: storyId,
          viewer_id: user.id,
        }, { onConflict: 'story_id,viewer_id' });
    } catch (error) {
      console.error('Error marking story as viewed:', error);
    }
  };

  const fetchViewers = async (storyId: string) => {
    setLoadingViewers(true);
    try {
      const { data, error } = await supabase
        .from('story_views')
        .select(`
          id,
          viewer_id,
          viewed_at,
          profile:profiles!story_views_viewer_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('story_id', storyId)
        .order('viewed_at', { ascending: false });

      if (error) throw error;
      setViewers((data || []) as unknown as StoryViewer[]);
    } catch (error) {
      console.error('Error fetching viewers:', error);
    } finally {
      setLoadingViewers(false);
    }
  };

  const nextStory = useCallback(() => {
    if (activeIndex < activeGroup.stories.length - 1) {
      setActiveIndex(prev => prev + 1);
    } else {
      // Move to next group
      const currentGroupIndex = allGroups.findIndex(g => g.user_id === activeGroup.user_id);
      if (currentGroupIndex < allGroups.length - 1) {
        const nextGroup = allGroups[currentGroupIndex + 1];
        setActiveGroup(nextGroup);
        setActiveIndex(0);
        setShowViewers(false);
      } else {
        onClose();
      }
    }
  }, [activeGroup, activeIndex, allGroups, onClose]);

  const prevStory = useCallback(() => {
    if (activeIndex > 0) {
      setActiveIndex(prev => prev - 1);
    } else {
      // Move to previous group
      const currentGroupIndex = allGroups.findIndex(g => g.user_id === activeGroup.user_id);
      if (currentGroupIndex > 0) {
        const prevGroup = allGroups[currentGroupIndex - 1];
        setActiveGroup(prevGroup);
        setActiveIndex(prevGroup.stories.length - 1);
        setShowViewers(false);
      }
    }
  }, [activeGroup, activeIndex, allGroups]);

  const handleStoryReply = async () => {
    if (!storyReply.trim() || !activeGroup || !user || isSendingReply) return;
    
    setIsSendingReply(true);
    
    try {
      // Find or create conversation with story owner
      const storyOwnerId = activeGroup.user_id;
      
      // Check if conversation already exists
      const { data: myParticipations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      let existingConversationId: string | null = null;

      if (myParticipations && myParticipations.length > 0) {
        for (const p of myParticipations) {
          const { data: otherParticipant } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('conversation_id', p.conversation_id)
            .eq('user_id', storyOwnerId)
            .single();

          if (otherParticipant) {
            const { data: existingConv } = await supabase
              .from('conversations')
              .select('id')
              .eq('id', p.conversation_id)
              .eq('type', 'private')
              .single();

            if (existingConv) {
              existingConversationId = existingConv.id;
              break;
            }
          }
        }
      }

      let conversationId = existingConversationId;

      if (!conversationId) {
        // Create new conversation
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            type: 'private',
            owner_id: user.id,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (convError) throw convError;

        // Add both participants
        await supabase
          .from('conversation_participants')
          .insert([
            { conversation_id: newConv.id, user_id: user.id, role: 'owner' },
            { conversation_id: newConv.id, user_id: storyOwnerId, role: 'member' },
          ]);

        conversationId = newConv.id;
      }

      // Send the story reply as a message with story_id reference
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: storyReply.trim(),
          story_id: currentStory.id,
        });

      if (msgError) throw msgError;

      // Update conversation last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      toast.success('Reply sent!');
      setStoryReply('');
    } catch (error) {
      console.error('Error sending story reply:', error);
      toast.error('Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleShare = () => {
    // TODO: Implement share functionality
    console.log('Share story');
  };

  const handleLike = () => {
    setIsLiked(prev => !prev);
    // TODO: Implement story like
  };

  const handleDelete = () => {
    if (currentStory && onDelete) {
      onDelete(currentStory.id);
    }
  };

  const handleViewerClick = (viewer: { id: string; username?: string }) => {
    onClose();
    navigate(`/user/${viewer.username || viewer.id}`);
  };

  const togglePause = () => {
    setIsPaused(prev => !prev);
    if (videoRef.current) {
      if (isPaused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  if (!currentStory) return null;

  const storyViewerContent = (
    <div className={cn(
      "fixed inset-0 bg-black",
      isMobile ? "overflow-hidden touch-none" : "flex items-center justify-center overflow-hidden"
    )}
    style={{ zIndex: 9999 }}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className={cn(
          "z-20 text-white hover:text-muted-foreground",
          isMobile ? "fixed top-4 right-4 safe-area-top" : "absolute top-4 right-4"
        )}
      >
        <X className="h-8 w-8" />
      </button>

      {/* Navigation Arrows (Desktop/Tablet - Outside Container) */}
      {!isMobile && (
        <>
          <button
            onClick={prevStory}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 rounded-full p-3 backdrop-blur-sm z-20"
          >
            <ChevronLeft className="h-8 w-8 text-white" />
          </button>
          <button
            onClick={nextStory}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 rounded-full p-3 backdrop-blur-sm z-20"
          >
            <ChevronRight className="h-8 w-8 text-white" />
          </button>
        </>
      )}

      {/* Main Container */}
      <div className={cn(
        "relative flex flex-col",
        isMobile
          ? "h-[100dvh] w-full"
          : "h-[calc(100vh-80px)] max-h-[800px] w-full max-w-[450px] mx-auto"
      )}>
        {/* Story Content */}
        <div className={cn(
          "relative bg-black flex-1 flex flex-col",
          isMobile ? "h-full" : "rounded-xl overflow-hidden"
        )}>
          {/* Progress Bars */}
          <div className={cn(
            "absolute left-4 right-4 flex gap-1 z-10",
            isMobile ? "top-4 safe-area-top" : "top-4"
          )}>
            {activeGroup.stories.map((_, idx) => (
              <div key={idx} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                <div
                  ref={idx === activeIndex ? progressRef : null}
                  className={cn(
                    "h-full bg-white transition-all",
                    idx < activeIndex ? "w-full" :
                    idx === activeIndex && !isPaused ? "w-full animate-story-progress" : "w-0"
                  )}
                  style={idx === activeIndex && !isPaused && currentStory.media_type !== 'video'
                    ? { animationDuration: '5s' }
                    : undefined}
                />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className={cn(
            "absolute left-4 right-16 flex items-center justify-between z-10",
            isMobile ? "top-10 safe-area-top" : "top-10"
          )}>
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => {
                onClose();
                navigate(`/user/${activeGroup.username || activeGroup.user_id}`);
              }}
            >
              <Avatar className="h-10 w-10 border-2 border-white">
                <AvatarImage src={activeGroup.avatar_url || ''} />
                <AvatarFallback>
                  {activeGroup.display_name?.[0] || activeGroup.username?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-white font-semibold text-sm">
                    {activeGroup.display_name || activeGroup.username}
                  </p>
                  {activeGroup.is_verified && <VerifiedBadge size="sm" />}
                </div>
                <p className="text-white/60 text-xs">
                  {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={togglePause}
                className="text-white/80 hover:text-white"
              >
                {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </button>

              {isOwnStory && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-white/80 hover:text-white">
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[110]">
                    <DropdownMenuItem onClick={() => setShowAddToHighlight(true)}>
                      <Bookmark className="h-4 w-4 mr-2" />
                      Add to Highlight
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Story
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Media */}
          <div className={cn(
            "absolute inset-0 flex items-center justify-center",
            isMobile ? "pt-24 pb-28 safe-area-top safe-area-bottom" : "pt-20 pb-24"
          )}>
            <div className="relative w-full h-full flex items-center justify-center">
              {currentStory.media_type === 'video' ? (
                <video
                  ref={videoRef}
                  src={currentStory.media_url}
                  className="max-w-full max-h-full object-contain"
                  autoPlay
                  playsInline
                  muted={false}
                  onEnded={nextStory}
                />
              ) : (
                <img
                  src={currentStory.media_url}
                  alt="Story"
                  className="max-w-full max-h-full object-contain"
                />
              )}
            </div>
          </div>

          {/* Caption */}
          {currentStory.caption && (
            <div className={cn(
              "absolute left-4 right-4 text-white text-center z-10",
              isMobile ? "bottom-28" : "bottom-24"
            )}>
              <p className="bg-black/50 rounded-lg px-4 py-2 text-sm backdrop-blur-sm">
                {currentStory.caption}
              </p>
            </div>
          )}

          {/* Viewers Button (Own Story) */}
          {isOwnStory && (
            <div className={cn(
              "absolute left-0 right-0 z-10",
              isMobile ? "bottom-6 safe-area-bottom" : "bottom-6"
            )}>
              <button
                onClick={() => setShowViewers(true)}
                className="flex items-center gap-2 text-white bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mx-auto"
              >
                <Eye className="h-4 w-4" />
                <span className="text-sm">{viewers.length || currentStory.views_count} viewers</span>
              </button>
            </div>
          )}

          {/* Bottom Actions */}
          {!isOwnStory && (
            <div className={cn(
              "z-10 bg-gradient-to-t from-black/80 to-transparent",
              isMobile
                ? "absolute bottom-0 left-0 right-0 p-4 pb-6 safe-area-bottom"
                : "absolute bottom-0 left-0 right-0 p-4 rounded-b-xl"
            )}>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input
                    value={storyReply}
                    onChange={(e) => setStoryReply(e.target.value)}
                    placeholder="Send message..."
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50 pr-10 backdrop-blur-sm h-11"
                    onKeyDown={(e) => e.key === 'Enter' && handleStoryReply()}
                  />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white">
                    <Smile className="h-5 w-5" />
                  </button>
                </div>
                <button
                  onClick={handleLike}
                  className={cn(
                    "p-2.5 rounded-full transition-colors",
                    isLiked ? "text-red-500" : "text-white hover:text-red-400"
                  )}
                >
                  <Heart className={cn("h-6 w-6", isLiked && "fill-current")} />
                </button>
                <button
                  onClick={handleShare}
                  className="p-2.5 text-white hover:text-primary"
                >
                  <Share2 className="h-6 w-6" />
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20 h-11 w-11"
                  onClick={handleStoryReply}
                  disabled={!storyReply.trim() || isSendingReply}
                >
                  {isSendingReply ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Navigation Touch Areas */}
          <div
            onClick={prevStory}
            className={cn(
              "absolute left-0 top-24 w-1/3 cursor-pointer z-5",
              isMobile ? "bottom-24" : "bottom-24"
            )}
          />
          <div
            onClick={nextStory}
            className={cn(
              "absolute right-0 top-24 w-1/3 cursor-pointer z-5",
              isMobile ? "bottom-24" : "bottom-24"
            )}
          />
        </div>
      </div>

      {/* Viewers Sheet (Own Story) */}
      {showViewers && isOwnStory && (
        <div
          className="absolute inset-0 z-30 flex items-end justify-center"
          onClick={() => setShowViewers(false)}
        >
          <div
            className={cn(
              "bg-background rounded-t-2xl w-full animate-slide-up",
              isMobile ? "max-h-[60vh]" : "max-w-lg max-h-[50vh]"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border">
              <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Viewers</h3>
                <span className="text-muted-foreground text-sm">{viewers.length}</span>
              </div>
            </div>
            <div className="max-h-[45vh] overflow-y-auto">
              {loadingViewers ? (
                <div className="p-4 text-center text-muted-foreground">Loading...</div>
              ) : viewers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No viewers yet</div>
              ) : (
                <div className="p-2">
                  {viewers.map((viewer) => (
                    <button
                      key={viewer.id}
                      onClick={() => handleViewerClick({ id: viewer.viewer_id, username: viewer.profile?.username || undefined })}
                      className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-accent transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={viewer.profile?.avatar_url || ''} />
                        <AvatarFallback>
                          {viewer.profile?.display_name?.[0] || viewer.profile?.username?.[0] || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left flex-1">
                        <p className="font-medium text-sm">
                          {viewer.profile?.display_name || viewer.profile?.username}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(viewer.viewed_at), { addSuffix: true })}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add to Highlight Dialog */}
      <AddToHighlightDialog
        open={showAddToHighlight}
        onOpenChange={setShowAddToHighlight}
        story={currentStory ? {
          id: currentStory.id,
          media_url: currentStory.media_url,
          media_type: currentStory.media_type,
          caption: currentStory.caption,
        } : null}
      />
    </div>
  );

  // Use portal to render outside AppLayout
  return createPortal(storyViewerContent, document.body);
}
