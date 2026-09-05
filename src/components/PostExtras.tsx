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
  /** `posts.has_poll` — keraksiz so‘rovlarni oldini oladi. */
  hasPoll?: boolean;
  /** Post egasi bo‘lsa live joylashuvni to‘xtatish tugmasi chiqadi. */
  isOwner?: boolean;
  /**
   * Eski sxemadagi fayllar (`posts.media_urls`).
   * `post_media` bo‘sh bo‘lganda faqat shu ishlatiladi — shu tariqa eski
   * postlar ham ko‘rinadi, yangi postlar esa ikki marta chizilmaydi.
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

function AudioCard({ item }: { item: PostMediaItem }) {
  const details = [
    item.duration_seconds ? Math.floor(item.duration_seconds / 60) + ':' + String(Math.round(item.duration_seconds % 60)).padStart(2, '0') : 'Audio',
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
 * Lentadagi post ostiga qo‘shiladigan strukturali kontent bloki:
 * fayllar galereyasi (har qanday tur), stikerlar, musiqa, so‘rovnoma va joylashuv.
 *
 * Bu blok postning matnidan mustaqil — shuning uchun eski postlar ham
 * buzilmaydi: `post_media` bo‘sh bo‘lsa eski `media_urls` ishlatiladi,
 * `post_music` bo‘sh bo‘lsa content markeridagi musiqa ko‘rsatiladi.
 *
 * Home va Profile feed cardlari standart `px-4 md:px-5` ichki gutter bilan
 * ishlaydi. Visual media shu gutterdan chiqib, cardning o‘z chap/o‘ng chetiga
 * yetadi; audio/document/poll/location kabi matnli bloklar esa o‘qish uchun
 * ichki paddingda qoladi. Bu Instagram uslubidagi media-first kompozitsiyani
 * cardning premium border/radiusini saqlagan holda beradi.
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
  const [resolvedLegacyMedia, setResolvedLegacyMedia] = useState<string[]>(
    legacyMediaUrls ?? [],
  );

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
        // Legacy fallback serverda realtime yangilanmaydi, shuning uchun static place sifatida ko'rsatiladi.
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

  // Strukturali musiqa ustun; bo‘lmasa content markeridagi musiqa chiziladi.
  // MUHIM: ilgari `playback_url` bo‘lmasa karta umuman chizilmasdi. Signed URL
  // olinmagan holatlarda ham trekning o‘z `audio_url` i bilan ijro qilinadi.
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

  // Yangi sxemada fayl bo'lmasa — eski massivga qaytamiz.
  // storage:// reference browserga berilishidan oldin real URL'ga resolve qilinadi.
  const legacy = media.length === 0 ? resolvedLegacyMedia : [];

  const legacyItems = useMemo(
    () =>
      legacy.map((url, index) => {
        let kind = detectMediaKind({ name: fileNameFromUrl(url), type: '' });

        if (kind === 'other' && (index === 0 || legacy.length === 1)) {
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

  // HomePage va ProfilePostsGrid ikkalasi PostExtras'ga aynan shu standard
  // gutterlarni beradi. Faqat shunday card konteksida visual media bleed qiladi;
  // boshqa chaqiruvchilar bo'lsa ularning layouti o'zgarmaydi.
  const hasStandardCardGutter =
    Boolean(className?.split(/\s+/).includes('px-4')) &&
    Boolean(className?.split(/\s+/).includes('md:px-5'));
  const visualBleedClass = hasStandardCardGutter ? '-mx-4 md:-mx-5' : undefined;
  const visualFrameClass = hasStandardCardGutter
    ? 'overflow-hidden border-y border-border/60'
    : 'overflow-hidden rounded-2xl border border-border/60';

  return (
    <div className={cn('space-y-3', className)}>
      {/* Legacy posts.media_urls ham unified media renderer orqali. */}
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
        .filter(
          (item) =>
            item.kind === 'document' ||
            item.kind === 'archive' ||
            item.kind === 'other',
        )
        .map((item) => (
          <PostDocumentCard
            key={item.url}
            url={item.url}
            fileName={fileNameFromUrl(item.url)}
          />
        ))}

      {/* Structured rasm/video ham legacy media bilan bir xil premium frame.
          Bitta asosiy media ko'rinadi; ko'p media swipe/arrows/dots bilan almashadi. */}
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

      {/* Audio, hujjat, arxiv va boshqa turlar */}
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

      {/* Post musiqasi: structured sxema yoki content markeri */}
      {displayMusic && (
        <PostMusicCard
          music={displayMusic}
          startSeconds={structuredMusic ? music?.start_seconds : 0}
          endSeconds={structuredMusic ? music?.end_seconds : null}
          volume={structuredMusic ? music?.volume : 1}
        />
      )}

      {/* So‘rovnoma */}
      {hasPoll && <PollCard postId={postId} />}

      {/* Joylashuv */}
      {displayLocation && (
        <PostLocationCard
          location={displayLocation}
          isOwner={Boolean(location) && isOwner}
        />
      )}

      {/* Koordinatasi yo‘q eski joylashuv */}
      {labelOnlyLocation && <PlaceLabelCard label={labelOnlyLocation} />}
    </div>
  );
}
