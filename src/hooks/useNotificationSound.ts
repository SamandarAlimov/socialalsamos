import { useCallback, useRef, useEffect } from 'react';
import { useUserSettings } from './useUserSettings';

// Notification sound frequencies and durations for different types
const SOUND_CONFIGS = {
  default: { frequencies: [800, 1000], duration: 100 },
  message: { frequencies: [600, 800, 1000], duration: 80 },
  like: { frequencies: [1200, 1400], duration: 60 },
  comment: { frequencies: [700, 900, 1100], duration: 70 },
  follow: { frequencies: [500, 700, 900, 1100], duration: 90 },
  mention: { frequencies: [900, 1100, 1300], duration: 75 },
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

  const playTone = useCallback((frequency: number, duration: number, startTime: number, ctx: AudioContext) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);

    // Smooth envelope for pleasant sound
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
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
        playTone(freq, config.duration, startTime + (index * config.duration / 1000), ctx);
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
    isEnabled: settings?.notification_sounds !== false,
  };
}
