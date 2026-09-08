import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { detectMediaKind, formatBytes } from '@/lib/postComposer';
import { usePostMedia, type PostMediaItem } from '@/hooks/usePostMedia';
import { usePostLocation, type PostLocation } from '@/hooks/usePostLocation';
import { usePostMusic } from '@/hooks/usePostMusic';
import { PollCard } from '@/components/PollCard';
import { PostLocationCard } from '@/components/PostLocationCard';
import { PostMusicCard } from '@/components/PostMusicCard';
import { PostAudioPlayer } from '@/components/PostAudioPlayer';
import { PostDocumentCard } from '@/components/PostDocumentViewer';
import { fileNameFromUrl } from '@/lib/documentPreview';
import { resolveStorageUrl } from '@/lib/mediaUpload';
import { PostMediaCarousel } from '@/components/PostMediaCarousel';
import { MediaStickerOverlay } from '@/components/stickers/MediaStickerOverlay';
import type { WithEditState } from '@/lib/stickerPlacements';
import type { LegacyPostLocation, PostMusic } from '@/lib/postMarkers';

interface PostExtrasProps {
  postId: string;
  hasPoll?: boolean;
  isOwner?: boolean;
  legacyMediaUrls?: string[] | null;
  legacyMediaType?: string | null;
  legacyLocation?: LegacyPostLocation | null;
  legacyLocationLabel?: string | null;
  legacyMusic?: PostMusic | null;
  className?: string;
}

function AudioCard({ item }: { item: PostMediaItem }) {
  const details = [
    item.duration_seconds
      ? Math.floor(item.duration_seconds / 60) + ':' + String(Math.round(item.duration_seconds % 60)).padStart(2, '0')
      : 'Audio',
    item.file_size ? formatBytes(item.file_size) : null,
  ].filter(Boolean).join(' · ');

  return (
    <PostAudioPlayer
      src={item.storage_url}
      title={item.file_name ?? 'Audio'}
      subtitle={details}
      durationSeconds={item.duration_seconds}
    />
  );
}

function PlaceLabelCard({ label }: { label: string }) {
  return (
    <Link
      to={'/map?label=' + encodeURIComponent(label)}
      onClick={(event) => event.stopPropagation()}
      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3 py-2.5 transition hover:border-border"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MapPin className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">Xaritada ochish</span>
      </span>
    </Link>
  );
}

export function PostExtras({
  postId,
  hasPoll,
  isOwner,
  legacyMediaUrls,
  legacyMediaType,
  legacyLocation,
  legacyLocationLabel,
  legacyMusic,
  className,
}: PostExtrasProps) {
  const { media } = usePostMedia(postId);
  const { location } = usePostLocation(postId);
  const { music } = usePostMusic(postId);
  const [resolvedLegacyMedia, setResolvedLegacyMedia] = useState<string[]>(legacyMediaUrls ?? []);

  useEffect(() => {
    let cancelled = false;
    const source = (legacyMediaUrls ?? []).filter(Boolean);

    if (source.length === 0) {
      setResolvedLegacyMedia([]);
      return;
    }

    void Promise.all(
      source.map(async (url) => {
        try {
          return await resolveStorageUrl(url);
        } catch (error) {
          console.warn('Legacy post media URL resolve failed:', error);
          return url;
        }
      }),
    ).then((resolved) => {
      if (!cancelled) setResolvedLegacyMedia(resolved);
    });

    return () => {
      cancelled = true;
    };
  }, [legacyMediaUrls]);

  const fallbackLocation: PostLocation | null = legacyLocation
    ? {
        id: 'legacy-location:' + postId,
        post_id: postId,
        place_id: null,
        mode: 'place',
        label: legacyLocation.label,
        latitude: legacyLocation.latitude,
        longitude: legacyLocation.longitude,
        accuracy_m: legacyLocation.accuracyM,
        live_until: null,
        updated_at: new Date(0).toISOString(),
        place: legacyLocation.place
          ? {
              id: 'legacy-place:' + postId,
              name: legacyLocation.place.name,
              address: legacyLocation.place.address,
              category: legacyLocation.place.category,
            }
          : null,
      }
    : null;

  const displayLocation = location ?? fallbackLocation;
  const labelOnlyLocation = !displayLocation && legacyLocationLabel ? legacyLocationLabel : null;

  const structuredAudioUrl = music?.playback_url ?? music?.track?.audio_url ?? null;
  const structuredMusic: PostMusic | null =
    music?.track && structuredAudioUrl
      ? {
          title: music.track.title,
          artist: music.track.artist,
          coverUrl: music.track.cover_url,
          audioUrl: structuredAudioUrl,
          durationSeconds: music.track.duration_seconds,
        }
      : null;
  const displayMusic = structuredMusic ?? legacyMusic ?? null;

  const visuals = media.filter((item) => item.kind === 'image' || item.kind === 'video');
  const others = media.filter((item) => item.kind !== 'image' && item.kind !== 'video');

  const legacy = media.length === 0 ? resolvedLegacyMedia : [];

  const legacyItems = useMemo(
    () =>
      legacy.map((url, index) => {
        let kind = detectMediaKind({ name: fileNameFromUrl(url), type: '' });

        if (kind === 'other' && (index === 0 || legacy.length === 1)) {
          if (legacyMediaType === 'video' || legacyMediaType === 'reel' || legacyMediaType === 'short') {
            kind = 'video';
          } else if (legacyMediaType === 'image') {
            kind = 'image';
          } else if (legacyMediaType === 'audio') {
            kind = 'audio';
          }
        }

        return { url, kind };
      }),
    [legacy, legacyMediaType],
  );

  const hasAnything =
    media.length > 0 ||
    legacy.length > 0 ||
    Boolean(displayLocation) ||
    Boolean(labelOnlyLocation) ||
    Boolean(displayMusic) ||
    Boolean(hasPoll);
  if (!hasAnything) return null;

  const hasStandardCardGutter =
    Boolean(className?.split(/\s+/).includes('px-4')) &&
    Boolean(className?.split(/\s+/).includes('md:px-5'));
  const visualBleedClass = hasStandardCardGutter ? '-mx-4 md:-mx-5' : undefined;
  const visualFrameClass = hasStandardCardGutter
    ? 'overflow-hidden border-y border-border/60'
    : 'overflow-hidden rounded-2xl border border-border/60';

  return (
    <div data-post-analytics-post-id={postId} className={cn('space-y-3', className)}>
      {legacyItems.filter((item) => item.kind === 'image' || item.kind === 'video').length > 0 && (
        <div className={cn(visualBleedClass, hasStandardCardGutter && 'border-y border-border/60')}>
          <PostMediaCarousel
            mediaUrls={legacyItems
              .filter((item) => item.kind === 'image' || item.kind === 'video')
              .map((item) => item.url)}
            mediaType={
              legacyItems.some((item) => item.kind === 'video')
                ? 'mixed'
                : legacyMediaType || 'image'
            }
            mediaKinds={legacyItems
              .filter((item) => item.kind === 'image' || item.kind === 'video')
              .map((item) => item.kind as 'image' | 'video')}
          />
        </div>
      )}

      {legacyItems
        .filter((item) => item.kind === 'audio')
        .map((item) => (
          <PostAudioPlayer
            key={item.url}
            src={item.url}
            title={fileNameFromUrl(item.url, 'Audio')}
            subtitle="Audio"
          />
        ))}

      {legacyItems
        .filter((item) => item.kind === 'document' || item.kind === 'archive' || item.kind === 'other')
        .map((item) => (
          <PostDocumentCard key={item.url} url={item.url} fileName={fileNameFromUrl(item.url)} />
        ))}

      {visuals.length > 0 && (
        <div className={cn(visualFrameClass, visualBleedClass)}>
          <PostMediaCarousel
            mediaUrls={visuals.map((item) => item.storage_url)}
            mediaType={visuals.some((item) => item.kind === 'video') ? 'mixed' : 'image'}
            mediaKinds={visuals.map((item) => item.kind as 'image' | 'video')}
            posters={visuals.map((item) => item.thumbnail_url)}
            altTexts={visuals.map((item) => item.alt_text ?? item.file_name)}
            overlays={visuals.map((item) => (
              <MediaStickerOverlay
                key={item.id}
                editState={(item as PostMediaItem & WithEditState).edit_state}
                idPrefix={item.id}
              />
            ))}
          />
        </div>
      )}

      {others.map((item) =>
        item.kind === 'audio' ? (
          <AudioCard key={item.id} item={item} />
        ) : (
          <PostDocumentCard
            key={item.id}
            url={item.storage_url}
            fileName={item.file_name}
            fileSize={item.file_size}
          />
        ),
      )}

      {displayMusic && (
        <PostMusicCard
          music={displayMusic}
          startSeconds={structuredMusic ? music?.start_seconds : 0}
          endSeconds={structuredMusic ? music?.end_seconds : null}
          volume={structuredMusic ? music?.volume : 1}
        />
      )}

      {hasPoll && <PollCard postId={postId} />}

      {displayLocation && (
        <PostLocationCard location={displayLocation} isOwner={Boolean(location) && isOwner} />
      )}

      {labelOnlyLocation && <PlaceLabelCard label={labelOnlyLocation} />}
    </div>
  );
}
