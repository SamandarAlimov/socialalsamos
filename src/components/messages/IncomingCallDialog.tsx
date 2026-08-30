import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CallControlButton } from '@/components/calls/CallControlButton';
import { Mic, MicOff, Phone, PhoneOff, Video } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface IncomingCallDialogProps {
  isOpen: boolean;
  callerName: string;
  callerAvatar?: string;
  callType: 'audio' | 'video';
  onAccept: () => void;
  onDecline: () => void;
  onMissed?: () => void;
  /** Javob berilmasa necha sekunddan keyin avtomatik yopilsin (Telegramda ~45s) */
  timeoutSeconds?: number;
}

/** Web Audio API orqali ikki tovushli jiringlash */
function createRingtone(audioContext: AudioContext, volume: number): OscillatorNode[] {
  const oscillators: OscillatorNode[] = [];
  const frequencies = [440, 480];

  frequencies.forEach((freq) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);

    // Yumshoq boshlanish/tugash - "klik" ovozi bo'lmasligi uchun
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.08);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 1);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillators.push(oscillator);
  });

  return oscillators;
}

/**
 * Telegram Desktopdagi "kelayotgan qo'ng'iroq" oynasi.
 *
 * Qora shaffof panel, katta yumaloq avatar, ism va "sizga qo'ng'iroq
 * qilmoqda..." holati, pastda esa izohli yumaloq tugmalar:
 * **Video | Rad etish | Javob berish | Ovoz**.
 */
export function IncomingCallDialog({
  isOpen,
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onDecline,
  onMissed,
  timeoutSeconds = 45,
}: IncomingCallDialogProps) {
  const [isRinging, setIsRinging] = useState(false);
  const [muted, setMuted] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vibrateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);
  const mutedRef = useRef(false);

  mutedRef.current = muted;

  const stopRingtone = useCallback(() => {
    isPlayingRef.current = false;

    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    oscillatorsRef.current.forEach((osc) => {
      try {
        osc.stop();
      } catch {}
    });
    oscillatorsRef.current = [];

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
    }
    audioContextRef.current = null;

    if (
      'vibrate' in navigator &&
      (!navigator.userActivation || navigator.userActivation.hasBeenActive)
    ) {
      try {
        navigator.vibrate(0);
      } catch {}
    }
  }, []);

  const playRingtone = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        audioContextRef.current = new AudioContext();
      } catch (err) {
        console.error('AudioContext yaratilmadi:', err);
        return;
      }
    }

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }

    const ring = () => {
      if (!isPlayingRef.current || !audioContextRef.current || mutedRef.current) return;

      try {
        oscillatorsRef.current.forEach((osc) => {
          try {
            osc.stop();
          } catch {}
        });

        oscillatorsRef.current = createRingtone(audioContextRef.current, 0.08);
        oscillatorsRef.current.forEach((osc) => osc.start());

        setTimeout(() => {
          oscillatorsRef.current.forEach((osc) => {
            try {
              osc.stop();
            } catch {}
          });
        }, 1000);
      } catch (err) {
        console.error('Jiringlashda xatolik:', err);
      }
    };

    isPlayingRef.current = true;
    ring();
    ringIntervalRef.current = setInterval(ring, 3000);

    // Telegramdek tebranish naqshi
    if (
      'vibrate' in navigator &&
      (!navigator.userActivation || navigator.userActivation.hasBeenActive)
    ) {
      const vibrate = () => {
        if (mutedRef.current) return;
        try {
          navigator.vibrate([400, 200, 400, 1600]);
        } catch {}
      };
      vibrate();
      vibrateIntervalRef.current = setInterval(vibrate, 2600);
    }
  }, []);

  const handleDecline = useCallback(() => {
    stopRingtone();
    onDecline();
  }, [onDecline, stopRingtone]);

  const handleAccept = useCallback(() => {
    stopRingtone();
    onAccept();
  }, [onAccept, stopRingtone]);

  useEffect(() => {
    if (isOpen) {
      setIsRinging(true);
      setMuted(false);
      playRingtone();

      // Javob berilmasa avtomatik yopiladi
      timeoutRef.current = setTimeout(() => {
        stopRingtone();
        (onMissed || onDecline)();
      }, timeoutSeconds * 1000);
    } else {
      setIsRinging(false);
      stopRingtone();
    }

    return () => {
      stopRingtone();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDecline()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm overflow-hidden rounded-3xl border-white/10 bg-neutral-900/95 p-0 text-white backdrop-blur-2xl sm:max-w-md">
        {/* Yuqoridagi yumshoq nur - Telegramdagi qo'ng'iroq oynasi kayfiyati */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#4DA6FF]/20 to-transparent" />

        <div className="relative flex flex-col items-center px-6 pb-6 pt-9">
          {/* Avatar - jiringlash paytida ikki qatlamli pulsatsiya */}
          <div className="relative mb-5">
            <span
              className={`absolute -inset-3 rounded-full bg-white/10 ${
                isRinging ? 'animate-ping' : ''
              }`}
              style={{ animationDuration: '2s' }}
            />
            <span
              className={`absolute -inset-1.5 rounded-full border border-white/25 ${
                isRinging ? 'animate-pulse' : ''
              }`}
            />
            <Avatar className="relative h-28 w-28 border-4 border-white/10 shadow-2xl sm:h-32 sm:w-32">
              <AvatarImage src={callerAvatar} alt={callerName} />
              <AvatarFallback className="bg-white/10 text-3xl font-semibold text-white">
                {callerName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <h3 className="max-w-full truncate text-center text-2xl font-semibold">{callerName}</h3>
          <p className="mt-1 text-center text-sm text-white/60">
            {callType === 'video'
              ? "sizga video qo'ng'iroq qilmoqda..."
              : "sizga qo'ng'iroq qilmoqda..."}
          </p>

          {/* Telegram Desktopdagidek izohli yumaloq tugmalar qatori */}
          <div className="mt-8 flex items-start justify-center gap-1.5 sm:gap-3">
            <CallControlButton
              icon={Video}
              label="Video"
              tone="neutral"
              hasMenu
              onClick={handleAccept}
            />
            <CallControlButton
              icon={PhoneOff}
              label="Rad etish"
              tone="decline"
              onClick={handleDecline}
            />
            <CallControlButton
              icon={callType === 'video' ? Video : Phone}
              label="Javob berish"
              tone="accept"
              onClick={handleAccept}
            />
            <CallControlButton
              icon={muted ? MicOff : Mic}
              label={muted ? "Ovoz o'chirilgan" : 'Ovoz'}
              tone={muted ? 'active' : 'neutral'}
              hasMenu
              onClick={() => setMuted((prev) => !prev)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
