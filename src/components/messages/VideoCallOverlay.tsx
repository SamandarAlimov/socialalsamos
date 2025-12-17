import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor, 
  Hand,
  PhoneOff,
  MoreVertical,
  Users,
  MessageSquare,
  Settings,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  const [activeView, setActiveView] = useState<'grid' | 'speaker'>('grid');
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const totalParticipants = participants.length + 1; // +1 for local user

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const getGridLayout = () => {
    if (totalParticipants === 1) return 'grid-cols-1';
    if (totalParticipants === 2) return 'grid-cols-2';
    if (totalParticipants <= 4) return 'grid-cols-2';
    if (totalParticipants <= 9) return 'grid-cols-3';
    return 'grid-cols-4';
  };

  return (
    <div 
      className="fixed inset-0 bg-black/95 z-50 flex flex-col"
      onMouseMove={handleMouseMove}
    >
      {/* Video Grid */}
      <div className="flex-1 relative p-4">
        <div className={cn("grid gap-4 h-full", getGridLayout())}>
          {/* Remote participants */}
          {participants.map((participant) => (
            <div 
              key={participant.id} 
              className="relative bg-gray-800 rounded-2xl overflow-hidden aspect-video"
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
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={participant.avatarUrl} />
                    <AvatarFallback className="text-3xl bg-primary">
                      {participant.name?.[0] || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              
              {/* Participant info overlay */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-full backdrop-blur">
                  <span className="text-sm text-white font-medium">
                    {participant.name || 'Participant'}
                  </span>
                  {participant.isMuted && <MicOff className="h-4 w-4 text-red-400" />}
                </div>
                {participant.isHandRaised && (
                  <div className="px-3 py-1.5 bg-yellow-500/80 rounded-full">
                    <Hand className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Local video (if no participants, show full, otherwise PIP) */}
          {participants.length === 0 ? (
            <div className="relative bg-gray-800 rounded-2xl overflow-hidden">
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
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={currentUserAvatar} />
                    <AvatarFallback className="text-3xl bg-primary">
                      {currentUserName?.[0] || 'Y'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              <div className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-full backdrop-blur">
                <span className="text-sm text-white font-medium">You</span>
                {isMuted && <MicOff className="h-4 w-4 text-red-400" />}
              </div>
            </div>
          ) : null}
        </div>

        {/* Picture-in-Picture Local Video */}
        {participants.length > 0 && (
          <div className="absolute bottom-24 right-6 w-48 aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-2xl border border-white/10">
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
                <Avatar className="h-12 w-12">
                  <AvatarImage src={currentUserAvatar} />
                  <AvatarFallback className="text-lg bg-primary">
                    {currentUserName?.[0] || 'Y'}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            <div className="absolute bottom-2 left-2 flex items-center gap-1">
              {isMuted && (
                <div className="p-1 bg-red-500 rounded-full">
                  <MicOff className="h-3 w-3 text-white" />
                </div>
              )}
              {!isVideoOn && (
                <div className="p-1 bg-red-500 rounded-full">
                  <VideoOff className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Call Controls */}
      <div className={cn(
        "h-24 flex items-center justify-center gap-4 bg-black/80 backdrop-blur transition-opacity duration-300",
        showControls ? "opacity-100" : "opacity-0"
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isMuted ? "destructive" : "secondary"}
              size="icon"
              className="rounded-full h-14 w-14"
              onClick={onToggleMute}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isMuted ? 'Unmute' : 'Mute'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={!isVideoOn ? "destructive" : "secondary"}
              size="icon"
              className="rounded-full h-14 w-14"
              onClick={onToggleVideo}
            >
              {isVideoOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isVideoOn ? 'Turn off camera' : 'Turn on camera'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isScreenSharing ? "default" : "secondary"}
              size="icon"
              className="rounded-full h-14 w-14"
              onClick={onToggleScreenShare}
            >
              <Monitor className="h-6 w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isScreenSharing ? 'Stop sharing' : 'Share screen'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isHandRaised ? "default" : "secondary"}
              size="icon"
              className="rounded-full h-14 w-14"
              onClick={onToggleHandRaise}
            >
              <Hand className="h-6 w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isHandRaised ? 'Lower hand' : 'Raise hand'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full h-14 w-14"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize2 className="h-6 w-6" /> : <Maximize2 className="h-6 w-6" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="rounded-full h-16 w-16"
              onClick={onEndCall}
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>End call</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
