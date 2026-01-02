import { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinkPreviewProps {
  url: string;
  className?: string;
}

interface PreviewData {
  type: 'youtube' | 'instagram' | 'generic';
  title?: string;
  thumbnail?: string;
  videoId?: string;
  domain: string;
}

export function LinkPreview({ url, className }: LinkPreviewProps) {
  const [showEmbed, setShowEmbed] = useState(false);

  const previewData = useMemo((): PreviewData | null => {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');

      // YouTube detection
      if (domain === 'youtube.com' || domain === 'youtu.be') {
        let videoId = '';
        if (domain === 'youtu.be') {
          videoId = urlObj.pathname.slice(1);
        } else {
          videoId = urlObj.searchParams.get('v') || '';
        }
        
        if (videoId) {
          return {
            type: 'youtube',
            videoId,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            title: 'YouTube Video',
            domain: 'youtube.com',
          };
        }
      }

      // Instagram detection
      if (domain === 'instagram.com') {
        return {
          type: 'instagram',
          title: 'Instagram Post',
          domain: 'instagram.com',
        };
      }

      // Generic link
      return {
        type: 'generic',
        title: urlObj.hostname,
        domain,
      };
    } catch {
      return null;
    }
  }, [url]);

  if (!previewData) return null;

  // YouTube embed
  if (previewData.type === 'youtube' && previewData.videoId) {
    if (showEmbed) {
      return (
        <div className={cn("relative rounded-xl overflow-hidden bg-black", className)}>
          <button
            onClick={() => setShowEmbed(false)}
            className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-black/70 flex items-center justify-center hover:bg-black/90 transition-colors"
          >
            <X className="h-4 w-4 text-white" />
          </button>
          <iframe
            className="w-full aspect-video"
            src={`https://www.youtube.com/embed/${previewData.videoId}?autoplay=1`}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }

    return (
      <button
        onClick={() => setShowEmbed(true)}
        className={cn(
          "block w-full text-left rounded-xl overflow-hidden bg-card border border-border hover:border-primary/50 transition-all group",
          className
        )}
      >
        <div className="relative">
          <img
            src={previewData.thumbnail}
            alt="YouTube thumbnail"
            className="w-full aspect-video object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
            <div className="h-16 w-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="h-8 w-8 text-white ml-1" fill="white" />
            </div>
          </div>
        </div>
        <div className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="text-red-500 font-semibold">YouTube</span>
          </p>
          <p className="text-sm font-medium mt-1 line-clamp-2">{previewData.title}</p>
        </div>
      </button>
    );
  }

  // Instagram preview
  if (previewData.type === 'instagram') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "block rounded-xl overflow-hidden bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-[1px]",
          className
        )}
      >
        <div className="bg-card rounded-[11px] p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Instagram Post</p>
            <p className="text-xs text-muted-foreground truncate">{url}</p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </div>
      </a>
    );
  }

  // Generic link preview
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors",
        className
      )}
    >
      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <ExternalLink className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{previewData.domain}</p>
        <p className="text-xs text-muted-foreground truncate">{url}</p>
      </div>
    </a>
  );
}
