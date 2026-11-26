import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchBackgroundPush,
  extractPushSubscriptionKeys,
  fetchVapidPublicKey,
  resetPushKeyCacheForTest,
  resolvePushApiUrl,
  urlBase64ToUint8Array,
  verifyActivePushServiceWorker,
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

  it('waits for an installing Service Worker to activate before verifying push capability', async () => {
    const listeners = new Set<() => void>();
    const newWorker = {
      state: 'installing',
      addEventListener: vi.fn((ev: string, fn: () => void) => {
        if (ev === 'statechange') listeners.add(fn);
      }),
      removeEventListener: vi.fn((ev: string, fn: () => void) => {
        if (ev === 'statechange') listeners.delete(fn);
      }),
      postMessage: vi.fn((msg: { type?: string }, ports?: MessagePort[]) => {
        if (msg.type === 'GASKEUN_SW_PING' && ports?.[0]) {
          ports[0].postMessage({ ok: true, version: 'push-v4', hasPushListener: true });
        }
      }),
    };

    const fakeReg: {
      active: typeof newWorker | null;
      waiting: typeof newWorker | null;
      installing: typeof newWorker | null;
      update: ReturnType<typeof vi.fn>;
    } = {
      active: null,
      waiting: null,
      installing: null,
      update: vi.fn(async () => {
        fakeReg.installing = newWorker;
        globalThis.setTimeout(() => {
          newWorker.state = 'activated';
          fakeReg.installing = null;
          fakeReg.active = newWorker;
          listeners.forEach((fn) => fn());
        }, 10);
      }),
    };

    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn(async () => fakeReg),
      },
    });

    const check = await verifyActivePushServiceWorker();
    expect(check).toEqual({
      registered: true,
      pushCapable: true,
      version: 'push-v4',
      state: 'activated',
    });
  });
});
