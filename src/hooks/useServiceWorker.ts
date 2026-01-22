import { useState, useEffect, useCallback } from 'react';

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  registration: ServiceWorkerRegistration | null;
  error: Error | null;
}

export function useServiceWorker() {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    registration: null,
    error: null,
  });

  useEffect(() => {
    const isSupported = 'serviceWorker' in navigator;
    setState(prev => ({ ...prev, isSupported }));

    if (!isSupported) return;

    // Register service worker
    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        console.log('[SW] Service Worker registered with scope:', registration.scope);

        setState(prev => ({
          ...prev,
          isRegistered: true,
          registration,
        }));

        // Check for updates
        registration.addEventListener('updatefound', () => {
          console.log('[SW] New service worker found');
        });

      } catch (error) {
        console.error('[SW] Service Worker registration failed:', error);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error : new Error('Registration failed'),
        }));
      }
    };

    registerServiceWorker();

    // Listen for service worker messages
    const handleMessage = (event: MessageEvent) => {
      console.log('[SW] Message from Service Worker:', event.data);
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  const showNotification = useCallback(async (title: string, options: NotificationOptions & { data?: Record<string, unknown> }) => {
    if (!state.registration) {
      console.warn('[SW] No service worker registration available');
      return false;
    }

    try {
      // Use service worker to show notification (works in background)
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options,
        });
        return true;
      } else {
        // Fallback to registration.showNotification
        await state.registration.showNotification(title, options);
        return true;
      }
    } catch (error) {
      console.error('[SW] Failed to show notification:', error);
      return false;
    }
  }, [state.registration]);

  const requestPushSubscription = useCallback(async () => {
    if (!state.registration) return null;

    try {
      // Create application server key
      const vapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
      const applicationServerKey = urlBase64ToUint8Array(vapidKey);
      
      const subscription = await state.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });

      console.log('[SW] Push subscription:', subscription);
      return subscription;
    } catch (error) {
      console.error('[SW] Failed to subscribe to push:', error);
      return null;
    }
  }, [state.registration]);

  return {
    ...state,
    showNotification,
    requestPushSubscription,
  };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
