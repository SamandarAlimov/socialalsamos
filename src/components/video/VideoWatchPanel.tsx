import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Bookmark,
  Heart,
  Maximize2,
  MessageCircle,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { VideoScrubBar } from '@/components/video/VideoScrubBar';
import { VideoUpNextItem } from '@/components/video/VideoUpNextItem';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { usePinchZoom } from '@/hooks/usePinchZoom';
import { useVideoHeatmap } from '@/hooks/useVideoHeatmap';
import { type VideoPost } from '@/hooks/useVideoPosts';
import { useVideoSurfaceTap } from '@/hooks/useVideoSurfaceTap';
import { cn } from '@/lib/utils';
import { UI_LAYER } from '@/lib/uiLayers';
import {
  readVideosMutedPreference,
  writeVideosMutedPreference,
} from '@/lib/videoPlaybackPreference';
import {
  deriveVideoTitle,
  formatCompactNumber,
  formatMediaTime,
  resolveAspectKind,
} from '@/lib/videoFormat';

const HOLD_TO_SPEED_MS = 300;
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface VideoWatchPanelProps {
  videos: VideoPost[];
  activeVideoId: string;
  onSelectVideo: (videoId: string) => void;
  onClose: () => void;
  onLike: (videoId: string) => void;
  onBookmark: (videoId: string) => void;
  onFollow: (userId: string) => void;
  currentUserId?: string | null;
  onShare: (video: VideoPost) => void;
  onComments: (video: VideoPost) => void;
  onOpenProfile: (video: VideoPost) => void;
  keyboardEnabled?: boolean;
}

export function VideoWatchPanel({
  videos,
  activeVideoId,
  onSelectVideo,
  onClose,
  onLike,
  onBookmark,
  onFollow,
  currentUserId,
  onShare,
  onComments,
  onOpenProfile,
  keyboardEnabled = true,
}: VideoWatchPanelProps) {
  const video = useMemo(
    () => videos.find((item) => item.id === activeVideoId),
    [activeVideoId, videos],
  );
  const upNext = useMemo(
    () => videos.filter((item) => item.id !== activeVideoId),
    [activeVideoId, videos],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const speedRef = useRef(1);
  const mutedRef = useRef(readVideosMutedPreference());
  const zoom = usePinchZoom(2.5, 1, playerRef);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isEnded, setIsEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(mutedRef.current);
  const [speed, setSpeed] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitCover, setFitCover] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const { lightTap, mediumTap, successFeedback } = useHapticFeedback();
  const heatmap = useVideoHeatmap(activeVideoId || 'video', 56);
  const videoUrl = video?.media_urls?.[0];
  const posterUrl = video?.media_urls?.[1];
  const aspectKind = resolveAspectKind(ratio);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    mutedRef.current = isMuted;
    writeVideosMutedPreference(isMuted);
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    speedRef.current = speed;
    if (videoRef.current && !holdActiveRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setRatio(null);
    setDescriptionOpen(false);
    setIsEnded(false);
    setIsPlaying(true);
    zoom.resetZoom();
    revealControls();

    requestAnimationFrame(() => {
      const el = videoRef.current;
      if (!el) return;
      el.currentTime = 0;
      el.muted = mutedRef.current;
      el.playbackRate = speedRef.current;
      void el.play().catch(() => setIsPlaying(false));
    });
  }, [activeVideoId, revealControls, zoom.resetZoom]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
  }, []);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused || el.ended || isEnded) {
      if (el.ended || isEnded) {
        el.currentTime = 0;
        setCurrentTime(0);
        setIsEnded(false);
      }
      void el.play().catch(() => setIsPlaying(false));
    } else {
      el.pause();
    }
    lightTap();
    revealControls();
  }, [isEnded, lightTap, revealControls]);

  const doubleTapLike = useCallback(() => {
    if (!video) return;
    successFeedback();
    if (!video.is_liked) onLike(video.id);
    setShowLikeBurst(true);
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => setShowLikeBurst(false), 680);
    revealControls();
  }, [onLike, revealControls, successFeedback, video]);

  const { registerTap, clearPending } = useVideoSurfaceTap({
    onSingleTap: togglePlay,
    onDoubleTap: doubleTapLike,
  });

  const startHold = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      const el = videoRef.current;
      if (!el) return;
      clearPending();
      holdActiveRef.current = true;
      el.playbackRate = 2;
      if (el.paused) void el.play().catch(() => setIsPlaying(false));
      mediumTap();
    }, HOLD_TO_SPEED_MS);
  }, [clearPending, mediumTap]);

  const endHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!holdActiveRef.current) return false;
    holdActiveRef.current = false;
    if (videoRef.current) videoRef.current.playbackRate = speedRef.current;
    return true;
  }, []);

  const seekBy = useCallback((delta: number) => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.min(el.duration, Math.max(0, el.currentTime + delta));
    setCurrentTime(el.currentTime);
    revealControls();
  }, [revealControls]);

  const handleSeek = useCallback((time: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = time;
    setCurrentTime(time);
    if (time < duration) setIsEnded(false);
  }, [duration]);

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const index = PLAYBACK_RATES.indexOf(current as (typeof PLAYBACK_RATES)[number]);
      return PLAYBACK_RATES[(Math.max(index, 0) + 1) % PLAYBACK_RATES.length];
    });
    lightTap();
    revealControls();
  }, [lightTap, revealControls]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await playerRef.current?.requestFullscreen?.();
    } catch {
      // Optional platform capability.
    }
  }, []);

  useEffect(() => {
    if (!keyboardEnabled) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"]')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key.toLowerCase()) {
        case ' ':
        case 'k': event.preventDefault(); togglePlay(); break;
        case 'j': event.preventDefault(); seekBy(-10); break;
        case 'l': event.preventDefault(); seekBy(10); break;
        case 'm': event.preventDefault(); setIsMuted((value) => !value); break;
        case 'f': event.preventDefault(); void toggleFullscreen(); break;
        case 'escape': if (!document.fullscreenElement) { event.preventDefault(); onClose(); } break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keyboardEnabled, onClose, seekBy, toggleFullscreen, togglePlay]);

  if (!video) return null;

  const title = deriveVideoTitle(video.content, video.profile?.username);
  const description = video.content?.split('\n').slice(1).join('\n').trim();
  const isOwnVideo = Boolean(currentUserId && video.user_id === currentUserId);

  const upNextList = (
    <div className="min-h-full bg-background pb-[calc(env(safe-area-inset-bottom,0px)+24px)] text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl">
        <h2 className="text-sm font-semibold">Keyingi videolar</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Avtomatik o‘tish o‘chirilgan</p>
      </div>
      <div className="py-1">
        {upNext.map((item) => (
          <VideoUpNextItem key={item.id} video={item} onClick={() => { onSelectVideo(item.id); lightTap(); }} onProfileClick={() => onOpenProfile(item)} />
        ))}
      </div>
    </div>
  );

  return createPortal(
    <div className={cn('fixed inset-0 flex min-h-0 flex-col bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_400px]', UI_LAYER.immersive)}>
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-black">
        <div
          ref={playerRef}
          className={cn('relative w-full shrink-0 overflow-hidden bg-black', isFullscreen ? 'h-full' : 'aspect-video lg:h-full lg:flex-1 lg:aspect-auto')}
          onPointerMove={revealControls}
          onWheel={zoom.handlers.onWheel}
          onTouchStart={(event) => {
            if (event.touches.length >= 2 || zoom.isZoomed) { event.stopPropagation(); endHold(); }
            zoom.handlers.onTouchStart(event);
          }}
          onTouchMove={(event) => {
            if (event.touches.length >= 2 || zoom.isZoomed) event.stopPropagation();
            zoom.handlers.onTouchMove(event);
          }}
          onTouchEnd={(event) => {
            if (zoom.isZoomed || event.touches.length > 0) { event.stopPropagation(); zoom.handlers.onTouchEnd(event); }
          }}
          onPointerDown={(event) => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            if (target?.closest('button, a, input, textarea, select, [role="slider"], [data-video-interactive="true"]')) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            startHold();
          }}
          onPointerUp={(event) => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            if (target?.closest('button, a, input, textarea, select, [role="slider"], [data-video-interactive="true"]')) return;
            if (!endHold()) registerTap(event.clientX, event.clientY);
          }}
          onPointerCancel={() => endHold()}
          onPointerLeave={() => endHold()}
          onDoubleClick={(event) => event.preventDefault()}
        >
          {aspectKind !== 'landscape' && !fitCover && posterUrl && (
            <><img src={posterUrl} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-[34px]" /><div className="pointer-events-none absolute inset-0 bg-black/30" /></>
          )}

          <video
            ref={videoRef}
            src={videoUrl}
            poster={posterUrl}
            className={cn('relative z-[1] h-full w-full will-change-transform', fitCover ? 'object-cover' : 'object-contain')}
            style={{ transform: `translate3d(${zoom.translateX}px, ${zoom.translateY}px, 0) scale(${zoom.scale})`, transformOrigin: 'center center' }}
            playsInline
            autoPlay
            muted={isMuted}
            onLoadedMetadata={(event) => {
              const el = event.currentTarget;
              setDuration(Number.isFinite(el.duration) ? el.duration : 0);
              if (el.videoWidth && el.videoHeight) setRatio(el.videoWidth / el.videoHeight);
              el.playbackRate = speedRef.current;
              el.muted = mutedRef.current;
            }}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onProgress={(event) => { const el = event.currentTarget; if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1)); }}
            onPlay={() => { setIsPlaying(true); setIsEnded(false); }}
            onPause={() => setIsPlaying(false)}
            onEnded={(event) => {
              // No autoplay/auto-next: stop on the current item and expose replay.
              setCurrentTime(event.currentTarget.duration || duration);
              setIsEnded(true);
              setIsPlaying(false);
              setShowControls(true);
              if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            }}
          />

          <div className={cn('pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-3 transition-opacity', showControls ? 'opacity-100' : 'opacity-0')}>
            <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); onClose(); }} className={cn('h-10 w-10 rounded-full bg-black/30 text-white hover:bg-white/15', showControls ? 'pointer-events-auto' : 'pointer-events-none')} aria-label="Videolarga qaytish"><ArrowLeft className="h-5 w-5" /></Button>
            <div className={cn('flex items-center gap-2', showControls ? 'pointer-events-auto' : 'pointer-events-none')}>
              <Button variant="ghost" size="sm" onClick={cycleSpeed} className="h-9 rounded-full bg-black/30 px-3 text-xs font-semibold text-white">{speed}x</Button>
              <Button variant="ghost" size="icon" onClick={() => setFitCover((value) => !value)} className="h-10 w-10 rounded-full bg-black/30 text-white" aria-label="Sig‘dirish">{fitCover ? <Minimize2 className="h-4.5 w-4.5" /> : <Maximize2 className="h-4.5 w-4.5" />}</Button>
            </div>
          </div>

          {showLikeBurst && <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"><Heart className="h-28 w-28 animate-[ping_.55s_ease-out_1] fill-white text-white" /></div>}
          {zoom.isZoomed && <button type="button" data-video-interactive="true" onClick={(event) => { event.stopPropagation(); zoom.resetZoom(); }} className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white">{zoom.scale.toFixed(1)}× · Reset</button>}
          {!isPlaying && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-xl">{isEnded ? <RotateCcw className="h-8 w-8" /> : <Play className="ml-1 h-8 w-8 fill-white" />}</div></div>}

          <div className={cn('absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2 pt-12 transition-opacity lg:px-5 lg:pb-3', showControls ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0')} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}>
            <VideoScrubBar src={videoUrl} duration={duration} currentTime={currentTime} bufferedSeconds={buffered} heatmap={heatmap} onSeek={handleSeek} enablePreview={duration > 0} playedClassName="bg-primary" thumbClassName="bg-primary" />
            <div className="mt-1 flex items-center justify-between text-white">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={togglePlay} className="h-9 w-9 rounded-full text-white hover:bg-white/15" aria-label={isPlaying ? 'Pauza' : 'Ijro'}>{isPlaying ? <Pause className="h-5 w-5" /> : isEnded ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5" />}</Button>
                <Button variant="ghost" size="icon" onClick={() => setIsMuted((value) => !value)} className="h-9 w-9 rounded-full text-white hover:bg-white/15" aria-label={isMuted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}>{isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</Button>
                <span className="ml-1 text-[11px] tabular-nums text-white/90">{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void toggleFullscreen()} className="h-9 w-9 rounded-full text-white hover:bg-white/15" aria-label="To‘liq ekran">{isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}</Button>
            </div>
          </div>
        </div>

        {!isFullscreen && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background text-foreground lg:hidden">
            <div className="px-4 pt-4">
              <h1 className="text-base font-semibold leading-snug">{title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">{formatCompactNumber(video.views_count || 0)} ko‘rish · {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}</p>
              <div className="mt-3 flex items-center gap-2.5">
                <button type="button" onClick={() => onOpenProfile(video)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left"><StoryAvatar userId={video.user_id} avatarUrl={video.profile?.avatar_url} username={video.profile?.username} size="sm" /><span className="flex min-w-0 items-center gap-1"><span className="truncate text-sm font-semibold">@{video.profile?.username || 'user'}</span>{video.profile?.is_verified && <VerifiedBadge size="xs" />}</span></button>
                {!isOwnVideo && <button type="button" onClick={() => onFollow(video.user_id)} className={cn('h-8 rounded-full px-3 text-xs font-semibold', video.is_following ? 'border border-border' : 'bg-foreground text-background')}>{video.is_following ? 'Kuzatilmoqda' : 'Kuzatish'}</button>}
              </div>
              {description && <button type="button" onClick={() => setDescriptionOpen((value) => !value)} className="mt-3 w-full rounded-2xl bg-muted/60 p-3 text-left"><p className={cn('whitespace-pre-wrap text-[13px]', !descriptionOpen && 'line-clamp-2')}>{description}</p><span className="mt-1 inline-block text-[11px] font-semibold text-muted-foreground">{descriptionOpen ? 'Yopish' : 'Batafsil'}</span></button>}
              <div className="mt-3 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button type="button" onClick={() => onLike(video.id)} className={cn('flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold', video.is_liked && 'bg-primary/15 text-primary')}><Heart className={cn('h-4 w-4', video.is_liked && 'fill-red-500 text-red-500')} />{formatCompactNumber(video.likes_count || 0)}</button>
                <button type="button" onClick={() => onComments(video)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold"><MessageCircle className="h-4 w-4" />{formatCompactNumber(video.comments_count || 0)}</button>
                <button type="button" onClick={() => onShare(video)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold"><Send className="h-4 w-4" />Ulashish</button>
                <button type="button" onClick={() => onBookmark(video.id)} className={cn('flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold', video.is_bookmarked && 'bg-primary/15 text-primary')}><Bookmark className={cn('h-4 w-4', video.is_bookmarked && 'fill-current')} />Saqlash</button>
              </div>
            </div>
            {upNextList}
          </div>
        )}
      </section>
      {!isFullscreen && <aside className="hidden h-full min-h-0 overflow-y-auto border-l border-border bg-background lg:block">{upNextList}</aside>}
    </div>,
    document.body,
  );
}
