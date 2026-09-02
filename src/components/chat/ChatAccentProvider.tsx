import { useEffect } from 'react';
import {
  applyChatAccent,
  CHAT_ACCENT_STORAGE_KEY,
  CHAT_ACCENT_CUSTOM_COLOR_KEY,
  getStoredChatAccent,
  normalizeChatAccent,
} from '@/lib/chatAccent';

/**
 * Chat rangini brand/theme rangidan mustaqil saqlaydi.
 * Tanlov localStorage'da qoladi va boshqa tablarda ham sinxronlashadi.
 */
export function ChatAccentProvider() {
  useEffect(() => {
    applyChatAccent(getStoredChatAccent());

    const syncFromStorage = (event: StorageEvent) => {
      if (event.key === CHAT_ACCENT_STORAGE_KEY) {
        applyChatAccent(normalizeChatAccent(event.newValue));
        return;
      }
      if (event.key === CHAT_ACCENT_CUSTOM_COLOR_KEY && getStoredChatAccent() === 'custom') {
        applyChatAccent('custom');
      }
    };

    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  return null;
}
