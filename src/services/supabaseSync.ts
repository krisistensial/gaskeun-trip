import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  clearOfflineQueueItem,
  enqueueOfflineMutation,
  getOfflineQueue,
  saveSharedTrip,
} from './db';
import type { SharedTrip } from '../types/trip';

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
  cachedClient = createClient(
    String(import.meta.env.VITE_SUPABASE_URL).trim(),
    String(import.meta.env.VITE_SUPABASE_ANON_KEY).trim(),
  );
  return cachedClient;
}

function parseTimestampMs(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
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

  // Same timestamp or non-pending local copy whose payload differs (e.g. coverPhotoUrl added)
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
    const { data, error } = await client
      .from('shared_trips')
      .select('payload, updated_at')
      .eq('trip_code', cleanCode)
      .maybeSingle();

    if (error || !data?.payload) return null;
    const remoteTrip = data.payload as SharedTrip;
    if (!remoteTrip.id || !remoteTrip.code) return null;
    return applyRemoteSharedTrip(remoteTrip, saveSharedTrip, data.updated_at as string | undefined);
  } catch {
    return null;
  }
}

export interface CloudPullResult {
  status: 'updated' | 'up-to-date' | 'offline' | 'unconfigured' | 'not-found' | 'error';
  trip?: SharedTrip;
  syncedAt: string;
}

/**
 * Compares remote `shared_trips` (`updated_at` & `payload`) against local Layer-1 state,
 * flushing any pending offline mutations first so edits from another device are pulled cleanly.
 */
export async function pullLatestSharedTrip(
  code: string,
  localTrip: SharedTrip | null | undefined,
  options?: { force?: boolean },
): Promise<CloudPullResult> {
  const syncedAt = new Date().toISOString();
  const client = getSupabaseClient();
  if (!client) return { status: 'unconfigured', syncedAt };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { status: 'offline', syncedAt };
  }

  try {
    // Push queued offline mutations first so we don't clobber local offline work
    const pendingBefore = localTrip ? await getOfflineQueue(localTrip.id) : [];
    if (pendingBefore.length > 0) {
      await flushOfflineMutationQueue();
    }
    const pendingAfter = localTrip ? await getOfflineQueue(localTrip.id) : [];

    const cleanCode = code.trim().toUpperCase();
    const { data, error } = await client
      .from('shared_trips')
      .select('payload, updated_at')
      .eq('trip_code', cleanCode)
      .maybeSingle();

    if (error) return { status: 'error', syncedAt };
    if (!data?.payload) return { status: 'not-found', syncedAt };

    const rawRemote = data.payload as SharedTrip;
    if (!rawRemote.id || !rawRemote.code) return { status: 'not-found', syncedAt };

    const normalizedRemote = normalizeSharedTripPayload(
      rawRemote,
      data.updated_at as string | undefined,
    );

    if (
      shouldApplyRemoteTrip(localTrip, normalizedRemote, {
        force: options?.force,
        hasPendingLocalMutations: pendingAfter.length > 0,
      })
    ) {
      const persisted = await applyRemoteSharedTrip(
        normalizedRemote,
        saveSharedTrip,
        data.updated_at as string | undefined,
      );
      return { status: 'updated', trip: persisted, syncedAt };
    }

    return { status: 'up-to-date', trip: localTrip ?? normalizedRemote, syncedAt };
  } catch {
    return { status: 'error', syncedAt };
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

/**
 * Pushes a Layer-1 shared trip mutation via the server-verified RPC
 * `create_or_mutate_trip(p_code, p_pin_hash, p_payload)`.
 * If offline or network fails, queues it safely in IndexedDB `offline_queue`.
 */
export async function pushOrQueueSharedTrip(
  trip: SharedTrip,
): Promise<'synced' | 'queued' | 'local'> {
  const client = getSupabaseClient();
  if (!client) return 'local';

  const sanitized = normalizeSharedTripPayload(trip);

  const queueMutation = async () => {
    await enqueueOfflineMutation({
      tripId: sanitized.id,
      entity: 'trip',
      action: 'upsert',
      payload: sanitized,
    });
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await queueMutation();
    return 'queued';
  }

  try {
    const { error } = await client.rpc('create_or_mutate_trip', {
      p_code: sanitized.code.toUpperCase(),
      p_pin_hash: sanitized.crewPinHash,
      p_payload: sanitized,
    });
    if (error) {
      await queueMutation();
      return 'queued';
    }
    return 'synced';
  } catch {
    await queueMutation();
    return 'queued';
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
        const { error } = await client.rpc('create_or_mutate_trip', {
          p_code: payload.code.toUpperCase(),
          p_pin_hash: payload.crewPinHash,
          p_payload: payload,
        });
        if (!error) {
          await clearOfflineQueueItem(item.id);
          flushed += 1;
        }
      } catch {
        break;
      }
    } else {
      await clearOfflineQueueItem(item.id);
    }
  }
  return flushed;
}
