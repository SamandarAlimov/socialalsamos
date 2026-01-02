import { useMemo } from 'react';
import { Link } from 'react-router-dom';

interface RichTextContentProps {
  content: string;
  className?: string;
}

export function RichTextContent({ content, className }: RichTextContentProps) {
  const parsedContent = useMemo(() => {
    if (!content) return [];

    const parts: { type: 'text' | 'mention' | 'hashtag' | 'link'; value: string; display?: string }[] = [];
    
    // Combined regex for mentions, hashtags, and URLs
    const pattern = /(@[a-zA-Z0-9_]+)|(#[a-zA-Z0-9_]+)|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          value: content.slice(lastIndex, match.index),
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
    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        value: content.slice(lastIndex),
      });
    }

    return parts;
  }, [content]);

  return (
    <span className={className}>
      {parsedContent.map((part, index) => {
        switch (part.type) {
          case 'mention':
            return (
              <Link
                key={index}
                to={`/user/${part.value}`}
                className="text-primary font-medium hover:underline"
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
                className="text-primary font-medium hover:underline"
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
                className="text-primary underline hover:opacity-80 break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {part.display}
              </a>
            );
          default:
            return <span key={index}>{part.value}</span>;
        }
      })}
    </span>
  );
}