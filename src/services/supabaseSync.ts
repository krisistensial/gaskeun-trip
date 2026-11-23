import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  clearOfflineQueueItem,
  enqueueOfflineMutation,
  getOfflineQueue,
  saveSharedTrip,
} from './db';
import type { OfflineQueueItem, SharedTrip } from '../types/trip';

let cachedClient: SupabaseClient | null | undefined;

export function isCloudSyncConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key && String(url).trim() && String(key).trim());
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;
  if (!isCloudSyncConfigured()) {
    cachedClient = null;
    return null;
  }
  const cleanUrl = String(import.meta.env.VITE_SUPABASE_URL).trim().replace(/\/+$/, '');
  const cleanKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY).trim();
  cachedClient = createClient(cleanUrl, cleanKey);
  return cachedClient;
}

function parseTimestampMs(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Extracts a concise, real diagnostic message from a PostgREST / Supabase / Fetch error
 * so UI toasts & DevTools logs show the exact root cause instead of generic strings.
 */
export function formatSupabaseError(error: unknown): string {
  if (!error) return 'Unknown Supabase error';
  if (typeof error === 'string') return error.trim() || 'Unknown Supabase error';

  if (error instanceof Error) {
    return error.message.trim() || error.name || 'Network error';
  }

  if (typeof error === 'object') {
    const e = error as {
      status?: number;
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
      error_description?: string;
    };
    const prefix = e.code ? `${e.code}` : e.status ? `${e.status}` : '';
    const msg = (e.message || e.error_description || e.details || e.hint || '').trim();
    if (prefix && msg) {
      const combined = msg.includes(prefix) ? msg : `${prefix} ${msg}`;
      return combined.length > 96 ? `${combined.slice(0, 93)}...` : combined;
    }
    if (msg) return msg.length > 96 ? `${msg.slice(0, 93)}...` : msg;
    if (prefix) return `Error ${prefix}`;
  }

  return 'Unknown Supabase error';
}

function isMissingRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  const code = String(e.code ?? '').toUpperCase();
  const msg = String(e.message ?? '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    (msg.includes('create_or_mutate_trip') &&
      (msg.includes('not find') || msg.includes('does not exist')))
  );
}

/**
 * Normalizes a Layer-1 `SharedTrip` payload for storage & cloud sync:
 * - Strips any accidentally attached Layer-2 `personal` transactions
 * - Promotes/aligns `coverPhotoUrl` and legacy `heroCoverUrl`
 * - Uses the newer of `trip.updatedAt` and the Postgres `shared_trips.updated_at`
 */
export function normalizeSharedTripPayload(
  trip: SharedTrip,
  rowUpdatedAt?: string,
): SharedTrip {
  const sharedCover = trip.coverPhotoUrl || trip.heroCoverUrl || undefined;
  const payloadMs = parseTimestampMs(trip.updatedAt);
  const rowMs = parseTimestampMs(rowUpdatedAt);
  const resolvedUpdatedAt =
    rowMs > payloadMs && rowUpdatedAt
      ? rowUpdatedAt
      : trip.updatedAt || rowUpdatedAt || new Date().toISOString();

  return {
    ...trip,
    code: trip.code.trim().toUpperCase(),
    coverPhotoUrl: sharedCover,
    heroCoverUrl: sharedCover,
    transactions: Array.isArray(trip.transactions)
      ? trip.transactions.filter((tx) => tx.pocket !== 'personal')
      : [],
    updatedAt: resolvedUpdatedAt,
  };
}

/**
 * Decides whether a remote `SharedTrip` from Supabase should replace the local Layer-1 copy.
 * - `force: true` (manual Sync button) always applies the authoritative cloud copy.
 * - Unedited/stale local copies (including freshly seeded demos) never block a newer remote copy.
 * - Pending offline local mutations are only preserved when the local copy is strictly newer.
 */
export function shouldApplyRemoteTrip(
  localTrip: SharedTrip | null | undefined,
  remoteTrip: SharedTrip,
  options?: { force?: boolean; hasPendingLocalMutations?: boolean },
): boolean {
  if (options?.force) return true;
  if (!localTrip) return true;

  const remoteMs = parseTimestampMs(remoteTrip.updatedAt);
  const localMs = parseTimestampMs(localTrip.updatedAt);

  if (remoteMs > localMs) return true;
  if (localMs > remoteMs && options?.hasPendingLocalMutations) return false;

  if (remoteMs === localMs && !options?.hasPendingLocalMutations) {
    return (
      localTrip.coverPhotoUrl !== remoteTrip.coverPhotoUrl ||
      localTrip.heroCoverUrl !== remoteTrip.heroCoverUrl ||
      localTrip.itinerary.length !== remoteTrip.itinerary.length ||
      (localTrip.contentIdeas?.length ?? 0) !== (remoteTrip.contentIdeas?.length ?? 0)
    );
  }

  return false;
}

/**
 * Pure Layer-1 merge helper: writes ONLY `shared_trips`, guaranteeing
 * Layer 2 (`local_personal`) is NEVER touched or overwritten by cloud sync.
 */
export async function applyRemoteSharedTrip(
  remoteTrip: SharedTrip,
  persistShared: (trip: SharedTrip) => Promise<void> = saveSharedTrip,
  rowUpdatedAt?: string,
): Promise<SharedTrip> {
  const sanitized = normalizeSharedTripPayload(remoteTrip, rowUpdatedAt);
  await persistShared(sanitized);
  return sanitized;
}

async function selectSharedTripRow(
  client: SupabaseClient,
  cleanCode: string,
): Promise<{
  row: { payload?: unknown; updated_at?: string } | null;
  error: unknown;
}> {
  const exact = await client
    .from('shared_trips')
    .select('payload, updated_at')
    .eq('trip_code', cleanCode)
    .maybeSingle();

  if (exact.error) {
    return { row: null, error: exact.error };
  }
  if (exact.data) {
    return { row: exact.data as { payload?: unknown; updated_at?: string }, error: null };
  }

  // Case-insensitive fallback in case a row was inserted lowercase manually in Supabase Table Editor
  const fallback = await client
    .from('shared_trips')
    .select('payload, updated_at')
    .ilike('trip_code', cleanCode)
    .maybeSingle();

  if (fallback.error) {
    return { row: null, error: fallback.error };
  }
  return {
    row: (fallback.data as { payload?: unknown; updated_at?: string } | null) ?? null,
    error: null,
  };
}

async function writeSharedTripToCloud(
  client: SupabaseClient,
  sanitized: SharedTrip,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const cleanCode = sanitized.code.toUpperCase();

  // Primary write path: server-verified PIN RPC (`create_or_mutate_trip`)
  const rpcRes = await client.rpc('create_or_mutate_trip', {
    p_code: cleanCode,
    p_pin_hash: sanitized.crewPinHash,
    p_payload: sanitized,
  });

  if (!rpcRes.error) {
    return { ok: true };
  }

  // Fallback path if RPC function is not deployed yet: direct upsert using RLS policies
  if (isMissingRpcError(rpcRes.error)) {
    console.warn('[GASKEUN Sync] RPC create_or_mutate_trip missing; falling back to direct upsert');
    const upsertRes = await client.from('shared_trips').upsert(
      {
        trip_code: cleanCode,
        edit_pin_hash: sanitized.crewPinHash,
        payload: sanitized,
        updated_at: sanitized.updatedAt || new Date().toISOString(),
      },
      { onConflict: 'trip_code' },
    );
    if (!upsertRes.error) {
      return { ok: true };
    }
    return { ok: false, error: upsertRes.error };
  }

  return { ok: false, error: rpcRes.error };
}

/**
 * Fetches a shared trip by code from Supabase when online & configured,
 * and caches it into IndexedDB Layer 1 without touching Layer 2.
 */
export async function fetchRemoteTripByCode(code: string): Promise<SharedTrip | null> {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return null;
  }
  try {
    const cleanCode = code.trim().toUpperCase();
    const { row, error } = await selectSharedTripRow(client, cleanCode);
    if (error) {
      console.error('[GASKEUN Sync] fetchRemoteTripByCode failed:', error);
      return null;
    }
    if (!row?.payload) return null;
    const remoteTrip = row.payload as SharedTrip;
    if (!remoteTrip.id || !remoteTrip.code) return null;
    return applyRemoteSharedTrip(remoteTrip, saveSharedTrip, row.updated_at);
  } catch (err) {
    console.error('[GASKEUN Sync] fetchRemoteTripByCode exception:', err);
    return null;
  }
}

export interface CloudPullResult {
  status: 'updated' | 'up-to-date' | 'offline' | 'unconfigured' | 'not-found' | 'error';
  trip?: SharedTrip;
  syncedAt: string;
  errorMessage?: string;
}

export interface PullLatestOptions {
  force?: boolean;
  /** Optional dependency injection for deterministic unit testing */
  deps?: {
    client?: SupabaseClient | null;
    isOnline?: boolean;
    getQueue?: (tripId?: string) => Promise<OfflineQueueItem[]>;
    flushQueue?: () => Promise<number>;
    persistShared?: (trip: SharedTrip) => Promise<void>;
  };
}

/**
 * Compares remote `shared_trips` (`updated_at` & `payload`) against local Layer-1 state.
 * - Offline queue flush runs in an isolated try/catch (and is skipped on manual `force: true`
 *   so stale local queued data can never block or clobber a manual pull from Supabase).
 * - Always logs real errors via `console.error('[GASKEUN Sync]', ...)` and returns `errorMessage`.
 */
export async function pullLatestSharedTrip(
  code: string,
  localTrip: SharedTrip | null | undefined,
  options?: PullLatestOptions,
): Promise<CloudPullResult> {
  const syncedAt = new Date().toISOString();
  const deps = options?.deps;
  const client = deps && 'client' in deps ? deps.client : getSupabaseClient();
  if (!client) return { status: 'unconfigured', syncedAt, errorMessage: 'Supabase not configured' };

  const online =
    deps?.isOnline !== undefined
      ? deps.isOnline
      : typeof navigator === 'undefined' || navigator.onLine !== false;
  if (!online) {
    return { status: 'offline', syncedAt, errorMessage: 'Device is offline' };
  }

  const getQueueFn = deps?.getQueue ?? getOfflineQueue;
  const flushQueueFn = deps?.flushQueue ?? flushOfflineMutationQueue;
  const persistSharedFn = deps?.persistShared ?? saveSharedTrip;

  // Isolated best-effort flush BEFORE non-forced pull: failures NEVER block SELECT!
  let hasPendingLocalMutations = false;
  if (!options?.force && localTrip) {
    try {
      const pendingBefore = await getQueueFn(localTrip.id);
      if (pendingBefore.length > 0) {
        await flushQueueFn();
      }
      const pendingAfter = await getQueueFn(localTrip.id);
      hasPendingLocalMutations = pendingAfter.length > 0;
    } catch (flushErr) {
      console.error(
        '[GASKEUN Sync] Offline queue flush failed (continuing pull from Supabase):',
        flushErr,
      );
    }
  }

  try {
    const cleanCode = code.trim().toUpperCase();
    const { row, error } = await selectSharedTripRow(client, cleanCode);

    if (error) {
      const errorMessage = formatSupabaseError(error);
      console.error('[GASKEUN Sync] Pull SELECT shared_trips failed:', error);
      return { status: 'error', syncedAt, errorMessage };
    }
    if (!row?.payload) {
      return { status: 'not-found', syncedAt };
    }

    const rawRemote = row.payload as SharedTrip;
    if (!rawRemote.id || !rawRemote.code) {
      return { status: 'not-found', syncedAt };
    }

    const normalizedRemote = normalizeSharedTripPayload(rawRemote, row.updated_at);

    if (
      shouldApplyRemoteTrip(localTrip, normalizedRemote, {
        force: options?.force,
        hasPendingLocalMutations,
      })
    ) {
      const persisted = await applyRemoteSharedTrip(
        normalizedRemote,
        persistSharedFn,
        row.updated_at,
      );
      return { status: 'updated', trip: persisted, syncedAt };
    }

    return { status: 'up-to-date', trip: localTrip ?? normalizedRemote, syncedAt };
  } catch (err) {
    const errorMessage = formatSupabaseError(err);
    console.error('[GASKEUN Sync] pullLatestSharedTrip exception:', err);
    return { status: 'error', syncedAt, errorMessage };
  }
}

/**
 * Subscribes to Supabase Realtime `postgres_changes` on `public.shared_trips` for a trip code.
 * Gracefully returns a no-op unsubscribe if Supabase is not configured.
 */
export function subscribeToSharedTrip(
  code: string,
  onRemoteUpdate: (remoteTrip: SharedTrip) => void,
): () => void {
  const client = getSupabaseClient();
  const cleanCode = code.trim().toUpperCase();
  if (!client || !cleanCode) return () => {};

  const channel = client
    .channel(`shared-trip-${cleanCode}-${Math.random().toString(36).slice(2, 7)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shared_trips',
        filter: `trip_code=eq.${cleanCode}`,
      },
      (change) => {
        const nextRow = change.new as { payload?: SharedTrip; updated_at?: string } | undefined;
        if (!nextRow?.payload || !nextRow.payload.id || !nextRow.payload.code) return;
        const normalized = normalizeSharedTripPayload(nextRow.payload, nextRow.updated_at);
        onRemoteUpdate(normalized);
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export interface CloudPushResult {
  status: 'synced' | 'queued' | 'local';
  errorMessage?: string;
}

export interface PushTripDeps {
  client?: SupabaseClient | null;
  isOnline?: boolean;
  enqueue?: typeof enqueueOfflineMutation;
}

/**
 * Pushes a Layer-1 shared trip mutation via `create_or_mutate_trip` RPC (with automatic
 * direct-upsert fallback if RPC is missing). Surfaces real diagnostic `errorMessage`
 * on cloud errors instead of silently swallowing them.
 */
export async function pushOrQueueSharedTrip(
  trip: SharedTrip,
  deps?: PushTripDeps,
): Promise<CloudPushResult> {
  const client = deps && 'client' in deps ? deps.client : getSupabaseClient();
  if (!client) return { status: 'local' };

  const sanitized = normalizeSharedTripPayload(trip);
  const enqueueFn = deps?.enqueue ?? enqueueOfflineMutation;

  const queueMutation = async () => {
    try {
      await enqueueFn({
        tripId: sanitized.id,
        entity: 'trip',
        action: 'upsert',
        payload: sanitized,
      });
    } catch (queueErr) {
      console.error('[GASKEUN Sync] Failed to enqueue offline mutation:', queueErr);
    }
  };

  const online =
    deps?.isOnline !== undefined
      ? deps.isOnline
      : typeof navigator === 'undefined' || navigator.onLine !== false;
  if (!online) {
    await queueMutation();
    return { status: 'queued' };
  }

  try {
    const writeRes = await writeSharedTripToCloud(client, sanitized);
    if (!writeRes.ok) {
      const errorMessage = formatSupabaseError(writeRes.error);
      console.error('[GASKEUN Sync] Push shared_trips failed:', writeRes.error);
      await queueMutation();
      return { status: 'queued', errorMessage };
    }
    return { status: 'synced' };
  } catch (err) {
    const errorMessage = formatSupabaseError(err);
    console.error('[GASKEUN Sync] Push shared_trips exception:', err);
    await queueMutation();
    return { status: 'queued', errorMessage };
  }
}

/**
 * Flushes queued offline Layer-1 mutations sequentially once the device
 * regains connectivity.
 */
export async function flushOfflineMutationQueue(): Promise<number> {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return 0;
  }
  const items = await getOfflineQueue();
  if (items.length === 0) return 0;

  let flushed = 0;
  for (const item of items) {
    if (item.entity === 'trip' && item.action === 'upsert') {
      const payload = normalizeSharedTripPayload(item.payload as SharedTrip);
      try {
        const writeRes = await writeSharedTripToCloud(client, payload);
        if (writeRes.ok) {
          await clearOfflineQueueItem(item.id);
          flushed += 1;
        } else {
          console.error('[GASKEUN Sync] Offline queue item push failed:', writeRes.error);
          break;
        }
      } catch (err) {
        console.error('[GASKEUN Sync] Offline queue item exception:', err);
        break;
      }
    } else {
      await clearOfflineQueueItem(item.id);
    }
  }
  return flushed;
}
