import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  CameraOff,
  Clock,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Radio,
  ShieldAlert,
  SwitchCamera,
  Users,
  Video as VideoIcon,
  Wifi,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreateListRow } from '@/components/create/CreateListRow';
import { useAuth } from '@/contexts/AuthContext';
import {
  useLiveStreamComments,
  useLiveStreamReactions,
  useLiveStreamViewer,
} from '@/hooks/useLiveStream';
import { useLiveStreamBroadcaster } from '@/hooks/useLiveStreamWebRTC';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const MAX_TITLE_LENGTH = 120;

interface LiveStreamBroadcastProps {
  onClose: () => void;
  initialTitle?: string;
}

interface LiveStream {
  id: string;
  user_id: string;
  title: string | null;
  status: 'live' | 'ended';
  viewer_count: number;
  peak_viewers: number;
  started_at: string;
  ended_at: string | null;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function setTracksEnabled(
  stream: MediaStream | null,
  kind: 'audio' | 'video',
  enabled: boolean,
) {
  stream
    ?.getTracks()
    .filter((track) => track.kind === kind)
    .forEach((track) => {
      track.enabled = enabled;
    });
}

/**
 * Live creator surface.
 *
 * Setup stays inside Create. Once the broadcast starts, the live surface moves
 * to a viewport portal. Media changes are synchronized through RTCRtpSender
 * replacement, so connected viewers are not dropped when the broadcaster flips
 * the camera or starts/stops screen sharing.
 */
export function LiveStreamBroadcast({
  onClose,
  initialTitle,
}: LiveStreamBroadcastProps) {
  const { user, profile } = useAuth();

  const [title, setTitle] = useState(initialTitle || '');
  const [isLive, setIsLive] = useState(false);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showComments, setShowComments] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenReturnInProgressRef = useRef(false);

  const {
    isConnected: isWebRTCConnected,
    viewerCount: webrtcViewerCount,
    connect: connectWebRTC,
    syncStream: syncWebRTCStream,
    disconnect: disconnectWebRTC,
  } = useLiveStreamBroadcaster(stream?.id || null);

  const { comments } = useLiveStreamComments(stream?.id || null);
  const { reactions } = useLiveStreamReactions(stream?.id || null);
  const { viewerCount: dbViewerCount } = useLiveStreamViewer(stream?.id || null);
  const viewerCount = isWebRTCConnected ? webrtcViewerCount : dbViewerCount;

  const attachPreview = useCallback((nextStream: MediaStream | null) => {
    if (videoRef.current) {
      videoRef.current.srcObject = nextStream;
    }
  }, []);

  const publishLocalStream = useCallback(
    async (nextStream: MediaStream) => {
      localStreamRef.current = nextStream;
      attachPreview(nextStream);

      if (isLive && stream?.id) {
        await syncWebRTCStream(nextStream);
      }
    },
    [attachPreview, isLive, stream?.id, syncWebRTCStream],
  );

  const acquireCamera = useCallback(
    async (targetFacing: 'user' | 'environment') => {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: targetFacing,
          width: { max: 1280, min: 320 },
          height: { max: 720, min: 240 },
          frameRate: { max: 30, ideal: 24 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        return navigator.mediaDevices.getUserMedia({
          video: { facingMode: targetFacing },
          audio: true,
        });
      }
    },
    [],
  );

  const initializeCamera = useCallback(
    async (nextFacingMode?: 'user' | 'environment') => {
      const targetFacing = nextFacingMode ?? facingMode;
      setIsInitializing(true);
      setMediaError(null);

      // Mobile browsers frequently refuse a second camera while the previous
      // camera track is still active. Release it before requesting the other
      // facing mode. Screen sharing is handled separately and never calls this.
      stopStream(cameraStreamRef.current);
      cameraStreamRef.current = null;

      try {
        const cameraStream = await acquireCamera(targetFacing);
        setTracksEnabled(cameraStream, 'audio', !isMuted);
        setTracksEnabled(cameraStream, 'video', isCameraOn);

        cameraStreamRef.current = cameraStream;
        await publishLocalStream(cameraStream);

        setIsScreenSharing(false);
        setCameraReady(true);
        setIsInitializing(false);
        return true;
      } catch (error) {
        const name = (error as { name?: string })?.name;
        setMediaError(
          name === 'NotAllowedError'
            ? 'Brauzer kameraga ruxsat bermadi. Manzil satridagi qulf belgisidan ruxsatni yoqing.'
            : name === 'NotFoundError'
              ? 'Qurilmada kamera yoki mikrofon topilmadi.'
              : 'Kamerani ishga tushirib bo‘lmadi. Boshqa ilova uni band qilmaganini tekshiring.',
        );
        setCameraReady(false);
        setIsInitializing(false);
        return false;
      }
    },
    [
      acquireCamera,
      facingMode,
      isCameraOn,
      isMuted,
      publishLocalStream,
    ],
  );

  const returnToCameraFromScreen = useCallback(async () => {
    if (screenReturnInProgressRef.current) return;
    screenReturnInProgressRef.current = true;

    try {
      const cameraStream = cameraStreamRef.current;
      if (!cameraStream) {
        setIsScreenSharing(false);
        await initializeCamera(facingMode);
        return;
      }

      setTracksEnabled(cameraStream, 'audio', !isMuted);
      setTracksEnabled(cameraStream, 'video', isCameraOn);
      await publishLocalStream(cameraStream);

      stopStream(screenStreamRef.current);
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      setCameraReady(true);
    } finally {
      screenReturnInProgressRef.current = false;
    }
  }, [
    facingMode,
    initializeCamera,
    isCameraOn,
    isMuted,
    publishLocalStream,
  ]);

  useEffect(() => {
    return () => {
      disconnectWebRTC();
      stopStream(screenStreamRef.current);
      stopStream(cameraStreamRef.current);
      if (
        localStreamRef.current &&
        localStreamRef.current !== cameraStreamRef.current &&
        localStreamRef.current !== screenStreamRef.current
      ) {
        stopStream(localStreamRef.current);
      }
    };
  }, [disconnectWebRTC]);

  useEffect(() => {
    attachPreview(localStreamRef.current);
  }, [attachPreview, cameraReady, isLive]);

  useEffect(() => {
    if (commentsRef.current) {
      commentsRef.current.scrollTop = commentsRef.current.scrollHeight;
    }
  }, [comments]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      stopStream(screenStreamRef.current);
      stopStream(cameraStreamRef.current);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleStartLive = async () => {
    if (!user) {
      toast.error('Jonli efir uchun tizimga kiring');
      return;
    }
    if (!localStreamRef.current) {
      toast.error('Avval kamerani yoqing');
      return;
    }

    setIsStarting(true);
    try {
      await supabase
        .from('live_streams')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('status', 'live');

      const { data, error } = await supabase
        .from('live_streams')
        .insert({
          user_id: user.id,
          title: title.trim() || 'Live Stream',
          status: 'live',
        })
        .select()
        .single();

      if (error) throw error;
      setStream(data as LiveStream);
      setIsLive(true);
      toast.success('Jonli efir boshlandi');
    } catch (error) {
      const message = (error as { message?: string })?.message;
      console.error('Error starting broadcast:', error);
      toast.error(message || 'Efirni boshlab bo‘lmadi');
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (stream && isLive && localStreamRef.current && !isWebRTCConnected) {
      void connectWebRTC(localStreamRef.current);
    }
  }, [connectWebRTC, isLive, isWebRTCConnected, stream]);

  const stopLocalMedia = useCallback(() => {
    stopStream(screenStreamRef.current);
    stopStream(cameraStreamRef.current);
    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    localStreamRef.current = null;
    attachPreview(null);
    setCameraReady(false);
    setIsScreenSharing(false);
  }, [attachPreview]);

  const handleEndLive = async () => {
    try {
      disconnectWebRTC();
      stopLocalMedia();

      if (stream) {
        await supabase
          .from('live_streams')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', stream.id);
      }
      if (user) {
        await supabase
          .from('live_streams')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('status', 'live');
      }

      toast.success('Jonli efir yakunlandi');
      onClose();
    } catch (error) {
      console.error('Error ending broadcast:', error);
      onClose();
    }
  };

  const handleClose = () => {
    if (isLive && stream) {
      void handleEndLive();
      return;
    }
    disconnectWebRTC();
    stopLocalMedia();
    onClose();
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    setTracksEnabled(cameraStreamRef.current, 'audio', !nextMuted);
    if (localStreamRef.current !== cameraStreamRef.current) {
      setTracksEnabled(localStreamRef.current, 'audio', !nextMuted);
    }
  };

  const toggleCamera = () => {
    const nextCameraOn = !isCameraOn;
    setIsCameraOn(nextCameraOn);
    setTracksEnabled(cameraStreamRef.current, 'video', nextCameraOn);
    if (!isScreenSharing) {
      setTracksEnabled(localStreamRef.current, 'video', nextCameraOn);
    }
  };

  const switchCamera = async () => {
    if (isScreenSharing || isInitializing) return;

    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacingMode);
    const ok = await initializeCamera(nextFacingMode);
    if (!ok) toast.error('Kamerani almashtirib bo‘lmadi');
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await returnToCameraFromScreen();
      toast.success('Kameraga qaytildi');
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      const screenVideo = screenStream.getVideoTracks()[0];
      if (!screenVideo) {
        stopStream(screenStream);
        return;
      }

      screenStreamRef.current = screenStream;
      const cameraAudio = cameraStreamRef.current?.getAudioTracks() ?? [];
      const combinedStream = new MediaStream([screenVideo, ...cameraAudio]);
      setTracksEnabled(combinedStream, 'audio', !isMuted);

      await publishLocalStream(combinedStream);
      setIsScreenSharing(true);
      setCameraReady(true);

      screenVideo.onended = () => {
        void returnToCameraFromScreen();
      };

      toast.success('Ekran ulashish boshlandi');
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name !== 'NotAllowedError') {
        toast.error('Ekranni ulashib bo‘lmadi');
      }
    }
  };

  const canGoLive = cameraReady && !isInitializing && !isStarting;

  const setupContent = (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-border/60 bg-black">
          {cameraReady ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  'absolute inset-0 h-full w-full object-cover',
                  facingMode === 'user' && !isScreenSharing && 'mirror',
                )}
              />

              {!isCameraOn && !isScreenSharing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 text-white/70">
                  <CameraOff className="h-8 w-8" />
                  <span className="text-sm">Kamera o‘chirilgan</span>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-4">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Mikrofonni yoqish' : 'Mikrofonni o‘chirish'}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full text-white backdrop-blur transition',
                    isMuted
                      ? 'bg-destructive/85'
                      : 'bg-white/15 hover:bg-white/25',
                  )}
                >
                  {isMuted ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleCamera}
                  disabled={isScreenSharing}
                  aria-label={
                    isCameraOn ? 'Kamerani o‘chirish' : 'Kamerani yoqish'
                  }
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full text-white backdrop-blur transition disabled:opacity-40',
                    isCameraOn
                      ? 'bg-white/15 hover:bg-white/25'
                      : 'bg-destructive/85',
                  )}
                >
                  {isCameraOn ? (
                    <Camera className="h-5 w-5" />
                  ) : (
                    <CameraOff className="h-5 w-5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void switchCamera()}
                  disabled={isScreenSharing || isInitializing}
                  aria-label="Kamerani almashtirish"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-40"
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              {mediaError ? (
                <>
                  <ShieldAlert className="h-9 w-9 text-destructive" />
                  <p className="max-w-sm text-sm text-white/80">{mediaError}</p>
                  <Button
                    variant="secondary"
                    onClick={() => void initializeCamera()}
                    disabled={isInitializing}
                  >
                    Qayta urinish
                  </Button>
                </>
              ) : (
                <>
                  <VideoIcon className="h-9 w-9 text-white/50" />
                  <p className="max-w-sm text-sm text-white/70">
                    Kamera hozircha o‘chiq. Ko‘rinishni tekshirish uchun uni
                    yoqing — efir hali boshlanmaydi.
                  </p>
                  <Button
                    onClick={() => void initializeCamera()}
                    disabled={isInitializing}
                  >
                    {isInitializing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="mr-2 h-4 w-4" />
                    )}
                    Kamerani yoqish
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback>{profile?.display_name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {profile?.display_name || profile?.username}
              </p>
              <p className="text-xs text-muted-foreground">
                Jonli efir sozlamalari
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="live-title"
              className="mb-1.5 block text-sm font-medium"
            >
              Efir nomi
            </label>
            <Input
              id="live-title"
              value={title}
              onChange={(event) =>
                setTitle(event.target.value.slice(0, MAX_TITLE_LENGTH))
              }
              placeholder="Nima haqida gaplashasiz?"
              className="h-11"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {title.length}/{MAX_TITLE_LENGTH}
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60">
            <CreateListRow
              icon={isCameraOn ? Camera : CameraOff}
              label="Kamera"
              value={
                cameraReady
                  ? isScreenSharing
                    ? 'Ekran ulashilmoqda'
                    : isCameraOn
                      ? 'Yoniq'
                      : 'O‘chiq'
                  : 'Ulanmagan'
              }
              active={cameraReady && isCameraOn && !isScreenSharing}
              disabled={!cameraReady || isScreenSharing}
              onClick={toggleCamera}
            />
            <CreateListRow
              icon={isMuted ? MicOff : Mic}
              label="Mikrofon"
              value={cameraReady ? (isMuted ? 'O‘chiq' : 'Yoniq') : 'Ulanmagan'}
              active={cameraReady && !isMuted}
              disabled={!cameraReady}
              onClick={toggleMute}
            />
            <CreateListRow
              icon={isScreenSharing ? MonitorOff : Monitor}
              label="Ekranni ulashish"
              value={isScreenSharing ? 'Yoniq' : 'O‘chiq'}
              active={isScreenSharing}
              disabled={!cameraReady}
              onClick={() => void toggleScreenShare()}
            />
          </div>

          <Button
            onClick={() => void handleStartLive()}
            disabled={!canGoLive}
            className="h-12 w-full rounded-xl bg-destructive font-semibold text-white hover:bg-destructive/90"
          >
            {isStarting ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Radio className="mr-2 h-5 w-5" />
            )}
            Jonli efirni boshlash
          </Button>

          <p className="text-xs text-muted-foreground">
            {cameraReady
              ? 'Tugma bosilgach obunachilaringizga bildirishnoma boradi va efir darhol boshlanadi.'
              : 'Efirni boshlash uchun avval kamerani yoqing.'}
          </p>

          <Button variant="ghost" onClick={handleClose} className="h-10">
            Bekor qilish
          </Button>
        </aside>
      </div>
    </div>
  );

  const liveContent = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black"
      style={{ height: '100dvh' }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          'absolute inset-0 h-full w-full object-cover',
          facingMode === 'user' && !isScreenSharing && 'mirror',
        )}
      />

      {!isCameraOn && !isScreenSharing && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-black">
          <CameraOff className="h-10 w-10 text-white/45" />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/60 via-transparent to-black/80" />

      <div className="safe-area-top relative z-10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-destructive">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback>{profile?.display_name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {profile?.display_name || profile?.username}
                </span>
                <span className="animate-pulse rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">
                  LIVE
                </span>
                {isWebRTCConnected && (
                  <span className="flex items-center gap-1 rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">
                    <Wifi className="h-3 w-3" />
                    Ulandi
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-white/70">
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{viewerCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    {stream?.started_at &&
                      formatDistanceToNow(new Date(stream.started_at))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Button
            onClick={() => void handleEndLive()}
            variant="destructive"
            size="sm"
          >
            Tugatish
          </Button>
        </div>

        {title && <p className="mt-2 truncate text-sm text-white">{title}</p>}
      </div>

      <div className="pointer-events-none absolute bottom-40 right-4 z-10">
        {reactions.map((reaction) => (
          <div
            key={reaction.id}
            className="absolute bottom-0 right-0 animate-float-up text-3xl"
            style={{ right: `${Math.random() * 40}px` }}
          >
            {reaction.emoji}
          </div>
        ))}
      </div>

      {showComments && (
        <div className="pointer-events-none absolute bottom-24 left-0 right-20 z-10 h-48">
          <div
            ref={commentsRef}
            className="scrollbar-hide h-full overflow-y-auto px-4"
          >
            <div className="flex min-h-full flex-col justify-end">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="mb-2 flex animate-fade-in items-start gap-2"
                >
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarImage src={comment.profile?.avatar_url || ''} />
                    <AvatarFallback className="text-[10px]">
                      {comment.profile?.display_name?.[0] || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="max-w-[80%] rounded-lg bg-black/40 px-2 py-1">
                    <span className="text-xs font-medium text-white/70">
                      {comment.profile?.display_name || comment.profile?.username}
                    </span>
                    <p className="text-sm text-white">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="safe-area-bottom absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-4 p-4">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? 'Mikrofonni yoqish' : 'Mikrofonni o‘chirish'}
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full',
            isMuted ? 'bg-destructive' : 'bg-white/20',
          )}
        >
          {isMuted ? (
            <MicOff className="h-6 w-6 text-white" />
          ) : (
            <Mic className="h-6 w-6 text-white" />
          )}
        </button>

        <button
          type="button"
          onClick={toggleCamera}
          disabled={isScreenSharing}
          aria-label={isCameraOn ? 'Kamerani o‘chirish' : 'Kamerani yoqish'}
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-40',
            !isCameraOn ? 'bg-destructive' : 'bg-white/20',
          )}
        >
          {isCameraOn ? (
            <Camera className="h-6 w-6 text-white" />
          ) : (
            <CameraOff className="h-6 w-6 text-white" />
          )}
        </button>

        <button
          type="button"
          onClick={() => void switchCamera()}
          disabled={isScreenSharing || isInitializing}
          aria-label="Kamerani almashtirish"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 disabled:opacity-40"
        >
          <SwitchCamera className="h-6 w-6 text-white" />
        </button>

        <button
          type="button"
          onClick={() => void toggleScreenShare()}
          aria-label={
            isScreenSharing ? 'Ekran ulashishni to‘xtatish' : 'Ekranni ulashish'
          }
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full',
            isScreenSharing ? 'bg-primary' : 'bg-white/20',
          )}
        >
          {isScreenSharing ? (
            <MonitorOff className="h-6 w-6 text-white" />
          ) : (
            <Monitor className="h-6 w-6 text-white" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowComments((current) => !current)}
          aria-label="Izohlarni ko‘rsatish"
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full',
            showComments ? 'bg-white/20' : 'bg-white/10',
          )}
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </button>
      </div>

      <button
        type="button"
        onClick={handleClose}
        aria-label="Yopish"
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
      >
        <X className="h-5 w-5" />
      </button>

      <style>{`
        @keyframes float-up {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-200px) scale(1.5); }
        }
        .animate-float-up { animation: float-up 3s ease-out forwards; }
      `}</style>
    </div>
  );

  return isLive ? createPortal(liveContent, document.body) : setupContent;
}
