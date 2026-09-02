import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  detectEmbed,
  downloadRemoteMedia,
  fetchLinkMeta,
  formatDuration,
  resolveAspectRatio,
  snapAspectRatio,
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

/** Vertikal media uchun maksimal balandlik (Telegramdek yirik va aniq). */
const MAX_PORTRAIT_HEIGHT = 480;
/** Gorizontal / kvadrat media uchun maksimal balandlik. */
const MAX_LANDSCAPE_HEIGHT = 340;
/** Vertikal media uchun maqsadli kenglik (Telegram Desktopdagidek). */
const PORTRAIT_WIDTH = 300;
/** Gorizontal media uchun maqsadli kenglik. */
const LANDSCAPE_WIDTH = 420;
/** Mediasi yo'q oddiy karta kengligi. */
const TEXT_CARD_WIDTH = 360;

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
 * Telegram uslubidagi havola kartasi (premium ko'rinish).
 *
 * Telegramdek ishlaydi: foydalanuvchi shunchaki link tashlaydi, video/rasm
 * platformaga o'tmasdan XUDDI SHU CHAT ICHIDA ochiladi va yuklab olinadi.
 *
 *  - YouTube / Instagram / TikTok / Telegram / Vimeo -> ichki pleyer (iframe)
 *  - `og:video` topilsa -> haqiqiy `<video>` (to'liq boshqaruv + yuklab olish)
 *  - to'g'ridan-to'g'ri .mp4/.webm havolalari -> `<video>`
 *  - qolganlari -> klassik sarlavha/tavsif/rasm kartasi
 *
 * MUHIM: karta kengligi mediasining haqiqiy kengligiga moslashadi, ya'ni
 * vertikal (9:16) video atrofida bo'sh, keng joy qolmaydi va media kichkina
 * "ingichka" ko'rinmaydi. Nisbat esa har doim mediasining o'zidan olinadi
 * (9:16, 3:4, 4:5, 1:1, 4:3, 16:9 ...).
 */
export function TelegramLinkPreview({ url, isMine, className }: TelegramLinkPreviewProps) {
  const embed = useMemo(() => detectEmbed(url), [url]);
  const [meta, setMeta] = useState<LinkMeta>(() => localMeta(url, embed));
  const [playing, setPlaying] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  /** Brauzer o'qigan haqiqiy nisbat (video yoki poster yuklangandan keyin). */
  const [naturalRatio, setNaturalRatio] = useState<number | undefined>(undefined);

  useEffect(() => {
    setMeta(localMeta(url, embed));
    setPlaying(false);
    setImageFailed(false);
    setNaturalRatio(undefined);

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
        if (remote.imageWidth) next.imageWidth = remote.imageWidth;
        if (remote.imageHeight) next.imageHeight = remote.imageHeight;
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

  /** Media nisbati: og:video -> haqiqiy o'lcham -> og:image -> provider -> 16:9 */
  const ratio = useMemo(
    () => resolveAspectRatio({ embed, meta, natural: naturalRatio }),
    [embed, meta, naturalRatio]
  );
  const isPortrait = ratio < 0.95;

  /**
   * Media kengligi: nisbat va maksimal balandlikdan kelib chiqadi.
   * Vertikal videoda kenglik ~300px, balandligi 480px gacha - Telegramdagidek
   * yirik, "premium" ko'rinish. Karta ham xuddi shu kenglikka qisqaradi.
   */
  const mediaWidth = isPortrait
    ? Math.min(PORTRAIT_WIDTH, Math.round(MAX_PORTRAIT_HEIGHT * ratio))
    : Math.min(LANDSCAPE_WIDTH, Math.round(MAX_LANDSCAPE_HEIGHT * ratio));

  const hasMedia = canPlayInline || Boolean(poster);
  /** Karta ichidagi ustun kengligi - media bo'lsa aynan media kengligi. */
  const contentWidth = hasMedia ? Math.max(mediaWidth, 220) : TEXT_CARD_WIDTH;

  /**
   * iframe ichidagi platforma UI'si (Instagram profil satri, TikTok izohi...)
   * uchun qo'shimcha joy. `content-box` + `padding-bottom` bilan nisbat
   * mediaga tegishli qismda saqlanadi, chrome esa pastdan qo'shiladi -
   * natijada iframe ichida scroll bo'lmaydi.
   */
  const chrome = playing && !directVideo && embed.embedUrl ? embed.embedChrome || 0 : 0;

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

  const frameStyle: React.CSSProperties = {
    width: mediaWidth + 'px',
    maxWidth: '100%',
    aspectRatio: String(ratio),
    boxSizing: chrome ? 'content-box' : 'border-box',
    paddingBottom: chrome ? chrome + 'px' : undefined,
  };

  const mediaFrame = (
    <div
      className="relative overflow-hidden rounded-xl bg-black shadow-[0_2px_12px_rgba(0,0,0,0.18)] ring-1 ring-black/10"
      style={frameStyle}
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
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            const next = snapAspectRatio(el.videoWidth / el.videoHeight);
            if (next) setNaturalRatio(next);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : playing && embed.embedUrl ? (
        <iframe
          src={embed.embedUrl}
          title={meta.title || 'video'}
          loading="lazy"
          scrolling="no"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full overflow-hidden border-0 bg-black"
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
              onLoad={(e) => {
                if (meta.videoWidth && meta.videoHeight) return;
                const el = e.currentTarget;
                const next = snapAspectRatio(el.naturalWidth / el.naturalHeight);
                if (next) setNaturalRatio((prev) => prev ?? next);
              }}
              onError={() => setImageFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 bg-gradient-to-br from-neutral-700 to-neutral-900" />
          )}

          {/* Premium yorug'lik: pastdan yumshoq qoraytirish */}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />

          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 ring-1 ring-white/25 backdrop-blur-md transition-transform duration-150 group-hover:scale-110">
              <Play className="h-7 w-7 translate-x-[1px] fill-white text-white" />
            </span>
          </span>

          {duration && (
            <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md">
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
        'block overflow-hidden rounded-xl pl-2.5',
        isMine ? 'bg-bubble-own-foreground/10' : 'bg-muted/70',
        className
      )}
      style={{
        width: 'fit-content',
        maxWidth: '100%',
        borderLeft: '3px solid',
        borderLeftColor: isMine ? 'rgba(255,255,255,0.7)' : 'hsl(var(--primary))',
      }}
    >
      <div
        className="flex flex-col gap-1 py-2 pr-2.5"
        style={{ width: contentWidth + 'px', maxWidth: '100%' }}
      >
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
              isMine ? 'text-bubble-own-foreground/90' : 'text-link'
            )}
          >
            {meta.siteName}
            {meta.author ? ' \u00b7 ' + meta.author : ''}
          </p>

          {meta.title && (
            <p
              className={cn(
                'line-clamp-2 break-words text-[13px] font-semibold leading-snug',
                isMine ? 'text-bubble-own-foreground' : 'text-foreground'
              )}
            >
              {meta.title}
            </p>
          )}

          {meta.description && (
            <p
              className={cn(
                'line-clamp-2 break-words text-[12px] leading-snug',
                isMine ? 'text-bubble-own-foreground/70' : 'text-muted-foreground'
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
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
                    isMine
                      ? 'bg-bubble-own-foreground/10 text-bubble-own-foreground hover:bg-bubble-own-foreground/15'
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
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
                  isMine
                    ? 'bg-bubble-own-foreground/10 text-bubble-own-foreground hover:bg-bubble-own-foreground/15'
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
              className="relative mt-1 block overflow-hidden rounded-xl bg-black shadow-[0_2px_12px_rgba(0,0,0,0.18)] ring-1 ring-black/10"
              style={{
                width: mediaWidth + 'px',
                maxWidth: '100%',
                aspectRatio: String(ratio),
              }}
            >
              <img
                src={poster}
                alt={meta.title || ''}
                loading="lazy"
                decoding="async"
                onLoad={(e) => {
                  const el = e.currentTarget;
                  const next = snapAspectRatio(el.naturalWidth / el.naturalHeight);
                  if (next) setNaturalRatio((prev) => prev ?? next);
                }}
                onError={() => setImageFailed(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </a>
          )
        )}
      </div>
    </div>
  );
}
