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
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 900)),
      ]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(payload.title, {
          body: payload.body,
          icon,
          badge,
          tag: payload.tag || `gaskeun-${Date.now()}`,
        });
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
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Browser declined showing notification.',
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
