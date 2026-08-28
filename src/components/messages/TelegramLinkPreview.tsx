import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  detectEmbed,
  downloadRemoteMedia,
  fetchLinkMeta,
  formatDuration,
  suggestedFilename,
  type EmbedInfo,
  type LinkMeta,
} from '@/lib/linkEmbed';

interface TelegramLinkPreviewProps {
  url: string;
  isMine?: boolean;
  className?: string;
}

/** Mashhur saytlar uchun chiroyli nom */
const SITE_NAMES: Record<string, string> = {
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'github.com': 'GitHub',
  't.me': 'Telegram',
  'telegram.org': 'Telegram',
  'instagram.com': 'Instagram',
  'x.com': 'X',
  'twitter.com': 'X',
  'facebook.com': 'Facebook',
  'tiktok.com': 'TikTok',
  'linkedin.com': 'LinkedIn',
  'wikipedia.org': 'Wikipedia',
  'alsamos.com': 'Alsamos',
  'vercel.com': 'Vercel',
  'medium.com': 'Medium',
  'reddit.com': 'Reddit',
  'spotify.com': 'Spotify',
  'vimeo.com': 'Vimeo',
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function siteNameOf(url: string): string {
  const host = hostOf(url);
  const key = Object.keys(SITE_NAMES).find((k) => host === k || host.endsWith('.' + k));
  return key ? SITE_NAMES[key] : host;
}

function titleOf(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = decodeURIComponent(parsed.pathname).split('/').filter(Boolean);
    if (!segments.length) return hostOf(url);
    if (hostOf(url) === 'github.com' && segments.length >= 2) {
      return segments[0] + '/' + segments[1];
    }
    const last = segments[segments.length - 1];
    const cleaned = last.replace(/\.\w{2,5}$/, '').replace(/[-_+]+/g, ' ').trim();
    if (!cleaned) return hostOf(url);
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  } catch {
    return url;
  }
}

function pathOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname + parsed.search).replace(/\/$/, '');
    return path ? path : undefined;
  } catch {
    return undefined;
  }
}

/** Tarmoqsiz, darhol ko'rsatiladigan boshlang'ich metama'lumot. */
function localMeta(url: string, embed: EmbedInfo): LinkMeta {
  return {
    siteName: embed.siteName || siteNameOf(url),
    title:
      embed.provider === 'youtube'
        ? 'YouTube video'
        : embed.provider === 'instagram'
          ? 'Instagram video'
          : embed.provider === 'tiktok'
            ? 'TikTok video'
            : titleOf(url),
    description: embed.provider === 'none' ? pathOf(url) : hostOf(url),
    image: embed.thumbnail,
  };
}

/**
 * Telegram uslubidagi havola kartasi.
 *
 * Telegramdek ishlaydi: foydalanuvchi shunchaki link tashlaydi, video/rasm
 * platformaga o'tmasdan XUDDI SHU CHAT ICHIDA ochiladi va yuklab olinadi.
 *
 *  - YouTube / Instagram / TikTok / Telegram / Vimeo -> ichki pleyer (iframe)
 *  - `og:video` topilsa -> haqiqiy `<video>` (to'liq boshqaruv + yuklab olish)
 *  - to'g'ridan-to'g'ri .mp4/.webm havolalari -> `<video>`
 *  - qolganlari -> klassik sarlavha/tavsif/rasm kartasi
 */
export function TelegramLinkPreview({ url, isMine, className }: TelegramLinkPreviewProps) {
  const embed = useMemo(() => detectEmbed(url), [url]);
  const [meta, setMeta] = useState<LinkMeta>(() => localMeta(url, embed));
  const [playing, setPlaying] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setMeta(localMeta(url, embed));
    setPlaying(false);
    setImageFailed(false);

    let cancelled = false;
    fetchLinkMeta(url).then((remote) => {
      if (cancelled || !remote) return;
      setMeta((prev) => {
        const next: LinkMeta = { ...prev };
        if (remote.siteName) next.siteName = remote.siteName;
        if (remote.title) next.title = remote.title;
        if (remote.description) next.description = remote.description;
        if (remote.image) next.image = remote.image;
        if (remote.video) next.video = remote.video;
        if (remote.author) next.author = remote.author;
        if (remote.duration) next.duration = remote.duration;
        if (remote.videoWidth) next.videoWidth = remote.videoWidth;
        if (remote.videoHeight) next.videoHeight = remote.videoHeight;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [url, embed]);

  const directVideo =
    meta.video || (embed.fileKind === 'video' ? embed.fileUrl : undefined);
  const canPlayInline = Boolean(directVideo || embed.embedUrl);
  const poster = imageFailed ? undefined : meta.image || embed.thumbnail;
  const duration = formatDuration(meta.duration);

  // Vertikal video (Reels / Shorts / TikTok) yoki gorizontal
  const portrait =
    embed.portrait ||
    (Boolean(meta.videoWidth && meta.videoHeight) &&
      (meta.videoHeight as number) > (meta.videoWidth as number));

  const handleDownload = async () => {
    if (!directVideo || downloading) return;
    setDownloading(true);
    try {
      const filename = suggestedFilename(directVideo, embed.provider, embed.id);
      await downloadRemoteMedia(directVideo, filename);
    } catch {
      toast.error('Yuklab olinmadi');
    } finally {
      setDownloading(false);
    }
  };

  const mediaFrame = (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-lg bg-black/90',
        portrait ? 'aspect-[9/16] max-h-[430px]' : 'aspect-video'
      )}
    >
      {playing && directVideo ? (
        <video
          src={directVideo}
          poster={poster}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full bg-black object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      ) : playing && embed.embedUrl ? (
        <iframe
          src={embed.embedUrl}
          title={meta.title || 'video'}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0 bg-black"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPlaying(true);
          }}
          className="group absolute inset-0 h-full w-full"
          aria-label="Videoni ijro etish"
        >
          {poster ? (
            <img
              src={poster}
              alt={meta.title || ''}
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 bg-gradient-to-br from-neutral-700 to-neutral-900" />
          )}

          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition-transform duration-150 group-hover:scale-110">
              <Play className="h-6 w-6 translate-x-[1px] fill-white text-white" />
            </span>
          </span>

          {duration && (
            <span className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {duration}
            </span>
          )}
        </button>
      )}
    </div>
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'block max-w-full overflow-hidden rounded-lg pl-2.5',
        isMine ? 'bg-primary-foreground/10' : 'bg-muted/70',
        className
      )}
      style={{
        borderLeft: '3px solid',
        borderLeftColor: isMine ? 'rgba(255,255,255,0.7)' : 'hsl(var(--primary))',
      }}
    >
      <div className="flex flex-col gap-1 py-2 pr-2.5">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          <p
            className={cn(
              'truncate text-[12px] font-semibold',
              isMine ? 'text-primary-foreground/90' : 'text-primary'
            )}
          >
            {meta.siteName}
            {meta.author ? ' \u00b7 ' + meta.author : ''}
          </p>

          {meta.title && (
            <p
              className={cn(
                'line-clamp-2 break-words text-[13px] font-semibold leading-snug',
                isMine ? 'text-primary-foreground' : 'text-foreground'
              )}
            >
              {meta.title}
            </p>
          )}

          {meta.description && (
            <p
              className={cn(
                'line-clamp-2 break-words text-[12px] leading-snug',
                isMine ? 'text-primary-foreground/75' : 'text-muted-foreground'
              )}
            >
              {meta.description}
            </p>
          )}
        </a>

        {canPlayInline ? (
          <div className="mt-1 space-y-1.5">
            {mediaFrame}

            <div className="flex items-center gap-1.5">
              {directVideo && (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors',
                    isMine
                      ? 'bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25'
                      : 'bg-background/80 text-foreground hover:bg-background'
                  )}
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Yuklab olish
                </button>
              )}

              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors',
                  isMine
                    ? 'bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25'
                    : 'bg-background/80 text-foreground hover:bg-background'
                )}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Manbada ochish
              </a>
            </div>
          </div>
        ) : (
          poster && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="relative mt-1 block overflow-hidden rounded-md"
            >
              <img
                src={poster}
                alt={meta.title || ''}
                loading="lazy"
                decoding="async"
                onError={() => setImageFailed(true)}
                className="max-h-[240px] w-full object-cover"
              />
            </a>
          )
        )}
      </div>
    </div>
  );
}
