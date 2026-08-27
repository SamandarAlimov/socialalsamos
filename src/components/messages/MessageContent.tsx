import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { TelegramLinkPreview } from './TelegramLinkPreview';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';
import { splitInlineEmoji } from '@/lib/emojiOnly';

interface MessageContentProps {
  content: string;
  isMine: boolean;
  className?: string;
}

/**
 * Telegram shows the readable link text and lets long links wrap instead of
 * hiding the path behind an ellipsis. We only shorten extremely long URLs.
 */
function formatLinkDisplay(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const rest = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`;
    const full = host + rest;
    if (full.length <= 60) return full;
    return `${full.slice(0, 57)}\u2026`;
  } catch {
    return url.length > 60 ? `${url.slice(0, 57)}\u2026` : url;
  }
}

interface ContentPart {
  type: 'text' | 'mention' | 'hashtag' | 'link';
  value: string;
  display?: string;
}

export function MessageContent({ content, isMine, className }: MessageContentProps) {
  const { parsedParts, links } = useMemo(() => {
    const extractedLinks: string[] = [];
    const parts: ContentPart[] = [];

    // Combined regex for mentions, hashtags, and URLs
    const pattern = /(@[a-zA-Z0-9_]+)|(#[a-zA-Z0-9_]+)|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
      }

      if (match[1]) {
        parts.push({ type: 'mention', value: match[1].slice(1), display: match[1] });
      } else if (match[2]) {
        parts.push({ type: 'hashtag', value: match[2].slice(1), display: match[2] });
      } else if (match[3]) {
        if (!extractedLinks.includes(match[3])) extractedLinks.push(match[3]);
        parts.push({ type: 'link', value: match[3], display: match[3] });
      }

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push({ type: 'text', value: content.slice(lastIndex) });
    }

    return { parsedParts: parts, links: extractedLinks };
  }, [content]);

  // Apply lightweight markdown-ish formatting (bold, italic, spoiler, code, ...)
  const formatText = (text: string): string => {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<u>$1</u>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      .replace(/`(.*?)`/g, '<code class="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-[13px] font-mono">$1</code>')
      .replace(/\|\|(.*?)\|\|/g, '<span class="bg-muted-foreground text-muted-foreground hover:bg-transparent hover:text-inherit transition-colors cursor-pointer select-none rounded">$1</span>');
  };

  /**
   * Renders a plain-text run. Emoji inside text are replaced with Telegram-like
   * image emoji so every platform sees the same glyphs.
   */
  const renderTextRun = (text: string, keyPrefix: string) => {
    const segments = splitInlineEmoji(text);

    if (segments.length === 1 && segments[0].type === 'text') {
      return (
        <span
          key={keyPrefix}
          dangerouslySetInnerHTML={{ __html: formatText(segments[0].value) }}
        />
      );
    }

    return segments.map((segment, i) =>
      segment.type === 'emoji' ? (
        <AnimatedEmoji
          key={`${keyPrefix}-e${i}`}
          emoji={segment.value}
          size={20}
          inline
          className="mx-[1px]"
        />
      ) : (
        <span
          key={`${keyPrefix}-t${i}`}
          dangerouslySetInnerHTML={{ __html: formatText(segment.value) }}
        />
      )
    );
  };

  // Check if content is only a link (for cleaner display)
  const isOnlyLink = links.length === 1 && content.trim() === links[0];

  return (
    <div className={cn('min-w-0 max-w-full space-y-1.5', className)}>
      {!isOnlyLink && (
        <p
          className="min-w-0 max-w-full whitespace-pre-wrap text-[15px] leading-[1.35] break-words"
          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        >
          {parsedParts.map((part, index) => {
            switch (part.type) {
              case 'mention':
                return (
                  <Link
                    key={index}
                    to={`/user/${part.value}`}
                    className={cn(
                      'font-medium hover:underline transition-colors',
                      isMine ? 'text-primary-foreground underline/30' : 'text-primary'
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{part.value}
                  </Link>
                );
              case 'hashtag':
                return (
                  <Link
                    key={index}
                    to={`/search?q=%23${part.value}`}
                    className={cn(
                      'font-medium hover:underline transition-colors',
                      isMine ? 'text-primary-foreground' : 'text-primary'
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    #{part.value}
                  </Link>
                );
              case 'link':
                return (
                  <a
                    key={index}
                    href={part.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={part.value}
                    className={cn(
                      'underline-offset-2 hover:underline transition-colors',
                      isMine ? 'text-primary-foreground font-medium underline' : 'text-primary'
                    )}
                    style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {formatLinkDisplay(part.value)}
                  </a>
                );
              default:
                return renderTextRun(part.value, `p${index}`);
            }
          })}
        </p>
      )}

      {/* Telegram-style previews: only the first link gets a card, like Telegram */}
      {links.slice(0, 1).map((url, index) => (
        <TelegramLinkPreview key={index} url={url} isMine={isMine} className="mt-1" />
      ))}
    </div>
  );
}
