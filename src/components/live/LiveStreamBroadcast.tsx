import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  SwitchCamera,
  Users,
  Clock,
  Radio,
  MessageCircle,
  Loader2,
  Wifi,
  Monitor,
  MonitorOff,
  ShieldAlert,
  Video as VideoIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CreateListRow } from '@/components/create/CreateListRow';
import { useLiveStreamComments, useLiveStreamReactions, useLiveStreamViewer } from '@/hooks/useLiveStream';
import { useLiveStreamBroadcaster } from '@/hooks/useLiveStreamWebRTC';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

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

/**
 * Jonli efir.
 *
 * Ikki bosqich bor:
 *  1. Sozlash — sahifa ichidagi panel. Kamera bu yerda avtomatik yonmaydi,
 *     chunki tabni bosish hali "efirga chiqaman" degani emas. Instagram va
 *     YouTube Studio ham avval sozlamani so'raydi.
 *  2. Efir — butun ekranni egallagan qatlam. Bu bosqichda ekranni to'liq
 *     egallash o'rinli.
 */
export function LiveStreamBroadcast({ onClose, initialTitle }: LiveStreamBroadcastProps) {
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
  /** Kamera oqimi tayyor — faqat foydalanuvchi so'ragandan keyin true bo'ladi. */
  const [cameraReady, setCameraReady] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // WebRTC broadcaster hook
  const {
    isConnected: isWebRTCConnected,
    viewerCount: webrtcViewerCount,
    connect: connectWebRTC,
    disconnect: disconnectWebRTC,
  } = useLiveStreamBroadcaster(stream?.id || null);

  const { comments } = useLiveStreamComments(stream?.id || null);
  const { reactions } = useLiveStreamReactions(stream?.id || null);
  const { viewerCount: dbViewerCount } = useLiveStreamViewer(stream?.id || null);

  // Use WebRTC viewer count if connected, otherwise DB count
  const viewerCount = isWebRTCConnected ? webrtcViewerCount : dbViewerCount;

  /**
   * Kamerani ishga tushiradi. Mount paytida emas, faqat foydalanuvchi
   * "Kamerani yoqish" tugmasini bosganda chaqiriladi.
   */
  const initializeCamera = useCallback(async (nextFacingMode?: 'user' | 'environment') => {
    const targetFacing = nextFacingMode ?? facingMode;

    try {
      setIsInitializing(true);
      setMediaError(null);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Mobile-compatible video constraints. 'max' behaves better than 'ideal'
      // on some Android devices, which reject the request outright.
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

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      localStreamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      setIsCameraOn(true);
      setIsMuted(false);
      setCameraReady(true);
      setIsInitializing(false);
      return true;
    } catch (error) {
      // Eski qurilmalar uchun soddalashtirilgan cheklovlar bilan yana bir urinish.
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: targetFacing },
          audio: true,
        });

        localStreamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
        }

        setIsCameraOn(true);
        setIsMuted(false);
        setCameraReady(true);
        setIsInitializing(false);
        return true;
      } catch (fallbackError) {
        const name = (fallbackError as { name?: string })?.name;

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
    }
  }, [facingMode]);

  /** Sahifadan chiqilganda kamera albatta o'chirilishi kerak. */
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Bosqich almashganda video elementi yangidan ulanadi.
  useEffect(() => {
    if (videoRef.current && localStreamRef.current) {
      videoRef.current.srcObject = localStreamRef.current;
    }
  }, [isLive, cameraReady]);

  // Auto-scroll comments
  useEffect(() => {
    if (commentsRef.current) {
      commentsRef.current.scrollTop = commentsRef.current.scrollHeight;
    }
  }, [comments]);

  // Cleanup on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (stream && isLive) {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
        }

        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/live_streams?id=eq.${stream.id}`;
        const headers = {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          Prefer: 'return=minimal',
        };
        void headers;

        const body = JSON.stringify({ status: 'ended', ended_at: new Date().toISOString() });
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon && navigator.sendBeacon(url, blob);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [stream, isLive]);

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
      // First end any existing live streams
      await supabase
        .from('live_streams')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
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

  // Connect WebRTC when stream is created
  useEffect(() => {
    if (stream && isLive && localStreamRef.current && !isWebRTCConnected) {
      connectWebRTC(localStreamRef.current);
    }
  }, [stream, isLive, isWebRTCConnected, connectWebRTC]);

  const stopLocalMedia = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    setCameraReady(false);
  };

  const handleEndLive = async () => {
    try {
      disconnectWebRTC();
      stopLocalMedia();

      if (stream) {
        await supabase
          .from('live_streams')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
          })
          .eq('id', stream.id);
      }

      if (user) {
        await supabase
          .from('live_streams')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
          })
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

    stopLocalMedia();
    onClose();
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;

    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = isMuted;
    });
    setIsMuted(!isMuted);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;

    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = !isCameraOn;
    });
    setIsCameraOn(!isCameraOn);
  };

  const switchCamera = async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);

    const ok = await initializeCamera(newFacingMode);
    if (!ok) {
      toast.error('Kamerani almashtirib bo‘lmadi');
      return;
    }

    if (isMuted && localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((track) => track.stop());
          screenStreamRef.current = null;
        }

        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { max: 1280, min: 320 },
            height: { max: 720, min: 240 },
          },
          audio: true,
        });

        localStreamRef.current = cameraStream;

        if (videoRef.current) {
          videoRef.current.srcObject = cameraStream;
        }

        if (isMuted) {
          cameraStream.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
        }

        setIsScreenSharing(false);
        toast.success('Kameraga qaytildi');
      } else {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });

        screenStreamRef.current = screenStream;

        // Ovoz kameradan olinadi, tasvir esa ekrandan.
        const audioTracks = localStreamRef.current?.getAudioTracks() || [];

        const combinedStream = new MediaStream([
          ...screenStream.getVideoTracks(),
          ...audioTracks,
        ]);

        localStreamRef.current = combinedStream;

        if (videoRef.current) {
          videoRef.current.srcObject = combinedStream;
        }

        // Foydalanuvchi brauzer paneli orqali to'xtatsa ham holat yangilansin.
        screenStream.getVideoTracks()[0].onended = () => {
          void toggleScreenShare();
        };

        setIsScreenSharing(true);
        setCameraReady(true);
        toast.success('Ekran ulashish boshlandi');
      }
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name !== 'NotAllowedError') {
        toast.error('Ekranni ulashib bo‘lmadi');
      }
    }
  };

  const canGoLive = cameraReady && !isInitializing && !isStarting;

  /**
   * Sozlash bosqichi — sahifa ichida, chunki bu hali efir emas.
   * Chapda ko'rinish, o'ngda sozlamalar.
   */
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

              {!isCameraOn && (
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
                    isMuted ? 'bg-destructive/85' : 'bg-white/15 hover:bg-white/25',
                  )}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>

                <button
                  type="button"
                  onClick={toggleCamera}
                  aria-label={isCameraOn ? 'Kamerani o‘chirish' : 'Kamerani yoqish'}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full text-white backdrop-blur transition',
                    isCameraOn ? 'bg-white/15 hover:bg-white/25' : 'bg-destructive/85',
                  )}
                >
                  {isCameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
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
                    Kamera hozircha o‘chiq. Ko‘rinishni tekshirish uchun uni yoqing —
                    efir hali boshlanmaydi.
                  </p>
                  <Button onClick={() => void initializeCamera()} disabled={isInitializing}>
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
              <p className="text-xs text-muted-foreground">Jonli efir sozlamalari</p>
            </div>
          </div>

          <div>
            <label htmlFor="live-title" className="mb-1.5 block text-sm font-medium">
              Efir nomi
            </label>
            <Input
              id="live-title"
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, MAX_TITLE_LENGTH))}
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
              value={cameraReady ? (isCameraOn ? 'Yoniq' : 'O‘chiq') : 'Ulanmagan'}
              active={cameraReady && isCameraOn}
              disabled={!cameraReady}
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

  // Efir bosqichi — butun ekran.
  const liveContent = (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ height: '100dvh' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          'absolute inset-0 w-full h-full object-cover',
          facingMode === 'user' && !isScreenSharing && 'mirror',
        )}
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

      <div className="relative z-10 p-4 safe-area-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-destructive">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback>{profile?.display_name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-sm">
                  {profile?.display_name || profile?.username}
                </span>
                <span className="bg-destructive text-white text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse">
                  LIVE
                </span>
                {isWebRTCConnected && (
                  <span className="bg-success/20 text-success text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Wifi className="h-3 w-3" />
                    Ulandi
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-white/70 text-xs">
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{viewerCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    {stream?.started_at && formatDistanceToNow(new Date(stream.started_at))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Button onClick={() => void handleEndLive()} variant="destructive" size="sm">
            Tugatish
          </Button>
        </div>

        {title && <p className="text-white text-sm mt-2 truncate">{title}</p>}
      </div>

      <div className="absolute right-4 bottom-40 pointer-events-none">
        {reactions.map((reaction) => (
          <div
            key={reaction.id}
            className="absolute bottom-0 right-0 text-3xl animate-float-up"
            style={{ right: `${Math.random() * 40}px` }}
          >
            {reaction.emoji}
          </div>
        ))}
      </div>

      {showComments && (
        <div className="absolute left-0 right-20 bottom-24 h-48 pointer-events-none">
          <div ref={commentsRef} className="h-full overflow-y-auto px-4 scrollbar-hide">
            <div className="flex flex-col justify-end min-h-full">
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start gap-2 mb-2 animate-fade-in">
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarImage src={comment.profile?.avatar_url || ''} />
                    <AvatarFallback className="text-[10px]">
                      {comment.profile?.display_name?.[0] || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-black/40 rounded-lg px-2 py-1 max-w-[80%]">
                    <span className="text-white/70 text-xs font-medium">
                      {comment.profile?.display_name || comment.profile?.username}
                    </span>
                    <p className="text-white text-sm">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-4 safe-area-bottom flex items-center justify-center gap-4">
        <button
          onClick={toggleMute}
          aria-label={isMuted ? 'Mikrofonni yoqish' : 'Mikrofonni o‘chirish'}
          className={cn(
            'h-12 w-12 rounded-full flex items-center justify-center',
            isMuted ? 'bg-destructive' : 'bg-white/20',
          )}
        >
          {isMuted ? <MicOff className="h-6 w-6 text-white" /> : <Mic className="h-6 w-6 text-white" />}
        </button>

        <button
          onClick={toggleCamera}
          aria-label={isCameraOn ? 'Kamerani o‘chirish' : 'Kamerani yoqish'}
          className={cn(
            'h-12 w-12 rounded-full flex items-center justify-center',
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
          onClick={() => void switchCamera()}
          aria-label="Kamerani almashtirish"
          className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center"
          disabled={isScreenSharing}
        >
          <SwitchCamera className={cn('h-6 w-6 text-white', isScreenSharing && 'opacity-50')} />
        </button>

        <button
          onClick={() => void toggleScreenShare()}
          aria-label={isScreenSharing ? 'Ekran ulashishni to‘xtatish' : 'Ekranni ulashish'}
          className={cn(
            'h-12 w-12 rounded-full flex items-center justify-center',
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
          onClick={() => setShowComments(!showComments)}
          aria-label="Izohlarni ko‘rsatish"
          className={cn(
            'h-12 w-12 rounded-full flex items-center justify-center',
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
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-200px) scale(1.5);
          }
        }
        .animate-float-up {
          animation: float-up 3s ease-out forwards;
        }
      `}</style>
    </div>
  );

  // Faqat efir vaqtida to'liq ekran qatlami ishlatiladi.
  return isLive ? createPortal(liveContent, document.body) : setupContent;
}
