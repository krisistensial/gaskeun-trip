/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

interface IncomingPushPayload {
  title?: string;
  body?: string;
  tag?: string;
  renotify?: boolean;
  url?: string;
  openChat?: boolean;
  icon?: string;
  badge?: string;
  forceShow?: boolean;
}

function resolveScopeAsset(relativePath: string): string {
  try {
    return new URL(relativePath, self.registration.scope).toString();
  } catch {
    return relativePath;
  }
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: IncomingPushPayload = {};
  try {
    payload = event.data ? (event.data.json() as IncomingPushPayload) : {};
  } catch {
    const fallbackText = event.data ? event.data.text() : '';
    payload = {
      title: 'GASKEUN!',
      body: fallbackText || 'New crew activity',
    };
  }

  const title = (payload.title || 'GASKEUN!').trim();
  const body = (payload.body || 'New update in your trip').trim();
  const tag =
    payload.tag ||
    `gaskeun-push-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const icon = payload.icon || resolveScopeAsset('pwa-192x192.png');
  const badge = payload.badge || resolveScopeAsset('favicon-32x32.png');
  const targetUrl = payload.url || self.registration.scope;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const hasFocusedVisibleClient = windowClients.some(
        (client) => client.focused && client.visibilityState === 'visible',
      );
      if (hasFocusedVisibleClient && !payload.forceShow) {
        // Always satisfy userVisibleOnly=true (prevents iOS 3-strikes & Chrome silent-push revocation),
        // then dismiss silently while the foreground in-app banner is active.
        await self.registration.showNotification(title, {
          body,
          icon,
          badge,
          tag,
          silent: true,
          data: {
            url: targetUrl,
            openChat: Boolean(payload.openChat),
          },
        } as NotificationOptions);
        const active = await self.registration.getNotifications({ tag });
        active.forEach((n) => n.close());
        return;
      }

      await self.registration.showNotification(title, {
        body,
        icon,
        badge,
        tag,
        renotify: true,
        silent: false,
        vibrate: [180, 70, 180],
        timestamp: Date.now(),
        data: {
          url: targetUrl,
          openChat: Boolean(payload.openChat),
        },
      } as NotificationOptions);
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  const pushEvent = event as ExtendableEvent & {
    oldSubscription?: PushSubscription;
  };
  pushEvent.waitUntil(
    (async () => {
      try {
        const appKey = pushEvent.oldSubscription?.options?.applicationServerKey;
        if (!appKey) return;
        await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appKey,
        });
      } catch {
        // Client will re-sync subscription on next app open
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const notifData = (event.notification.data ?? {}) as {
    url?: string;
    openChat?: boolean;
  };
  const targetUrl = notifData.url || self.registration.scope;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({
            type: 'GASKEUN_NOTIFICATION_CLICK',
            openChat: Boolean(notifData.openChat),
            url: targetUrl,
          });
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
