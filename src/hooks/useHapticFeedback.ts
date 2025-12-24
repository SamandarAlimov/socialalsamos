import { useCallback } from 'react';

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export function useHapticFeedback() {
  const triggerHaptic = useCallback((type: HapticType = 'light') => {
    // Check if the Vibration API is supported
    if (!('vibrate' in navigator)) return;

    try {
      switch (type) {
        case 'light':
          navigator.vibrate(10);
          break;
        case 'medium':
          navigator.vibrate(20);
          break;
        case 'heavy':
          navigator.vibrate(40);
          break;
        case 'success':
          navigator.vibrate([10, 50, 10]);
          break;
        case 'warning':
          navigator.vibrate([20, 30, 20]);
          break;
        case 'error':
          navigator.vibrate([50, 30, 50, 30, 50]);
          break;
      }
    } catch (e) {
      // Silently fail if vibration is not allowed
      console.debug('Haptic feedback not available');
    }
  }, []);

  const lightTap = useCallback(() => triggerHaptic('light'), [triggerHaptic]);
  const mediumTap = useCallback(() => triggerHaptic('medium'), [triggerHaptic]);
  const heavyTap = useCallback(() => triggerHaptic('heavy'), [triggerHaptic]);
  const successFeedback = useCallback(() => triggerHaptic('success'), [triggerHaptic]);
  const warningFeedback = useCallback(() => triggerHaptic('warning'), [triggerHaptic]);
  const errorFeedback = useCallback(() => triggerHaptic('error'), [triggerHaptic]);

  return {
    triggerHaptic,
    lightTap,
    mediumTap,
    heavyTap,
    successFeedback,
    warningFeedback,
    errorFeedback,
  };
}
