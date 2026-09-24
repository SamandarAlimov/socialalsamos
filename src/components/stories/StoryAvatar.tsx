import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { StoryViewer } from './StoryViewer';
import { cn } from '@/lib/utils';

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

interface StoryAvatarProps {
  userId?: string;
  /** Tashqi manbadan kelgan "ko'rilmagan story" holati (ixtiyoriy). */
  hasUnviewed?: boolean;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
  /**
   * Avatarning o'ng-pastida tasdiq nishonini ko'rsatish.
   *
   * Odatda nishon ism yonida (`UserName` komponenti orqali) chiqadi,
   * shuning uchun bu yerda sukut bo'yicha o'chirilgan - aks holda bitta
   * kartochkada ikkita nishon paydo bo'lardi. Ism ko'rinmaydigan joylarda
   * (masalan faqat avatar chiqadigan ro'yxatlarda) `true` qiling.
   */
  showVerifiedBadge?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showRing?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** Story mavjud bo'lganda uzoq bosish uchun ikkilamchi action. */
  onLongPress?: () => void;
  /** Uzoq bosish chegarasi. Default: 500ms. */
  longPressDelayMs?: number;
}

const sizeClasses = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
  xl: 'h-32 w-32',
};

const fallbackTextClasses = {
  xs: 'text-[9px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-lg',
  xl: 'text-4xl',
};

const ringPadding = {
  xs: 'p-[1px]',
  sm: 'p-[1.5px]',
  md: 'p-[2px]',
  lg: 'p-[2px]',
  xl: 'p-[3px]',
};

/** Avatar o'lchamiga mos nishon o'lchami */
const badgeSizeForAvatar = {
  xs: 'xs',
  sm: 'xs',
  md: 'sm',
  lg: 'sm',
  xl: 'lg',
} as const;

const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

export function StoryAvatar({
  userId,
  hasUnviewed,
  username,
  displayName,
  avatarUrl,
  isVerified = false,
  showVerifiedBadge = false,
  size = 'md',
  showRing = true,
  className,
  onClick,
  onLongPress,
  longPressDelayMs = 500,
}: StoryAvatarProps) {
  const { user } = useAuth();
  const [hasStory, setHasStory] = useState(false);
  const [hasUnviewedStory, setHasUnviewedStory] = useState(Boolean(hasUnviewed));
  const [storyGroup, setStoryGroup] = useState<StoryGroup | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressResetTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const pointerStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    checkForStories();
  }, [userId, user?.id]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      if (longPressResetTimerRef.current !== null) window.clearTimeout(longPressResetTimerRef.current);
    };
  }, []);

  const checkForStories = async () => {
    if (!userId) return;
    try {
      // Fetch stories for this user
      const { data: stories, error } = await supabase
        .from('stories')
        .select('*')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (stories && stories.length > 0) {
        setHasStory(true);

        // Check if current user has viewed all stories
        if (user && user.id !== userId) {
          const { data: views } = await supabase
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', user.id)
            .in('story_id', stories.map(s => s.id));

          const viewedIds = new Set((views || []).map(v => v.story_id));
          const hasUnviewed = stories.some(s => !viewedIds.has(s.id));
          setHasUnviewedStory(hasUnviewed);
        } else if (user?.id === userId) {
          // Own story - always show as viewed
          setHasUnviewedStory(false);
        }

        // Build story group
        setStoryGroup({
          user_id: userId,
          username: username || null,
          display_name: displayName || null,
          avatar_url: avatarUrl || null,
          is_verified: isVerified,
          stories: stories as Story[],
          all_story_ids: stories.map(s => s.id),
        });
      } else {
        setHasStory(false);
        setStoryGroup(null);
      }
    } catch (error) {
      console.error('Error checking for stories:', error);
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  };

  const scheduleLongPressSuppressionReset = () => {
    if (!longPressTriggeredRef.current) return;
    if (longPressResetTimerRef.current !== null) {
      window.clearTimeout(longPressResetTimerRef.current);
    }
    // Pointerup'dan keyin keladigan synthetic click'ni yutish uchun qisqa oynacha.
    longPressResetTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = false;
      longPressResetTimerRef.current = null;
    }, 250);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    // Long-press faqat story oddiy tap actionini egallab turgan holatda kerak.
    if (!hasStory || !onLongPress) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    if (longPressResetTimerRef.current !== null) {
      window.clearTimeout(longPressResetTimerRef.current);
      longPressResetTimerRef.current = null;
    }
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    pointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      pointerStartRef.current = null;
      longPressTriggeredRef.current = true;
      onLongPress();
    }, longPressDelayMs);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) clearLongPressTimer();
  };

  const handlePointerEnd = () => {
    clearLongPressTimer();
    scheduleLongPressSuppressionReset();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (longPressTriggeredRef.current) {
      e.preventDefault();
      longPressTriggeredRef.current = false;
      if (longPressResetTimerRef.current !== null) {
        window.clearTimeout(longPressResetTimerRef.current);
        longPressResetTimerRef.current = null;
      }
      return;
    }

    if (hasStory && storyGroup) {
      setShowViewer(true);
    } else if (onClick) {
      onClick(e);
    }
  };

  const handleCloseViewer = () => {
    setShowViewer(false);
    // Refresh story status after viewing
    checkForStories();
  };

  const handleMarkAsViewed = () => {
    // Update local state when story is viewed
    if (user?.id !== userId) {
      checkForStories();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onContextMenu={(event) => {
          if (hasStory && onLongPress) event.preventDefault();
        }}
        className={cn(
          'relative rounded-full transition-transform hover:scale-105',
          sizeClasses[size],
          hasStory && showRing ? (
            hasUnviewedStory
              ? 'bg-gradient-to-tr from-alsamos-orange-light to-alsamos-orange-dark'
              : 'bg-muted'
          ) : '',
          hasStory && showRing && ringPadding[size],
          className
        )}
      >
        <div className={cn(
          'h-full w-full',
          hasStory && showRing && 'rounded-full bg-background p-[1.5px]'
        )}>
          <Avatar className="h-full w-full">
            <AvatarImage src={avatarUrl || ''} />
            <AvatarFallback className={cn('font-semibold leading-none', fallbackTextClasses[size])}>
              {displayName?.[0] || username?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Yagona manba: VerifiedBadge (to'ldirilgan ko'k Instagram nishoni) */}
        {isVerified && showVerifiedBadge && (
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-[1px] leading-none">
            <VerifiedBadge size={badgeSizeForAvatar[size]} />
          </span>
        )}
      </button>

      {showViewer && storyGroup && (
        <StoryViewer
          storyGroup={storyGroup}
          allGroups={[storyGroup]}
          onClose={handleCloseViewer}
          onMarkAsViewed={handleMarkAsViewed}
        />
      )}
    </>
  );
}