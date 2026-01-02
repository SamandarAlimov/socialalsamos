import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { LinkPreview } from './LinkPreview';

interface MessageContentProps {
  content: string;
  isMine: boolean;
  className?: string;
}

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;

export function MessageContent({ content, isMine, className }: MessageContentProps) {
  const { formattedContent, links } = useMemo(() => {
    const extractedLinks: string[] = [];
    
    // Extract all URLs
    const urlMatches = content.match(URL_REGEX) || [];
    urlMatches.forEach(url => {
      if (!extractedLinks.includes(url)) {
        extractedLinks.push(url);
      }
    });

    // Format the content with clickable links and text formatting
    let formatted = content
      // Escape HTML first
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Make URLs clickable
      .replace(URL_REGEX, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:opacity-80 break-all">${url}</a>`;
      })
      // Text formatting
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<u>$1</u>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      .replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm font-mono">$1</code>')
      .replace(/\|\|(.*?)\|\|/g, '<span class="bg-muted-foreground text-muted-foreground hover:bg-transparent hover:text-inherit transition-colors cursor-pointer select-none">$1</span>');

    return {
      formattedContent: formatted,
      links: extractedLinks,
    };
  }, [content]);

  // Check if content is only a link (for cleaner display)
  const isOnlyLink = links.length === 1 && content.trim() === links[0];
  
  // Filter for previewable links (YouTube, Instagram)
  const previewableLinks = links.filter(url => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return ['youtube.com', 'youtu.be', 'instagram.com'].includes(domain);
    } catch {
      return false;
    }
  });

  return (
    <div className={cn("space-y-2", className)}>
      {/* Text content - hide if it's only a link that will have a preview */}
      {!(isOnlyLink && previewableLinks.length > 0) && (
        <p 
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{ __html: formattedContent }}
        />
      )}

      {/* Link previews */}
      {previewableLinks.map((url, index) => (
        <LinkPreview key={index} url={url} className="mt-2" />
      ))}
    </div>
  );
}
