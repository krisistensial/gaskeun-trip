import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AlbumPhoto,
  LocalPersonalData,
  OfflineQueueItem,
  PrepTask,
  SharedTrip,
  Transaction,
} from '../types/trip';

/**
 * Dual-Layer IndexedDB Architecture (`gaskeun-db`)
 * - Layer 1 (Shared): `shared_trips` + `offline_queue`
 * - Layer 2 (Local Personal): `local_personal` (isolated 100% from JSON export/import & cloud sync)
 */

interface GaskeunDBSchema extends DBSchema {
  shared_trips: {
    key: string; // trip.id
    value: SharedTrip;
    indexes: { 'by-code': string };
  };
  offline_queue: {
    key: string; // queueItem.id
    value: OfflineQueueItem;
    indexes: { 'by-trip': string; 'by-timestamp': string };
  };
  local_personal: {
    key: string; // tripId
    value: LocalPersonalData;
  };
}

const DB_NAME = 'gaskeun-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GaskeunDBSchema>> | null = null;

export function getGaskeunDB(): Promise<IDBPDatabase<GaskeunDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<GaskeunDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('shared_trips')) {
          const tripStore = db.createObjectStore('shared_trips', { keyPath: 'id' });
          tripStore.createIndex('by-code', 'code', { unique: true });
        }

        if (!db.objectStoreNames.contains('offline_queue')) {
          const queueStore = db.createObjectStore('offline_queue', { keyPath: 'id' });
          queueStore.createIndex('by-trip', 'tripId', { unique: false });
          queueStore.createIndex('by-timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('local_personal')) {
          db.createObjectStore('local_personal', { keyPath: 'tripId' });
        }
      },
    });
  }
  return dbPromise;
}

/* ===========================
   LAYER 1: SHARED TRIP DATA
   =========================== */

export async function listSharedTrips(): Promise<SharedTrip[]> {
  const db = await getGaskeunDB();
  return db.getAll('shared_trips');
}

export async function getSharedTripById(tripId: string): Promise<SharedTrip | undefined> {
  const db = await getGaskeunDB();
  return db.get('shared_trips', tripId);
}

export async function getSharedTripByCode(code: string): Promise<SharedTrip | undefined> {
  const db = await getGaskeunDB();
  return db.getFromIndex('shared_trips', 'by-code', code.trim().toUpperCase());
}

/**
 * Upserts ONLY Layer 1 (`shared_trips`).
 * Layer 2 (`local_personal`) is NEVER touched by shared updates or WhatsApp JSON imports.
 */
export async function saveSharedTrip(trip: SharedTrip): Promise<void> {
  const db = await getGaskeunDB();
  const normalized: SharedTrip = {
    ...trip,
    code: trip.code.trim().toUpperCase(),
    // Enforce Layer 1 purity: strip any personal transactions if accidentally passed
    transactions: trip.transactions.filter((tx) => tx.pocket !== 'personal'),
    updatedAt: new Date().toISOString(),
  };
  await db.put('shared_trips', normalized);
}

export async function ensureSeedTrip(seed: SharedTrip): Promise<SharedTrip> {
  const existing = await getSharedTripByCode(seed.code);
  if (!existing) {
    await saveSharedTrip(seed);
    return seed;
  }

  // Non-destructive seed version bump: upgrades pilot demo itinerary & default Drive folder
  // while preserving user-uploaded profile avatars, editor roles, ledger, and Layer-2 local data.
  const currentVersion = existing.seedVersion ?? 1;
  const targetVersion = seed.seedVersion ?? 1;
  if (currentVersion < targetVersion) {
    const needsDay3Upgrade = currentVersion < 3;
    const upgradedItinerary = needsDay3Upgrade
      ? [
          ...existing.itinerary.filter((i) => i.dayId !== 'day-3'),
          ...seed.itinerary.filter((i) => i.dayId === 'day-3'),
        ]
      : existing.itinerary;

    const isGenericDrive =
      !existing.gdriveFolderUrl ||
      existing.gdriveFolderUrl.trim() === 'https://drive.google.com/' ||
      existing.gdriveFolderUrl.trim() === 'https://drive.google.com';

    const hasCustomScript = Boolean(existing.gdriveScriptUrl?.trim());

    const upgraded: SharedTrip = {
      ...existing,
      seedVersion: targetVersion,
      editorMemberIds:
        existing.editorMemberIds && existing.editorMemberIds.length > 0
          ? existing.editorMemberIds
          : seed.editorMemberIds,
      albumUrl: isGenericDrive ? seed.albumUrl : existing.albumUrl,
      gdriveFolderUrl: isGenericDrive ? seed.gdriveFolderUrl : existing.gdriveFolderUrl,
      gdriveScriptUrl: hasCustomScript ? existing.gdriveScriptUrl : seed.gdriveScriptUrl,
      itinerary: upgradedItinerary,
      contentIdeas:
        existing.contentIdeas !== undefined ? existing.contentIdeas : seed.contentIdeas,
    };
    await saveSharedTrip(upgraded);
    return upgraded;
  }

  return existing;
}

/* ===========================
   LAYER 1: OFFLINE QUEUE
   =========================== */

export async function enqueueOfflineMutation(
  item: Omit<OfflineQueueItem, 'id' | 'timestamp'>,
): Promise<OfflineQueueItem> {
  const db = await getGaskeunDB();
  const entry: OfflineQueueItem = {
    ...item,
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  await db.put('offline_queue', entry);
  return entry;
}

export async function getOfflineQueue(tripId?: string): Promise<OfflineQueueItem[]> {
  const db = await getGaskeunDB();
  if (tripId) {
    return db.getAllFromIndex('offline_queue', 'by-trip', tripId);
  }
  return db.getAllFromIndex('offline_queue', 'by-timestamp');
}

export async function clearOfflineQueueItem(id: string): Promise<void> {
  const db = await getGaskeunDB();
  await db.delete('offline_queue', id);
}

/* ===========================
   LAYER 2: LOCAL PERSONAL DATA
   =========================== */

function createEmptyLocalPersonal(tripId: string): LocalPersonalData {
  return {
    tripId,
    activeMemberId: null,
    coverBlob: null,
    personalTransactions: [],
    personalPrep: [
      { id: 'pp-1', title: 'ID Card / KTP', done: true, category: 'Docs' },
      { id: 'pp-2', title: 'Powerbank', done: false, category: 'Tech' },
      { id: 'pp-3', title: 'Rain poncho', done: false, category: 'Ride' },
      { id: 'pp-4', title: 'Walking shoes', done: false, category: 'Wear' },
    ],
    localAlbumPhotos: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getLocalPersonal(tripId: string): Promise<LocalPersonalData> {
  const db = await getGaskeunDB();
  const existing = await db.get('local_personal', tripId);
  if (existing) return existing;
  const fresh = createEmptyLocalPersonal(tripId);
  await db.put('local_personal', fresh);
  return fresh;
}

export async function saveLocalPersonal(data: LocalPersonalData): Promise<void> {
  const db = await getGaskeunDB();
  await db.put('local_personal', {
    ...data,
    personalTransactions: data.personalTransactions.map((tx) => ({
      ...tx,
      pocket: 'personal',
    })),
    updatedAt: new Date().toISOString(),
  });
}

export async function setActiveMemberLocal(
  tripId: string,
  memberId: string | null,
): Promise<LocalPersonalData> {
  const current = await getLocalPersonal(tripId);
  const next: LocalPersonalData = { ...current, activeMemberId: memberId };
  await saveLocalPersonal(next);
  return next;
}

export async function saveLocalCoverBlob(tripId: string, blob: Blob | null): Promise<void> {
  const current = await getLocalPersonal(tripId);
  await saveLocalPersonal({ ...current, coverBlob: blob });
}

export async function upsertPersonalTransaction(
  tripId: string,
  tx: Transaction,
): Promise<LocalPersonalData> {
  const current = await getLocalPersonal(tripId);
  const personalTx: Transaction = { ...tx, pocket: 'personal', direction: 'out' };
  const exists = current.personalTransactions.some((t) => t.id === personalTx.id);
  const personalTransactions = exists
    ? current.personalTransactions.map((t) => (t.id === personalTx.id ? personalTx : t))
    : [personalTx, ...current.personalTransactions];
  const next: LocalPersonalData = { ...current, personalTransactions };
  await saveLocalPersonal(next);
  return next;
}

export async function savePersonalPrep(
  tripId: string,
  personalPrep: PrepTask[],
): Promise<LocalPersonalData> {
  const current = await getLocalPersonal(tripId);
  const next: LocalPersonalData = { ...current, personalPrep };
  await saveLocalPersonal(next);
  return next;
}

export async function saveLocalAlbumPhotos(
  tripId: string,
  localAlbumPhotos: AlbumPhoto[],
): Promise<LocalPersonalData> {
  const current = await getLocalPersonal(tripId);
  const next: LocalPersonalData = { ...current, localAlbumPhotos };
  await saveLocalPersonal(next);
  return next;
}
