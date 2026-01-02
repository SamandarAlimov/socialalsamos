import { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Play, Image as ImageIcon, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OpenGraphData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: string;
  url?: string;
}

interface OpenGraphPreviewProps {
  url: string;
  className?: string;
}

// Safe embed whitelist
const EMBED_WHITELIST = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'spotify.com',
  'soundcloud.com',
];

// Extract video ID for different platforms
function extractVideoInfo(url: string): { platform: string; id: string; embedUrl: string } | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    
    // YouTube
    if (hostname === 'youtube.com' || hostname === 'youtu.be') {
      let videoId = '';
      if (hostname === 'youtu.be') {
        videoId = urlObj.pathname.slice(1);
      } else {
        videoId = urlObj.searchParams.get('v') || '';
      }
      if (videoId) {
        return {
          platform: 'youtube',
          id: videoId,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
        };
      }
    }
    
    // Vimeo
    if (hostname === 'vimeo.com') {
      const match = urlObj.pathname.match(/\/(\d+)/);
      if (match) {
        return {
          platform: 'vimeo',
          id: match[1],
          embedUrl: `https://player.vimeo.com/video/${match[1]}`,
        };
      }
    }
    
    // Spotify
    if (hostname === 'open.spotify.com') {
      const match = urlObj.pathname.match(/\/(track|album|playlist)\/(\w+)/);
      if (match) {
        return {
          platform: 'spotify',
          id: match[2],
          embedUrl: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

// Get domain-specific colors
function getDomainStyle(hostname: string): { gradient: string; icon: React.ReactNode } {
  const domain = hostname.replace('www.', '');
  
  if (domain.includes('youtube')) {
    return { gradient: 'from-red-500/20 to-red-600/10', icon: <Play className="h-4 w-4 text-red-500" /> };
  }
  if (domain.includes('instagram')) {
    return { gradient: 'from-pink-500/20 via-purple-500/20 to-orange-500/10', icon: <ImageIcon className="h-4 w-4 text-pink-500" /> };
  }
  if (domain.includes('twitter') || domain.includes('x.com')) {
    return { gradient: 'from-sky-500/20 to-sky-600/10', icon: <span className="text-sky-500 font-bold text-sm">𝕏</span> };
  }
  if (domain.includes('spotify')) {
    return { gradient: 'from-green-500/20 to-green-600/10', icon: <span className="text-green-500">●</span> };
  }
  if (domain.includes('tiktok')) {
    return { gradient: 'from-pink-500/20 to-cyan-500/10', icon: <span className="font-bold">♪</span> };
  }
  if (domain.includes('vimeo')) {
    return { gradient: 'from-cyan-500/20 to-cyan-600/10', icon: <Play className="h-4 w-4 text-cyan-500" /> };
  }
  
  return { gradient: 'from-muted/50 to-muted/30', icon: <Link2 className="h-4 w-4" /> };
}

export function OpenGraphPreview({ url, className }: OpenGraphPreviewProps) {
  const [ogData, setOgData] = useState<OpenGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);

  const videoInfo = useMemo(() => extractVideoInfo(url), [url]);
  
  const { hostname, domainStyle, canEmbed } = useMemo(() => {
    try {
      const urlObj = new URL(url);
      const hn = urlObj.hostname.replace('www.', '');
      const ds = getDomainStyle(hn);
      const ce = EMBED_WHITELIST.some(domain => hn.includes(domain));
      return { hostname: hn, domainStyle: ds, canEmbed: ce };
    } catch {
      return { hostname: '', domainStyle: getDomainStyle(''), canEmbed: false };
    }
  }, [url]);

  useEffect(() => {
    // Simulate OG data fetching (in production, use an edge function)
    // For now, we'll use platform-specific fallbacks
    const fetchOgData = async () => {
      setLoading(true);
      try {
        // Use fallback data based on platform
        if (videoInfo?.platform === 'youtube') {
          setOgData({
            title: 'YouTube Video',
            description: 'Watch this video on YouTube',
            image: `https://img.youtube.com/vi/${videoInfo.id}/hqdefault.jpg`,
            siteName: 'YouTube',
          });
        } else if (hostname.includes('instagram')) {
          setOgData({
            title: 'Instagram Post',
            description: 'View this post on Instagram',
            siteName: 'Instagram',
          });
        } else if (hostname.includes('twitter') || hostname.includes('x.com')) {
          setOgData({
            title: 'Post on X',
            description: 'View this post',
            siteName: 'X (Twitter)',
          });
        } else if (hostname.includes('spotify')) {
          setOgData({
            title: 'Spotify',
            description: 'Listen on Spotify',
            siteName: 'Spotify',
          });
        } else {
          // Generic fallback
          setOgData({
            title: hostname,
            description: 'Visit this link',
            siteName: hostname,
            url: url,
          });
        }
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchOgData();
  }, [url, videoInfo, hostname]);

  if (loading) {
    return (
      <div className={cn('animate-pulse bg-muted rounded-xl p-4', className)}>
        <div className="h-4 bg-muted-foreground/20 rounded w-3/4 mb-2" />
        <div className="h-3 bg-muted-foreground/20 rounded w-1/2" />
      </div>
    );
  }

  if (error || !ogData) {
    return null;
  }

  // Show embedded player
  if (showEmbed && videoInfo && canEmbed) {
    return (
      <div className={cn('rounded-xl overflow-hidden', className)}>
        {videoInfo.platform === 'spotify' ? (
          <iframe
            src={videoInfo.embedUrl}
            width="100%"
            height="152"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="border-0"
          />
        ) : (
          <div className="relative aspect-video">
            <iframe
              src={videoInfo.embedUrl}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'block rounded-xl overflow-hidden border border-border/50 hover:border-border transition-colors',
        'bg-gradient-to-br',
        domainStyle.gradient,
        className
      )}
      onClick={(e) => {
        if (videoInfo && canEmbed) {
          e.preventDefault();
          setShowEmbed(true);
        }
      }}
    >
      {/* Thumbnail */}
      {ogData.image && (
        <div className="relative aspect-video bg-muted overflow-hidden">
          <img
            src={ogData.image}
            alt={ogData.title || 'Link preview'}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {videoInfo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="h-14 w-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <Play className="h-6 w-6 text-black ml-1" fill="currentColor" />
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Content */}
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {domainStyle.icon}
          <span>{ogData.siteName || hostname}</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
        </div>
        
        {ogData.title && (
          <h4 className="font-medium text-sm line-clamp-2 text-foreground">
            {ogData.title}
          </h4>
        )}
        
        {ogData.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {ogData.description}
          </p>
        )}
      </div>
    </a>
  );
}
