import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { detectMediaKind } from '@/lib/postComposer';
import { usePostMedia, type PostMediaItem } from '@/hooks/usePostMedia';
import { usePostLocation, type PostLocation } from '@/hooks/usePostLocation';
import { usePostMusic } from '@/hooks/usePostMusic';
import { PollCard } from '@/components/PollCard';
import { PostLocationCard } from '@/components/PostLocationCard';
import { PostMusicCard } from '@/components/PostMusicCard';
import { PostAudioPlayer } from '@/components/PostAudioPlayer';
import { PostDocumentCard } from '@/components/PostDocumentViewer';
import { fileNameFromUrl } from '@/lib/documentPreview';
import { PostMediaCarousel } from '@/components/PostMediaCarousel';
import { MediaStickerOverlay } from '@/components/stickers/MediaStickerOverlay';
import type { WithEditState } from '@/lib/stickerPlacements';
import type { LegacyPostLocation, PostMusic } from '@/lib/postMarkers';

interface PostExtrasProps {
  postId: string;
  /** `posts.has_poll` — keraksiz so\u2018rovlarni oldini oladi. */
  hasPoll?: boolean;
  /** Post egasi bo\u2018lsa live joylashuvni to\u2018xtatish tugmasi chiqadi. */
  isOwner?: boolean;
  /**
   * Eski sxemadagi fayllar (`posts.media_urls`).
   * `post_media` bo\u2018sh bo\u2018lganda faqat shu ishlatiladi — shu tariqa eski
   * postlar ham ko\u2018rinadi, yangi postlar esa ikki marta chizilmaydi.
   */
  legacyMediaUrls?: string[] | null;
  legacyMediaType?: string | null;
  /** Production structured schema hali deploy bo'lmaganda content markeridan tiklanadi. */
  legacyLocation?: LegacyPostLocation | null;
  /** Koordinatasiz eski joylashuv (masalan "Joriy joylashuv") — nom bilan karta chiziladi. */
  legacyLocationLabel?: string | null;
  /** `[MUSIC]{...}` markeridan olingan musiqa — `post_music` bo\u2018lmasa ishlatiladi. */
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

/** Koordinatasi yo\u2018q eski joylashuv uchun karta (xarita rasmi bo\u2018lmaydi). */
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
 * Lentadagi post ostiga qo\u2018shiladigan strukturali kontent bloki:
 * fayllar galereyasi (har qanday tur), stikerlar, musiqa, so\u2018rovnoma va joylashuv.
 *
 * Bu blok postning matnidan mustaqil — shuning uchun eski postlar ham
 * buzilmaydi: `post_media` bo\u2018sh bo\u2018lsa eski `media_urls` ishlatiladi,
 * `post_music` bo\u2018sh bo\u2018lsa content markeridagi musiqa ko\u2018rsatiladi.
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

  // Strukturali musiqa ustun; bo\u2018lmasa content markeridagi musiqa chiziladi.
  // MUHIM: ilgari `playback_url` bo\u2018lmasa karta umuman chizilmasdi. Signed URL
  // olinmagan holatlarda ham trekning o\u2018z `audio_url` i bilan ijro qilinadi.
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

  // Yangi sxemada fayl bo\u2018lmasa — eski massivga qaytamiz.
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
      {/* Eski posts.media_urls ham extension bo'yicha ajratiladi:
          document/archive endi image carouselga noto'g'ri tushmaydi. */}
      {legacy.filter((url) => {
        const kind = detectMediaKind({ name: fileNameFromUrl(url), type: '' });
        return kind !== 'document' && kind !== 'archive' && kind !== 'other' && kind !== 'audio';
      }).length > 0 && (
        <PostMediaCarousel
          mediaUrls={legacy.filter((url) => {
            const kind = detectMediaKind({ name: fileNameFromUrl(url), type: '' });
            return kind !== 'document' && kind !== 'archive' && kind !== 'other' && kind !== 'audio';
          })}
          mediaType={legacyMediaType || 'image'}
        />
      )}

      {legacy
        .filter((url) => detectMediaKind({ name: fileNameFromUrl(url), type: '' }) === 'audio')
        .map((url) => (
          <PostAudioPlayer
            key={url}
            src={url}
            title={fileNameFromUrl(url, 'Audio')}
            subtitle="Audio"
          />
        ))}

      {legacy
        .filter((url) => {
          const kind = detectMediaKind({ name: fileNameFromUrl(url), type: '' });
          return kind === 'document' || kind === 'archive' || kind === 'other';
        })
        .map((url) => (
          <PostDocumentCard
            key={url}
            url={url}
            fileName={fileNameFromUrl(url)}
          />
        ))}

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

              {/* Media ustidagi stikerlar — faqat ko\u2018rish rejimi */}
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

      {/* So\u2018rovnoma */}
      {hasPoll && <PollCard postId={postId} />}

      {/* Joylashuv */}
      {displayLocation && (
        <PostLocationCard
          location={displayLocation}
          isOwner={Boolean(location) && isOwner}
        />
      )}

      {/* Koordinatasi yo\u2018q eski joylashuv */}
      {labelOnlyLocation && <PlaceLabelCard label={labelOnlyLocation} />}
    </div>
  );
}
