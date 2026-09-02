import { useState } from 'react';
import { FileText, ImageIcon, Music2, Play, Quote, MapPin } from 'lucide-react';
import { getPostPreview } from '@/components/discovery/PostPreviewContent';
import { formatTrackDuration } from '@/lib/postMarkers';
import { cn } from '@/lib/utils';

/**
 * Discover kartochkalari ilgari HAR QANDAY postni bir xil "media katak"
 * sifatida chizardi:
 *   - matnli post bo'sh kulrang kvadrat ichida turardi (media kabi),
 *   - fayl/hujjat posti ham xuddi shunday,
 *   - video posti esa <img src="...mp4"> ga tushib, brauzer singan rasm
 *     ikonkasi va alt matnini ko'rsatardi.
 *
 * Bu modul post turini aniqlab, har biriga mos professional ko'rinish beradi.
 */

export type PostVisualKind = 'image' | 'video' | 'audio' | 'file' | 'text';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg|heic)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|avi|mkv)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)(\?|#|$)/i;

/** URL dan foydalanuvchiga ko'rsatiladigan fayl nomini ajratadi. */
export function fileNameFromUrl(url: string | null | undefined): string {
  if (!url) return 'Fayl';

  try {
    const path = url.split('?')[0].split('#')[0];
    const last = path.split('/').filter(Boolean).pop() ?? '';
    const decoded = decodeURIComponent(last);
    return decoded || 'Fayl';
  } catch {
    return 'Fayl';
  }
}

function fileExtension(url: string | null | undefined): string | null {
  const name = fileNameFromUrl(url);
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toUpperCase().slice(0, 5);
}

/**
 * media_type bazada har doim ham to'g'ri to'ldirilmagan, shuning uchun
 * fayl kengaytmasi ham hisobga olinadi.
 */
export function resolvePostVisualKind(
  mediaType: string | null | undefined,
  url: string | null | undefined,
  hasMusicMarker = false,
): PostVisualKind {
  if (!url) return hasMusicMarker ? 'audio' : 'text';

  const type = (mediaType ?? '').toLowerCase();

  if (type === 'video' || type === 'reel' || VIDEO_EXT.test(url)) return 'video';
  if (type === 'audio' || type === 'music' || type === 'voice' || AUDIO_EXT.test(url)) return 'audio';
  if (type === 'image' || type === 'photo' || IMAGE_EXT.test(url)) return 'image';
  if (type === 'file' || type === 'document') return 'file';

  // Noma'lum tur: rasm deb taxmin qilib, xato bo'lsa fayl ko'rinishiga tushamiz.
  return 'image';
}

interface PostCardVisualProps {
  content: string | null | undefined;
  mediaUrls: string[] | null | undefined;
  mediaType: string | null | undefined;
  /** `grid` - kattaroq kartochka, `tile` - 3 ustunli kichik katak. */
  variant?: 'grid' | 'tile';
  className?: string;
}

export function PostCardVisual({
  content,
  mediaUrls,
  mediaType,
  variant = 'grid',
  className,
}: PostCardVisualProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const url = mediaUrls?.[0] ?? null;
  const preview = getPostPreview(content);
  const kind = resolvePostVisualKind(mediaType, url, !!preview.music);
  const compact = variant === 'tile';

  const wrapper = cn('relative h-full w-full overflow-hidden', className);

  // ── Rasm ──
  if (kind === 'image' && url && !imageFailed) {
    return (
      <div className={cn(wrapper, 'bg-muted')}>
        <img
          src={url}
          alt={preview.text ? preview.text.slice(0, 80) : 'Post rasmi'}
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {(mediaUrls?.length ?? 0) > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
            1/{mediaUrls?.length}
          </span>
        )}
      </div>
    );
  }

  // ── Video: <img> emas, haqiqiy video birinchi kadri ──
  if (kind === 'video' && url) {
    return (
      <div className={cn(wrapper, 'bg-black')}>
        <video
          src={url}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
          aria-label={preview.text ? preview.text.slice(0, 80) : 'Video post'}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/40 via-transparent to-transparent">
          <span
            className={cn(
              'flex items-center justify-center rounded-full bg-white/90 text-black shadow-lg',
              compact ? 'h-8 w-8' : 'h-11 w-11',
            )}
          >
            <Play className={cn('translate-x-[1px] fill-current', compact ? 'h-3.5 w-3.5' : 'h-5 w-5')} />
          </span>
        </div>
        {preview.text && !compact && (
          <p className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-left text-xs text-white">
            {preview.text}
          </p>
        )}
      </div>
    );
  }

  // ── Audio / musiqa ──
  if (kind === 'audio') {
    const title = preview.music?.title ?? fileNameFromUrl(url);
    const subtitle =
      [preview.music?.artist, formatTrackDuration(preview.music?.durationSeconds ?? null)]
        .filter(Boolean)
        .join(' · ') || 'Audio';

    return (
      <div
        className={cn(
          wrapper,
          'flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted/80 via-background to-muted/45',
          compact ? 'p-2' : 'p-4',
        )}
      >
        <span
          className={cn(
            'flex items-center justify-center rounded-2xl bg-muted text-muted-foreground',
            compact ? 'h-9 w-9' : 'h-14 w-14',
          )}
        >
          <Music2 className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
        </span>
        <p
          className={cn(
            'line-clamp-2 px-1 text-center font-semibold text-foreground',
            compact ? 'text-[11px]' : 'text-sm',
          )}
        >
          {title}
        </p>
        {!compact && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    );
  }

  // ── Fayl / hujjat ──
  if (kind === 'file' || (kind === 'image' && imageFailed)) {
    const name = fileNameFromUrl(url);
    const ext = fileExtension(url);
    const Icon = kind === 'image' ? ImageIcon : FileText;

    return (
      <div
        className={cn(
          wrapper,
          'flex flex-col items-center justify-center gap-2 bg-muted/60',
          compact ? 'p-2' : 'p-4',
        )}
      >
        <span
          className={cn(
            'flex items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm',
            compact ? 'h-9 w-9' : 'h-14 w-14',
          )}
        >
          <Icon className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
        </span>
        <p
          className={cn(
            'line-clamp-2 break-all px-1 text-center font-medium text-foreground',
            compact ? 'text-[10px]' : 'text-xs',
          )}
        >
          {name}
        </p>
        {ext && !compact && (
          <span className="rounded-md bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {ext}
          </span>
        )}
      </div>
    );
  }

  // ── Matnli post: bu media emas, shuning uchun tipografik kartochka ──
  return (
    <div
      className={cn(
        wrapper,
        'flex flex-col justify-center gap-2 bg-gradient-to-br from-muted/70 via-background to-muted/40',
        compact ? 'p-3' : 'p-5',
      )}
    >
      <Quote
        className={cn('shrink-0 text-muted-foreground/30', compact ? 'h-3.5 w-3.5' : 'h-5 w-5')}
        aria-hidden="true"
      />
      {preview.text ? (
        <p
          className={cn(
            'text-left font-medium leading-snug text-foreground',
            compact ? 'line-clamp-5 text-[11px]' : 'line-clamp-6 text-sm',
          )}
        >
          {preview.text}
        </p>
      ) : (
        <p className={cn('text-left italic text-muted-foreground', compact ? 'text-[11px]' : 'text-sm')}>
          Matnsiz post
        </p>
      )}

      {preview.location && (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {preview.location.label ?? preview.location.place?.name ?? 'Joylashuv'}
          </span>
        </span>
      )}
    </div>
  );
}
