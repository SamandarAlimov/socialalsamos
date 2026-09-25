import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Archive, ArrowLeft, Loader2, Play, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AddToHighlightDialog } from '@/components/stories/AddToHighlightDialog';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ArchivedStory {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  views_count: number;
  expires_at: string;
  created_at: string;
}

export default function StoryArchivePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stories, setStories] = useState<ArchivedStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [highlightStory, setHighlightStory] = useState<ArchivedStory | null>(null);
  const [viewerStory, setViewerStory] = useState<ArchivedStory | null>(null);

  const fetchStories = useCallback(async () => {
    if (!user) {
      setStories([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('id, user_id, media_url, media_type, caption, views_count, expires_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStories((data || []) as ArchivedStory[]);
    } catch (error) {
      console.error('Error fetching story archive:', error);
      setStories([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchStories();
  }, [fetchStories]);

  const viewerGroup = useMemo(() => {
    if (!viewerStory || !user) return null;
    return {
      user_id: user.id,
      username: null,
      display_name: 'Story arxivi',
      avatar_url: null,
      is_verified: false,
      stories: [viewerStory],
      all_story_ids: [viewerStory.id],
    };
  }, [user, viewerStory]);

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-4xl px-4 pb-24 pt-4 sm:px-6 md:py-8">
      <header className="mb-5 flex items-center gap-3 sm:mb-7">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={() => navigate(-1)}
          aria-label="Orqaga"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Archive className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl">
            Story arxivi
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Faol va avvalgi storylaringiz
          </p>
        </div>
      </header>

      <div className="mb-5 rounded-[24px] border border-border/70 bg-muted/25 px-4 py-3 text-sm leading-relaxed text-muted-foreground sm:mb-6 sm:px-5">
        Joylagan storylaringiz shu yerda tarix sifatida ko‘rinadi. Istalgan storyni profil Tanlanganlariga qo‘shishingiz mumkin.
      </div>

      {isLoading ? (
        <div className="flex min-h-[42vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : stories.length === 0 ? (
        <Card className="rounded-[28px] border-border/70 shadow-sm">
          <CardContent className="flex min-h-[360px] flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-muted/70">
              <Archive className="h-9 w-9 text-muted-foreground/55" />
            </span>
            <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-foreground">
              Hozircha story yo‘q
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Story joylaganingizdan keyin u shu arxivda paydo bo‘ladi va keyin Tanlanganlarga qo‘shish mumkin bo‘ladi.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-5">
          {stories.map((story) => {
            const active = new Date(story.expires_at).getTime() > Date.now();
            return (
              <article
                key={story.id}
                className="group relative aspect-[9/16] min-w-0 overflow-hidden rounded-[18px] border border-border/70 bg-muted shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setViewerStory(story)}
                  className="absolute inset-0 z-0 block h-full w-full"
                  aria-label="Storini ko‘rish"
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
                      alt="Story"
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>

                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />

                <span
                  className={cn(
                    'pointer-events-none absolute left-1.5 top-1.5 rounded-full px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md',
                    active ? 'bg-emerald-500/75' : 'bg-black/45',
                  )}
                >
                  {active ? 'Faol' : 'Arxiv'}
                </span>

                {story.media_type === 'video' ? (
                  <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
                    <Play className="h-3 w-3 fill-current" />
                  </span>
                ) : null}

                <div className="absolute inset-x-0 bottom-0 z-10 p-1.5 sm:p-2">
                  <p className="mb-1.5 truncate text-[10px] font-medium text-white/90 sm:text-[11px]">
                    {format(new Date(story.created_at), 'dd MMM, HH:mm')}
                  </p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setHighlightStory(story);
                    }}
                    className="flex h-7 w-full items-center justify-center gap-1 rounded-full bg-white/92 px-2 text-[10px] font-semibold text-black shadow-sm backdrop-blur sm:h-8 sm:text-[11px]"
                  >
                    <Plus className="h-3 w-3" />
                    Tanlanganlarga
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AddToHighlightDialog
        open={Boolean(highlightStory)}
        onOpenChange={(open) => !open && setHighlightStory(null)}
        story={
          highlightStory
            ? {
                id: highlightStory.id,
                media_url: highlightStory.media_url,
                media_type: highlightStory.media_type,
                caption: highlightStory.caption,
              }
            : null
        }
      />

      {viewerGroup ? (
        <StoryViewer
          storyGroup={viewerGroup}
          allGroups={[]}
          onClose={() => setViewerStory(null)}
        />
      ) : null}
    </div>
  );
}
