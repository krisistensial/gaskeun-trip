import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMergedNotificationContent,
  formatChatNotificationCopy,
  formatTripUpdateNotificationCopy,
  getDeviceNotificationPermission,
  getDeviceNotificationsEnabled,
  normalizeGroupedNotificationTag,
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

  it('formats compact anti-stacking chat/trip notifications and fires OS alerts when hidden or unfocused', () => {
    expect(shouldFireOsNotification(false)).toBe(false);
    expect(shouldFireOsNotification(false, true)).toBe(false);
    expect(shouldFireOsNotification(false, false)).toBe(true);
    expect(shouldFireOsNotification(true, true)).toBe(true);

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

  it('merges multiple chat messages into 1 expandable multi-line card and deduplicates by messageId', () => {
    const first = buildMergedNotificationContent({
      baseTitle: 'SOLO JOGJA',
      newLine: 'Chika: udah aman',
      groupKind: 'chat',
      messageId: 'm-1',
    });
    expect(first.title).toBe('SOLO JOGJA');
    expect(first.body).toBe('Chika: udah aman');
    expect(first.duplicate).toBe(false);

    // Duplicate delivery (e.g. Realtime + Push for same m-1) does not duplicate lines
    const dup = buildMergedNotificationContent({
      baseTitle: 'SOLO JOGJA',
      newLine: 'Chika: udah aman',
      groupKind: 'chat',
      messageId: 'm-1',
      existingData: first.data,
      existingBody: first.body,
    });
    expect(dup.duplicate).toBe(true);
    expect(dup.data.count).toBe(1);

    const second = buildMergedNotificationContent({
      baseTitle: 'SOLO JOGJA',
      newLine: 'Dora: Enaknya kapan ya',
      groupKind: 'chat',
      messageId: 'm-2',
      existingData: first.data,
      existingBody: first.body,
    });
    expect(second.title).toBe('SOLO JOGJA (2 messages)');
    expect(second.body).toBe('Chika: udah aman\nDora: Enaknya kapan ya');
    expect(second.data.count).toBe(2);

    // Caps visible lines to 8 while preserving accurate total count
    let acc = second;
    for (let i = 3; i <= 10; i++) {
      acc = buildMergedNotificationContent({
        baseTitle: 'SOLO JOGJA',
        newLine: `Crew: msg ${i}`,
        groupKind: 'chat',
        messageId: `m-${i}`,
        existingData: acc.data,
        existingBody: acc.body,
      });
    }
    expect(acc.title).toBe('SOLO JOGJA (10 messages)');
    expect(acc.data.lines).toHaveLength(8);
    expect(acc.data.lines[0]).toBe('Crew: msg 3');
    expect(acc.data.lines[7]).toBe('Crew: msg 10');

    // Legacy per-message tags always collapse to 1 single trip chat/trip tag
    expect(
      normalizeGroupedNotificationTag({
        tag: 'chat-SOLO-27-msg-abc123',
        groupKind: 'chat',
      }),
    ).toBe('chat-SOLO-27');
    expect(
      normalizeGroupedNotificationTag({
        tag: 'poll-SOLO-27-poll-99',
        openChat: true,
      }),
    ).toBe('chat-SOLO-27');
    expect(
      normalizeGroupedNotificationTag({
        tag: 'trip-SOLO-27-log-777',
        groupKind: 'trip',
      }),
    ).toBe('trip-SOLO-27');
  });
});
