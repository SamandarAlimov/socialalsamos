import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Hand,
  PhoneOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NetworkQualityIndicator } from './NetworkQualityIndicator';
import { CallDebugPanel } from './CallDebugPanel';
import type { CallStats, ICEDebugInfo } from '@/hooks/useCallStats';

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
  callStats?: CallStats;
  debugInfo?: ICEDebugInfo;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleHandRaise: () => void;
  onEndCall: () => void;
  currentUserName?: string;
  currentUserAvatar?: string;
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
  isCallConnected,
  isReconnecting = false,
  callStats,
  debugInfo,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleHandRaise,
  onEndCall,
  currentUserName,
  currentUserAvatar,
}: VideoCallOverlayProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  // PIP oynasi o'ng-past burchakdan boshlanadi
  const [pipPosition, setPipPosition] = useState({ x: 12, y: 12 });
  const [isDragging, setIsDragging] = useState(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const draggingRef = useRef(false);

  const isOneOnOne = participants.length === 1;
  const isOneToOneCall = participants.length <= 1;

  // Lokal videoni faqat bir marta bog'laymiz (miltillamasligi uchun)
  useEffect(() => {
    const videoEl = localVideoRef.current;
    if (videoEl && localStream && videoEl.srcObject !== localStream) {
      videoEl.srcObject = localStream;
    }
  }, [localStream]);

  // Qo'ng'iroq davomiyligi - faqat ulanganidan keyin sanaladi
  useEffect(() => {
    if (!isCallConnected || !callStartedAt) {
      setCallDuration(0);
      return;
    }

    const startedMs = new Date(callStartedAt).getTime();
    const tick = () => setCallDuration(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [callStartedAt, isCallConnected]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Boshqaruv tugmalarini avtomatik yashirish (Telegramdek 3.5s)
  const revealControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (!draggingRef.current) setShowControls(false);
    }, 3500);
  }, []);

  useEffect(() => {
    revealControls();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [revealControls]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // PIP oynasini sudrash
  const handlePipDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    draggingRef.current = true;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      offsetX: pipPosition.x,
      offsetY: pipPosition.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      // right/bottom bo'yicha joylashgani uchun yo'nalish teskari
      const newX = dragStartRef.current.offsetX - (clientX - dragStartRef.current.x);
      const newY = dragStartRef.current.offsetY - (clientY - dragStartRef.current.y);

      const maxX = Math.max(12, window.innerWidth - 140);
      const maxY = Math.max(12, window.innerHeight - 220);

      setPipPosition({
        x: Math.max(12, Math.min(newX, maxX)),
        y: Math.max(12, Math.min(newY, maxY)),
      });
    };

    const onEnd = () => {
      draggingRef.current = false;
      setIsDragging(false);
      // Telegramdek eng yaqin burchakka yopishadi
      setPipPosition((pos) => ({
        x: pos.x > window.innerWidth / 2 - 70 ? window.innerWidth - 152 : 12,
        y: pos.y,
      }));
      revealControls();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDragging, revealControls]);

  return (
    <div
      className="chat-no-select fixed inset-0 z-[9999] flex flex-col bg-black"
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      onClick={revealControls}
      style={{ height: '100dvh', width: '100vw' }}
    >
      {/* Yuqori holat paneli */}
      <div
        className={cn(
          'safe-area-inset-top absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 py-2.5 sm:px-4 sm:py-3',
          'tg-transition',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-white">
          <div
            className={cn(
              'h-2 w-2 shrink-0 animate-pulse rounded-full',
              isCallConnected ? 'bg-green-500' : 'bg-yellow-500'
            )}
          />
          <span className="truncate text-xs font-medium tabular-nums sm:text-sm">
            {isCallConnected && callStartedAt
              ? formatDuration(callDuration)
              : 'Ulanmoqda...'}
          </span>
          <span className="hidden truncate text-xs text-white/60 sm:inline">
            {callType === 'video' ? "Video qo'ng'iroq" : "Audio qo'ng'iroq"}
          </span>
        </div>
        <NetworkQualityIndicator
          quality={callStats?.quality || 'disconnected'}
          rtt={callStats?.rtt}
          packetLoss={callStats?.packetLoss}
          bitrate={callStats?.bitrate}
          isReconnecting={isReconnecting}
        />
      </div>

      {/* Qayta ulanish banneri */}
      {isReconnecting && (
        <div className="absolute left-0 right-0 top-14 z-20 animate-pulse bg-yellow-500/90 py-2 text-center text-xs font-medium text-black sm:text-sm">
          Qayta ulanmoqda...
        </div>
      )}

      {callStats && debugInfo && <CallDebugPanel stats={callStats} debugInfo={debugInfo} />}

      {/* Asosiy video maydoni */}
      <div className="relative flex-1">
        {isOneOnOne && participants[0] ? (
          <div className="absolute inset-0">
            {participants[0].stream && participants[0].isVideoOn ? (
              <video
                autoPlay
                playsInline
                ref={(el) => {
                  if (el && participants[0].stream && el.srcObject !== participants[0].stream) {
                    el.srcObject = participants[0].stream;
                  }
                }}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                <div className="flex flex-col items-center gap-4 px-6">
                  <Avatar className="h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40">
                    <AvatarImage src={participants[0].avatarUrl} />
                    <AvatarFallback className="bg-primary/20 text-3xl text-primary sm:text-4xl md:text-5xl">
                      {participants[0].name?.[0] || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-center">
                    <h3 className="truncate text-lg font-semibold text-white sm:text-xl md:text-2xl">
                      {participants[0].name || 'Suhbatdosh'}
                    </h3>
                    {participants[0].isMuted && (
                      <p className="mt-1 flex items-center justify-center gap-1 text-xs text-white/60 sm:text-sm">
                        <MicOff className="h-4 w-4" /> Mikrofon o'chirilgan
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div
              className={cn(
                'tg-transition absolute bottom-28 left-3 flex max-w-[70%] items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur sm:left-4 sm:px-4 sm:py-2',
                showControls ? 'opacity-100' : 'opacity-0'
              )}
            >
              <span className="truncate text-xs font-medium text-white sm:text-sm">
                {participants[0].name || 'Suhbatdosh'}
              </span>
              {participants[0].isMuted && <MicOff className="h-4 w-4 shrink-0 text-red-400" />}
              {participants[0].isHandRaised && (
                <Hand className="h-4 w-4 shrink-0 text-yellow-400" />
              )}
            </div>
          </div>
        ) : participants.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <div className="px-6 text-center">
              <div className="mb-4 animate-pulse">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 sm:h-24 sm:w-24">
                  {callType === 'video' ? (
                    <Video className="h-10 w-10 text-primary sm:h-12 sm:w-12" />
                  ) : (
                    <Mic className="h-10 w-10 text-primary sm:h-12 sm:w-12" />
                  )}
                </div>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white sm:text-xl">
                {isOneToOneCall ? 'Ulanmoqda...' : "Boshqalar qo'shilishini kutmoqdamiz..."}
              </h3>
              <p className="text-sm text-white/60">
                {isOneToOneCall
                  ? "Qo'ng'iroq ulanguncha kutib turing"
                  : "Taklif qilish uchun qo'ng'iroq havolasini ulashing"}
              </p>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'grid h-full gap-1.5 p-1.5 sm:gap-2 sm:p-2',
              participants.length <= 2
                ? 'grid-cols-1 md:grid-cols-2'
                : participants.length <= 4
                  ? 'grid-cols-2'
                  : participants.length <= 9
                    ? 'grid-cols-2 md:grid-cols-3'
                    : 'grid-cols-3 md:grid-cols-4'
            )}
          >
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="relative overflow-hidden rounded-xl bg-gray-800 sm:rounded-2xl"
              >
                {participant.stream && participant.isVideoOn ? (
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el && participant.stream && el.srcObject !== participant.stream) {
                        el.srcObject = participant.stream;
                      }
                    }}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                    <Avatar className="h-14 w-14 sm:h-16 sm:w-16 md:h-20 md:w-20">
                      <AvatarImage src={participant.avatarUrl} />
                      <AvatarFallback className="bg-primary/20 text-xl text-primary sm:text-2xl">
                        {participant.name?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}

                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 sm:bottom-2 sm:left-2 sm:right-2">
                  <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[11px] backdrop-blur sm:text-xs">
                    <span className="truncate text-white">
                      {participant.name || "A'zo"}
                    </span>
                    {participant.isMuted && <MicOff className="h-3 w-3 shrink-0 text-red-400" />}
                  </div>
                  {participant.isHandRaised && (
                    <div className="shrink-0 rounded-full bg-yellow-500/80 p-1.5">
                      <Hand className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* O'zimizning kichik oynamiz (sudralади) */}
        <div
          className={cn(
            'no-drag absolute h-24 w-[104px] cursor-move overflow-hidden rounded-xl border-2 border-white/20 bg-gray-800 shadow-2xl sm:h-32 sm:w-44 md:h-36 md:w-48',
            isDragging ? '' : 'tg-transition',
            showControls || isDragging ? 'opacity-100' : 'opacity-70'
          )}
          style={{
            right: pipPosition.x,
            bottom: pipPosition.y + 96,
          }}
          onMouseDown={handlePipDragStart}
          onTouchStart={handlePipDragStart}
        >
          {localStream && isVideoOn ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full scale-x-[-1] object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
              <Avatar className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14">
                <AvatarImage src={currentUserAvatar} />
                <AvatarFallback className="bg-primary/20 text-lg text-primary">
                  {currentUserName?.[0] || 'S'}
                </AvatarFallback>
              </Avatar>
            </div>
          )}

          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Siz</span>
            {isMuted && (
              <div className="rounded-full bg-red-500 p-1">
                <MicOff className="h-2.5 w-2.5 text-white" />
              </div>
            )}
            {!isVideoOn && (
              <div className="rounded-full bg-red-500 p-1">
                <VideoOff className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Qo'ng'iroq tugmalari */}
      <div
        className={cn(
          'safe-area-inset-bottom flex h-24 items-center justify-center gap-2.5 bg-gradient-to-t from-black via-black/90 to-black/60 px-3 pb-6 backdrop-blur sm:gap-4 sm:px-4 md:pb-4',
          'tg-transition',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isMuted ? 'destructive' : 'secondary'}
              size="icon"
              className="tg-transition h-11 w-11 rounded-full active:scale-95 sm:h-12 sm:w-12 md:h-14 md:w-14"
              onClick={onToggleMute}
              aria-label={isMuted ? 'Mikrofonni yoqish' : "Mikrofonni o'chirish"}
            >
              {isMuted ? (
                <MicOff className="h-5 w-5 md:h-6 md:w-6" />
              ) : (
                <Mic className="h-5 w-5 md:h-6 md:w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isMuted ? 'Mikrofonni yoqish' : "Mikrofonni o'chirish"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={!isVideoOn ? 'destructive' : 'secondary'}
              size="icon"
              className="tg-transition h-11 w-11 rounded-full active:scale-95 sm:h-12 sm:w-12 md:h-14 md:w-14"
              onClick={onToggleVideo}
              aria-label={isVideoOn ? "Kamerani o'chirish" : 'Kamerani yoqish'}
            >
              {isVideoOn ? (
                <Video className="h-5 w-5 md:h-6 md:w-6" />
              ) : (
                <VideoOff className="h-5 w-5 md:h-6 md:w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isVideoOn ? "Kamerani o'chirish" : 'Kamerani yoqish'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isScreenSharing ? 'default' : 'secondary'}
              size="icon"
              className="tg-transition hidden h-12 w-12 rounded-full active:scale-95 md:flex md:h-14 md:w-14"
              onClick={onToggleScreenShare}
              aria-label="Ekranni ulashish"
            >
              <Monitor className="h-5 w-5 md:h-6 md:w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isScreenSharing ? "Ulashishni to'xtatish" : 'Ekranni ulashish'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isHandRaised ? 'default' : 'secondary'}
              size="icon"
              className="tg-transition h-11 w-11 rounded-full active:scale-95 sm:h-12 sm:w-12 md:h-14 md:w-14"
              onClick={onToggleHandRaise}
              aria-label="Qo'l ko'tarish"
            >
              <Hand className="h-5 w-5 md:h-6 md:w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isHandRaised ? "Qo'lni tushirish" : "Qo'l ko'tarish"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="tg-transition hidden h-12 w-12 rounded-full active:scale-95 md:flex md:h-14 md:w-14"
              onClick={toggleFullscreen}
              aria-label="To'liq ekran"
            >
              {isFullscreen ? (
                <Minimize2 className="h-5 w-5 md:h-6 md:w-6" />
              ) : (
                <Maximize2 className="h-5 w-5 md:h-6 md:w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isFullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="tg-transition ml-1 h-13 w-13 rounded-full active:scale-95 sm:ml-2 sm:h-14 sm:w-14 md:h-16 md:w-16"
              onClick={onEndCall}
              aria-label="Tugatish"
            >
              <PhoneOff className="h-6 w-6 md:h-7 md:w-7" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Qo'ng'iroqni tugatish</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
