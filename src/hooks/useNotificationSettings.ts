import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SETTINGS_EVENT,
  NotificationSettings,
  NotificationTone,
  STORAGE_KEY_NOTIFICATIONS,
  isDefaultNotificationSettings,
  isQuietHours,
  loadNotificationSettings,
  normalizeNotificationSettings,
  playIncomingMessageSound,
  playNotificationTone,
  playSentMessageSound,
  saveNotificationSettings,
  IncomingSoundContext,
} from '@/lib/notificationSettings';

/**
 * Bildirishnoma sozlamalari uchun hook.
 * Barcha oynalar/komponentlar orasida sinxron ishlaydi.
 */
export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(() => loadNotificationSettings());

  useEffect(() => {
    const applyDetail = (event: Event) => {
      const detail = (event as CustomEvent<NotificationSettings>).detail;
      setSettings(detail ? normalizeNotificationSettings(detail) : loadNotificationSettings());
    };
    const applyStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY_NOTIFICATIONS) return;
      setSettings(loadNotificationSettings());
    };

    window.addEventListener(NOTIFICATION_SETTINGS_EVENT, applyDetail as EventListener);
    window.addEventListener('storage', applyStorage);
    return () => {
      window.removeEventListener(NOTIFICATION_SETTINGS_EVENT, applyDetail as EventListener);
      window.removeEventListener('storage', applyStorage);
    };
  }, []);

  const update = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings((prev) => {
      const next = normalizeNotificationSettings({ ...prev, ...patch });
      saveNotificationSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = { ...DEFAULT_NOTIFICATION_SETTINGS };
    saveNotificationSettings(next);
    setSettings(next);
  }, []);

  const preview = useCallback(
    (tone: NotificationTone) => playNotificationTone(tone, settings.volume),
    [settings.volume]
  );

  const notifyIncoming = useCallback(
    (context?: IncomingSoundContext) => playIncomingMessageSound(settings, context),
    [settings]
  );

  const notifySent = useCallback(() => playSentMessageSound(settings), [settings]);

  return {
    settings,
    update,
    reset,
    preview,
    notifyIncoming,
    notifySent,
    isDefault: isDefaultNotificationSettings(settings),
    inQuietHours: isQuietHours(settings),
  };
}
