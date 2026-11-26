import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatChatNotificationCopy,
  formatTripUpdateNotificationCopy,
  getDeviceNotificationPermission,
  getDeviceNotificationsEnabled,
  NOTIFICATIONS_STORAGE_KEY,
  setDeviceNotificationsEnabled,
  shouldFireOsNotification,
  showDeviceNotification,
} from './notifications';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (idx: number) => Array.from(map.keys())[idx] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, val: string) => {
      map.set(key, String(val));
    },
  };
}

describe('Device / Phone Notification service', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults device notifications enabled unless explicitly muted in localStorage', () => {
    expect(getDeviceNotificationsEnabled()).toBe(true);
    setDeviceNotificationsEnabled(false);
    expect(localStorage.getItem(NOTIFICATIONS_STORAGE_KEY)).toBe('false');
    expect(getDeviceNotificationsEnabled()).toBe(false);
  });

  it('safely returns unsupported or false when Notification API is unavailable', async () => {
    vi.stubGlobal('window', {});
    expect(getDeviceNotificationPermission()).toBe('unsupported');
    expect(
      await showDeviceNotification({ title: 'Test', body: 'Hello' }),
    ).toBe(false);
  });

  it('uses ServiceWorkerRegistration.showNotification when permission is granted', async () => {
    const swShowMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      Notification: { permission: 'granted' },
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({ showNotification: swShowMock }),
      },
    });

    const shown = await showDeviceNotification({
      title: 'Kris · Crew Chat',
      body: 'OTW Stasiun!',
      tag: 'chat-SOLO-27',
    });

    expect(shown).toBe(true);
    expect(swShowMock).toHaveBeenCalledWith(
      'Kris · Crew Chat',
      expect.objectContaining({
        body: 'OTW Stasiun!',
        tag: 'chat-SOLO-27',
      }),
    );
  });

  it('formats compact anti-stacking chat/trip notifications and restricts OS tray alerts to background', () => {
    expect(shouldFireOsNotification(false)).toBe(false);
    expect(shouldFireOsNotification(true)).toBe(true);

    const stickerAlert = formatChatNotificationCopy({
      tripTitle: 'Solo – Jogja',
      senderName: 'Rani',
      kind: 'sticker',
      text: 'Gaskeun',
    });
    expect(stickerAlert).toEqual({
      title: 'Solo – Jogja',
      body: 'Rani sent a sticker ✨',
    });

    const groupedMentionAlert = formatChatNotificationCopy({
      tripTitle: 'Solo – Jogja',
      senderName: 'Kris',
      kind: 'text',
      text: '@Rani meet at Gate 2 now!',
      unreadFromOthers: 4,
      isMentioned: true,
    });
    expect(groupedMentionAlert.title).toBe('Solo – Jogja');
    expect(groupedMentionAlert.body).toContain('Mentioned you ·');
    expect(groupedMentionAlert.body).toContain('(4 unread)');

    const tripAlert = formatTripUpdateNotificationCopy({
      tripTitle: 'Solo – Jogja',
      actorName: 'Dora',
      action: 'Updated Hotel Check-in',
    });
    expect(tripAlert).toEqual({
      title: 'Solo – Jogja',
      body: 'Dora: Updated Hotel Check-in',
    });
  });
});
