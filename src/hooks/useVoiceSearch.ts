import { useState, useCallback, useRef, useEffect } from 'react';

interface UseVoiceSearchOptions {
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  language?: string;
}

export function useVoiceSearch(options: UseVoiceSearchOptions = {}) {
  const { onResult, onError, language = 'uz-UZ' } = options;
  
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);

  // Check browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  // Initialize speech recognition
  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError("Brauzeringiz ovozli qidiruvni qo'llab-quvvatlamaydi");
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setTranscript('');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const currentTranscript = finalTranscript || interimTranscript;
      setTranscript(currentTranscript);

      if (finalTranscript) {
        onResult?.(finalTranscript.trim());
      }
    };

    recognition.onerror = (event) => {
      let errorMessage = 'Xatolik yuz berdi';
      
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'Ovoz eshitilmadi';
          break;
        case 'audio-capture':
          errorMessage = 'Mikrofon topilmadi';
          break;
        case 'not-allowed':
          errorMessage = 'Mikrofon ruxsati berilmagan';
          break;
        case 'network':
          errorMessage = 'Tarmoq xatosi';
          break;
        case 'aborted':
          errorMessage = '';
          break;
      }

      if (errorMessage) {
        setError(errorMessage);
        onError?.(errorMessage);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  }, [language, onResult, onError]);

  // Start listening
  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Brauzeringiz ovozli qidiruvni qo'llab-quvvatlamaydi");
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = initRecognition();
    if (recognition) {
      recognitionRef.current = recognition;
      recognition.start();
    }
  }, [isSupported, initRecognition]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}

// TypeScript declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
