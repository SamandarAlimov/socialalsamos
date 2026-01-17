import { useState, useRef, useEffect, memo } from 'react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  const [pipPosition, setPipPosition] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const isOneOnOne = participants.length === 1;
  const hasRemoteVideo = participants.some(p => p.stream && p.isVideoOn);

  // Set up local video - only set srcObject once to prevent flickering
  useEffect(() => {
    const videoEl = localVideoRef.current;
    if (videoEl && localStream && videoEl.srcObject !== localStream) {
      videoEl.srcObject = localStream;
    }
  }, [localStream]);

  // Call duration timer (starts only after call is actually connected and we have a shared start time)
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

  // Format duration
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-hide controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!isDragging) {
        setShowControls(false);
      }
    }, 3000);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // PIP drag handling
  const handlePipDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
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

  const handlePipDrag = (e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const newX = dragStartRef.current.offsetX + (clientX - dragStartRef.current.x);
    const newY = dragStartRef.current.offsetY + (clientY - dragStartRef.current.y);
    
    // Keep within bounds
    const maxX = window.innerWidth - 200;
    const maxY = window.innerHeight - 150;
    
    setPipPosition({
      x: Math.max(16, Math.min(newX, maxX)),
      y: Math.max(16, Math.min(newY, maxY)),
    });
  };

  const handlePipDragEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handlePipDrag);
      window.addEventListener('mouseup', handlePipDragEnd);
      window.addEventListener('touchmove', handlePipDrag);
      window.addEventListener('touchend', handlePipDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handlePipDrag);
      window.removeEventListener('mouseup', handlePipDragEnd);
      window.removeEventListener('touchmove', handlePipDrag);
      window.removeEventListener('touchend', handlePipDragEnd);
    };
  }, [isDragging]);

  // Check if this is a 1:1 call (not a group call)
  const isOneToOneCall = participants.length <= 1;

  return (
    <div 
      className="fixed inset-0 bg-black z-[9999] flex flex-col"
      onMouseMove={handleMouseMove}
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        height: '100dvh',
        width: '100vw',
      }}
    >
      {/* Status Bar */}
      <div className={cn(
        "absolute top-0 left-0 right-0 z-20 px-4 py-3 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 safe-area-inset-top",
        showControls ? "opacity-100" : "opacity-0"
      )}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-white">
            <div className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              isCallConnected ? "bg-green-500" : "bg-yellow-500"
            )} />
            <span className="text-sm font-medium">
              {isCallConnected && callStartedAt ? formatDuration(callDuration) : 'Connecting…'}
            </span>
          </div>
        </div>
        <NetworkQualityIndicator
          quality={callStats?.quality || 'disconnected'}
          rtt={callStats?.rtt}
          packetLoss={callStats?.packetLoss}
          bitrate={callStats?.bitrate}
          isReconnecting={isReconnecting}
        />
      </div>

      {/* Reconnecting Banner */}
      {isReconnecting && (
        <div className="absolute top-14 left-0 right-0 z-20 bg-yellow-500/90 text-black text-center py-2 text-sm font-medium animate-pulse">
          Reconnecting...
        </div>
      )}

      {/* Debug Panel (dev mode only) */}
      {callStats && debugInfo && (
        <CallDebugPanel stats={callStats} debugInfo={debugInfo} />
      )}

      {/* Main Video Area */}
      <div className="flex-1 relative">
        {/* 1-on-1 Call: Remote video fullscreen */}
        {isOneOnOne && participants[0] ? (
          <div className="absolute inset-0">
            {participants[0].stream && participants[0].isVideoOn ? (
              <video
                autoPlay
                playsInline
                ref={(el) => {
                  if (el && participants[0].stream) {
                    el.srcObject = participants[0].stream;
                  }
                }}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                <div className="flex flex-col items-center gap-4">
                  <Avatar className="h-32 w-32 md:h-40 md:w-40">
                    <AvatarImage src={participants[0].avatarUrl} />
                    <AvatarFallback className="text-4xl md:text-5xl bg-primary/20 text-primary">
                      {participants[0].name?.[0] || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-center">
                    <h3 className="text-xl md:text-2xl font-semibold text-white">
                      {participants[0].name || 'Participant'}
                    </h3>
                    {participants[0].isMuted && (
                      <p className="text-sm text-white/60 flex items-center justify-center gap-1 mt-1">
                        <MicOff className="h-4 w-4" /> Muted
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Participant status overlay */}
            <div className={cn(
              "absolute bottom-28 left-4 flex items-center gap-2 px-4 py-2 bg-black/60 rounded-full backdrop-blur transition-opacity duration-300",
              showControls ? "opacity-100" : "opacity-0"
            )}>
              <span className="text-sm text-white font-medium">
                {participants[0].name || 'Participant'}
              </span>
              {participants[0].isMuted && <MicOff className="h-4 w-4 text-red-400" />}
              {participants[0].isHandRaised && <Hand className="h-4 w-4 text-yellow-400" />}
            </div>
          </div>
        ) : participants.length === 0 ? (
          /* Waiting for connection - show connecting message for 1:1 calls */
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <div className="text-center">
              <div className="animate-pulse mb-4">
                <div className="h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                  {callType === 'video' ? (
                    <Video className="h-12 w-12 text-primary" />
                  ) : (
                    <Mic className="h-12 w-12 text-primary" />
                  )}
                </div>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {isOneToOneCall ? 'Connecting...' : 'Waiting for others to join...'}
              </h3>
              <p className="text-white/60">
                {isOneToOneCall ? 'Please wait while the call connects' : 'Share the call link to invite participants'}
              </p>
            </div>
          </div>
        ) : (
          /* Group call grid */
          <div className={cn(
            "grid gap-2 p-2 h-full",
            participants.length <= 2 ? "grid-cols-1 md:grid-cols-2" :
            participants.length <= 4 ? "grid-cols-2" :
            participants.length <= 9 ? "grid-cols-2 md:grid-cols-3" :
            "grid-cols-3 md:grid-cols-4"
          )}>
            {participants.map((participant) => (
              <div 
                key={participant.id} 
                className="relative bg-gray-800 rounded-xl overflow-hidden"
              >
                {participant.stream && participant.isVideoOn ? (
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el && participant.stream) {
                        el.srcObject = participant.stream;
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                    <Avatar className="h-16 w-16 md:h-20 md:w-20">
                      <AvatarImage src={participant.avatarUrl} />
                      <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                        {participant.name?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
                
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 px-2 py-1 bg-black/60 rounded-full backdrop-blur text-xs">
                    <span className="text-white">{participant.name || 'Participant'}</span>
                    {participant.isMuted && <MicOff className="h-3 w-3 text-red-400" />}
                  </div>
                  {participant.isHandRaised && (
                    <div className="p-1.5 bg-yellow-500/80 rounded-full">
                      <Hand className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Local Video PIP (draggable) */}
        <div 
          className={cn(
            "absolute w-32 h-24 md:w-48 md:h-36 bg-gray-800 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 cursor-move transition-opacity",
            showControls || isDragging ? "opacity-100" : "opacity-70"
          )}
          style={{
            right: pipPosition.x,
            bottom: pipPosition.y + 96, // Account for control bar
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
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
              <Avatar className="h-12 w-12 md:h-14 md:w-14">
                <AvatarImage src={currentUserAvatar} />
                <AvatarFallback className="text-lg bg-primary/20 text-primary">
                  {currentUserName?.[0] || 'Y'}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
          
          {/* Status indicators */}
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
            <span className="px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white">You</span>
            {isMuted && (
              <div className="p-1 bg-red-500 rounded-full">
                <MicOff className="h-2.5 w-2.5 text-white" />
              </div>
            )}
            {!isVideoOn && (
              <div className="p-1 bg-red-500 rounded-full">
                <VideoOff className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Call Controls - Fixed above everything including BottomNavbar */}
      <div className={cn(
        "h-24 md:h-24 flex items-center justify-center gap-3 md:gap-4 px-4 pb-6 md:pb-4 bg-gradient-to-t from-black via-black/90 to-black/60 backdrop-blur transition-opacity duration-300 safe-area-inset-bottom",
        showControls ? "opacity-100" : "opacity-0"
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isMuted ? "destructive" : "secondary"}
              size="icon"
              className="rounded-full h-12 w-12 md:h-14 md:w-14"
              onClick={onToggleMute}
            >
              {isMuted ? <MicOff className="h-5 w-5 md:h-6 md:w-6" /> : <Mic className="h-5 w-5 md:h-6 md:w-6" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isMuted ? 'Unmute' : 'Mute'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={!isVideoOn ? "destructive" : "secondary"}
              size="icon"
              className="rounded-full h-12 w-12 md:h-14 md:w-14"
              onClick={onToggleVideo}
            >
              {isVideoOn ? <Video className="h-5 w-5 md:h-6 md:w-6" /> : <VideoOff className="h-5 w-5 md:h-6 md:w-6" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isVideoOn ? 'Turn off camera' : 'Turn on camera'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isScreenSharing ? "default" : "secondary"}
              size="icon"
              className="rounded-full h-12 w-12 md:h-14 md:w-14 hidden md:flex"
              onClick={onToggleScreenShare}
            >
              <Monitor className="h-5 w-5 md:h-6 md:w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isScreenSharing ? 'Stop sharing' : 'Share screen'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isHandRaised ? "default" : "secondary"}
              size="icon"
              className="rounded-full h-12 w-12 md:h-14 md:w-14"
              onClick={onToggleHandRaise}
            >
              <Hand className="h-5 w-5 md:h-6 md:w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isHandRaised ? 'Lower hand' : 'Raise hand'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full h-12 w-12 md:h-14 md:w-14 hidden md:flex"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5 md:h-6 md:w-6" /> : <Maximize2 className="h-5 w-5 md:h-6 md:w-6" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="rounded-full h-14 w-14 md:h-16 md:w-16 ml-2"
              onClick={onEndCall}
            >
              <PhoneOff className="h-6 w-6 md:h-7 md:w-7" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>End call</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
