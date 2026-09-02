import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Play, Eye, Heart, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { cn } from '@/lib/utils';

// Flutter: lib/features/discovery/presentation/widgets/trending_videos.dart

interface TrendingVideo {
  id: string;
  content: string | null;
  media_urls: string[] | null;
  likes_count: number | null;
  views_count: number | null;
  created_at: string;
  profile: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface TrendingVideosProps {
  refreshKey?: number;
}

function formatCount(count: number | null) {
  const value = count ?? 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

export function TrendingVideos({ refreshKey = 0 }: TrendingVideosProps) {
  const navigate = useNavigate();
  const { triggerHaptic } = useHapticFeedback();
  const [videos, setVideos] = useState<TrendingVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const fetchVideos = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    try {
      const { data, error } = await supabase
        .from('posts')
        .select(
          `id, content, media_urls, likes_count, views_count, created_at,
           profile:profiles!posts_user_id_fkey (username, display_name, avatar_url)`,
        )
        .eq('visibility', 'public')
        .eq('media_type', 'video')
        .order('views_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(9);

      if (error) throw error;
      setVideos((data ?? []) as unknown as TrendingVideo[]);
    } catch (error) {
      console.error('Trend videolarni yuklashda xatolik:', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos, refreshKey]);

  // Sarlavha ikoni dekorativ — bosiladigan harakatni bildirmaydi, neytral.
  const header = (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Video className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Trend videolar</h2>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            triggerHaptic('light');
            fetchVideos();
          }}
          disabled={isLoading}
          aria-label="Videolarni yangilash"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate('/videos')}>
          Barchasi
        </Button>
      </div>
    </div>
  );

  if (isLoading && videos.length === 0) {
    return (
      <section aria-busy="true">
        {header}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16] rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (hasError) {
    return (
      <section>
        {header}
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">Videolarni yuklab bolmadi.</p>
          <Button variant="outline" size="sm" onClick={fetchVideos}>
            Qayta urinish
          </Button>
        </div>
      </section>
    );
  }

  if (videos.length === 0) {
    return (
      <section>
        {header}
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">Hozircha trend video yoq.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      {header}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {videos.map((video) => (
          <button
            key={video.id}
            type="button"
            onClick={() => {
              triggerHaptic('light');
              navigate(`/videos?v=${video.id}`);
            }}
            className="group relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Videoni ochish"
          >
            {video.media_urls?.[0] ? (
              <video
                src={video.media_urls[0]}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Play className="h-8 w-8 text-muted-foreground" />
              </div>
            )}

            <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

            <span className="absolute left-2 right-2 bottom-2 space-y-1 text-white">
              <span className="block truncate text-xs font-medium">
                @{video.profile?.username}
              </span>
              <span className="flex items-center gap-3 text-[11px] opacity-90">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {formatCount(video.views_count)}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="h-3 w-3" />
                  {formatCount(video.likes_count)}
                </span>
              </span>
            </span>

            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded-full bg-black/60 p-3 text-white">
                <Play className="h-5 w-5" />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
