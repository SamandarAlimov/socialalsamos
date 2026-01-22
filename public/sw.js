// Service Worker for Push Notifications
// This runs in the background even when the browser is closed

const CACHE_NAME = 'alsamos-v1';
const NOTIFICATION_ICON = '/favicon.ico';

// Install event
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(clients.claim());
});

// Push event - handles incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);
  
  let data = {
    title: 'Yangi xabar',
    body: 'Sizga yangi xabar keldi',
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    tag: 'message-' + Date.now(),
    data: {}
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        ...data,
        ...payload,
        icon: payload.icon || NOTIFICATION_ICON,
        badge: payload.badge || NOTIFICATION_ICON,
      };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [
      { action: 'open', title: "Ko'rish" },
      { action: 'close', title: 'Yopish' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/messages';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there is already a window/tab open with the target URL
        for (let client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // If no window/tab is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Message event - for communication between app and service worker
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    
    self.registration.showNotification(title, {
      body: options.body,
      icon: options.icon || NOTIFICATION_ICON,
      badge: options.badge || NOTIFICATION_ICON,
      tag: options.tag || 'notification-' + Date.now(),
      data: options.data,
      vibrate: options.vibrate || [200, 100, 200],
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
    });
  }
});

// Periodic sync for background updates (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-messages') {
    event.waitUntil(checkForNewMessages());
  }
});

async function checkForNewMessages() {
  // This would be used with a server endpoint to check for new messages
  console.log('[Service Worker] Checking for new messages...');
}
