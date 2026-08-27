import { useEffect, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinkMeta {
  siteName: string;
  title: string;
  description?: string;
  image?: string;
  isVideo?: boolean;
  embedUrl?: string;
}

interface TelegramLinkPreviewProps {
  url: string;
  isMine?: boolean;
  className?: string;
}

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

function prettyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function prettyPath(url: string): string {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname).replace(/\/$/, '');
    if (!path || path === '') return prettyHost(url);
    const last = path.split('/').filter(Boolean).pop() || '';
    return last.replace(/[-_]+/g, ' ').replace(/\.\w{2,5}$/, '') || prettyHost(url);
  } catch {
    return url;
  }
}

/**
 * Telegram-style link preview card:
 * a colored left accent bar, site name, title, description and optional thumbnail.
 * Metadata is derived locally (no server round-trip) so it never blocks the bubble.
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
        description: prettyPath(url),
        image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        isVideo: true,
      });
      return;
    }

    setMeta({
      siteName: prettyHost(url),
      title: prettyPath(url),
      description: undefined,
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
      <div className="flex flex-col gap-1.5 py-2 pr-2.5">
        <p
          className={cn(
            'flex items-center gap-1 text-[12px] font-semibold',
            isMine ? 'text-primary-foreground/90' : 'text-primary'
          )}
        >
          <span className="truncate">{meta.siteName}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
        </p>

        <p
          className={cn(
            'line-clamp-2 break-words text-[13px] font-medium leading-snug',
            isMine ? 'text-primary-foreground' : 'text-foreground'
          )}
        >
          {meta.title}
        </p>

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

        {showImage && (
          <div className="relative mt-1 overflow-hidden rounded-md">
            <img
              src={meta.image}
              alt={meta.title}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="max-h-[180px] w-full object-cover"
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
