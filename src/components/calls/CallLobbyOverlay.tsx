import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CallControlButton } from '@/components/calls/CallControlButton';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CallLobbyStartOptions {
  withVideo: boolean;
  muted: boolean;
  preparedStream: MediaStream | null;
}

interface CallLobbyOverlayProps {
  open: boolean;
  peerName: string;
  peerAvatar?: string;
  callType: 'audio' | 'video';
  onCancel: () => void;
  onStart: (options: CallLobbyStartOptions) => void | Promise<void>;
}

function mediaErrorMessage(error: unknown): string {
  const name = String((error as { name?: string } | null)?.name ?? '');
  if (name === 'NotAllowedError') {
    return 'Kamera yoki mikrofon ruxsati berilmadi. Brauzer sozlamalaridan ruxsat bering.';
  }
  if (name === 'NotFoundError') return 'Kamera yoki mikrofon topilmadi.';
  if (name === 'NotReadableError') return 'Kamera yoki mikrofon boshqa dastur tomonidan ishlatilmoqda.';
  return 'Kamera yoki mikrofonni ishga tushirib bo‘lmadi.';
}

/**
 * Qo‘ng‘iroqdan oldingi premium lobby.
 *
 * Muhim jihat: call DB yozuvi foydalanuvchi "Qo‘ng‘iroq qilish"ni bosmaguncha
 * yaratilmaydi. Shu bilan bekor qilingan previewlar serverda yetim call qoldirmaydi.
 */
export function CallLobbyOverlay({
  open,
  peerName,
  peerAvatar,
  callType,
  onCancel,
  onStart,
}: CallLobbyOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handedOffRef = useRef(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const stopPreview = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    setPreviewStream(null);
    setVideoEnabled(false);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (el && previewStream && el.srcObject !== previewStream) {
      el.srcObject = previewStream;
    }
  }, [previewStream]);

  useEffect(() => {
    if (!open) {
      handedOffRef.current = false;
      stopPreview();
      setMuted(false);
      setMediaError(null);
      setStarting(false);
      return;
    }

    return () => {
      if (!handedOffRef.current) stopPreview();
    };
  }, [open, stopPreview]);

  const enableVideoPreview = useCallback(async () => {
    if (mediaBusy) return;

    if (videoEnabled) {
      streamRef.current?.getVideoTracks().forEach((track) => track.stop());
      const audioTracks = streamRef.current?.getAudioTracks() ?? [];
      const audioOnly = audioTracks.length ? new MediaStream(audioTracks) : null;
      streamRef.current = audioOnly;
      setPreviewStream(audioOnly);
      setVideoEnabled(false);
      return;
    }

    setMediaBusy(true);
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user',
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      stopPreview();
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
      streamRef.current = stream;
      setPreviewStream(stream);
      setVideoEnabled(true);
    } catch (error) {
      setMediaError(mediaErrorMessage(error));
    } finally {
      setMediaBusy(false);
    }
  }, [mediaBusy, muted, stopPreview, videoEnabled]);

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  const cancel = useCallback(() => {
    handedOffRef.current = false;
    stopPreview();
    onCancel();
  }, [onCancel, stopPreview]);

  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setMediaError(null);

    try {
      // Video preview stream call ichiga handoff qilinadi. Audio-only holatda
      // WebRTC hook o‘zi sifatli audio constraint bilan stream oladi.
      handedOffRef.current = Boolean(streamRef.current);
      await onStart({
        withVideo: callType === 'video' && videoEnabled,
        muted,
        preparedStream: streamRef.current,
      });
    } catch (error) {
      handedOffRef.current = false;
      setMediaError(error instanceof Error ? error.message : 'Qo‘ng‘iroqni boshlab bo‘lmadi.');
    } finally {
      setStarting(false);
    }
  }, [callType, muted, onStart, starting, videoEnabled]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10020] overflow-hidden bg-[#11161c] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(76,166,255,0.12),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(60,200,100,0.08),transparent_30%)]" />

      <div className="relative mx-auto flex h-[100dvh] w-full max-w-[1200px] flex-col items-center px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))] sm:px-8">
        <div
          className={cn(
            'flex min-h-0 w-full flex-1 flex-col items-center justify-center transition-all duration-300',
            videoEnabled ? 'gap-4 sm:gap-5' : 'gap-5 sm:gap-6'
          )}
        >
          <Avatar
            className={cn(
              'border border-white/10 shadow-[0_18px_80px_rgba(0,0,0,0.45)] transition-all duration-300',
              videoEnabled ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-32 w-32 sm:h-40 sm:w-40'
            )}
          >
            <AvatarImage src={peerAvatar} alt={peerName} className="object-cover" />
            <AvatarFallback className="bg-white/10 text-3xl font-semibold text-white">
              {peerName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="text-center">
            <h2 className="max-w-[80vw] truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {peerName}
            </h2>
            <p className="mt-1 text-sm text-white/55 sm:text-base">
              {videoEnabled
                ? 'Kamera tayyor. Qo‘ng‘iroqni boshlashingiz mumkin.'
                : callType === 'video'
                  ? 'Videoni oldindan tekshiring yoki darhol qo‘ng‘iroq qiling.'
                  : 'Audio qo‘ng‘iroqni boshlashga tayyor.'}
            </p>
          </div>

          {videoEnabled && previewStream && (
            <div className="relative w-full max-w-[920px] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_24px_100px_rgba(0,0,0,0.55)]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="aspect-video max-h-[58vh] w-full scale-x-[-1] object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
              <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium backdrop-blur-xl">
                Sizning kamerangiz
              </div>
            </div>
          )}

          {mediaError && (
            <div className="max-w-xl rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-center text-sm text-red-100">
              {mediaError}
            </div>
          )}
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-start justify-center gap-1.5 rounded-[28px] border border-white/10 bg-black/30 px-2 py-2.5 shadow-2xl backdrop-blur-2xl sm:gap-3 sm:px-4">
          {callType === 'video' && (
            <CallControlButton
              icon={videoEnabled ? VideoOff : Video}
              label={videoEnabled ? 'Videoni o‘chirish' : 'Videoni yoqish'}
              tone={videoEnabled ? 'active' : 'accept'}
              disabled={mediaBusy || starting}
              onClick={() => void enableVideoPreview()}
            />
          )}
          <CallControlButton
            icon={PhoneOff}
            label="Bekor qilish"
            tone="decline"
            disabled={starting}
            onClick={cancel}
          />
          <CallControlButton
            icon={Phone}
            label={starting ? 'Boshlanmoqda...' : 'Qo‘ng‘iroq qilish'}
            tone="accept"
            disabled={starting || mediaBusy}
            onClick={() => void start()}
          />
          <CallControlButton
            icon={muted ? MicOff : Mic}
            label={muted ? 'Mikrofon o‘chiq' : 'Mikrofon'}
            tone={muted ? 'active' : 'neutral'}
            disabled={starting}
            onClick={toggleMute}
          />
        </div>
      </div>
    </div>
  );
}

export default CallLobbyOverlay;
