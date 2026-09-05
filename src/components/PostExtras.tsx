import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { detectMediaKind, formatBytes, type MediaKind } from '@/lib/postComposer';
import { usePostMedia, type PostMediaItem } from '@/hooks/usePostMedia';
import { usePostLocation, type PostLocation } from '@/hooks/usePostLocation';
import { usePostMusic } from '@/hooks/usePostMusic';
import { PollCard } from '@/components/PollCard';
import { PostLocationCard } from '@/components/PostLocationCard';
import { PostMusicCard } from '@/components/PostMusicCard';
import { PostAudioPlayer } from '@/components/PostAudioPlayer';
import { PostDocumentCard } from '@/components/PostDocumentViewer';
import { fileNameFromUrl } from '@/lib/documentPreview';
import { resolveStorageUrlCandidates } from '@/lib/mediaUpload';
import {
  mergeMediaCandidateGroups,
  type MediaCandidateGroup,
} from '@/lib/mediaRecovery';
import { PostMediaCarousel } from '@/components/PostMediaCarousel';
import { MediaStickerOverlay } from '@/components/stickers/MediaStickerOverlay';
import type { WithEditState } from '@/lib/stickerPlacements';
import type { LegacyPostLocation, PostMusic } from '@/lib/postMarkers';

interface PostExtrasProps {
  postId: string;
  /** `posts.has_poll` — keraksiz so‘rovlarni oldini oladi. */
  hasPoll?: boolean;
  /** Post egasi bo‘lsa live joylashuvni to‘xtatish tugmasi chiqadi. */
  isOwner?: boolean;
  /**
   * Eski sxemadagi fayllar (`posts.media_urls`). Bu massiv user data hisoblanadi:
   * structured `post_media` mavjud bo'lsa ham o'chirilmaydi va fallback bo'lib qoladi.
   */
  legacyMediaUrls?: string[] | null;
  legacyMediaType?: string | null;
  /** Production structured schema hali deploy bo'lmaganda content markeridan tiklanadi. */
  legacyLocation?: LegacyPostLocation | null;
  /** Koordinatasiz eski joylashuv (masalan "Joriy joylashuv") — nom bilan karta chiziladi. */
  legacyLocationLabel?: string | null;
  /** `[MUSIC]{...}` markeridan olingan musiqa — `post_music` bo‘lmasa ishlatiladi. */
  legacyMusic?: PostMusic | null;
  className?: string;
}

function mediaKindFromLegacyUrl(
  url: string,
  index: number,
  total: number,
  legacyMediaType?: string | null,
): MediaKind {
  let kind = detectMediaKind({ name: fileNameFromUrl(url), type: '' });

  if (kind === 'other' && (index === 0 || total === 1)) {
    if (
      legacyMediaType === 'video' ||
      legacyMediaType === 'reel' ||
      legacyMediaType === 'short'
    ) {
      kind = 'video';
    } else if (legacyMediaType === 'image') {
      kind = 'image';
    } else if (legacyMediaType === 'audio') {
      kind = 'audio';
    }
  }

  return kind;
}

function AudioCard({
  url,
  item,
}: {
  url: string;
  item?: PostMediaItem;
}) {
  const details = [
    item?.duration_seconds
      ? Math.floor(item.duration_seconds / 60) + ':' + String(Math.round(item.duration_seconds % 60)).padStart(2, '0')
      : 'Audio',
    item?.file_size ? formatBytes(item.file_size) : null,
  ].filter(Boolean).join(' · ');

  return (
    <PostAudioPlayer
      src={url}
      title={item?.file_name ?? fileNameFromUrl(url, 'Audio')}
      subtitle={details}
      durationSeconds={item?.duration_seconds}
    />
  );
}

/** Koordinatasi yo‘q eski joylashuv uchun karta (xarita rasmi bo‘lmaydi). */
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
        <span className="block truncate text-xs text-muted-foreground">
          Xaritada ochish
        </span>
      </span>
    </Link>
  );
}

/**
 * Lentadagi post ostiga qo‘shiladigan strukturali kontent bloki.
 *
 * Muhim compatibility qoidasi: `post_media` va `posts.media_urls` bir-birini
 * almashtirmaydi. Ular position bo'yicha bitta logical media'ga birlashtiriladi
 * va har bir URL playback fallback sifatida saqlanadi. Shu sabab migration yoki
 * eski CDN/bucket holati bir foydalanuvchi mediasini feed'dan yo'qotmaydi.
 */
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
  const [legacyCandidateSets, setLegacyCandidateSets] = useState<string[][]>(
    () => (legacyMediaUrls ?? []).map((url) => (url ? [url] : [])),
  );

  useEffect(() => {
    let cancelled = false;
    const source = legacyMediaUrls ?? [];

    if (source.length === 0) {
      setLegacyCandidateSets([]);
      return;
    }

    void Promise.all(
      source.map(async (url) => {
        if (!url) return [];
        try {
          const candidates = await resolveStorageUrlCandidates(url);
          return candidates.length > 0 ? candidates : [url];
        } catch (error) {
          console.warn('Legacy post media URL resolve failed:', error);
          return [url];
        }
      }),
    ).then((resolved) => {
      if (!cancelled) setLegacyCandidateSets(resolved);
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
  const labelOnlyLocation =
    !displayLocation && legacyLocationLabel ? legacyLocationLabel : null;

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

  const structuredGroups = useMemo<MediaCandidateGroup[]>(
    () =>
      media.map((item) => ({
        position: item.position,
        kind: item.kind,
        urls: item.storage_candidates?.length
          ? item.storage_candidates
          : [item.storage_url],
      })),
    [media],
  );

  const legacyGroups = useMemo<MediaCandidateGroup[]>(() => {
    const source = legacyMediaUrls ?? [];
    return source
      .map((url, index) => ({
        position: index,
        kind: mediaKindFromLegacyUrl(url ?? '', index, source.length, legacyMediaType),
        urls: legacyCandidateSets[index]?.length
          ? legacyCandidateSets[index]
          : url
            ? [url]
            : [],
      }))
      .filter((item) => item.urls.length > 0);
  }, [legacyCandidateSets, legacyMediaType, legacyMediaUrls]);

  const mergedMedia = useMemo(
    () => mergeMediaCandidateGroups(structuredGroups, legacyGroups),
    [legacyGroups, structuredGroups],
  );
  const structuredByPosition = useMemo(
    () => new Map(media.map((item) => [item.position, item] as const)),
    [media],
  );

  const visuals = mergedMedia.filter(
    (item) => item.kind === 'image' || item.kind === 'video',
  );
  const others = mergedMedia.filter(
    (item) => item.kind !== 'image' && item.kind !== 'video',
  );

  const hasAnything =
    mergedMedia.length > 0 ||
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

  const visualMediaType =
    legacyMediaType === 'reel' || legacyMediaType === 'short'
      ? legacyMediaType
      : visuals.some((item) => item.kind === 'video')
        ? 'mixed'
        : 'image';

  return (
    <div className={cn('space-y-3', className)}>
      {visuals.length > 0 && (
        <div className={cn(visualFrameClass, visualBleedClass)}>
          <PostMediaCarousel
            mediaUrls={visuals.map((item) => item.urls[0])}
            mediaCandidates={visuals.map((item) => item.urls)}
            mediaType={visualMediaType}
            mediaKinds={visuals.map((item) => item.kind as 'image' | 'video')}
            posters={visuals.map(
              (item) => structuredByPosition.get(item.position)?.thumbnail_url,
            )}
            altTexts={visuals.map((item) => {
              const structured = structuredByPosition.get(item.position);
              return structured?.alt_text ?? structured?.file_name ?? null;
            })}
            overlays={visuals.map((item) => {
              const structured = structuredByPosition.get(item.position);
              return structured ? (
                <MediaStickerOverlay
                  key={structured.id}
                  editState={(structured as PostMediaItem & WithEditState).edit_state}
                  idPrefix={structured.id}
                />
              ) : null;
            })}
          />
        </div>
      )}

      {others.map((group) => {
        const structured = structuredByPosition.get(group.position);
        const url = group.urls[0];

        return group.kind === 'audio' ? (
          <AudioCard
            key={`audio:${group.position}:${url}`}
            url={url}
            item={structured}
          />
        ) : (
          <PostDocumentCard
            key={`file:${group.position}:${url}`}
            url={url}
            fileName={structured?.file_name ?? fileNameFromUrl(url)}
            fileSize={structured?.file_size}
          />
        );
      })}

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
        <PostLocationCard
          location={displayLocation}
          isOwner={Boolean(location) && isOwner}
        />
      )}

      {labelOnlyLocation && <PlaceLabelCard label={labelOnlyLocation} />}
    </div>
  );
}
