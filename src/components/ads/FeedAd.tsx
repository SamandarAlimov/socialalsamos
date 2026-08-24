import { useState, useEffect, useRef } from 'react';
import { ExternalLink, Volume2, VolumeX, MoreHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Ad } from '@/hooks/useAds';

interface FeedAdProps {
  ad: Ad;
  onImpression: (adId: string) => void;
  onClick: (adId: string) => void;
  className?: string;
}

export function FeedAd({ ad, onImpression, onClick, className }: FeedAdProps) {
  const [isMuted, setIsMuted] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasTrackedImpression = useRef(false);

  // Intersection observer for impression tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        
        if (entry.isIntersecting && !hasTrackedImpression.current) {
          hasTrackedImpression.current = true;
          onImpression(ad.id);
        }

        // Auto-play video when visible
        if (videoRef.current) {
          if (entry.isIntersecting) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current.pause();
          }
        }
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [ad.id, onImpression]);

  const handleClick = () => {
    onClick(ad.id);
    if (ad.destination_url) {
      window.open(ad.destination_url, '_blank', 'noopener,noreferrer');
    }
  };

  if (dismissed) return null;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "bg-card border border-border rounded-xl overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Sponsored
          </Badge>
          <span className="text-xs text-muted-foreground">{ad.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Media */}
      <div 
        className="relative aspect-video bg-black cursor-pointer"
        onClick={handleClick}
      >
        {ad.media_type === 'video' ? (
          <>
            <video
              ref={videoRef}
              src={ad.media_url}
              className="w-full h-full object-cover"
              loop
              muted={isMuted}
              playsInline
            />
            <Button
              variant="secondary"
              size="icon"
              className="absolute bottom-3 right-3 h-8 w-8 bg-black/60 hover:bg-black/80"
              onClick={(e) => {
                e.stopPropagation();
                setIsMuted(!isMuted);
              }}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </>
        ) : (
          <img
            src={ad.media_url}
            alt={ad.title}
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Description & CTA */}
      <div className="p-3 space-y-3">
        {ad.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {ad.description}
          </p>
        )}

        <Button
          onClick={handleClick}
          className="w-full gap-2"
        >
          <ExternalLink className="h-4 w-4" />
          {ad.call_to_action || 'Learn More'}
        </Button>
      </div>
    </div>
  );
}
