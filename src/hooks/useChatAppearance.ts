import { useCallback, useEffect, useState } from 'react';
import {
  CHAT_APPEARANCE_EVENT,
  ChatAppearance,
  isAppearanceDefault,
  readChatAppearance,
  resetChatAppearance,
  writeChatAppearance,
} from '@/lib/chatAppearance';

/** Chat ko'rinishi sozlamalarini o'qish va o'zgartirish */
export function useChatAppearance() {
  const [appearance, setAppearance] = useState<ChatAppearance>(() => readChatAppearance());

  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<ChatAppearance>).detail;
      setAppearance(detail || readChatAppearance());
    };

    const handleStorage = () => setAppearance(readChatAppearance());

    window.addEventListener(CHAT_APPEARANCE_EVENT, handleChange as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(CHAT_APPEARANCE_EVENT, handleChange as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const update = useCallback((patch: Partial<ChatAppearance>) => {
    setAppearance(writeChatAppearance(patch));
  }, []);

  const reset = useCallback(() => {
    setAppearance(resetChatAppearance());
  }, []);

  return {
    appearance,
    isDefault: isAppearanceDefault(appearance),
    setFontSize: (fontSize: number) => update({ fontSize }),
    setCorners: (corners: number) => update({ corners }),
    setEnergySaver: (energySaver: boolean) => update({ energySaver }),
    update,
    reset,
  };
}

export default useChatAppearance;
