import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchBackgroundPush,
  extractPushSubscriptionKeys,
  fetchVapidPublicKey,
  resetPushKeyCacheForTest,
  resolvePushApiUrl,
  urlBase64ToUint8Array,
} from './pushNotifications';

describe('Background Web Push client service', () => {
  afterEach(() => {
    resetPushKeyCacheForTest();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('converts URL-safe base64 VAPID public keys into Uint8Array bytes', () => {
    const bytes = urlBase64ToUint8Array('SGVsbG8td29ybGQ_');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(8);
  });

  it('defaults push relay endpoint to /api/push', () => {
    expect(resolvePushApiUrl()).toBe('/api/push');
  });

  it('extracts endpoint and encryption keys from PushSubscription JSON', () => {
    const fakeSub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
      }),
    } as unknown as PushSubscription;

    expect(extractPushSubscriptionKeys(fakeSub)).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'key-p256dh',
      auth: 'key-auth',
    });
  });

  it('auto-discovers VAPID public key from GET /api/push and dispatches background pushes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ ok: true, configured: true, publicKey: 'BPubKeyTest123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, sent: 2 }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const key = await fetchVapidPublicKey();
    expect(key).toBe('BPubKeyTest123');

    const dispatched = await dispatchBackgroundPush({
      tripCode: 'solo-27',
      senderId: 'm-1',
      title: 'Solo – Jogja · Kris',
      body: 'OTW Stasiun!',
      openChat: true,
    });
    expect(dispatched).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/push',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
      }),
    );
  });
});
