import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinkMeta {
  siteName: string;
  title: string;
  description?: string;
  image?: string;
  isVideo?: boolean;
  large?: boolean;
}

interface TelegramLinkPreviewProps {
  url: string;
  isMine?: boolean;
  className?: string;
}

const YT_THUMB_BASE = 'https://' + 'img.youtube.com/vi/';
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i;

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
};

function youtubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

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
    const last = segments[segments.length - 1];
    const cleaned = last.replace(/\.\w{2,5}$/, '').replace(/[-_+]+/g, ' ').trim();
    if (!cleaned) return hostOf(url);
    // GitHub: "owner/repo" ko'rinishida
    if (hostOf(url) === 'github.com' && segments.length >= 2) {
      return segments[0] + '/' + segments[1];
    }
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  } catch {
    return url;
  }
}

function pathOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname + parsed.search).replace(/\/$/, '');
    return path && path !== '' ? path : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Telegram uslubidagi havola kartasi: chapda rangli chiziq, sayt nomi, sarlavha,
 * tavsif va (mavjud bo'lsa) katta rasm. Metama'lumot mahalliy hisoblanadi,
 * shuning uchun karta xabarni hech qachon kutib turmaydi.
 */
export function TelegramLinkPreview({ url, isMine, className }: TelegramLinkPreviewProps) {
  const [meta, setMeta] = useState<LinkMeta | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);

    const videoId = youtubeId(url);
    if (videoId) {
      setMeta({
        siteName: 'YouTube',
        title: 'YouTube video',
        description: hostOf(url),
        image: YT_THUMB_BASE + videoId + '/hqdefault.jpg',
        isVideo: true,
        large: true,
      });
      return;
    }

    if (IMAGE_EXT.test(url)) {
      setMeta({
        siteName: siteNameOf(url),
        title: titleOf(url),
        image: url,
        large: true,
      });
      return;
    }

    setMeta({
      siteName: siteNameOf(url),
      title: titleOf(url),
      description: pathOf(url),
    });
  }, [url]);

  if (!meta) return null;

  const showImage = !!meta.image && !imageFailed;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'block max-w-full overflow-hidden rounded-lg pl-2.5 transition-colors',
        isMine ? 'bg-primary-foreground/10 hover:bg-primary-foreground/15' : 'bg-muted/70 hover:bg-muted',
        className
      )}
      style={{
        borderLeft: '3px solid',
        borderLeftColor: isMine ? 'rgba(255,255,255,0.7)' : 'hsl(var(--primary))',
      }}
    >
      <div className="flex flex-col gap-1 py-2 pr-2.5">
        <p
          className={cn(
            'truncate text-[12px] font-semibold',
            isMine ? 'text-primary-foreground/90' : 'text-primary'
          )}
        >
          {meta.siteName}
        </p>

        <p
          className={cn(
            'line-clamp-2 break-words text-[13px] font-semibold leading-snug',
            isMine ? 'text-primary-foreground' : 'text-foreground'
          )}
        >
          {meta.title}
        </p>

        {meta.description && (
          <p
            className={cn(
              'line-clamp-2 break-all text-[12px] leading-snug',
              isMine ? 'text-primary-foreground/75' : 'text-muted-foreground'
            )}
          >
            {meta.description}
          </p>
        )}

        {showImage && (
          <div className="relative mt-1 overflow-hidden rounded-md">
            <img
              src={meta.image}
              alt={meta.title}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className={cn('w-full object-cover', meta.large ? 'max-h-[220px]' : 'max-h-[160px]')}
            />
            {meta.isVideo && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                  <Play className="h-5 w-5 translate-x-[1px] fill-white text-white" />
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </a>
  );
}
