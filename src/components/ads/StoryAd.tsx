import { useState, useEffect, useRef } from 'react';
import { ExternalLink, Volume2, VolumeX, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Ad } from '@/hooks/useAds';
import { motion, AnimatePresence } from 'framer-motion';

interface StoryAdProps {
  ad: Ad;
  onImpression: (adId: string) => void;
  onClick: (adId: string) => void;
  onComplete: () => void;
  isPaused?: boolean;
  duration?: number; // in seconds
}

export function StoryAd({ 
  ad, 
  onImpression, 
  onClick, 
  onComplete,
  isPaused = false,
  duration = 5 
}: StoryAdProps) {
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasTrackedImpression = useRef(false);
  const startTimeRef = useRef<number>(Date.now());
  const pausedTimeRef = useRef<number>(0);

  // Track impression on mount
  useEffect(() => {
    if (!hasTrackedImpression.current) {
      hasTrackedImpression.current = true;
      onImpression(ad.id);
    }
  }, [ad.id, onImpression]);

  // Progress bar
  useEffect(() => {
    if (isPaused) {
      pausedTimeRef.current = progress;
      return;
    }

    startTimeRef.current = Date.now() - (pausedTimeRef.current * duration * 10);
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / (duration * 1000)) * 100, 100);
      setProgress(newProgress);

      if (newProgress >= 100) {
        clearInterval(interval);
        onComplete();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isPaused, duration, onComplete]);

  // Video control
  useEffect(() => {
    if (videoRef.current) {
      if (isPaused) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [isPaused]);

  const handleClick = () => {
    onClick(ad.id);
    if (ad.destination_url) {
      window.open(ad.destination_url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="relative w-full h-full bg-black">
      {/* Progress bar at top */}
      <div className="absolute top-0 left-0 right-0 z-20 p-2">
        <div className="h-1 bg-white/30 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-white rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Sponsored badge */}
      <div className="absolute top-6 left-3 z-20">
        <Badge variant="secondary" className="bg-black/50 text-white border-0">
          Sponsored
        </Badge>
      </div>

      {/* Media */}
      {ad.media_type === 'video' ? (
        <>
          <video
            ref={videoRef}
            src={ad.media_url}
            className="w-full h-full object-cover"
            loop
            muted={isMuted}
            playsInline
            autoPlay
          />
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-6 right-3 z-20 h-8 w-8 bg-black/50 hover:bg-black/70 border-0"
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-white" />
            ) : (
              <Volume2 className="h-4 w-4 text-white" />
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

      {/* Bottom overlay with CTA */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-20">
        <div className="space-y-3">
          <div>
            <h3 className="text-white font-semibold text-lg">{ad.title}</h3>
            {ad.description && (
              <p className="text-white/80 text-sm line-clamp-2">{ad.description}</p>
            )}
          </div>

          {/* Swipe up indicator */}
          <motion.div
            className="flex flex-col items-center cursor-pointer"
            onClick={handleClick}
            animate={{ y: [0, -5, 0] }}
            transition={{ repeat: Infinity, duration: 1 }}
          >
            <ChevronUp className="h-6 w-6 text-white" />
            <span className="text-white text-sm font-medium">
              {ad.call_to_action || 'Learn More'}
            </span>
          </motion.div>

          {/* Or button for easier click */}
          <Button
            onClick={handleClick}
            variant="secondary"
            className="w-full gap-2 bg-white text-black hover:bg-white/90"
          >
            <ExternalLink className="h-4 w-4" />
            {ad.call_to_action || 'Learn More'}
          </Button>
        </div>
      </div>
    </div>
  );
}
