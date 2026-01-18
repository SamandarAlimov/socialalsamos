import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { OpenGraphPreview } from './OpenGraphPreview';

interface MessageContentProps {
  content: string;
  isMine: boolean;
  className?: string;
}

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;
const HASHTAG_REGEX = /#([a-zA-Z0-9_]+)/g;

// Format link display - show domain only for cleaner look
function formatLinkDisplay(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const path = urlObj.pathname;
    
    if (path.length <= 20 && path !== '/') {
      return domain + path;
    }
    return domain + (path !== '/' ? '/...' : '');
  } catch {
    if (url.length > 35) {
      return url.substring(0, 32) + '...';
    }
    return url;
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
      // Add text before the match
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        // Apply text formatting to plain text
        parts.push({
          type: 'text',
          value: textBefore,
        });
      }

      if (match[1]) {
        // Mention (@username)
        parts.push({
          type: 'mention',
          value: match[1].slice(1), // Remove @
          display: match[1],
        });
      } else if (match[2]) {
        // Hashtag (#tag)
        parts.push({
          type: 'hashtag',
          value: match[2].slice(1), // Remove #
          display: match[2],
        });
      } else if (match[3]) {
        // URL
        if (!extractedLinks.includes(match[3])) {
          extractedLinks.push(match[3]);
        }
        parts.push({
          type: 'link',
          value: match[3],
          display: match[3],
        });
      }

      lastIndex = pattern.lastIndex;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        value: content.slice(lastIndex),
      });
    }

    return {
      parsedParts: parts,
      links: extractedLinks,
    };
  }, [content]);

  // Apply text formatting (bold, italic, etc.)
  const formatText = (text: string): string => {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<u>$1</u>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      .replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm font-mono">$1</code>')
      .replace(/\|\|(.*?)\|\|/g, '<span class="bg-muted-foreground text-muted-foreground hover:bg-transparent hover:text-inherit transition-colors cursor-pointer select-none">$1</span>');
  };

  // Check if content is only a link (for cleaner display)
  const isOnlyLink = links.length === 1 && content.trim() === links[0];

  return (
    <div className={cn("space-y-2", className)}>
      {/* Text content - hide if it's only a link that will have a preview */}
      {!(isOnlyLink && links.length > 0) && (
        <p 
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        >
          {parsedParts.map((part, index) => {
            switch (part.type) {
              case 'mention':
                return (
                  <Link
                    key={index}
                    to={`/user/${part.value}`}
                    className="text-alsamos-orange-light font-semibold hover:text-alsamos-orange-dark hover:underline transition-colors cursor-pointer"
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
                    className="text-blue-400 font-medium hover:text-blue-300 hover:underline transition-colors"
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
                    className="text-sky-400 hover:text-sky-300 underline underline-offset-2 break-all transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {formatLinkDisplay(part.value)}
                  </a>
                );
              default:
                return (
                  <span 
                    key={index}
                    dangerouslySetInnerHTML={{ __html: formatText(part.value) }}
                  />
                );
            }
          })}
        </p>
      )}

      {/* OpenGraph previews for all links */}
      {links.map((url, index) => (
        <OpenGraphPreview key={index} url={url} className="mt-2" />
      ))}
    </div>
  );
}
