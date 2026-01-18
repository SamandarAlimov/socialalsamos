import { useMemo } from 'react';
import { Link } from 'react-router-dom';

interface RichTextContentProps {
  content: string;
  className?: string;
}

// Media format: [media:type:url]
const MEDIA_REGEX = /\[media:(image|video|gif):([^\]]+)\]/g;

// Format link display - show domain only for cleaner look
function formatLinkDisplay(url: string): string {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const path = urlObj.pathname;
    
    // For short paths, show domain + path
    if (path.length <= 20 && path !== '/') {
      return domain + path;
    }
    // For long paths, just show domain
    return domain + (path !== '/' ? '/...' : '');
  } catch {
    // If URL parsing fails, truncate manually
    if (url.length > 35) {
      return url.substring(0, 32) + '...';
    }
    return url;
  }
}

export function RichTextContent({ content, className }: RichTextContentProps) {
  const { textContent, mediaItems } = useMemo(() => {
    if (!content) return { textContent: '', mediaItems: [] };

    const media: { type: 'image' | 'video' | 'gif'; url: string }[] = [];
    
    // Extract media items and remove them from text
    const cleanedText = content.replace(MEDIA_REGEX, (_, type, url) => {
      media.push({ type: type as 'image' | 'video' | 'gif', url });
      return '';
    }).trim();

    return { textContent: cleanedText, mediaItems: media };
  }, [content]);

  const parsedContent = useMemo(() => {
    if (!textContent) return [];

    const parts: { type: 'text' | 'mention' | 'hashtag' | 'link'; value: string; display?: string }[] = [];
    
    // Combined regex for mentions, hashtags, and URLs
    const pattern = /(@[a-zA-Z0-9_]+)|(#[a-zA-Z0-9_]+)|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(textContent)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          value: textContent.slice(lastIndex, match.index),
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
        parts.push({
          type: 'link',
          value: match[3],
          display: match[3],
        });
      }

      lastIndex = pattern.lastIndex;
    }

    // Add remaining text
    if (lastIndex < textContent.length) {
      parts.push({
        type: 'text',
        value: textContent.slice(lastIndex),
      });
    }

    return parts;
  }, [textContent]);

  return (
    <div className={className}>
      {/* Render text content */}
      {parsedContent.length > 0 && (
        <span className="whitespace-pre-wrap">
          {parsedContent.map((part, index) => {
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
                return <span key={index}>{part.value}</span>;
            }
          })}
        </span>
      )}

      {/* Render media items */}
      {mediaItems.map((media, index) => (
        <div key={`media-${index}`} className="mt-2">
          {media.type === 'video' ? (
            <video
              src={media.url}
              controls
              className="max-w-full rounded-lg max-h-48"
            />
          ) : (
            <img
              src={media.url}
              alt={media.type === 'gif' ? 'GIF' : 'Image'}
              className="max-w-full rounded-lg max-h-48 object-contain"
              loading="lazy"
            />
          )}
        </div>
      ))}
    </div>
  );
}