import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigationSnapshot } from '@/hooks/useActiveNavigation';

const STORAGE_KEY = 'alsamos.map.navigation.voice.v1';

function readInitialEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function metersPhrase(distanceM: number): string {
  if (distanceM >= 1000) {
    const km = distanceM / 1000;
    return (km >= 10 ? Math.round(km) : Number(km.toFixed(1))) + ' kilometrdan keyin';
  }
  const rounded =
    distanceM > 250
      ? Math.round(distanceM / 100) * 100
      : distanceM > 100
        ? Math.round(distanceM / 50) * 50
        : Math.max(20, Math.round(distanceM / 10) * 10);
  return rounded + ' metrdan keyin';
}

export function useNavigationVoice({
  active,
  snapshot,
}: {
  active: boolean;
  snapshot: NavigationSnapshot;
}) {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window;

  const [enabled, setEnabledState] = useState(readInitialEnabled);
  const lastStepRef = useRef<number>(-1);
  const spokenThresholdsRef = useRef<Set<number>>(new Set());
  const arrivedSpokenRef = useRef(false);
  const reroutingSpokenRef = useRef(false);

  const speak = useCallback(
    (text: string, interrupt = true) => {
      if (!supported || !enabled || !text.trim()) return;
      try {
        if (interrupt) window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'uz-UZ';
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Speech API browserda mavjud bo'lsa ham ayrim WebView'larda bloklanishi mumkin.
      }
    },
    [enabled, supported],
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // localStorage mavjud bo'lmasa faqat session state ishlaydi.
      }
      if (!next && supported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // no-op
        }
      }
    },
    [supported],
  );

  const toggle = useCallback(() => setEnabled(!enabled), [enabled, setEnabled]);

  useEffect(() => {
    if (!active) {
      lastStepRef.current = -1;
      spokenThresholdsRef.current = new Set();
      arrivedSpokenRef.current = false;
      reroutingSpokenRef.current = false;
      if (supported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // no-op
        }
      }
      return;
    }

    if (!enabled || !supported) return;

    if (snapshot.arrived) {
      if (!arrivedSpokenRef.current) {
        arrivedSpokenRef.current = true;
        speak('Manzilga yetib keldingiz.');
      }
      return;
    }

    if (snapshot.rerouting) {
      if (!reroutingSpokenRef.current) {
        reroutingSpokenRef.current = true;
        speak('Marshrut qayta hisoblanmoqda.');
      }
      return;
    }
    reroutingSpokenRef.current = false;

    const step = snapshot.currentStep;
    if (!step) return;

    if (snapshot.currentStepIndex !== lastStepRef.current) {
      lastStepRef.current = snapshot.currentStepIndex;
      spokenThresholdsRef.current = new Set();
      speak(step.instruction);
      return;
    }

    const distance = snapshot.distanceToManeuverM;
    const thresholds = [500, 200, 80, 30];
    const threshold = thresholds.find(
      (value) =>
        distance <= value &&
        !spokenThresholdsRef.current.has(value) &&
        // 500m signalni juda qisqa stepda aytish shart emas.
        distance > Math.max(0, value === 30 ? 5 : value * 0.2),
    );

    if (threshold) {
      spokenThresholdsRef.current.add(threshold);
      speak(metersPhrase(distance) + ' ' + step.instruction);
    }
  }, [
    active,
    enabled,
    supported,
    snapshot.arrived,
    snapshot.rerouting,
    snapshot.currentStep,
    snapshot.currentStepIndex,
    snapshot.distanceToManeuverM,
    speak,
  ]);

  return useMemo(
    () => ({
      supported,
      enabled,
      setEnabled,
      toggle,
      speak,
    }),
    [supported, enabled, setEnabled, toggle, speak],
  );
}

export default useNavigationVoice;
