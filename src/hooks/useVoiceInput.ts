import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API tiplari (TS lib da yo'q).
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type UseVoiceInput = {
  supported: boolean;
  listening: boolean;
  error: string | null;
  /** Yakunlangan matn (final). */
  transcript: string;
  /** Hozircha tanilayotgan matn. */
  interim: string;
  start: (lang?: string) => void;
  stop: () => void;
  toggle: (lang?: string) => void;
  reset: () => void;
};

/** Ovozli kiritish — brauzerning Web Speech API asosida. */
export function useVoiceInput(defaultLang = 'uz-UZ'): UseVoiceInput {
  const Ctor = getRecognitionCtor();
  const supported = Boolean(Ctor);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(
    (lang?: string) => {
      if (!Ctor) {
        setError("Bu brauzer ovozli kiritishni qo'llab-quvvatlamaydi.");
        return;
      }
      try {
        recognitionRef.current?.abort();
      } catch {
        // e'tiborsiz
      }

      const recognition = new Ctor();
      recognition.lang = lang ?? defaultLang;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? '';
          if (result.isFinal) finalText += text;
          else interimText += text;
        }
        if (finalText) setTranscript((prev) => (prev ? `${prev} ${finalText.trim()}` : finalText.trim()));
        setInterim(interimText);
      };

      recognition.onerror = (event: any) => {
        const code = event?.error ?? 'unknown';
        setError(
          code === 'not-allowed' || code === 'service-not-allowed'
            ? "Mikrofonga ruxsat berilmadi. Brauzer sozlamalarini tekshiring."
            : code === 'no-speech'
              ? 'Ovoz eshitilmadi.'
              : `Ovozli kiritish xatosi: ${code}`,
        );
        setListening(false);
      };

      recognition.onend = () => setListening(false);

      recognitionRef.current = recognition;
      setError(null);
      setInterim('');
      try {
        recognition.start();
        setListening(true);
      } catch (e) {
        setError("Ovozli kiritishni boshlab bo'lmadi.");
        setListening(false);
      }
    },
    [Ctor, defaultLang],
  );

  const toggle = useCallback(
    (lang?: string) => {
      if (listening) stop();
      else start(lang);
    },
    [listening, start, stop],
  );

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError(null);
  }, []);

  useEffect(
    () => () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // e'tiborsiz
      }
    },
    [],
  );

  return { supported, listening, error, transcript, interim, start, stop, toggle, reset };
}
