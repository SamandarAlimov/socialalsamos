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
  showUrl?: boolean;
}

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

const PORTRAIT_WIDTH = 320;
const LANDSCAPE_WIDTH = 430;
const MAX_PORTRAIT_HEIGHT = 520;
const MAX_LANDSCAPE_HEIGHT = 340;
const TEXT_CARD_WIDTH = 360;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url;
  }
}

function siteNameOf(url: string): string {
  const host = hostOf(url);
  const key = Object.keys(SITE_NAMES).find((item) => host === item || host.endsWith('.' + item));
  return key ? SITE_NAMES[key] : host;
}

function titleOf(url: string, embed: EmbedInfo): string {
  if (embed.provider === 'youtube') return embed.portrait ? 'YouTube Shorts' : 'YouTube video';
  if (embed.provider === 'instagram') return embed.portrait ? 'Instagram Reel' : 'Instagram post';
  if (embed.provider === 'tiktok') return 'TikTok video';
  if (embed.provider === 'vimeo') return 'Vimeo video';

  try {
    const parsed = new URL(url);
    const segments = decodeURIComponent(parsed.pathname).split('/').filter(Boolean);
    if (!segments.length) return hostOf(url);
    if (hostOf(url) === 'github.com' && segments.length >= 2) {
      return segments[0] + '/' + segments[1];
    }
    const last = segments[segments.length - 1];
    const cleaned = last.replace(/\.\w{2,5}$/, '').replace(/[-_+]+/g, ' ').trim();
    return cleaned || hostOf(url);
  } catch {
    return url;
  }
}

function localMeta(url: string, embed: EmbedInfo): LinkMeta {
  return {
    siteName: embed.siteName || siteNameOf(url),
    title: titleOf(url, embed),
    image: embed.thumbnail,
  };
}

function normalized(value?: string) {
  return (value || '').trim().toLowerCase().replace(/^www\./, '');
}

function meaningfulRemoteText(value: string | undefined, url: string, siteName?: string) {
  if (!value?.trim()) return false;
  const clean = normalized(value);
  const host = normalized(hostOf(url));
  const site = normalized(siteName);
  return clean !== host && clean !== site && clean !== 'instagram.com' && clean !== 'youtube.com';
}

function cropStyle(provider: EmbedInfo['provider']): React.CSSProperties | undefined {
  if (provider === 'instagram') {
    return {
      width: '100%',
      height: 'calc(100% + 184px)',
      top: '-72px',
      left: 0,
    };
  }
  if (provider === 'tiktok') {
    return {
      width: '100%',
      height: 'calc(100% + 156px)',
      top: '-58px',
      left: 0,
    };
  }
  return undefined;
}

export function TelegramLinkPreview({
  url,
  isMine,
  className,
  showUrl = false,
}: TelegramLinkPreviewProps) {
  const embed = useMemo(() => detectEmbed(url), [url]);
  const [meta, setMeta] = useState<LinkMeta>(() => localMeta(url, embed));
  const [playing, setPlaying] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<number | undefined>();

  useEffect(() => {
    setMeta(localMeta(url, embed));
    setPlaying(false);
    setImageFailed(false);
    setNaturalRatio(undefined);

    let cancelled = false;
    void fetchLinkMeta(url).then((remote) => {
      if (cancelled || !remote) return;

      setMeta((previous) => {
        const next: LinkMeta = { ...previous };
        if (remote.siteName && meaningfulRemoteText(remote.siteName, url)) next.siteName = remote.siteName;
        if (remote.title && meaningfulRemoteText(remote.title, url, next.siteName)) next.title = remote.title;
        if (remote.description && meaningfulRemoteText(remote.description, url, next.siteName)) {
          next.description = remote.description;
        }
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
  }, [embed, url]);

  const directVideo = meta.video || (embed.fileKind === 'video' ? embed.fileUrl : undefined);
  const playable = Boolean(directVideo || embed.embedUrl);
  const poster = imageFailed ? undefined : meta.image || embed.thumbnail;
  const duration = formatDuration(meta.duration);
  const isSocialVideo = ['youtube', 'instagram', 'tiktok', 'vimeo'].includes(embed.provider);
  const cropEmbed = embed.provider === 'instagram' || embed.provider === 'tiktok';

  const ratio = useMemo(() => {
    if (!directVideo && isSocialVideo && embed.aspectRatio) return embed.aspectRatio;
    return resolveAspectRatio({ embed, meta, natural: naturalRatio });
  }, [directVideo, embed, isSocialVideo, meta, naturalRatio]);

  const portrait = ratio < 0.95;
  const mediaWidth = portrait
    ? Math.min(PORTRAIT_WIDTH, Math.round(MAX_PORTRAIT_HEIGHT * ratio))
    : Math.min(LANDSCAPE_WIDTH, Math.round(MAX_LANDSCAPE_HEIGHT * ratio));
  const hasMedia = playable || Boolean(poster);
  const contentWidth = hasMedia ? Math.max(mediaWidth, 240) : TEXT_CARD_WIDTH;

  const handleDownload = async () => {
    if (!directVideo || downloading) return;
    setDownloading(true);
    try {
      await downloadRemoteMedia(
        directVideo,
        suggestedFilename(directVideo, embed.provider, embed.id)
      );
    } catch {
      toast.error('Yuklab olinmadi');
    } finally {
      setDownloading(false);
    }
  };

  const mediaFrame = hasMedia ? (
    <div
      className="relative overflow-hidden rounded-[14px] bg-black shadow-[0_2px_10px_rgba(0,0,0,0.16)] ring-1 ring-black/10"
      style={{
        width: mediaWidth + 'px',
        maxWidth: '100%',
        aspectRatio: String(ratio),
      }}
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
          onLoadedMetadata={(event) => {
            const element = event.currentTarget;
            const next = snapAspectRatio(element.videoWidth / element.videoHeight);
            if (next) setNaturalRatio(next);
          }}
          onClick={(event) => event.stopPropagation()}
        />
      ) : playing && embed.embedUrl ? (
        <iframe
          src={embed.embedUrl}
          title={meta.title || 'video'}
          loading="eager"
          scrolling="no"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute border-0 bg-black"
          style={cropStyle(embed.provider) || { inset: 0, width: '100%', height: '100%' }}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <>
          {poster ? (
            <img
              src={poster}
              alt={meta.title || ''}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              onLoad={(event) => {
                if (embed.aspectRatio && isSocialVideo) return;
                const element = event.currentTarget;
                const next = snapAspectRatio(element.naturalWidth / element.naturalHeight);
                if (next) setNaturalRatio((previous) => previous ?? next);
              }}
              onError={() => setImageFailed(true)}
            />
          ) : cropEmbed && embed.embedUrl ? (
            <iframe
              src={embed.embedUrl}
              title={meta.title || 'preview'}
              loading="lazy"
              scrolling="no"
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none absolute border-0 bg-black"
              style={cropStyle(embed.provider)}
            />
          ) : (
            <span className="absolute inset-0 bg-gradient-to-br from-neutral-700 to-neutral-950" />
          )}

          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setPlaying(true);
            }}
            className="group absolute inset-0 flex items-center justify-center bg-black/5"
            aria-label="Videoni ijro etish"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/52 ring-1 ring-white/30 backdrop-blur-md transition-transform group-hover:scale-105">
              <Play className="h-6 w-6 translate-x-[1px] fill-white text-white" />
            </span>
          </button>

          {duration && (
            <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
              {duration}
            </span>
          )}
        </>
      )}
    </div>
  ) : null;

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'block overflow-hidden rounded-xl border-l-[3px] pl-2.5',
        isMine ? 'border-bubble-own-accent/70 bg-black/[0.045]' : 'border-foreground/65 bg-muted/55',
        className
      )}
      style={{ width: 'fit-content', maxWidth: '100%' }}
    >
      <div
        className="flex flex-col gap-1.5 py-2 pr-2.5"
        style={{ width: contentWidth + 'px', maxWidth: '100%' }}
      >
        {showUrl && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'line-clamp-2 break-all text-[12px] leading-snug underline-offset-2 hover:underline',
              isMine ? 'text-bubble-own-accent' : 'text-link'
            )}
          >
            {url}
          </a>
        )}

        <div className="flex items-start justify-between gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="min-w-0 flex-1"
          >
            <p
              className={cn(
                'truncate text-[12px] font-semibold',
                isMine ? 'text-bubble-own-foreground/85' : 'text-foreground/80'
              )}
            >
              {meta.siteName || siteNameOf(url)}
              {meta.author ? ' · ' + meta.author : ''}
            </p>
            {meta.title && (
              <p
                className={cn(
                  'line-clamp-2 text-[13px] font-semibold leading-snug',
                  isMine ? 'text-bubble-own-foreground' : 'text-foreground'
                )}
              >
                {meta.title}
              </p>
            )}
            {meta.description && (
              <p
                className={cn(
                  'line-clamp-2 text-[12px] leading-snug',
                  isMine ? 'text-bubble-own-foreground/65' : 'text-muted-foreground'
                )}
              >
                {meta.description}
              </p>
            )}
          </a>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Manbada ochish"
            title="Manbada ochish"
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
              isMine
                ? 'text-bubble-own-foreground/55 hover:bg-black/5 hover:text-bubble-own-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {mediaFrame && <div className="mt-0.5">{mediaFrame}</div>}

        {directVideo && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className={cn(
              'mt-0.5 inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors',
              isMine
                ? 'bg-black/5 text-bubble-own-foreground/70 hover:bg-black/10'
                : 'bg-muted text-muted-foreground hover:text-foreground'
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
      </div>
    </div>
  );
}
