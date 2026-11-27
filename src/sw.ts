/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import {
  buildMergedNotificationContent,
  normalizeGroupedNotificationTag,
  type GroupedNotificationData,
  type NotificationGroupKind,
} from './services/notifications';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const SW_PUSH_VERSION = 'push-v6';
const PUSH_META_CACHE_NAME = 'gaskeun-push-meta-v1';
const PUSH_META_CACHE_URL = '/__gaskeun_push_meta__';

// Serializes concurrent pushes for the same tag so rapid-fire messages in the same second
// NEVER race or overwrite each other — all lines accumulate reliably into 1 single WA-style card.
const pushTagLocks = new Map<string, Promise<void>>();
// In-memory snapshot of the latest merged data per tag for rapid bursts before OS tray commits.
const latestTagState = new Map<string, GroupedNotificationData>();

function enqueueByTag(tag: string, task: () => Promise<void>): Promise<void> {
  const prev = pushTagLocks.get(tag) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  pushTagLocks.set(tag, next);
  void next.finally(() => {
    if (pushTagLocks.get(tag) === next) {
      pushTagLocks.delete(tag);
    }
  });
  return next;
}

self.addEventListener('install', () => {
  void self.skipWaiting();
});
clientsClaim();

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string; tag?: string } | null;
  if (data?.type === 'GASKEUN_SKIP_WAITING') {
    void self.skipWaiting();
    return;
  }
  if (data?.type === 'GASKEUN_CLEAR_NOTIF_TAG' && data.tag) {
    latestTagState.delete(data.tag);
    return;
  }
  if (data?.type === 'GASKEUN_SW_PING') {
    const reply = {
      ok: true,
      version: SW_PUSH_VERSION,
      hasPushListener: true,
    };
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(reply);
    } else if (event.source && 'postMessage' in event.source) {
      event.source.postMessage({ type: 'GASKEUN_SW_PONG', ...reply });
    }
  }
});

// Deduplicate precache manifest entries defensively so a duplicate URL with
// conflicting revisions can never abort SW installation or break push listeners.
const rawPrecacheManifest = self.__WB_MANIFEST;
try {
  const uniqueByUrl = new Map<string, { url: string; revision: string | null }>();
  for (const rawEntry of Array.isArray(rawPrecacheManifest) ? rawPrecacheManifest : []) {
    if (!rawEntry || typeof rawEntry === 'string') continue;
    const prev = uniqueByUrl.get(rawEntry.url);
    if (!prev || (!prev.revision && rawEntry.revision)) {
      uniqueByUrl.set(rawEntry.url, rawEntry);
    }
  }
  cleanupOutdatedCaches();
  precacheAndRoute(Array.from(uniqueByUrl.values()));
} catch (err) {
  console.warn('[GASKEUN SW] Precache setup warning:', err);
}

interface IncomingPushPayload {
  title?: string;
  body?: string;
  tripCode?: string;
  tag?: string;
  messageId?: string;
  groupKind?: NotificationGroupKind;
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
  const inferredGroupKind: NotificationGroupKind | undefined =
    payload.groupKind ??
    (payload.openChat
      ? 'chat'
      : payload.tag?.startsWith('chat-') || payload.tag?.startsWith('poll-')
        ? 'chat'
        : payload.tag?.startsWith('trip-')
          ? 'trip'
          : undefined);
  const tag = payload.forceShow
    ? payload.tag || `gaskeun-test-${Date.now()}`
    : normalizeGroupedNotificationTag({
        tag: payload.tag,
        groupKind: inferredGroupKind,
        openChat: payload.openChat,
        tripCode: payload.tripCode,
      });
  const icon = payload.icon || resolveScopeAsset('pwa-192x192.png');
  const badge = payload.badge || resolveScopeAsset('favicon-32x32.png');
  const targetUrl = payload.url || self.registration.scope;

  event.waitUntil(
    enqueueByTag(tag, async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        client.postMessage({
          type: 'GASKEUN_PUSH_DEBUG',
          phase: 'received',
          version: SW_PUSH_VERSION,
          title,
        });
      }

      const hasFocusedVisibleClient = windowClients.some(
        (client) => client.focused && client.visibilityState === 'visible',
      );
      if (hasFocusedVisibleClient && !payload.forceShow) {
        // Always satisfy userVisibleOnly=true (prevents iOS 3-strikes & Chrome silent-push revocation),
        // then dismiss silently while the foreground in-app banner is active.
        const silentTag = `gaskeun-fg-${Date.now()}`;
        try {
          await self.registration.showNotification(title, {
            body,
            icon,
            badge,
            tag: silentTag,
            silent: true,
            data: {
              url: targetUrl,
              openChat: Boolean(payload.openChat),
            },
          } as NotificationOptions);
          const active = await self.registration.getNotifications({ tag: silentTag });
          active.forEach((n) => n.close());
        } catch {
          // ignore silent foreground cleanup error
        }
        return;
      }

      let finalTitle = title;
      let finalBody = body;
      let notifData: GroupedNotificationData = {
        baseTitle: title,
        openChat: Boolean(payload.openChat),
        url: targetUrl,
      };

      if (inferredGroupKind && !payload.forceShow) {
        try {
          // Read all active notifications so we also fold any stray legacy per-message cards into 1 card
          const allActive = await self.registration.getNotifications();
          const sameTag = allActive.filter((n) => n.tag === tag);
          const strayLegacy = allActive.filter(
            (n) => n.tag && n.tag !== tag && n.tag.startsWith(`${tag}-`),
          );

          const latestExisting = sameTag[sameTag.length - 1];
          const existingDataFromTray =
            (latestExisting?.data as GroupedNotificationData | undefined) ?? null;

          // If the tray still has this card, prefer whichever has newer lines (tray or in-memory burst state);
          // if the user cleared/dismissed the card from the tray, reset cleanly to start a fresh stack!
          let seedData: GroupedNotificationData | null = null;
          let seedBody: string | undefined = latestExisting?.body;

          if (latestExisting) {
            const mem = latestTagState.get(tag);
            const trayCount = existingDataFromTray?.count ?? 0;
            const memCount = mem?.count ?? 0;
            seedData = mem && memCount > trayCount ? mem : existingDataFromTray;
          } else {
            latestTagState.delete(tag);
          }

          // Fold any stray legacy cards (from pre-v6 senders) into this single card and close them
          if (strayLegacy.length > 0) {
            const strayLines = strayLegacy
              .map((n) => (n.body || '').trim())
              .filter(Boolean);
            const existingLines = seedData?.lines ?? (seedBody ? seedBody.split('\n') : []);
            seedData = {
              ...(seedData ?? {}),
              lines: [...existingLines, ...strayLines],
              count: (seedData?.count ?? existingLines.length) + strayLines.length,
            };
            strayLegacy.forEach((n) => n.close());
          }

          const merged = buildMergedNotificationContent({
            baseTitle: title,
            newLine: body,
            groupKind: inferredGroupKind,
            messageId: payload.messageId,
            existingData: seedData,
            existingBody: seedBody,
          });
          finalTitle = merged.title;
          finalBody = merged.body;
          notifData = {
            ...notifData,
            ...merged.data,
          };
          latestTagState.set(tag, notifData);

          if (merged.duplicate) {
            await self.registration.showNotification(finalTitle, {
              body: finalBody,
              icon,
              badge,
              tag,
              renotify: false,
              silent: true,
              timestamp: Date.now(),
              data: notifData,
            } as NotificationOptions);
            return;
          }
        } catch {
          // fall back to single notification
        }
      }

      try {
        await self.registration.showNotification(finalTitle, {
          body: finalBody,
          icon,
          badge,
          tag,
          renotify: true,
          silent: false,
          vibrate: [180, 70, 180],
          timestamp: Date.now(),
          data: notifData,
        } as NotificationOptions);
      } catch (err) {
        for (const client of windowClients) {
          client.postMessage({
            type: 'GASKEUN_PUSH_DEBUG',
            phase: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
        // Fallback STILL preserves tag + data so OEMs never spawn a duplicate separate card
        await self.registration.showNotification(finalTitle, {
          body: finalBody,
          tag,
          renotify: true,
          data: notifData,
        } as NotificationOptions);
      }
    }),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  const pushEvent = event as ExtendableEvent & {
    oldSubscription?: PushSubscription;
    newSubscription?: PushSubscription;
  };
  pushEvent.waitUntil(
    (async () => {
      try {
        let nextSub: PushSubscription | null = pushEvent.newSubscription ?? null;
        if (!nextSub) {
          const appKey = pushEvent.oldSubscription?.options?.applicationServerKey;
          if (!appKey) return;
          nextSub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appKey,
          });
        }
        if (!nextSub) return;

        // Immediately persist rotated endpoint to Supabase so push survives phone reboots
        const json = typeof nextSub.toJSON === 'function' ? nextSub.toJSON() : null;
        const newEndpoint = (json?.endpoint || nextSub.endpoint || '').trim();
        const p256dh = String(json?.keys?.p256dh ?? '').trim();
        const auth = String(json?.keys?.auth ?? '').trim();
        if (!newEndpoint || !p256dh || !auth || typeof caches === 'undefined') return;

        const cache = await caches.open(PUSH_META_CACHE_NAME);
        const cachedResp = await cache.match(PUSH_META_CACHE_URL);
        if (!cachedResp) return;
        const meta = (await cachedResp.json()) as {
          tripCode?: string;
          memberId?: string;
          supabaseUrl?: string;
          supabaseKey?: string;
          endpoint?: string;
        };
        if (!meta.supabaseUrl || !meta.supabaseKey || !meta.tripCode || !meta.memberId) return;

        const baseUrl = meta.supabaseUrl.replace(/\/+$/, '');
        const headers = {
          'Content-Type': 'application/json',
          apikey: meta.supabaseKey,
          Authorization: `Bearer ${meta.supabaseKey}`,
          Prefer: 'resolution=merge-duplicates',
        };

        await fetch(`${baseUrl}/rest/v1/trip_push_subscriptions?on_conflict=endpoint`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            endpoint: newEndpoint,
            trip_code: meta.tripCode,
            member_id: meta.memberId,
            p256dh,
            auth,
            updated_at: new Date().toISOString(),
          }),
        });

        const oldEndpoint = (pushEvent.oldSubscription?.endpoint || meta.endpoint || '').trim();
        if (oldEndpoint && oldEndpoint !== newEndpoint) {
          await fetch(
            `${baseUrl}/rest/v1/trip_push_subscriptions?endpoint=eq.${encodeURIComponent(oldEndpoint)}`,
            { method: 'DELETE', headers },
          ).catch(() => undefined);
        }

        await cache.put(
          PUSH_META_CACHE_URL,
          new Response(
            JSON.stringify({
              ...meta,
              endpoint: newEndpoint,
              updatedAt: new Date().toISOString(),
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      } catch {
        // Client will re-sync subscription on next app open / online event
      }
    })(),
  );
});

self.addEventListener('notificationclose', (event: NotificationEvent) => {
  if (event.notification.tag) {
    latestTagState.delete(event.notification.tag);
  }
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  if (event.notification.tag) {
    latestTagState.delete(event.notification.tag);
  }
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
