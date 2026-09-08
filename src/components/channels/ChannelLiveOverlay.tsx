import { useEffect, useRef } from 'react';
import { Mic, MicOff, Monitor, PhoneOff, Radio, Video, VideoOff, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LiveParticipant {
  id: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isVideoOn: boolean;
}

interface ChannelLiveOverlayProps {
  channelName: string;
  localStream: MediaStream | null;
  participants: LiveParticipant[];
  isBroadcaster: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  error?: string | null;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
}

function StreamVideo({ stream, muted = false, className }: { stream: MediaStream; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);

  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function StreamAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);

  return <audio ref={ref} autoPlay />;
}

export function ChannelLiveOverlay({
  channelName,
  localStream,
  participants,
  isBroadcaster,
  isConnected,
  isReconnecting,
  isMuted,
  isVideoOn,
  isScreenSharing,
  error,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onLeave,
}: ChannelLiveOverlayProps) {
  const remoteWithMedia = participants.filter((participant) => participant.stream);
  const primaryRemote = remoteWithMedia[0];
  const displayStream = isBroadcaster ? localStream : primaryRemote?.stream ?? null;
  const shouldShowVideo = isBroadcaster ? isVideoOn || isScreenSharing : primaryRemote?.isVideoOn !== false;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-neutral-950 text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-400">
          <Radio className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-semibold">{channelName}</h2>
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">LIVE</span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-white/60">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {isBroadcaster ? participants.length : Math.max(1, participants.length)}
            </span>
            <span>
              {isReconnecting
                ? 'Qayta ulanmoqda…'
                : isConnected
                  ? 'Jonli aloqa ulandi'
                  : isBroadcaster
                    ? 'Tomoshabin kutilmoqda…'
                    : 'Jonli efirga ulanmoqda…'}
            </span>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={onLeave} className="gap-2">
          <PhoneOff className="h-4 w-4" />
          {isBroadcaster ? 'Efirni tugatish' : 'Chiqish'}
        </Button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        {displayStream ? (
          shouldShowVideo ? (
            <StreamVideo
              stream={displayStream}
              muted={isBroadcaster}
              className="h-full w-full object-contain"
            />
          ) : (
            <>
              {!isBroadcaster && <StreamAudio stream={displayStream} />}
              <div className="flex flex-col items-center gap-3 text-white/70">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10">
                  <Radio className="h-10 w-10" />
                </div>
                <p className="text-sm">Audio jonli efir</p>
              </div>
            </>
          )
        ) : (
          <div className="flex flex-col items-center gap-4 text-center text-white/65">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10">
              <Radio className="h-10 w-10 animate-pulse" />
            </div>
            <div>
              <p className="font-medium text-white">{isBroadcaster ? 'Jonli efir boshlandi' : 'Stream kutilmoqda'}</p>
              <p className="mt-1 text-sm">{isBroadcaster ? 'Tomoshabinlar kirishi bilan real media ulanadi.' : 'Broadcaster media yo‘li ochilmoqda.'}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-2 text-sm text-red-100 backdrop-blur">
            {error}
          </div>
        )}
      </div>

      {isBroadcaster && (
        <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-neutral-950/95 px-4 py-4">
          <button
            type="button"
            onClick={onToggleMute}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full transition',
              isMuted ? 'bg-red-500 text-white' : 'bg-white/10 hover:bg-white/20'
            )}
            aria-label={isMuted ? 'Mikrofonni yoqish' : 'Mikrofonni o‘chirish'}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={onToggleVideo}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full transition',
              !isVideoOn ? 'bg-red-500 text-white' : 'bg-white/10 hover:bg-white/20'
            )}
            aria-label={isVideoOn ? 'Kamerani o‘chirish' : 'Kamerani yoqish'}
          >
            {isVideoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={onToggleScreenShare}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full transition',
              isScreenSharing ? 'bg-white text-neutral-950' : 'bg-white/10 hover:bg-white/20'
            )}
            aria-label="Ekran ulashish"
          >
            <Monitor className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
