export const NOTIFICATIONS_STORAGE_KEY = 'gaskeun_notifications_enabled';

export type DeviceNotificationPermission = 'unsupported' | 'default' | 'granted' | 'denied';

export interface DeviceNotificationResult {
  ok: boolean;
  error?: string;
}

export interface DeviceNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  renotify?: boolean;
}

function truncateNotificationText(raw: string, maxLen = 72): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Formats compact, non-stacked notification copy for Crew Chat messages & polls.
 */
export function formatChatNotificationCopy(params: {
  tripTitle: string;
  senderName: string;
  kind: 'text' | 'sticker' | 'poll';
  text: string;
  unreadFromOthers?: number;
  isMentioned?: boolean;
}): { title: string; body: string } {
  const title = truncateNotificationText(params.tripTitle || 'Crew Chat', 36);
  const sender = params.senderName.trim() || 'Crew';
  const unread = Math.max(1, params.unreadFromOthers ?? 1);
  const mentionPrefix = params.isMentioned ? 'Mentioned you · ' : '';

  let preview = '';
  if (params.kind === 'sticker') {
    preview = `${sender} sent a sticker ✨`;
  } else if (params.kind === 'poll') {
    preview = `Poll · ${sender}: ${params.text}`;
  } else if (unread > 1) {
    preview = `(${unread} unread) ${sender}: ${params.text}`;
  } else {
    preview = `${sender}: ${params.text}`;
  }

  return {
    title,
    body: truncateNotificationText(`${mentionPrefix}${preview}`, 80),
  };
}

/**
 * Formats compact, single-line trip update copy for background sync notifications.
 */
export function formatTripUpdateNotificationCopy(params: {
  tripTitle: string;
  actorName: string;
  action: string;
}): { title: string; body: string } {
  return {
    title: truncateNotificationText(params.tripTitle || 'Trip Updated', 36),
    body: truncateNotificationText(`${params.actorName}: ${params.action}`, 76),
  };
}

/**
 * Fire OS tray notifications when the app is backgrounded OR the browser window
 * is currently unfocused (e.g. covered window / desktop workspace / split-screen),
 * while actively focused sessions use the sleek in-app heads-up banner/toast.
 */
export function shouldFireOsNotification(
  isDocumentHidden: boolean,
  hasDocumentFocus = true,
): boolean {
  return Boolean(isDocumentHidden || !hasDocumentFocus);
}

export function isDeviceNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getDeviceNotificationPermission(): DeviceNotificationPermission {
  if (!isDeviceNotificationSupported()) return 'unsupported';
  return window.Notification.permission;
}

export function getDeviceNotificationsEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setDeviceNotificationsEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(Boolean(enabled)));
  } catch {
    // ignore storage restrictions
  }
}

function resolveAssetUrl(file: string): string {
  try {
    const base = import.meta.env.BASE_URL || '/';
    if (typeof window !== 'undefined' && window.location?.origin) {
      return new URL(`${base}${file}`, window.location.origin).href;
    }
    return `${base}${file}`;
  } catch {
    return `./${file}`;
  }
}

/**
 * Displays an OS / Android PWA tray notification when permission is granted
 * and returns a clear result object so manual tests can surface diagnostics.
 */
export async function tryShowDeviceNotification(
  payload: DeviceNotificationPayload,
): Promise<DeviceNotificationResult> {
  if (!isDeviceNotificationSupported()) {
    return {
      ok: false,
      error: 'On iPhone/iPad, install GASKEUN via Share -> Add to Home Screen to enable alerts.',
    };
  }
  if (window.Notification.permission === 'denied') {
    return {
      ok: false,
      error: 'Notifications are blocked in your browser/phone site settings.',
    };
  }
  if (window.Notification.permission !== 'granted') {
    return {
      ok: false,
      error: 'Notification permission not granted yet.',
    };
  }
  if (!getDeviceNotificationsEnabled()) {
    return {
      ok: false,
      error: 'Phone notifications are paused on this device.',
    };
  }

  const icon = resolveAssetUrl('pwa-192x192.png');
  const badge = resolveAssetUrl('favicon-32x32.png');

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const sw = navigator.serviceWorker;
      let reg: ServiceWorkerRegistration | null | undefined = null;
      if (typeof sw.getRegistration === 'function') {
        reg =
          (await sw.getRegistration(resolveAssetUrl('')).catch(() => undefined)) ??
          (await sw.getRegistration().catch(() => undefined));
      }
      if (!reg && sw.ready) {
        let timerId: ReturnType<typeof globalThis.setTimeout> | undefined;
        reg = await Promise.race([
          sw.ready.catch(() => null),
          new Promise<null>((resolve) => {
            timerId = globalThis.setTimeout(() => resolve(null), 2500);
          }),
        ]);
        if (timerId !== undefined) globalThis.clearTimeout(timerId);
      }
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(payload.title, {
          body: payload.body,
          icon,
          badge,
          tag: payload.tag || `gaskeun-${Date.now()}`,
          silent: false,
          vibrate: [180, 70, 180],
          timestamp: Date.now(),
          ...(payload.renotify ? { renotify: true } : {}),
        } as NotificationOptions);
        return { ok: true };
      }
    }
  } catch {
    // fall through cleanly to window.Notification
  }

  try {
    new window.Notification(payload.title, {
      body: payload.body,
      icon,
      tag: payload.tag || `gaskeun-${Date.now()}`,
    });
    return { ok: true };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : '';
    const friendlyMsg = /illegal constructor/i.test(rawMsg)
      ? 'Install PWA or reload once so the notification Service Worker stays active.'
      : rawMsg || 'Browser declined showing notification.';
    return {
      ok: false,
      error: friendlyMsg,
    };
  }
}

export async function showDeviceNotification(
  payload: DeviceNotificationPayload,
): Promise<boolean> {
  const res = await tryShowDeviceNotification(payload);
  return res.ok;
}

export async function requestDeviceNotificationPermission(): Promise<{
  permission: DeviceNotificationPermission;
  granted: boolean;
  shown?: boolean;
  error?: string;
}> {
  if (!isDeviceNotificationSupported()) {
    return {
      permission: 'unsupported',
      granted: false,
      error:
        'Notifications require Safari -> Share -> Add to Home Screen on iOS, or a supported browser.',
    };
  }

  try {
    const result = await window.Notification.requestPermission();
    const granted = result === 'granted';
    if (granted) {
      setDeviceNotificationsEnabled(true);
      const testRes = await tryShowDeviceNotification({
        title: 'GASKEUN! Notifications On',
        body: 'Crew Chat messages and trip updates will now alert this phone.',
        tag: `gaskeun-welcome-${Date.now()}`,
      });
      return {
        permission: result,
        granted: true,
        shown: testRes.ok,
        error: testRes.error,
      };
    }
    return {
      permission: result,
      granted: false,
      error:
        result === 'denied'
          ? 'Notifications blocked — allow alerts in browser site settings.'
          : 'Notification prompt dismissed.',
    };
  } catch (err) {
    return {
      permission: getDeviceNotificationPermission(),
      granted: false,
      error: err instanceof Error ? err.message : 'Could not request notifications.',
    };
  }
}
