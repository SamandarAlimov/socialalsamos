import { useCallback, useEffect, useState } from 'react';
import {
  AutoDownloadMode,
  ConnectionKind,
  DEFAULT_AUTO_DOWNLOAD,
  MEDIA_AUTO_DOWNLOAD_EVENT,
  MediaAutoDownloadSettings,
  MediaCategory,
  getConnectionKind,
  getNetworkInformation,
  isDefaultAutoDownload,
  loadAutoDownload,
  saveAutoDownload,
  shouldAutoDownload as shouldAutoDownloadFn,
} from '@/lib/mediaAutoDownload';

/**
 * Media avtomatik yuklab olish sozlamalari.
 *
 * Sozlama o'zgarganda barcha komponentlar bir vaqtda yangilanadi
 * (`MEDIA_AUTO_DOWNLOAD_EVENT`), ulanish turi ham kuzatiladi.
 */
export function useMediaAutoDownload() {
  const [settings, setSettings] = useState<MediaAutoDownloadSettings>(() =>
    loadAutoDownload()
  );
  const [connection, setConnection] = useState<ConnectionKind>(() => getConnectionKind());

  // Boshqa komponent/oyna sozlamani o'zgartirsa
  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<MediaAutoDownloadSettings>).detail;
      setSettings(detail || loadAutoDownload());
    };
    const handleStorage = () => setSettings(loadAutoDownload());

    window.addEventListener(MEDIA_AUTO_DOWNLOAD_EVENT, handleChange as EventListener);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(MEDIA_AUTO_DOWNLOAD_EVENT, handleChange as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Ulanish turini kuzatish
  useEffect(() => {
    const update = () => setConnection(getConnectionKind());
    const network = getNetworkInformation();

    network?.addEventListener?.('change', update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    return () => {
      network?.removeEventListener?.('change', update);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const update = useCallback((patch: Partial<MediaAutoDownloadSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveAutoDownload(next);
      return next;
    });
  }, []);

  const setMode = useCallback(
    (category: MediaCategory, mode: AutoDownloadMode) => {
      update({ [category]: mode } as Partial<MediaAutoDownloadSettings>);
    },
    [update]
  );

  const reset = useCallback(() => {
    const next = { ...DEFAULT_AUTO_DOWNLOAD };
    saveAutoDownload(next);
    setSettings(next);
  }, []);

  const shouldAutoDownload = useCallback(
    (category: MediaCategory, sizeBytes?: number) =>
      shouldAutoDownloadFn(category, { settings, sizeBytes, connection }),
    [settings, connection]
  );

  return {
    settings,
    connection,
    isDefault: isDefaultAutoDownload(settings),
    setMode,
    update,
    reset,
    shouldAutoDownload,
  };
}

export default useMediaAutoDownload;
