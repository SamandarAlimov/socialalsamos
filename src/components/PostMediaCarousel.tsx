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
  const [videoAspect, setVideoAspect] = useState<'portrait' | 'landscape' | 'square'>('landscape');
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Determine if media is a reel/short (9:16 vertical) or regular video
  const isReel = mediaType === 'reel' || mediaType === 'short';
  const isVideoType = mediaType === 'video' || isReel;

  // Autoplay when video is visible on screen (Intersection Observer)
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            video.play().catch(() => {});
          } else {
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
    return isVideoType || url.match(/\.(mp4|webm|mov)$/i);
  };

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
    
    // Determine video aspect ratio
    const { videoWidth, videoHeight } = videoRef.current;
    if (videoWidth && videoHeight) {
      const ratio = videoWidth / videoHeight;
      if (ratio < 0.8) {
        setVideoAspect('portrait'); // Vertical video (9:16 or similar)
      } else if (ratio > 1.2) {
        setVideoAspect('landscape'); // Horizontal video (16:9 or similar)
      } else {
        setVideoAspect('square'); // Square video (1:1 or similar)
      }
    }
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

  // Determine container aspect ratio based on content type
  const getContainerClasses = () => {
    if (isCurrentVideo) {
      // For reels/shorts - Instagram style (9:16)
      if (isReel || videoAspect === 'portrait') {
        return "aspect-[9/16] max-h-[600px] mx-auto max-w-[340px] rounded-xl";
      }
      // For landscape videos - YouTube style (16:9)
      if (videoAspect === 'landscape') {
        return "aspect-video w-full";
      }
      // Square videos
      return "aspect-square max-w-[500px] mx-auto";
    }
    // For images - fill the card width with proper aspect ratio
    return "aspect-square md:aspect-[4/3]";
  };

  return (
    <div ref={containerRef} className="relative group w-full">
      {/* Main Media Display */}
      <div 
        className={cn(
          "relative overflow-hidden bg-black",
          getContainerClasses()
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
              className={cn(
                "w-full h-full",
                isReel || videoAspect === 'portrait' ? "object-cover" : "object-contain"
              )}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnd}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onClick={togglePlayPause}
            />

            {/* Reel/Short Style Overlay - Instagram Style */}
            {(isReel || videoAspect === 'portrait') && (
              <div 
                className={cn(
                  "absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
                  showControls ? "opacity-100" : "opacity-0"
                )}
              >
                {/* Top gradient with badge */}
                <div className="p-3 bg-gradient-to-b from-black/60 to-transparent">
                  <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-alsamos-orange-light to-alsamos-orange-dark text-white text-xs px-3 py-1.5 rounded-full font-semibold">
                    <Play className="h-3 w-3 fill-white" />
                    Reel
                  </div>
                </div>

                {/* Center Play Button */}
                <div className="flex-1 flex items-center justify-center">
                  {!isPlaying && (
                    <button
                      onClick={togglePlayPause}
                      className="h-16 w-16 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/20 hover:bg-black/60 transition-all hover:scale-110"
                    >
                      <Play className="h-8 w-8 text-white fill-white ml-1" />
                    </button>
                  )}
                </div>

                {/* Bottom Controls - Minimal */}
                <div className="p-3 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={toggleMute}
                      className="h-8 w-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
                    >
                      {isMuted ? (
                        <VolumeX className="h-4 w-4 text-white" />
                      ) : (
                        <Volume2 className="h-4 w-4 text-white" />
                      )}
                    </button>
                    <span className="text-white text-xs font-medium">
                      {formatTime(videoRef.current?.currentTime || 0)}
                    </span>
                  </div>
                  {/* Progress Bar */}
                  <div className="mt-2">
                    <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-alsamos-orange-light to-alsamos-orange-dark transition-all duration-150"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* YouTube Style Controls - For Landscape Videos */}
            {videoAspect === 'landscape' && !isReel && (
              <div 
                className={cn(
                  "absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
                  showControls ? "opacity-100" : "opacity-0"
                )}
              >
                {/* Center Play/Pause Button */}
                <div className="flex-1 flex items-center justify-center">
                  <button
                    onClick={togglePlayPause}
                    className="h-16 w-16 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center hover:bg-black/70 transition-all hover:scale-105"
                  >
                    {isPlaying ? (
                      <Pause className="h-7 w-7 text-white fill-white" />
                    ) : (
                      <Play className="h-7 w-7 text-white fill-white ml-1" />
                    )}
                  </button>
                </div>

                {/* Bottom Controls Bar - YouTube Style */}
                <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 space-y-2">
                  {/* Progress Bar */}
                  <Slider
                    value={[progress]}
                    onValueChange={handleSeek}
                    max={100}
                    step={0.1}
                    className="cursor-pointer [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:bg-primary [&_[role=slider]]:border-0 [&_.bg-primary]:bg-red-600"
                  />

                  {/* Control Buttons Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={togglePlayPause}
                        className="h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5 text-white" />
                        ) : (
                          <Play className="h-5 w-5 text-white ml-0.5" />
                        )}
                      </button>

                      <button
                        onClick={toggleMute}
                        className="h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                      >
                        {isMuted ? (
                          <VolumeX className="h-5 w-5 text-white" />
                        ) : (
                          <Volume2 className="h-5 w-5 text-white" />
                        )}
                      </button>

                      <span className="text-white text-xs font-medium tabular-nums ml-1">
                        {formatTime(videoRef.current?.currentTime || 0)} / {formatTime(duration)}
                      </span>
                    </div>

                    <button
                      onClick={handleFullscreen}
                      className="h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                    >
                      <Maximize2 className="h-5 w-5 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Square Video Controls */}
            {videoAspect === 'square' && !isReel && (
              <div 
                className={cn(
                  "absolute inset-0 flex flex-col justify-end transition-opacity duration-300",
                  showControls ? "opacity-100" : "opacity-0"
                )}
              >
                <div className="bg-gradient-to-t from-black/80 to-transparent p-3">
                  <div className="flex items-center gap-3">
                    <button onClick={togglePlayPause} className="text-white">
                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </button>
                    <div className="flex-1">
                      <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-white transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <button onClick={toggleMute} className="text-white">
                      {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <img
            key={currentMedia}
            src={currentMedia}
            alt={`Post media ${currentIndex + 1}`}
            className="w-full h-full object-cover"
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
                className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 backdrop-blur-sm border-0 hover:bg-black/70 shadow-lg"
                onClick={goToPrevious}
              >
                <ChevronLeft className="h-5 w-5 text-white" />
              </Button>
            )}
            {currentIndex < mediaUrls.length - 1 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 backdrop-blur-sm border-0 hover:bg-black/70 shadow-lg"
                onClick={goToNext}
              >
                <ChevronRight className="h-5 w-5 text-white" />
              </Button>
            )}
          </>
        )}

        {/* Media Counter */}
        {mediaUrls.length > 1 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-full font-medium">
            {currentIndex + 1}/{mediaUrls.length}
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
                "h-1.5 rounded-full transition-all duration-300",
                index === currentIndex 
                  ? "w-5 bg-gradient-to-r from-alsamos-orange-light to-alsamos-orange-dark" 
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
