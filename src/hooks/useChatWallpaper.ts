import { useCallback, useEffect, useState } from 'react';
import {
  CHAT_WALLPAPER_EVENT,
  ChatWallpaper,
  ChatWallpaperPreset,
  DEFAULT_CHAT_WALLPAPER,
  isWallpaperActive,
  readChatWallpaper,
  wallpaperFromImageUrl,
  wallpaperFromPreset,
  writeChatWallpaper,
} from '@/lib/chatWallpaper';

/**
 * Chat fonini o'qish/yozish. Barcha nusxalar bir xil holatda bo'lishi uchun
 * `chat-wallpaper-change` eventi va `storage` eventi (boshqa tab) kuzatiladi.
 */
export function useChatWallpaper() {
  const [wallpaper, setWallpaper] = useState<ChatWallpaper>(() => readChatWallpaper());

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ChatWallpaper>).detail;
      setWallpaper(detail ? detail : readChatWallpaper());
    };

    const onStorage = () => setWallpaper(readChatWallpaper());

    window.addEventListener(CHAT_WALLPAPER_EVENT, onChange as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(CHAT_WALLPAPER_EVENT, onChange as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setPreset = useCallback((preset: ChatWallpaperPreset) => {
    setWallpaper(writeChatWallpaper(wallpaperFromPreset(preset)));
  }, []);

  const setCustomImage = useCallback((url: string) => {
    setWallpaper(writeChatWallpaper(wallpaperFromImageUrl(url)));
  }, []);

  const setSolidColor = useCallback((color: string) => {
    setWallpaper(
      writeChatWallpaper({
        id: 'custom-color',
        kind: 'solid',
        color,
        image: 'none',
        repeat: false,
        dim: 0,
        blur: 0,
      })
    );
  }, []);

  const update = useCallback((patch: Partial<ChatWallpaper>) => {
    setWallpaper((prev) => writeChatWallpaper({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setWallpaper(writeChatWallpaper(DEFAULT_CHAT_WALLPAPER));
  }, []);

  return {
    wallpaper,
    isActive: isWallpaperActive(wallpaper),
    setPreset,
    setCustomImage,
    setSolidColor,
    update,
    reset,
  };
}
