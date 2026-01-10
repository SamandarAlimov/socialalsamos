import { useCallback, useRef, useEffect } from 'react';
import { useUserSettings } from './useUserSettings';

// Enhanced notification sound frequencies and durations for different types
const SOUND_CONFIGS = {
  default: { frequencies: [800, 1000], duration: 100, volume: 0.15 },
  message: { frequencies: [523, 659, 784], duration: 80, volume: 0.2 }, // C5, E5, G5 chord
  like: { frequencies: [880, 1108], duration: 50, volume: 0.12 }, // A5, C#6 - bright pop
  comment: { frequencies: [587, 740, 880], duration: 70, volume: 0.15 }, // D5, F#5, A5
  follow: { frequencies: [440, 554, 659, 880], duration: 100, volume: 0.18 }, // A4, C#5, E5, A5 arpeggio
  mention: { frequencies: [698, 880, 1047], duration: 80, volume: 0.15 }, // F5, A5, C6
  call: { frequencies: [440, 554], duration: 200, volume: 0.25 }, // More prominent for calls
} as const;

type SoundType = keyof typeof SOUND_CONFIGS;

export function useNotificationSound() {
  const { settings } = useUserSettings();
  const audioContextRef = useRef<AudioContext | null>(null);
  const isEnabledRef = useRef(true);

  // Update enabled state when settings change
  useEffect(() => {
    isEnabledRef.current = settings?.notification_sounds !== false;
  }, [settings?.notification_sounds]);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const playTone = useCallback((frequency: number, duration: number, startTime: number, ctx: AudioContext, volume: number = 0.15) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);

    // Smooth envelope for pleasant sound
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration / 1000);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration / 1000);
  }, []);

  const playNotificationSound = useCallback((type: SoundType = 'default') => {
    // Check if sounds are enabled
    if (!isEnabledRef.current) return;

    try {
      const ctx = getAudioContext();
      
      // Resume context if suspended (required for user gesture policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const config = SOUND_CONFIGS[type] || SOUND_CONFIGS.default;
      const startTime = ctx.currentTime;

      // Play sequence of tones for a pleasant notification sound
      config.frequencies.forEach((freq, index) => {
        playTone(freq, config.duration, startTime + (index * config.duration / 1200), ctx, config.volume);
      });
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }, [getAudioContext, playTone]);

  const playMessageSound = useCallback(() => playNotificationSound('message'), [playNotificationSound]);
  const playLikeSound = useCallback(() => playNotificationSound('like'), [playNotificationSound]);
  const playCommentSound = useCallback(() => playNotificationSound('comment'), [playNotificationSound]);
  const playFollowSound = useCallback(() => playNotificationSound('follow'), [playNotificationSound]);
  const playMentionSound = useCallback(() => playNotificationSound('mention'), [playNotificationSound]);
  const playCallSound = useCallback(() => playNotificationSound('call'), [playNotificationSound]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    playNotificationSound,
    playMessageSound,
    playLikeSound,
    playCommentSound,
    playFollowSound,
    playMentionSound,
    playCallSound,
    isEnabled: settings?.notification_sounds !== false,
  };
}
