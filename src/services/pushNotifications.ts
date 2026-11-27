import { getSupabaseClient } from './supabaseSync';
import {
  getDeviceNotificationPermission,
  getDeviceNotificationsEnabled,
} from './notifications';

export type WebPushSyncStatus =
  | 'subscribed'
  | 'unconfigured'
  | 'unsupported'
  | 'permission_required'
  | 'paused'
  | 'table_missing'
  | 'error';

export interface WebPushSyncResult {
  ok: boolean;
  status: WebPushSyncStatus;
  error?: string;
}

export interface BackgroundPushDispatchPayload {
  tripCode: string;
  senderId: string;
  targetMemberId?: string;
  title: string;
  body: string;
  tag?: string;
  messageId?: string;
  groupKind?: 'chat' | 'trip';
  renotify?: boolean;
  openChat?: boolean;
  url?: string;
  forceShow?: boolean;
}

export interface BackgroundPushDispatchResult {
  ok: boolean;
  sent?: number;
  totalTargets?: number;
  expired?: number;
  failedCount?: number;
  error?: string;
}

export interface ActivePushSwCheck {
  registered: boolean;
  pushCapable: boolean;
  version: string | null;
  state: string | null;
}

let cachedVapidPublicKey: string | null = null;
const PUSH_META_CACHE_NAME = 'gaskeun-push-meta-v1';
const PUSH_META_CACHE_URL = '/__gaskeun_push_meta__';

interface StoredPushMeta {
  tripCode: string;
  memberId: string;
  supabaseUrl: string;
  supabaseKey: string;
  endpoint: string;
  updatedAt: string;
}

async function saveSwPushSyncMeta(meta: StoredPushMeta): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(PUSH_META_CACHE_NAME);
    await cache.put(
      PUSH_META_CACHE_URL,
      new Response(JSON.stringify(meta), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch {
    // ignore storage/cache restrictions
  }
}

async function clearSwPushSyncMeta(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(PUSH_META_CACHE_NAME);
    await cache.delete(PUSH_META_CACHE_URL);
  } catch {
    // ignore cleanup errors
  }
}

export function resolvePushApiUrl(): string {
  const configured = String(import.meta.env.VITE_PUSH_API_URL ?? '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  return '/api/push';
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const clean = base64String.trim();
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = globalThis.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function extractPushSubscriptionKeys(sub: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} | null {
  const json = typeof sub.toJSON === 'function' ? sub.toJSON() : null;
  const endpoint = (json?.endpoint || sub.endpoint || '').trim();
  const p256dh = String(json?.keys?.p256dh ?? '').trim();
  const auth = String(json?.keys?.auth ?? '').trim();
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  const fromBuildEnv = String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();
  if (fromBuildEnv) {
    cachedVapidPublicKey = fromBuildEnv;
    return fromBuildEnv;
  }
  if (cachedVapidPublicKey) {
    return cachedVapidPublicKey;
  }
  if (typeof fetch !== 'function') {
    return null;
  }

  try {
    const res = await fetch(resolvePushApiUrl(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    const data = (await res.json()) as { configured?: boolean; publicKey?: string | null };
    if (data.configured && data.publicKey && data.publicKey.trim()) {
      cachedVapidPublicKey = data.publicKey.trim();
      return cachedVapidPublicKey;
    }
    return null;
  } catch {
    return null;
  }
}

export function resetPushKeyCacheForTest(): void {
  cachedVapidPublicKey = null;
}

function keysMatch(
  existingKey: ArrayBuffer | null | undefined,
  expected: Uint8Array,
): boolean {
  if (!existingKey) return true;
  const current = new Uint8Array(existingKey);
  if (current.length !== expected.length) return false;
  for (let i = 0; i < current.length; i += 1) {
    if (current[i] !== expected[i]) return false;
  }
  return true;
}

async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  const sw = navigator.serviceWorker;
  const base = import.meta.env.BASE_URL || '/';
  let reg: ServiceWorkerRegistration | undefined | null = null;
  if (typeof sw.getRegistration === 'function') {
    reg =
      (await sw.getRegistration(base).catch(() => undefined)) ??
      (await sw.getRegistration().catch(() => undefined));
  }
  if (!reg && typeof sw.register === 'function') {
    const swUrl = `${base.endsWith('/') ? base : `${base}/`}sw.js`;
    reg = await sw.register(swUrl, { scope: base }).catch(() => undefined);
  }
  if (!reg && sw.ready) {
    let timerId: ReturnType<typeof globalThis.setTimeout> | undefined;
    reg = await Promise.race([
      sw.ready.catch(() => null),
      new Promise<null>((resolve) => {
        timerId = globalThis.setTimeout(() => resolve(null), 3000);
      }),
    ]);
    if (timerId !== undefined) globalThis.clearTimeout(timerId);
  }
  return reg ?? null;
}

async function waitForWorkerActivation(
  worker: ServiceWorker | null | undefined,
  timeoutMs = 4500,
): Promise<void> {
  if (!worker) return;
  if (worker.state === 'activated' || worker.state === 'redundant') return;
  if (worker.state === 'installed') {
    try {
      worker.postMessage({ type: 'GASKEUN_SKIP_WAITING' });
    } catch {
      // ignore postMessage failure
    }
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      worker.removeEventListener('statechange', onStateChange);
      resolve();
    };
    const onStateChange = () => {
      if (worker.state === 'installed') {
        try {
          worker.postMessage({ type: 'GASKEUN_SKIP_WAITING' });
        } catch {
          // ignore
        }
      } else if (worker.state === 'activated' || worker.state === 'redundant') {
        finish();
      }
    };
    const timer = globalThis.setTimeout(finish, timeoutMs);
    worker.addEventListener('statechange', onStateChange);
  });
}

function isMissingPushTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  const code = String(e.code ?? '').toUpperCase();
  const msg = String(e.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('trip_push_subscriptions') && (msg.includes('does not exist') || msg.includes('not find'))
  );
}

export async function ensureWebPushSubscription(
  tripCode: string,
  memberId: string | null | undefined,
): Promise<WebPushSyncResult> {
  const cleanCode = tripCode.trim().toUpperCase();
  const cleanMemberId = (memberId || 'guest').trim();
  if (cleanCode.length < 3) {
    return { ok: false, status: 'error', error: 'Invalid trip code' };
  }
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return { ok: false, status: 'unsupported' };
  }
  if (getDeviceNotificationPermission() !== 'granted') {
    return { ok: false, status: 'permission_required' };
  }
  if (!getDeviceNotificationsEnabled()) {
    return { ok: false, status: 'paused' };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, status: 'unconfigured' };
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) {
    return { ok: false, status: 'unconfigured' };
  }

  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (!reg || !reg.pushManager) {
      return { ok: false, status: 'unsupported' };
    }

    const expectedKeyBytes = urlBase64ToUint8Array(publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !keysMatch(sub.options?.applicationServerKey, expectedKeyBytes)) {
      await sub.unsubscribe().catch(() => undefined);
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKeyBytes,
      });
    }

    const keys = extractPushSubscriptionKeys(sub);
    if (!keys) {
      return { ok: false, status: 'error', error: 'Missing push subscription keys' };
    }

    const { error } = await supabase.from('trip_push_subscriptions').upsert(
      {
        endpoint: keys.endpoint,
        trip_code: cleanCode,
        member_id: cleanMemberId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent:
          typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );

    if (error) {
      if (isMissingPushTableError(error)) {
        return { ok: false, status: 'table_missing', error: error.message };
      }
      return { ok: false, status: 'error', error: error.message };
    }

    const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '')
      .trim()
      .replace(/\/+$/, '');
    const supabaseKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
    if (supabaseUrl && supabaseKey) {
      await saveSwPushSyncMeta({
        tripCode: cleanCode,
        memberId: cleanMemberId,
        supabaseUrl,
        supabaseKey,
        endpoint: keys.endpoint,
        updatedAt: new Date().toISOString(),
      });
    }

    return { ok: true, status: 'subscribed' };
  } catch (err) {
    return {
      ok: false,
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to register background push',
    };
  }
}

export async function removeWebPushSubscription(): Promise<void> {
  try {
    const reg = await getActiveServiceWorkerRegistration();
    const sub = reg?.pushManager ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => undefined);

    const supabase = getSupabaseClient();
    if (supabase && endpoint) {
      await supabase
        .from('trip_push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);
    }
    await clearSwPushSyncMeta();
  } catch {
    // ignore cleanup failures
  }
}

export async function verifyActivePushServiceWorker(): Promise<ActivePushSwCheck> {
  const reg = await getActiveServiceWorkerRegistration();
  if (!reg) {
    return { registered: false, pushCapable: false, version: null, state: null };
  }
  await reg.update().catch(() => undefined);
  const incoming = reg.waiting ?? reg.installing;
  if (incoming) {
    await waitForWorkerActivation(incoming, 4500);
  }
  const worker = reg.active ?? reg.waiting ?? reg.installing;
  if (!worker) {
    return { registered: true, pushCapable: false, version: null, state: 'none' };
  }

  const pong = await new Promise<{ version?: string; hasPushListener?: boolean } | null>(
    (resolve) => {
      if (typeof MessageChannel === 'undefined') {
        resolve(null);
        return;
      }
      const channel = new MessageChannel();
      const timer = globalThis.setTimeout(() => resolve(null), 1500);
      channel.port1.onmessage = (ev) => {
        globalThis.clearTimeout(timer);
        resolve((ev.data ?? null) as { version?: string; hasPushListener?: boolean } | null);
      };
      try {
        worker.postMessage({ type: 'GASKEUN_SW_PING' }, [channel.port2]);
      } catch {
        globalThis.clearTimeout(timer);
        resolve(null);
      }
    },
  );

  return {
    registered: true,
    pushCapable: Boolean(pong?.hasPushListener),
    version: pong?.version ?? null,
    state: worker.state ?? null,
  };
}

export async function dispatchBackgroundPushDetailed(
  payload: BackgroundPushDispatchPayload,
): Promise<BackgroundPushDispatchResult> {
  if (typeof fetch !== 'function') {
    return { ok: false, error: 'Fetch unavailable' };
  }
  const cleanCode = payload.tripCode.trim().toUpperCase();
  if (cleanCode.length < 3 || !payload.body.trim()) {
    return { ok: false, error: 'Invalid trip code or body' };
  }

  try {
    const res = await fetch(resolvePushApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        tripCode: cleanCode,
      }),
      keepalive: true,
    });
    let data: {
      ok?: boolean;
      sent?: number;
      totalTargets?: number;
      expired?: number;
      failed?: Array<{ statusCode?: number; message?: string }>;
      error?: string;
    } | null = null;
    try {
      data = (await res.json()) as {
        ok?: boolean;
        sent?: number;
        totalTargets?: number;
        expired?: number;
        failed?: Array<{ statusCode?: number; message?: string }>;
        error?: string;
      };
    } catch {
      data = null;
    }
    if (!res.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    const firstFail = data?.failed?.[0];
    return {
      ok: Boolean(data?.ok ?? true),
      sent: data?.sent,
      totalTargets: data?.totalTargets,
      expired: data?.expired,
      failedCount: data?.failed?.length ?? 0,
      error:
        data?.error ||
        (firstFail
          ? `Push rejected (${firstFail.statusCode ?? '?'}): ${firstFail.message ?? ''}`
          : undefined),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

export async function dispatchBackgroundPush(
  payload: BackgroundPushDispatchPayload,
): Promise<boolean> {
  const res = await dispatchBackgroundPushDetailed(payload);
  return res.ok;
}
