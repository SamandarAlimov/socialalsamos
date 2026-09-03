import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Hand,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  PhoneOff,
  RotateCcw,
  Settings2,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { UI_LAYER } from '@/lib/uiLayers';
import { callPhaseLabel, deriveCallUiPhase, formatCallDuration } from '@/lib/callUi';
import { NetworkQualityIndicator } from './NetworkQualityIndicator';
import { CallDebugPanel } from './CallDebugPanel';
import type { CallStats, ICEDebugInfo } from '@/hooks/useCallStats';
import { CallDeviceSettingsDialog } from '@/components/calls/CallDeviceSettingsDialog';

interface Participant {
  id: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  name?: string;
  avatarUrl?: string;
}

interface ConnectionQuality {
  bitrate: number;
  packetLoss: number;
  latency: number;
  quality: 'excellent' | 'good' | 'poor' | 'disconnected';
}

interface VideoCallOverlayProps {
  localStream: MediaStream | null;
  participants: Participant[];
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  callType: 'audio' | 'video';
  callStartedAt?: string | null;
  isCallConnected?: boolean;
  isReconnecting?: boolean;
  error?: string | null;
  connectionQuality?: ConnectionQuality;
  callStats?: CallStats;
  debugInfo?: ICEDebugInfo;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleHandRaise: () => void;
  onSwitchCamera?: () => Promise<boolean> | boolean | void;
  onCameraChange?: (deviceId: string) => Promise<boolean> | boolean;
  onMicrophoneChange?: (deviceId: string) => Promise<boolean> | boolean;
  onAddPeople?: () => void;
  onEndCall: () => void;
  currentUserName?: string;
  currentUserAvatar?: string;
  peerName?: string;
  peerAvatar?: string;
}

function MediaElement({
  stream,
  showVideo,
  className,
  outputDeviceId,
}: {
  stream: MediaStream;
  showVideo: boolean;
  className?: string;
  outputDeviceId?: string;
}) {
  const ref = useRef<HTMLVideoElement | HTMLAudioElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== stream) element.srcObject = stream;

    if (outputDeviceId) {
      const sinkElement = element as HTMLMediaElement & {
        setSinkId?: (deviceId: string) => Promise<void>;
      };
      void sinkElement.setSinkId?.(outputDeviceId).catch(() => {});
    }
  }, [outputDeviceId, stream]);

  if (showVideo) {
    return (
      <video
        ref={ref as React.RefObject<HTMLVideoElement>}
        autoPlay
        playsInline
        className={className}
      />
    );
  }

  // Audio calls and camera-off participants still need a live media element.
  return <audio ref={ref as React.RefObject<HTMLAudioElement>} autoPlay className="hidden" />;
}

function PremiumControl({
  label,
  active,
  danger,
  onClick,
  children,
  className,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            'group flex min-w-0 flex-col items-center gap-1.5 text-white outline-none',
            className
          )}
        >
          <span
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/12 shadow-lg backdrop-blur-xl transition-all duration-200 group-hover:bg-white/20 group-active:scale-95 sm:h-12 sm:w-12',
              active && 'border-white/30 bg-white text-neutral-950 group-hover:bg-white/90',
              danger && 'border-red-400/30 bg-red-500 text-white group-hover:bg-red-500/90'
            )}
          >
            {children}
          </span>
          <span className="hidden max-w-[72px] truncate text-[10px] font-medium text-white/65 sm:block">
            {label}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function VideoCallOverlay({
  localStream,
  participants,
  isMuted,
  isVideoOn,
  isScreenSharing,
  isHandRaised,
  callType,
  callStartedAt,
  isCallConnected = false,
  isReconnecting = false,
  error,
  connectionQuality,
  callStats,
  debugInfo,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleHandRaise,
  onSwitchCamera,
  onCameraChange,
  onMicrophoneChange,
  onAddPeople,
  onEndCall,
  currentUserName,
  currentUserAvatar,
  peerName,
  peerAvatar,
}: VideoCallOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const draggingRef = useRef(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [outputDeviceId, setOutputDeviceId] = useState(() => {
    try {
      return window.localStorage.getItem('alsamos.call-output-device') || '';
    } catch {
      return '';
    }
  });
  const [showControls, setShowControls] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [pipPosition, setPipPosition] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);

  const primaryParticipant = participants[0];
  const displayName = primaryParticipant?.name || peerName || 'Suhbatdosh';
  const displayAvatar = primaryParticipant?.avatarUrl || peerAvatar;
  const isGroupCall = participants.length > 1;

  const changeOutputDevice = useCallback((deviceId: string) => {
    setOutputDeviceId(deviceId);
    try {
      if (deviceId) {
        window.localStorage.setItem('alsamos.call-output-device', deviceId);
      } else {
        window.localStorage.removeItem('alsamos.call-output-device');
      }
    } catch {
      // Device preference is optional.
    }
  }, []);

  const hasRemoteVideo = Boolean(
    primaryParticipant?.stream && primaryParticipant?.isVideoOn && callType === 'video'
  );

  const phase = useMemo(
    () =>
      deriveCallUiPhase({
        isConnected: isCallConnected,
        isReconnecting,
        participantCount: participants.length,
        callStartedAt,
        error,
      }),
    [callStartedAt, error, isCallConnected, isReconnecting, participants.length]
  );

  useEffect(() => {
    const video = localVideoRef.current;
    if (video && localStream && video.srcObject !== localStream) {
      video.srcObject = localStream;
    }
  }, [localStream, isMinimized]);

  useEffect(() => {
    if (!isCallConnected || !callStartedAt) {
      setCallDuration(0);
      return;
    }

    const started = new Date(callStartedAt).getTime();
    const tick = () => {
      if (!Number.isFinite(started)) return;
      setCallDuration(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [callStartedAt, isCallConnected]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);

    // Audio/ringing/error states keep controls visible. Auto-hide only while a
    // connected video is actually occupying the canvas.
    if (!isCallConnected || !hasRemoteVideo || isMinimized) return;

    controlsTimeoutRef.current = setTimeout(() => {
      if (!draggingRef.current) setShowControls(false);
    }, 3500);
  }, [hasRemoteVideo, isCallConnected, isMinimized]);

  useEffect(() => {
    revealControls();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [revealControls]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // Browser fullscreen is an enhancement, never a call blocker.
    }
  }, []);

  const handlePipDragStart = (event: React.MouseEvent | React.TouchEvent) => {
    event.stopPropagation();
    draggingRef.current = true;
    setIsDragging(true);
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      offsetX: pipPosition.x,
      offsetY: pipPosition.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (event: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
      const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
      const nextX = dragStartRef.current.offsetX - (clientX - dragStartRef.current.x);
      const nextY = dragStartRef.current.offsetY - (clientY - dragStartRef.current.y);
      const maxX = Math.max(16, window.innerWidth - 150);
      const maxY = Math.max(16, window.innerHeight - 220);

      setPipPosition({
        x: Math.max(16, Math.min(nextX, maxX)),
        y: Math.max(16, Math.min(nextY, maxY)),
      });
    };

    const onEnd = () => {
      draggingRef.current = false;
      setIsDragging(false);
      setPipPosition((position) => ({
        x: position.x > window.innerWidth / 2 - 70 ? window.innerWidth - 170 : 16,
        y: position.y,
      }));
      revealControls();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDragging, revealControls]);

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/95 text-white shadow-2xl backdrop-blur-2xl">
        {primaryParticipant?.stream && (
          <MediaElement
            stream={primaryParticipant.stream}
            showVideo={Boolean(primaryParticipant.isVideoOn && callType === 'video')}
            className="absolute inset-0 h-full w-full object-cover opacity-25"
            outputDeviceId={outputDeviceId}
          />
        )}
        <div className="relative flex items-center gap-3 p-3">
          <Avatar className="h-12 w-12 shrink-0 border border-white/15">
            <AvatarImage src={displayAvatar} />
            <AvatarFallback className="bg-white/10 text-white">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="mt-0.5 truncate text-xs text-white/55">
              {phase === 'connected' ? formatCallDuration(callDuration) : callPhaseLabel(phase)}
            </p>
          </button>

          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Mikrofonni yoqish' : "Mikrofonni o'chirish"}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="destructive"
            className="h-9 w-9 rounded-full"
            onClick={onEndCall}
            aria-label="Qo'ng'iroqni tugatish"
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'chat-no-select fixed inset-0 overflow-hidden bg-[#080b0f] text-white',
        UI_LAYER.immersive
      )}
      style={{ height: '100dvh', width: '100vw' }}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      onClick={revealControls}
    >
      {/* Ambient background keeps audio/camera-off calls visually premium. */}
      <div className="pointer-events-none absolute inset-0">
        {displayAvatar ? (
          <>
            <img
              src={displayAvatar}
              alt=""
              className="h-full w-full scale-110 object-cover opacity-20 blur-3xl"
            />
            <div className="absolute inset-0 bg-black/65" />
          </>
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_50%_30%,rgba(51,112,163,0.22),transparent_45%),linear-gradient(180deg,#141a21,#080b0f)]" />
        )}
      </div>

      {/* Remote media. Audio-only streams are deliberately attached too. */}
      <div className="absolute inset-0">
        {participants.length === 1 && primaryParticipant ? (
          primaryParticipant.stream ? (
            <MediaElement
              stream={primaryParticipant.stream}
              showVideo={Boolean(primaryParticipant.isVideoOn && callType === 'video')}
              className="h-full w-full bg-black object-contain"
              outputDeviceId={outputDeviceId}
            />
          ) : null
        ) : participants.length > 1 ? (
          <div
            className={cn(
              'grid h-full gap-1 p-1 sm:gap-2 sm:p-2',
              participants.length <= 2
                ? 'grid-cols-1 md:grid-cols-2'
                : participants.length <= 4
                  ? 'grid-cols-2'
                  : participants.length <= 6
                    ? 'grid-cols-2 md:grid-cols-3'
                    : 'grid-cols-3 md:grid-cols-4'
            )}
          >
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="relative min-h-0 overflow-hidden rounded-2xl border border-white/5 bg-black/35"
              >
                {participant.stream ? (
                  <MediaElement
                    stream={participant.stream}
                    showVideo={Boolean(participant.isVideoOn && callType === 'video')}
                    className="h-full w-full object-cover"
                    outputDeviceId={outputDeviceId}
                  />
                ) : null}
                {(!participant.stream || !participant.isVideoOn || callType === 'audio') && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Avatar className="h-20 w-20 border border-white/15 sm:h-24 sm:w-24">
                      <AvatarImage src={participant.avatarUrl} />
                      <AvatarFallback className="bg-white/10 text-2xl text-white">
                        {(participant.name || "A'zo").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex max-w-[75%] items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs backdrop-blur-xl">
                  <span className="truncate">{participant.name || "A'zo"}</span>
                  {participant.isMuted && <MicOff className="h-3.5 w-3.5 text-red-300" />}
                  {participant.isHandRaised && <Hand className="h-3.5 w-3.5 text-yellow-300" />}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Waiting/audio/camera-off identity stage. */}
      {(!hasRemoteVideo && !isGroupCall) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 pb-24">
          <div className="flex max-w-lg flex-col items-center text-center">
            <div className="relative mb-6">
              {(phase === 'ringing' || phase === 'connecting') && (
                <>
                  <span className="absolute -inset-5 animate-ping rounded-full bg-white/5" />
                  <span className="absolute -inset-2 animate-pulse rounded-full border border-white/15" />
                </>
              )}
              <Avatar className="relative h-28 w-28 border-2 border-white/15 shadow-2xl sm:h-36 sm:w-36">
                <AvatarImage src={displayAvatar} />
                <AvatarFallback className="bg-white/10 text-4xl font-semibold text-white">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <h2 className="max-w-[80vw] truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {displayName}
            </h2>
            <p className="mt-2 text-sm text-white/55 sm:text-base">
              {phase === 'connected' ? formatCallDuration(callDuration) : callPhaseLabel(phase)}
            </p>
            {error && phase === 'failed' && (
              <p className="mt-3 max-w-sm rounded-full bg-red-500/10 px-4 py-2 text-xs text-red-200">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top glass bar. */}
      <div
        className={cn(
          'safe-area-inset-top absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-b from-black/75 via-black/30 to-transparent px-3 pb-8 pt-3 transition-opacity duration-200 sm:px-5',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0 border border-white/15">
            <AvatarImage src={displayAvatar} />
            <AvatarFallback className="bg-white/10 text-xs text-white">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-white/55">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  phase === 'connected'
                    ? 'bg-emerald-400'
                    : phase === 'failed'
                      ? 'bg-red-400'
                      : 'animate-pulse bg-amber-300'
                )}
              />
              <span className="tabular-nums">
                {phase === 'connected' ? formatCallDuration(callDuration) : callPhaseLabel(phase)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NetworkQualityIndicator
            quality={
              callStats?.quality ||
              (connectionQuality?.quality === 'poor' ? 'poor' : connectionQuality?.quality || 'disconnected')
            }
            rtt={callStats?.rtt ?? connectionQuality?.latency ?? 0}
            packetLoss={callStats?.packetLoss ?? connectionQuality?.packetLoss ?? 0}
            bitrate={callStats?.bitrate ?? connectionQuality?.bitrate ?? 0}
            isReconnecting={isReconnecting}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full bg-black/20 text-white hover:bg-white/15 hover:text-white"
            onClick={() => setShowDeviceSettings(true)}
            aria-label="Qo'ng'iroq qurilmalari"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full bg-black/20 text-white hover:bg-white/15 hover:text-white"
            onClick={() => setIsMinimized(true)}
            aria-label="Qo'ng'iroqni kichraytirish"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-9 w-9 rounded-full bg-black/20 text-white hover:bg-white/15 hover:text-white md:inline-flex"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isReconnecting && (
        <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-amber-300/20 bg-amber-400/15 px-4 py-2 text-xs font-medium text-amber-100 backdrop-blur-xl">
          Aloqa qayta tiklanmoqda...
        </div>
      )}

      {callStats && debugInfo && <CallDebugPanel stats={callStats} debugInfo={debugInfo} />}

      {/* Local picture-in-picture. */}
      {localStream && (
        <div
          className={cn(
            'absolute z-20 h-28 w-20 cursor-move overflow-hidden rounded-2xl border border-white/20 bg-neutral-900 shadow-2xl sm:h-36 sm:w-24 md:h-40 md:w-28',
            !isDragging && 'transition-[right,bottom,opacity] duration-200',
            showControls || isDragging ? 'opacity-100' : 'opacity-65'
          )}
          style={{ right: pipPosition.x, bottom: pipPosition.y + 92 }}
          onMouseDown={handlePipDragStart}
          onTouchStart={handlePipDragStart}
        >
          {isVideoOn ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full scale-x-[-1] object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/5">
              <Avatar className="h-10 w-10">
                <AvatarImage src={currentUserAvatar} />
                <AvatarFallback className="bg-white/10 text-sm text-white">
                  {(currentUserName || 'Siz').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-medium">
            Siz
          </span>
          {isMuted && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-red-500/90 p-1">
              <MicOff className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      )}

      {/* Floating Telegram-style control dock. */}
      <div
        className={cn(
          'safe-area-inset-bottom absolute bottom-3 left-1/2 z-30 -translate-x-1/2 transition-all duration-200 sm:bottom-5',
          showControls ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
        )}
      >
        <div className="flex max-w-[calc(100vw-1rem)] items-start justify-center gap-2 rounded-[28px] border border-white/10 bg-black/60 px-3 py-2.5 shadow-2xl backdrop-blur-2xl sm:gap-3 sm:px-4 sm:py-3">
          <PremiumControl
            label={isMuted ? 'Ovozni yoqish' : "Ovozni o'chirish"}
            active={isMuted}
            onClick={onToggleMute}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </PremiumControl>

          <PremiumControl
            label={isVideoOn ? "Videoni o'chirish" : 'Videoni yoqish'}
            active={!isVideoOn}
            onClick={onToggleVideo}
          >
            {isVideoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </PremiumControl>

          {onSwitchCamera && callType === 'video' && isVideoOn && (
            <PremiumControl label="Kamerani almashtirish" onClick={() => void onSwitchCamera()}>
              <RotateCcw className="h-5 w-5" />
            </PremiumControl>
          )}

          <PremiumControl
            label={isScreenSharing ? "Ekran ulashishni to'xtatish" : 'Ekran ulashish'}
            active={isScreenSharing}
            onClick={onToggleScreenShare}
            className="hidden md:flex"
          >
            <Monitor className="h-5 w-5" />
          </PremiumControl>

          {onAddPeople && (
            <PremiumControl label="Odam qo'shish" onClick={onAddPeople} className="hidden sm:flex">
              <Users className="h-5 w-5" />
            </PremiumControl>
          )}

          {isGroupCall && (
            <PremiumControl
              label={isHandRaised ? "Qo'lni tushirish" : "Qo'l ko'tarish"}
              active={isHandRaised}
              onClick={onToggleHandRaise}
              className="hidden md:flex"
            >
              <Hand className="h-5 w-5" />
            </PremiumControl>
          )}

          <PremiumControl label="Tugatish" danger onClick={onEndCall}>
            <PhoneOff className="h-5 w-5" />
          </PremiumControl>
        </div>
      </div>

      <CallDeviceSettingsDialog
        open={showDeviceSettings}
        onOpenChange={setShowDeviceSettings}
        localStream={localStream}
        outputDeviceId={outputDeviceId}
        onOutputDeviceChange={changeOutputDevice}
        onCameraChange={onCameraChange}
        onMicrophoneChange={onMicrophoneChange}
      />
    </div>
  );
}
