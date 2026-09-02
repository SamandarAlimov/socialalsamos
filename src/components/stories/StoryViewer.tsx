import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Flag,
  Heart,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Send,
  Smile,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useStoryViewers } from '@/hooks/useStoryViews';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmojiText } from '@/components/emoji/EmojiText';
import { EmojiPicker } from '@/components/EmojiPicker';
import { StoryStickerOverlay } from '@/components/stickers/StoryStickerOverlay';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddToHighlightDialog } from './AddToHighlightDialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

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

interface StoryViewerProps {
  storyGroup: StoryGroup;
  allGroups: StoryGroup[];
  initialIndex?: number;
  onClose: () => void;
  onMarkAsViewed?: (storyId: string) => void;
  onDelete?: (storyId: string) => void;
}

const IMAGE_DURATION_MS = 5000;
const HOLD_DELAY_MS = 170;
const TAP_MOVE_TOLERANCE = 14;
const SWIPE_DISTANCE = 56;
const SWIPE_DOWN_DISTANCE = 82;

function compactStoryAge(iso: string): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return 'hozir';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h';
  const days = Math.floor(hours / 24);
  return days + 'd';
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return Boolean(
    target instanceof HTMLElement &&
      target.closest(
        '[data-story-interactive="true"], button, input, textarea, select, a, [role="button"]',
      ),
  );
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

  const [activeGroup, setActiveGroup] = useState(storyGroup);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [storyReply, setStoryReply] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [isReplyFocused, setIsReplyFocused] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showAddToHighlight, setShowAddToHighlight] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progressWidth, setProgressWidth] = useState(0);
  const [mediaTime, setMediaTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageElapsedRef = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    pointerId: number;
  } | null>(null);
  const pointerMovedRef = useRef(false);
  const heldRef = useRef(false);

  const currentStory = activeGroup.stories[activeIndex];
  const isOwnStory = user?.id === activeGroup.user_id;
  const isVideo = currentStory?.media_type === 'video';

  const {
    viewers,
    viewCount,
    isLoading: loadingViewers,
  } = useStoryViewers(isOwnStory ? currentStory?.id ?? null : null);

  const storySuspended =
    isPaused ||
    isHolding ||
    isReplyFocused ||
    isMenuOpen ||
    showViewers ||
    showAddToHighlight;

  const currentViewCount = Math.max(
    viewCount || 0,
    currentStory?.views_count || 0,
  );

  const currentGroupIndex = useMemo(
    () => allGroups.findIndex((group) => group.user_id === activeGroup.user_id),
    [activeGroup.user_id, allGroups],
  );

  const nextStory = useCallback(() => {
    if (activeIndex < activeGroup.stories.length - 1) {
      setActiveIndex((index) => index + 1);
      return;
    }

    if (currentGroupIndex >= 0 && currentGroupIndex < allGroups.length - 1) {
      setActiveGroup(allGroups[currentGroupIndex + 1]);
      setActiveIndex(0);
      setShowViewers(false);
      return;
    }

    onClose();
  }, [
    activeGroup.stories.length,
    activeIndex,
    allGroups,
    currentGroupIndex,
    onClose,
  ]);

  const prevStory = useCallback(() => {
    if (activeIndex > 0) {
      setActiveIndex((index) => index - 1);
      return;
    }

    if (currentGroupIndex > 0) {
      const previousGroup = allGroups[currentGroupIndex - 1];
      setActiveGroup(previousGroup);
      setActiveIndex(previousGroup.stories.length - 1);
      setShowViewers(false);
    }
  }, [activeIndex, allGroups, currentGroupIndex]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      clearHoldTimer();
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, []);

  useEffect(() => {
    if (!currentStory) return;

    imageElapsedRef.current = 0;
    setProgressWidth(0);
    setMediaTime(0);
    setIsPaused(false);
    setIsHolding(false);
    setIsLiked(false);
    setStoryReply('');
    setIsReplyFocused(false);
    heldRef.current = false;
  }, [currentStory?.id]);

  useEffect(() => {
    if (!currentStory || !user || isOwnStory) return;

    let cancelled = false;

    void supabase
      .from('story_views')
      .upsert(
        {
          story_id: currentStory.id,
          viewer_id: user.id,
        },
        { onConflict: 'story_id,viewer_id' },
      )
      .then(({ error }) => {
        if (!cancelled && error) {
          console.error('Error marking story as viewed:', error);
        }
      });

    onMarkAsViewed?.(currentStory.id);

    return () => {
      cancelled = true;
    };
  }, [currentStory?.id, isOwnStory, onMarkAsViewed, user]);

  // Image story progress: pause/resume davom etadi, 0 dan qayta boshlanmaydi.
  useEffect(() => {
    if (!currentStory || isVideo || storySuspended) return;

    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      imageElapsedRef.current += now - last;
      last = now;

      const progress = Math.min(
        100,
        (imageElapsedRef.current / IMAGE_DURATION_MS) * 100,
      );
      setProgressWidth(progress);
      setMediaTime(imageElapsedRef.current / 1000);

      if (progress >= 100) {
        window.clearInterval(timer);
        nextStory();
      }
    }, 40);

    return () => window.clearInterval(timer);
  }, [currentStory?.id, isVideo, nextStory, storySuspended]);

  // Video story pause/resume barcha modal/input holatlari bilan sinxron.
  useEffect(() => {
    if (!isVideo) return;
    const video = videoRef.current;
    if (!video) return;

    if (storySuspended) {
      video.pause();
    } else {
      void video.play().catch(() => {
        // Autoplay policy ba'zi brauzerlarda play'ni rad qilishi mumkin.
      });
    }
  }, [currentStory?.id, isVideo, storySuspended]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const focused = document.activeElement as HTMLElement | null;
      const typing =
        focused?.tagName === 'INPUT' ||
        focused?.tagName === 'TEXTAREA' ||
        focused?.isContentEditable;

      if (event.key === 'Escape') {
        event.preventDefault();
        if (showViewers) {
          setShowViewers(false);
          return;
        }
        onClose();
        return;
      }

      if (typing) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prevStory();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextStory();
      } else if (event.key === ' ' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPaused((value) => !value);
      } else if (event.key.toLowerCase() === 'm' && isVideo) {
        event.preventDefault();
        setIsMuted((value) => !value);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isVideo, nextStory, onClose, prevStory, showViewers]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isInteractiveTarget(event.target)) return;

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ba'zi webview'larda pointer capture yo'q.
      }

      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
        pointerId: event.pointerId,
      };
      pointerMovedRef.current = false;
      heldRef.current = false;

      clearHoldTimer();
      holdTimerRef.current = setTimeout(() => {
        heldRef.current = true;
        setIsHolding(true);
      }, HOLD_DELAY_MS);
    },
    [clearHoldTimer],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerStartRef.current;
      if (!start || start.pointerId !== event.pointerId) return;

      const distance = Math.hypot(
        event.clientX - start.x,
        event.clientY - start.y,
      );

      if (distance > TAP_MOVE_TOLERANCE) {
        pointerMovedRef.current = true;
        clearHoldTimer();
      }
    },
    [clearHoldTimer],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = pointerStartRef.current;
      clearHoldTimer();

      if (!start || start.pointerId !== event.pointerId) {
        pointerStartRef.current = null;
        return;
      }

      const wasHeld = heldRef.current;
      if (wasHeld) {
        heldRef.current = false;
        setIsHolding(false);
        pointerStartRef.current = null;
        return;
      }

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const elapsed = Date.now() - start.time;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      pointerStartRef.current = null;

      if (absY > SWIPE_DOWN_DISTANCE && absY > absX * 1.15) {
        if (dy > 0) {
          onClose();
        } else if (isOwnStory) {
          setShowViewers(true);
        }
        return;
      }

      if (absX > SWIPE_DISTANCE && absX > absY * 1.15 && elapsed < 750) {
        if (dx > 0) prevStory();
        else nextStory();
        return;
      }

      if (pointerMovedRef.current || elapsed > 380) return;

      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;

      const relativeX = event.clientX - rect.left;
      if (relativeX < rect.width * 0.34) {
        prevStory();
      } else if (relativeX > rect.width * 0.66) {
        nextStory();
      }
    },
    [clearHoldTimer, isOwnStory, nextStory, onClose, prevStory],
  );

  const handlePointerCancel = useCallback(() => {
    clearHoldTimer();
    pointerStartRef.current = null;
    pointerMovedRef.current = false;
    if (heldRef.current) {
      heldRef.current = false;
      setIsHolding(false);
    }
  }, [clearHoldTimer]);

  const openProfile = useCallback(() => {
    onClose();
    if (user?.id === activeGroup.user_id) {
      navigate('/profile');
    } else {
      navigate('/user/' + (activeGroup.username || activeGroup.user_id));
    }
  }, [
    activeGroup.user_id,
    activeGroup.username,
    navigate,
    onClose,
    user?.id,
  ]);

  const ensurePrivateConversation = useCallback(
    async (storyOwnerId: string): Promise<string> => {
      if (!user) throw new Error('User required');

      const { data: myParticipations, error: participationError } =
        await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', user.id);

      if (participationError) throw participationError;

      for (const participation of myParticipations || []) {
        const { data: otherParticipant } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('conversation_id', participation.conversation_id)
          .eq('user_id', storyOwnerId)
          .maybeSingle();

        if (!otherParticipant) continue;

        const { data: conversation } = await supabase
          .from('conversations')
          .select('id')
          .eq('id', participation.conversation_id)
          .eq('type', 'private')
          .maybeSingle();

        if (conversation?.id) return conversation.id;
      }

      const { data: newConversation, error: conversationError } = await supabase
        .from('conversations')
        .insert({
          type: 'private',
          owner_id: user.id,
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (conversationError) throw conversationError;

      const { error: participantsError } = await supabase
        .from('conversation_participants')
        .insert([
          {
            conversation_id: newConversation.id,
            user_id: user.id,
            role: 'owner',
          },
          {
            conversation_id: newConversation.id,
            user_id: storyOwnerId,
            role: 'member',
          },
        ]);

      if (participantsError) throw participantsError;
      return newConversation.id;
    },
    [user],
  );

  const handleStoryReply = useCallback(async () => {
    if (
      !storyReply.trim() ||
      !currentStory ||
      !user ||
      isSendingReply ||
      isOwnStory
    ) {
      return;
    }

    setIsSendingReply(true);

    try {
      const conversationId = await ensurePrivateConversation(
        activeGroup.user_id,
      );

      const { error: messageError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: storyReply.trim(),
        story_id: currentStory.id,
      });

      if (messageError) throw messageError;

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      setStoryReply('');
      toast.success('Javob yuborildi');
    } catch (error) {
      console.error('Story reply error:', error);
      toast.error('Javobni yuborib bo‘lmadi');
    } finally {
      setIsSendingReply(false);
    }
  }, [
    activeGroup.user_id,
    currentStory,
    ensurePrivateConversation,
    isOwnStory,
    isSendingReply,
    storyReply,
    user,
  ]);

  const handleShare = useCallback(async () => {
    if (!currentStory) return;

    const shareUrl = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title:
            (activeGroup.username || activeGroup.display_name || 'Alsamos') +
            ' storisi',
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Havola nusxalandi');
      }
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        console.error('Story share error:', error);
      }
    }
  }, [
    activeGroup.display_name,
    activeGroup.username,
    currentStory,
  ]);

  const handleSaveStory = useCallback(async () => {
    if (!currentStory) return;

    try {
      const response = await fetch(currentStory.media_url);
      if (!response.ok) throw new Error('Story download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        'story_' +
        currentStory.id +
        (currentStory.media_type === 'video' ? '.mp4' : '.jpg');
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Stori saqlandi');
    } catch (error) {
      console.error('Story save error:', error);
      toast.error('Storini saqlab bo‘lmadi');
    }
  }, [currentStory]);

  const handleViewerClick = useCallback(
    (viewer: { id: string; username?: string }) => {
      onClose();
      navigate('/user/' + (viewer.username || viewer.id));
    },
    [navigate, onClose],
  );

  if (!currentStory) return null;

  const authorLabel =
    activeGroup.username ||
    activeGroup.display_name ||
    'Foydalanuvchi';

  const storyViewerContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden overscroll-none bg-[#090a0d] text-white"
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* Desktop navigatsiya — story stage tashqarisida, mobilga xalaqit bermaydi. */}
      <button
        type="button"
        data-story-interactive="true"
        onClick={prevStory}
        aria-label="Oldingi stori"
        className={cn(
          'absolute left-[max(18px,calc(50%-285px))] top-1/2 z-40 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/90 shadow-xl backdrop-blur-xl transition hover:bg-white/18 lg:flex',
          currentGroupIndex === 0 && activeIndex === 0 && 'pointer-events-none opacity-25',
        )}
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      <button
        type="button"
        data-story-interactive="true"
        onClick={nextStory}
        aria-label="Keyingi stori"
        className="absolute right-[max(18px,calc(50%-285px))] top-1/2 z-40 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/90 shadow-xl backdrop-blur-xl transition hover:bg-white/18 lg:flex"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      <div
        ref={stageRef}
        className={cn(
          'relative isolate h-[100dvh] w-full overflow-hidden bg-black shadow-2xl',
          'sm:h-[min(94dvh,860px)] sm:w-auto sm:aspect-[9/16] sm:max-w-[calc(100vw-120px)] sm:rounded-[24px] sm:ring-1 sm:ring-white/10',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Media backdrop: noto'g'ri aspect-ratio rasmlar ham premium ko'rinadi. */}
        {!isVideo && (
          <img
            src={currentStory.media_url}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-3xl"
          />
        )}
        <div className="absolute inset-0 bg-black/20" />

        {isVideo ? (
          <video
            ref={videoRef}
            key={currentStory.id}
            src={currentStory.media_url}
            autoPlay
            playsInline
            muted={isMuted}
            preload="auto"
            className="absolute inset-0 h-full w-full bg-black object-contain"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (video.duration > 0) {
                setProgressWidth(
                  Math.min(100, (video.currentTime / video.duration) * 100),
                );
              }
            }}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              setMediaTime(video.currentTime);
              if (video.duration > 0 && Number.isFinite(video.duration)) {
                setProgressWidth(
                  Math.min(100, (video.currentTime / video.duration) * 100),
                );
              }
            }}
            onEnded={nextStory}
          />
        ) : (
          <img
            key={currentStory.id}
            src={currentStory.media_url}
            alt="Story"
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}

        {/* Readable chrome: media o'zini bosib ketmaydi, faqat gradient qatlam. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-52 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Progress + identity */}
        <div
          className={cn(
            'absolute inset-x-0 top-0 z-30 px-2.5 transition-opacity duration-150 sm:px-3',
            isHolding && 'opacity-0',
          )}
          style={{
            paddingTop: 'max(10px, env(safe-area-inset-top))',
          }}
        >
          <div className="flex gap-1">
            {activeGroup.stories.map((story, index) => (
              <div
                key={story.id}
                className="h-[2.5px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                <div
                  className="h-full rounded-full bg-white"
                  style={{
                    width:
                      index < activeIndex
                        ? '100%'
                        : index === activeIndex
                          ? progressWidth + '%'
                          : '0%',
                    transition:
                      index === activeIndex ? 'width 40ms linear' : 'none',
                  }}
                />
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              data-story-interactive="true"
              onClick={openProfile}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Avatar className="h-9 w-9 shrink-0 border border-white/45 bg-black/30">
                <AvatarImage src={activeGroup.avatar_url || ''} />
                <AvatarFallback className="bg-white/15 text-xs text-white">
                  {(activeGroup.display_name ||
                    activeGroup.username ||
                    'U')[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <span className="flex min-w-0 items-center gap-1.5 text-sm drop-shadow">
                <span className="max-w-[180px] truncate font-semibold text-white">
                  {authorLabel}
                </span>
                {activeGroup.is_verified && <VerifiedBadge size="xs" />}
                <span className="shrink-0 text-white/65">
                  {compactStoryAge(currentStory.created_at)}
                </span>
              </span>
            </button>

            {isVideo && (
              <button
                type="button"
                data-story-interactive="true"
                onClick={() => setIsMuted((value) => !value)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/12"
                aria-label={isMuted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}
              >
                {isMuted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
            )}

            <button
              type="button"
              data-story-interactive="true"
              onClick={() => setIsPaused((value) => !value)}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/12 sm:flex"
              aria-label={isPaused ? 'Davom ettirish' : 'Pauza'}
            >
              {isPaused ? (
                <Play className="h-5 w-5 fill-current" />
              ) : (
                <Pause className="h-5 w-5 fill-current" />
              )}
            </button>

            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-story-interactive="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/12"
                  aria-label="Stori amallari"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="z-[10020] min-w-[210px] rounded-2xl p-1.5"
              >
                {isOwnStory ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => setShowAddToHighlight(true)}
                      className="rounded-xl"
                    >
                      <Bookmark className="mr-2 h-4 w-4" />
                      Highlight'ga qo‘shish
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleSaveStory}
                      className="rounded-xl"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Storini saqlash
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => currentStory && onDelete?.(currentStory.id)}
                      className="rounded-xl text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Storini o‘chirish
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem
                      onClick={handleSaveStory}
                      className="rounded-xl"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Storini saqlash
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        toast.success(
                          'Shikoyat qabul qilindi. Moderatsiya ko‘rib chiqadi.',
                        )
                      }
                      className="rounded-xl text-destructive"
                    >
                      <Flag className="mr-2 h-4 w-4" />
                      Shikoyat qilish
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              data-story-interactive="true"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/12"
              aria-label="Storini yopish"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Interactive story stickers. */}
        <div className="pointer-events-none absolute inset-0 z-20 [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_textarea]:pointer-events-auto">
          <StoryStickerOverlay
            postId={currentStory.id}
            currentTime={mediaTime}
            readOnly={isOwnStory}
            className="h-full w-full"
          />
        </div>

        {/* Caption story ichida, pastki composer ustida. */}
        {currentStory.caption && (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-5 z-[25] flex justify-center transition-opacity duration-150',
              isOwnStory ? 'bottom-20' : 'bottom-[92px]',
              isHolding && 'opacity-0',
            )}
          >
            <div
              className="max-w-[92%] rounded-xl bg-black/48 px-3 py-2 text-center text-[15px] font-medium leading-snug text-white shadow-lg backdrop-blur-md"
              style={{ overflowWrap: 'anywhere' }}
            >
              <EmojiText text={currentStory.caption} size={19} />
            </div>
          </div>
        )}

        {/* Long press feedback juda nozik — media ustini yopmaydi. */}
        {isHolding && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white shadow-xl backdrop-blur-md">
              <Pause className="h-5 w-5 fill-current" />
            </span>
          </div>
        )}

        {/* Bottom interaction chrome */}
        <div
          data-story-interactive="true"
          className={cn(
            'absolute inset-x-0 bottom-0 z-30 px-3 transition-opacity duration-150 sm:px-4',
            isHolding && 'opacity-0',
          )}
          style={{
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          }}
        >
          {isOwnStory ? (
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShowViewers(true)}
                className="flex max-w-[92%] items-center gap-2.5 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-xl transition hover:bg-black/50"
              >
                <span className="flex -space-x-2">
                  {viewers.slice(0, 3).map((viewer) => (
                    <Avatar
                      key={viewer.id}
                      className="h-6 w-6 border-2 border-black/60"
                    >
                      <AvatarImage src={viewer.profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-neutral-700 text-[9px] text-white">
                        {(viewer.profile?.username ||
                          viewer.profile?.display_name ||
                          'U')[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {viewers.length === 0 && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/10">
                      <Eye className="h-3.5 w-3.5" />
                    </span>
                  )}
                </span>
                <span>
                  Faollik · {currentViewCount}
                </span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="relative min-w-0 flex-1">
                <Input
                  value={storyReply}
                  onChange={(event) => setStoryReply(event.target.value)}
                  onFocus={() => setIsReplyFocused(true)}
                  onBlur={() => setIsReplyFocused(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && storyReply.trim()) {
                      event.preventDefault();
                      void handleStoryReply();
                    }
                  }}
                  placeholder="Xabar yuboring..."
                  className="h-12 rounded-full border-white/45 bg-black/20 pl-4 pr-11 text-[15px] text-white shadow-lg backdrop-blur-xl placeholder:text-white/65 focus-visible:border-white/70 focus-visible:ring-white/30"
                />

                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <EmojiPicker
                    onSelect={(emoji) =>
                      setStoryReply((previous) => previous + emoji)
                    }
                    trigger={
                      <button
                        type="button"
                        data-story-interactive="true"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white"
                        aria-label="Emoji"
                      >
                        <Smile className="h-5 w-5" />
                      </button>
                    }
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsLiked((value) => !value)}
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition',
                  isLiked
                    ? 'text-rose-500'
                    : 'text-white hover:bg-white/10',
                )}
                aria-label="Storini yoqtirish"
              >
                <Heart
                  className={cn('h-7 w-7', isLiked && 'fill-current')}
                />
              </button>

              {storyReply.trim() ? (
                <button
                  type="button"
                  onClick={() => void handleStoryReply()}
                  disabled={isSendingReply}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-50"
                  aria-label="Javob yuborish"
                >
                  {isSendingReply ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-6 w-6" />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10"
                  aria-label="Storini ulashish"
                >
                  <Send className="h-6 w-6" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Owner activity / viewers — current story strip bilan. */}
      <Sheet
        open={showViewers && isOwnStory}
        onOpenChange={setShowViewers}
      >
        <SheetContent
          side="bottom"
          className="z-[10010] h-[78dvh] overflow-hidden rounded-t-[28px] border-border/70 px-0 pb-0 sm:mx-auto sm:h-[680px] sm:max-h-[84dvh] sm:max-w-[560px]"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/25" />

          <SheetHeader className="border-b border-border/60 px-5 pb-4 pt-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <SheetTitle className="text-left text-base">
                  Story faolligi
                </SheetTitle>
                <p className="mt-0.5 text-left text-xs text-muted-foreground">
                  {currentViewCount} ta ko‘rish
                </p>
              </div>

              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(currentStory.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-destructive"
                  aria-label="Storini o‘chirish"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          </SheetHeader>

          <div className="border-b border-border/60 px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {activeGroup.stories.map((story, index) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    'relative h-24 w-[58px] shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border transition',
                    index === activeIndex &&
                      'h-28 w-[66px] ring-2 ring-foreground/75',
                  )}
                >
                  {story.media_type === 'video' ? (
                    <video
                      src={story.media_url}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      src={story.media_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}

                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/75 to-transparent pb-1.5 pt-5 text-[10px] font-semibold text-white">
                    <Users className="h-3 w-3" />
                    {story.id === currentStory.id
                      ? currentViewCount
                      : story.views_count || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
            <Users className="h-[18px] w-[18px] text-link" />
            <span className="text-sm font-semibold">
              Ko‘rganlar
            </span>
            <span className="text-sm font-semibold text-link">
              {currentViewCount}
            </span>
          </div>

          <div className="h-[calc(100%-210px)] overflow-y-auto overscroll-contain">
            {loadingViewers ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : viewers.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Eye className="h-6 w-6 text-muted-foreground" />
                </span>
                <p className="mt-4 text-sm font-semibold">
                  Hali hech kim ko‘rmagan
                </p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Storini ko‘rgan foydalanuvchilar shu yerda real vaqtda paydo bo‘ladi.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/45">
                {viewers.map((viewer) => {
                  const username = viewer.profile?.username || null;
                  const displayName =
                    viewer.profile?.display_name || username || 'Foydalanuvchi';

                  return (
                    <button
                      key={viewer.id}
                      type="button"
                      onClick={() =>
                        handleViewerClick({
                          id: viewer.viewer_id,
                          username: username || undefined,
                        })
                      }
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-muted/45"
                    >
                      <Avatar className="h-11 w-11 shrink-0 ring-1 ring-border">
                        <AvatarImage src={viewer.profile?.avatar_url || ''} />
                        <AvatarFallback className="bg-muted text-xs">
                          {displayName[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {username ? '@' + username : displayName}
                        </span>
                        {username && viewer.profile?.display_name && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {viewer.profile.display_name}
                          </span>
                        )}
                      </span>

                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {compactStoryAge(viewer.viewed_at)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AddToHighlightDialog
        open={showAddToHighlight}
        onOpenChange={setShowAddToHighlight}
        story={{
          id: currentStory.id,
          media_url: currentStory.media_url,
          media_type: currentStory.media_type,
          caption: currentStory.caption,
        }}
      />
    </div>
  );

  return createPortal(storyViewerContent, document.body);
}
