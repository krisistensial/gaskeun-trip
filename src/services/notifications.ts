export const NOTIFICATIONS_STORAGE_KEY = 'gaskeun_notifications_enabled';

export type DeviceNotificationPermission = 'unsupported' | 'default' | 'granted' | 'denied';

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

export interface DeviceNotificationPayload {
  title: string;
  body: string;
  tag?: string;
}

/**
 * Displays an OS / Android PWA tray notification when permission is granted
 * and the user has notifications enabled on this device.
 */
export async function showDeviceNotification(
  payload: DeviceNotificationPayload,
): Promise<boolean> {
  if (!isDeviceNotificationSupported()) return false;
  if (window.Notification.permission !== 'granted') return false;
  if (!getDeviceNotificationsEnabled()) return false;

  const icon = `${import.meta.env.BASE_URL}pwa-192x192.png`;
  const badge = `${import.meta.env.BASE_URL}favicon-32x32.png`;

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 650)),
      ]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(payload.title, {
          body: payload.body,
          icon,
          badge,
          tag: payload.tag || 'gaskeun-alert',
        });
        return true;
      }
    }
  } catch {
    // fall through to window.Notification
  }

  try {
    new window.Notification(payload.title, {
      body: payload.body,
      icon,
      tag: payload.tag || 'gaskeun-alert',
    });
    return true;
  } catch {
    return false;
  }
}

export async function requestDeviceNotificationPermission(): Promise<{
  permission: DeviceNotificationPermission;
  granted: boolean;
}> {
  if (!isDeviceNotificationSupported()) {
    return { permission: 'unsupported', granted: false };
  }

  try {
    const result = await window.Notification.requestPermission();
    const granted = result === 'granted';
    if (granted) {
      setDeviceNotificationsEnabled(true);
      void showDeviceNotification({
        title: 'GASKEUN! Notifications On',
        body: 'Crew Chat messages and trip updates will now alert this phone.',
        tag: 'gaskeun-welcome',
      });
    }
    return { permission: result, granted };
  } catch {
    return { permission: getDeviceNotificationPermission(), granted: false };
  }
}
