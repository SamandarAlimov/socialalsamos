import { useEffect } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function PushNotificationProvider({ children }: { children: React.ReactNode }) {
  const { requestPermission, isServiceWorkerReady, permission } = usePushNotifications();

  useEffect(() => {
    // Request permission on mount if not already granted
    if (permission === 'default') {
      // Small delay to not interrupt initial load
      const timer = setTimeout(() => {
        requestPermission();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (isServiceWorkerReady) {
      console.log('[Push] Service worker ready for push notifications');
    }
  }, [isServiceWorkerReady]);

  return <>{children}</>;
}
