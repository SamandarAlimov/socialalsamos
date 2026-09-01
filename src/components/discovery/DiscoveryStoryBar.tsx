import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { useStories } from '@/hooks/useStories';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

// Flutter: lib/features/discovery/presentation/widgets/story_bar.dart
//
// Backend tuzilmasi (Supabase):
//   stories (id, user_id, media_url, media_type, storage_bucket, storage_key,
//            caption, views_count, expires_at, is_active, created_at)
//   stories.user_id -> profiles.id  (FK nomi: stories_user_id_fkey)
// useStories() faqat expires_at > now() va is_active != false bo'lgan
// story'larni oladi, media_url'ni resolveStorageUrl() orqali imzolangan
// URL'ga aylantiradi va ularni foydalanuvchi bo'yicha StoryGroup'larga
// guruhlaydi. Realtime kanal ('stories-realtime') INSERT/DELETE da qayta
// yuklaydi, UPDATE da esa faqat views_count'ni joyida yangilaydi.

interface DiscoveryStoryBarProps {
  refreshKey?: number;
}

interface OwnProfile {
  username: string | null;
  avatar_url: string | null;
}

export function DiscoveryStoryBar({ refreshKey = 0 }: DiscoveryStoryBarProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  const { storyGroups, isLoading, refresh } = useStories();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [ownProfile, setOwnProfile] = useState<OwnProfile | null>(null);

  // Discover refresh bosilganda story'lar ham qayta yuklanadi.
  const [lastRefreshKey, setLastRefreshKey] = useState(refreshKey);
  if (refreshKey !== lastRefreshKey) {
    setLastRefreshKey(refreshKey);
    void refresh();
  }

  // O'z avatarimizni ko'rsatish uchun profil kerak (story hali bo'lmasa ham).
  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setOwnProfile(null);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;
        if (!cancelled) setOwnProfile((data as OwnProfile) ?? null);
      } catch (error) {
        console.warn('Profil yuklanmadi:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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

  // O'z story'imiz doim birinchi, keyin ko'rilmaganlar (Flutter bilan bir xil tartib).
  const ordered = [...storyGroups].sort((a, b) => {
    if (a.user_id === user?.id) return -1;
    if (b.user_id === user?.id) return 1;
    if (a.has_unviewed === b.has_unviewed) return 0;
    return a.has_unviewed ? -1 : 1;
  });

  const ownIndex = ordered.findIndex((group) => group.user_id === user?.id);
  const ownGroup = ownIndex >= 0 ? ordered[ownIndex] : null;
  const others = ordered.filter((group) => group.user_id !== user?.id);

  const activeGroup = activeIndex !== null ? ordered[activeIndex] : null;

  const openGroup = (group: (typeof ordered)[number]) => {
    triggerHaptic('light');
    setActiveIndex(ordered.indexOf(group));
  };

  const openCreate = () => {
    triggerHaptic('light');
    navigate('/create');
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
        {/* Birinchi element - foydalanuvchining o'zi. Dashed "+ Yangi" katak
            o'rniga haqiqiy avatar turadi, bu Instagram/Telegram uslubidagi
            professional ko'rinish beradi. */}
        {user && (
          <div className="relative flex shrink-0 flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => (ownGroup ? openGroup(ownGroup) : openCreate())}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
              aria-label={ownGroup ? 'Sizning storyingiz' : 'Yangi story qoshish'}
            >
              <StoryAvatar
                avatarUrl={ownGroup?.avatar_url ?? ownProfile?.avatar_url ?? null}
                username={ownGroup?.username ?? ownProfile?.username ?? ''}
                size="lg"
                showRing={!!ownGroup}
                hasUnviewed={ownGroup?.has_unviewed ?? false}
              />
            </button>

            {/* Story bor bo'lsa ham yangisini qo'shish imkoni saqlanadi. */}
            <button
              type="button"
              onClick={openCreate}
              className="absolute right-0 top-11 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Yangi story qoshish"
            >
              <Plus className="h-3 w-3" />
            </button>

            <span className="max-w-[64px] truncate text-xs text-muted-foreground">
              Siz
            </span>
          </div>
        )}

        {others.map((group) => (
          <button
            key={group.user_id}
            type="button"
            onClick={() => openGroup(group)}
            className="flex shrink-0 flex-col items-center gap-2 focus-visible:outline-none"
            aria-label={`${group.username ?? 'Foydalanuvchi'} storysi`}
          >
            <StoryAvatar
              avatarUrl={group.avatar_url}
              username={group.username ?? ''}
              size="lg"
              showRing
              hasUnviewed={group.has_unviewed}
            />
            <span className="max-w-[64px] truncate text-xs">
              {group.display_name || group.username || 'Foydalanuvchi'}
            </span>
          </button>
        ))}

        {others.length === 0 && (
          <div className="flex items-center">
            <p className="text-xs text-muted-foreground">
              Hozircha story yoq. Birinchi bolib ulashing.
            </p>
          </div>
        )}
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
