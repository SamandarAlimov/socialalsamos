import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { useStories } from '@/hooks/useStories';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

// Flutter: lib/features/discovery/presentation/widgets/story_bar.dart

interface DiscoveryStoryBarProps {
  refreshKey?: number;
}

export function DiscoveryStoryBar({ refreshKey = 0 }: DiscoveryStoryBarProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  const { storyGroups, isLoading, refresh } = useStories();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Discover refresh bosilganda story'lar ham qayta yuklanadi.
  const [lastRefreshKey, setLastRefreshKey] = useState(refreshKey);
  if (refreshKey !== lastRefreshKey) {
    setLastRefreshKey(refreshKey);
    void refresh();
  }

  if (isLoading && storyGroups.length === 0) {
    return (
      <div className="flex gap-4 overflow-hidden" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    );
  }

  // O'z story'imiz doim birinchi bo'ladi (Flutter bilan bir xil tartib).
  const ordered = [...storyGroups].sort((a, b) => {
    if (a.user_id === user?.id) return -1;
    if (b.user_id === user?.id) return 1;
    if (a.has_unviewed === b.has_unviewed) return 0;
    return a.has_unviewed ? -1 : 1;
  });

  const activeGroup = activeIndex !== null ? ordered[activeIndex] : null;

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            navigate('/create');
          }}
          className="flex shrink-0 flex-col items-center gap-2 focus-visible:outline-none"
          aria-label="Story qo\u2018shish"
        >
          <span
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary/60',
              'bg-secondary text-primary transition-colors hover:bg-primary/10',
            )}
          >
            <Plus className="h-6 w-6" />
          </span>
          <span className="max-w-[64px] truncate text-xs text-muted-foreground">Qo\u2018shish</span>
        </button>

        {ordered.map((group, index) => (
          <button
            key={group.user_id}
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setActiveIndex(index);
            }}
            className="flex shrink-0 flex-col items-center gap-2 focus-visible:outline-none"
            aria-label={`${group.username} story'sini ko\u2018rish`}
          >
            <StoryAvatar
              avatarUrl={group.avatar_url}
              username={group.username}
              size="lg"
              showRing
              hasUnviewed={group.has_unviewed}
            />
            <span className="max-w-[64px] truncate text-xs">
              {group.user_id === user?.id ? 'Siz' : group.username}
            </span>
          </button>
        ))}
      </div>

      {activeGroup && (
        <StoryViewer
          storyGroup={activeGroup}
          allGroups={ordered}
          onClose={() => setActiveIndex(null)}
          onMarkAsViewed={() => refresh()}
        />
      )}
    </>
  );
}
