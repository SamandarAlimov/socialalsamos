import { Download, FileArchive, FileText, MapPin, Music2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatBytes, mediaKindLabel } from '@/lib/postComposer';
import { formatDuration } from '@/lib/mediaMetadata';
import { usePostMedia, type PostMediaItem } from '@/hooks/usePostMedia';
import { usePostLocation, type PostLocation } from '@/hooks/usePostLocation';
import { usePostMusic } from '@/hooks/usePostMusic';
import { PollCard } from '@/components/PollCard';
import { PostLocationCard } from '@/components/PostLocationCard';
import { PostMusicCard } from '@/components/PostMusicCard';
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

function DocumentCard({ item }: { item: PostMediaItem }) {
  const Icon = item.kind === 'archive' ? FileArchive : FileText;

  return (
    <a
      href={item.storage_url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 transition hover:border-border"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {item.file_name ?? mediaKindLabel(item.kind)}
        </span>
        <span className="block text-xs text-muted-foreground">
          {mediaKindLabel(item.kind)}
          {item.file_size ? ' · ' + formatBytes(item.file_size) : ''}
        </span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

function AudioCard({ item }: { item: PostMediaItem }) {
  return (
    <div
      className="rounded-2xl border border-border/60 bg-muted/30 p-3"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Music2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {item.file_name ?? 'Audio'}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.duration_seconds ? formatDuration(item.duration_seconds) : 'Audio'}
            {item.file_size ? ' · ' + formatBytes(item.file_size) : ''}
          </p>
        </div>
      </div>
      <audio src={item.storage_url} controls preload="metadata" className="mt-2 w-full" />
    </div>
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
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

  const fallbackLocation: PostLocation | null = legacyLocation
    ? {
        id: 'legacy-location:' + postId,
        post_id: postId,
        place_id: null,
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
  const structuredMusic: PostMusic | null =
    music?.track && music.playback_url
      ? {
          title: music.track.title,
          artist: music.track.artist,
          coverUrl: music.track.cover_url,
          audioUrl: music.playback_url,
          durationSeconds: music.track.duration_seconds,
        }
      : null;
  const displayMusic = structuredMusic ?? legacyMusic ?? null;

  const visuals = media.filter((item) => item.kind === 'image' || item.kind === 'video');
  const others = media.filter((item) => item.kind !== 'image' && item.kind !== 'video');

  // Yangi sxemada fayl bo‘lmasa — eski massivga qaytamiz.
  const legacy = media.length === 0 ? (legacyMediaUrls ?? []) : [];

  const hasAnything =
    media.length > 0 ||
    legacy.length > 0 ||
    Boolean(displayLocation) ||
    Boolean(labelOnlyLocation) ||
    Boolean(displayMusic) ||
    Boolean(hasPoll);
  if (!hasAnything) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Eski postlar uchun mavjud karusel */}
      {legacy.length > 0 && (
        <PostMediaCarousel mediaUrls={legacy} mediaType={legacyMediaType || 'image'} />
      )}

      {/* Rasm va videolar — gorizontal galereya (scroll mobil qurilmada ishlaydi) */}
      {visuals.length > 0 && (
        <div
          className={cn(
            visuals.length === 1
              ? 'overflow-hidden rounded-2xl border border-border/60'
              : 'flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]',
          )}
        >
          {visuals.map((item) => (
            <div
              key={item.id}
              className={cn(
                'relative',
                visuals.length === 1
                  ? 'w-full'
                  : 'w-64 shrink-0 snap-start overflow-hidden rounded-2xl border border-border/60',
              )}
            >
              {item.kind === 'image' ? (
                <img
                  src={item.storage_url}
                  alt={item.alt_text ?? item.file_name ?? 'Rasm'}
                  loading="lazy"
                  className="h-full max-h-[520px] w-full object-cover"
                />
              ) : (
                <video
                  src={item.storage_url}
                  poster={item.thumbnail_url ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  onClick={(event) => event.stopPropagation()}
                  className="h-full max-h-[520px] w-full bg-black object-contain"
                />
              )}

              {/* Media ustidagi stikerlar — faqat ko‘rish rejimi */}
              <MediaStickerOverlay
                editState={(item as PostMediaItem & WithEditState).edit_state}
                idPrefix={item.id}
              />
            </div>
          ))}
        </div>
      )}

      {/* Audio, hujjat, arxiv va boshqa turlar */}
      {others.map((item) =>
        item.kind === 'audio' ? (
          <AudioCard key={item.id} item={item} />
        ) : (
          <DocumentCard key={item.id} item={item} />
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
