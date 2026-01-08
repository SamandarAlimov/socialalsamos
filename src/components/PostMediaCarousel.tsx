import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';

interface PostMediaCarouselProps {
  mediaUrls: string[];
  mediaType: string;
}

export function PostMediaCarousel({ mediaUrls, mediaType }: PostMediaCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Autoplay when video is visible on screen (Intersection Observer)
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            // Video is at least 60% visible - autoplay
            video.play().catch(() => {
              // Autoplay blocked by browser, user needs to interact
            });
          } else {
            // Video is not visible enough - pause
            video.pause();
          }
        });
      },
      {
        threshold: [0, 0.6, 1],
        rootMargin: '-50px 0px',
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [currentIndex]);

  const goToPrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
    setIsPlaying(false);
    setProgress(0);
  };

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < mediaUrls.length - 1 ? prev + 1 : prev));
    setIsPlaying(false);
    setProgress(0);
  };

  const isVideo = (url: string) => {
    return mediaType === 'video' || url.match(/\.(mp4|webm|mov)$/i);
  };

  const isShortVideo = mediaType === 'video' || mediaType === 'reel' || mediaType === 'short';

  const togglePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const currentProgress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
    setProgress(currentProgress);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const handleSeek = (value: number[]) => {
    if (!videoRef.current) return;
    const newTime = (value[0] / 100) * videoRef.current.duration;
    videoRef.current.currentTime = newTime;
    setProgress(value[0]);
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
    setProgress(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  if (mediaUrls.length === 0) return null;

  const currentMedia = mediaUrls[currentIndex];
  const isCurrentVideo = isVideo(currentMedia);

  return (
    <div ref={containerRef} className="relative group">
      {/* Main Media Display */}
      <div 
        className={cn(
          "relative overflow-hidden bg-black/5",
          isShortVideo ? "aspect-[9/16] max-h-[70vh]" : "aspect-[4/3] md:aspect-video"
        )}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        {isCurrentVideo ? (
          <>
            <video
              ref={videoRef}
              key={currentMedia}
              src={currentMedia}
              playsInline
              muted={isMuted}
              loop={false}
              className="w-full h-full object-contain"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnd}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onClick={togglePlayPause}
            />

            {/* Alsamos Video Controls Overlay */}
            <div 
              className={cn(
                "absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
                showControls ? "opacity-100" : "opacity-0"
              )}
            >
              {/* Top gradient */}
              <div className="h-20 bg-gradient-to-b from-black/60 to-transparent" />

              {/* Center Play/Pause Button */}
              <div className="flex-1 flex items-center justify-center">
                <button
                  onClick={togglePlayPause}
                  className="h-16 w-16 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/20 hover:bg-black/60 transition-all hover:scale-110"
                >
                  {isPlaying ? (
                    <Pause className="h-7 w-7 text-white fill-white" />
                  ) : (
                    <Play className="h-7 w-7 text-white fill-white ml-1" />
                  )}
                </button>
              </div>

              {/* Bottom Controls */}
              <div className="bg-gradient-to-t from-black/80 to-transparent p-4 space-y-3">
                {/* Progress Bar */}
                <div className="px-1">
                  <Slider
                    value={[progress]}
                    onValueChange={handleSeek}
                    max={100}
                    step={0.1}
                    className="cursor-pointer [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:bg-primary [&_[role=slider]]:border-0 [&_[role=slider]]:shadow-lg [&_.bg-primary]:bg-gradient-to-r [&_.bg-primary]:from-alsamos-orange-light [&_.bg-primary]:to-alsamos-orange-dark"
                  />
                </div>

                {/* Control Buttons Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Play/Pause */}
                    <button
                      onClick={togglePlayPause}
                      className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4 text-white" />
                      ) : (
                        <Play className="h-4 w-4 text-white ml-0.5" />
                      )}
                    </button>

                    {/* Mute/Unmute */}
                    <button
                      onClick={toggleMute}
                      className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
                    >
                      {isMuted ? (
                        <VolumeX className="h-4 w-4 text-white" />
                      ) : (
                        <Volume2 className="h-4 w-4 text-white" />
                      )}
                    </button>

                    {/* Time Display */}
                    <span className="text-white text-xs font-medium tabular-nums">
                      {formatTime(videoRef.current?.currentTime || 0)} / {formatTime(duration)}
                    </span>
                  </div>

                  {/* Fullscreen */}
                  <button
                    onClick={handleFullscreen}
                    className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <Maximize2 className="h-4 w-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <img
            key={currentMedia}
            src={currentMedia}
            alt={`Post media ${currentIndex + 1}`}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        )}

        {/* Navigation Arrows - Only show if multiple media */}
        {mediaUrls.length > 1 && (
          <>
            {currentIndex > 0 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 shadow-lg"
                onClick={goToPrevious}
              >
                <ChevronLeft className="h-5 w-5 text-white" />
              </Button>
            )}
            {currentIndex < mediaUrls.length - 1 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 shadow-lg"
                onClick={goToNext}
              >
                <ChevronRight className="h-5 w-5 text-white" />
              </Button>
            )}
          </>
        )}

        {/* Media Counter */}
        {mediaUrls.length > 1 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full font-medium border border-white/10">
            {currentIndex + 1}/{mediaUrls.length}
          </div>
        )}

        {/* Video Badge for Reels/Shorts */}
        {isCurrentVideo && isShortVideo && (
          <div className="absolute top-3 left-3 bg-gradient-to-r from-alsamos-orange-light to-alsamos-orange-dark text-white text-xs px-3 py-1.5 rounded-full font-semibold">
            Reel
          </div>
        )}
      </div>

      {/* Dot Indicators - Only show if multiple media */}
      {mediaUrls.length > 1 && (
        <div className="flex justify-center gap-1.5 py-3">
          {mediaUrls.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(index);
                setIsPlaying(false);
                setProgress(0);
              }}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                index === currentIndex 
                  ? "w-6 bg-gradient-to-r from-alsamos-orange-light to-alsamos-orange-dark" 
                  : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
