import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface IncomingCallDialogProps {
  isOpen: boolean;
  callerName: string;
  callerAvatar?: string;
  callType: 'audio' | 'video';
  onAccept: () => void;
  onDecline: () => void;
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

export function IncomingCallDialog({
  isOpen,
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onDecline,
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

    if ('vibrate' in navigator) {
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
    if ('vibrate' in navigator) {
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
        handleDecline();
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

  const callLabel =
    callType === 'video' ? "Video qo'ng'iroq kelmoqda..." : "Audio qo'ng'iroq kelmoqda...";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDecline()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm rounded-3xl border-border/50 bg-card/95 backdrop-blur-xl sm:max-w-md">
        <div className="flex flex-col items-center space-y-5 py-4 sm:space-y-6 sm:py-6">
          {/* Qo'ng'iroq qiluvchining rasmi - pulsatsiya bilan */}
          <div className="relative">
            <div
              className={`absolute inset-0 rounded-full bg-primary/20 ${
                isRinging ? 'animate-ping' : ''
              }`}
              style={{ animationDuration: '1.6s' }}
            />
            <div
              className={`absolute -inset-2 rounded-full border-2 border-primary/40 ${
                isRinging ? 'animate-pulse' : ''
              }`}
            />
            <Avatar className="relative h-20 w-20 border-4 border-primary/30 sm:h-24 sm:w-24">
              <AvatarImage src={callerAvatar} alt={callerName} />
              <AvatarFallback className="bg-primary/20 text-xl text-primary sm:text-2xl">
                {callerName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="space-y-1 px-2 text-center">
            <h3 className="truncate text-lg font-semibold text-foreground sm:text-xl">
              {callerName}
            </h3>
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {callType === 'video' ? (
                <Video className="h-4 w-4" />
              ) : (
                <Phone className="h-4 w-4" />
              )}
              {callLabel}
            </p>
          </div>

          {/* Jiringlashni o'chirish */}
          <Button
            variant="ghost"
            size="sm"
            className="tg-transition h-8 rounded-full text-xs text-muted-foreground"
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? (
              <>
                <VolumeX className="mr-1.5 h-4 w-4" />
                Ovoz o'chirilgan
              </>
            ) : (
              <>
                <Volume2 className="mr-1.5 h-4 w-4" />
                Ovozni o'chirish
              </>
            )}
          </Button>

          <div className="flex items-center gap-10 sm:gap-12">
            <div className="flex flex-col items-center gap-2">
              <Button
                size="lg"
                variant="destructive"
                className="tg-transition h-14 w-14 rounded-full shadow-lg hover:scale-105 active:scale-95 sm:h-16 sm:w-16"
                onClick={handleDecline}
                aria-label="Rad etish"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <span className="text-xs text-muted-foreground">Rad etish</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button
                size="lg"
                className="tg-transition h-14 w-14 rounded-full bg-green-500 shadow-lg hover:scale-105 hover:bg-green-600 active:scale-95 sm:h-16 sm:w-16"
                onClick={handleAccept}
                aria-label="Javob berish"
              >
                {callType === 'video' ? (
                  <Video className="h-6 w-6" />
                ) : (
                  <Phone className="h-6 w-6" />
                )}
              </Button>
              <span className="text-xs text-muted-foreground">Javob berish</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
