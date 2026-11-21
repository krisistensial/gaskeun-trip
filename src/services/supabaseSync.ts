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

function getSupabaseClient(): SupabaseClient | null {
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

/**
 * Pure Layer-1 merge helper: writes ONLY `shared_trips`, guaranteeing
 * Layer 2 (`local_personal`) is NEVER touched or overwritten by cloud sync.
 */
export async function applyRemoteSharedTrip(
  remoteTrip: SharedTrip,
  persistShared: (trip: SharedTrip) => Promise<void> = saveSharedTrip,
): Promise<SharedTrip> {
  const sanitized: SharedTrip = {
    ...remoteTrip,
    transactions: remoteTrip.transactions.filter((tx) => tx.pocket !== 'personal'),
  };
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
      .select('payload')
      .eq('trip_code', cleanCode)
      .maybeSingle();

    if (error || !data?.payload) return null;
    const remoteTrip = data.payload as SharedTrip;
    if (!remoteTrip.id || !remoteTrip.code) return null;
    return applyRemoteSharedTrip(remoteTrip);
  } catch {
    return null;
  }
}

/**
 * Pushes a Layer-1 shared trip mutation via the server-verified RPC
 * `create_or_mutate_trip(p_code, p_pin_hash, p_payload)`.
 * If offline or network fails, queues it safely in IndexedDB `offline_queue`.
 */
export async function pushOrQueueSharedTrip(trip: SharedTrip): Promise<'synced' | 'queued' | 'local'> {
  const client = getSupabaseClient();
  if (!client) return 'local';

  const sanitized: SharedTrip = {
    ...trip,
    transactions: trip.transactions.filter((tx) => tx.pocket !== 'personal'),
  };

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
      const payload = item.payload as SharedTrip;
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
