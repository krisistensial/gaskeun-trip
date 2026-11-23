import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { LocalPersonalData, OfflineQueueItem, SharedTrip } from '../types/trip';
import {
  applyRemoteSharedTrip,
  formatSupabaseError,
  normalizeSharedTripPayload,
  pullLatestSharedTrip,
  pushOrQueueSharedTrip,
  shouldApplyRemoteTrip,
} from './supabaseSync';

const pilotTrip = seedData as unknown as SharedTrip;

function createMockSupabaseSelectClient(result: {
  data: { payload: SharedTrip; updated_at: string } | null;
  error: unknown;
}): SupabaseClient {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const ilike = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq, ilike });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as SupabaseClient;
}

describe('Dual-Layer Isolation & Cross-Device Layer-1 Sync', () => {
  it('NEVER overwrites Layer 2 (local_personal: Personal Prep, Personal Wallet, activeMemberId) when pulling Layer 1 remote updates', async () => {
    const sharedStore = new Map<string, SharedTrip>();
    const localStore = new Map<string, LocalPersonalData>();

    const userLocalBefore: LocalPersonalData = {
      tripId: pilotTrip.id,
      activeMemberId: 'm-kris',
      coverBlob: null,
      personalTransactions: [
        {
          id: 'ptx-1',
          tripId: pilotTrip.id,
          direction: 'out',
          pocket: 'personal',
          title: 'Soto Triwindu',
          amount: 25_000,
          date: '2027-02-12',
          createdAt: '2027-02-12T08:15:00+07:00',
          updatedAt: '2027-02-12T08:15:00+07:00',
        },
      ],
      personalPrep: [
        { id: 'pp-1', title: 'ID Card / KTP', done: true },
        { id: 'pp-2', title: 'Powerbank', done: true },
      ],
      localAlbumPhotos: [],
      updatedAt: '2026-11-21T10:00:00+07:00',
    };
    localStore.set(pilotTrip.id, userLocalBefore);

    const sharedHeroUrl =
      'https://example.supabase.co/storage/v1/object/public/trip-assets/SOLO-27/hero-123.jpg';
    const remoteUpdate: SharedTrip = {
      ...pilotTrip,
      title: 'Solo – Jogja (Updated)',
      coverPhotoUrl: sharedHeroUrl,
      members: pilotTrip.members.map((m) =>
        m.id === 'm-kris' ? { ...m, passcode: '2580' } : m,
      ),
      groupPrep: [
        ...pilotTrip.groupPrep,
        { id: 'gp-new', title: 'Confirm train snacks', done: false, assigneeId: 'm-rani' },
      ],
      transactions: [
        ...pilotTrip.transactions,
        {
          id: 'leaked-personal',
          tripId: pilotTrip.id,
          direction: 'out',
          pocket: 'personal',
          title: 'Should be stripped',
          amount: 10_000,
          date: '2027-02-12',
          createdAt: '2027-02-12T09:00:00+07:00',
          updatedAt: '2027-02-12T09:00:00+07:00',
        },
      ],
    };

    const persisted = await applyRemoteSharedTrip(
      remoteUpdate,
      async (trip) => {
        sharedStore.set(trip.id, trip);
      },
      '2026-11-23T07:30:00Z',
    );

    expect(sharedStore.get(pilotTrip.id)?.title).toBe('Solo – Jogja (Updated)');
    expect(sharedStore.get(pilotTrip.id)?.coverPhotoUrl).toBe(sharedHeroUrl);
    expect(persisted.coverPhotoUrl).toBe(sharedHeroUrl);
    expect(persisted.heroCoverUrl).toBe(sharedHeroUrl);
    expect(persisted.members.find((m) => m.id === 'm-kris')?.passcode).toBe('2580');
    expect(persisted.transactions.some((tx) => tx.pocket === 'personal')).toBe(false);
    expect(persisted.groupPrep.some((t) => t.id === 'gp-new')).toBe(true);
    expect(persisted.updatedAt).toBe('2026-11-23T07:30:00Z');

    const userLocalAfter = localStore.get(pilotTrip.id);
    expect(userLocalAfter).toEqual(userLocalBefore);
    expect(userLocalAfter?.personalPrep).toHaveLength(2);
    expect(userLocalAfter?.personalTransactions[0].title).toBe('Soto Triwindu');
    expect(userLocalAfter?.activeMemberId).toBe('m-kris');
  });

  it('promotes legacy heroCoverUrl to canonical coverPhotoUrl inside Layer 1 sync payloads', () => {
    const legacyUrl =
      'https://example.supabase.co/storage/v1/object/public/trip-assets/SOLO-27/hero-legacy.jpg';
    const normalized = normalizeSharedTripPayload({
      ...pilotTrip,
      coverPhotoUrl: undefined,
      heroCoverUrl: legacyUrl,
    });

    expect(normalized.coverPhotoUrl).toBe(legacyUrl);
    expect(normalized.heroCoverUrl).toBe(legacyUrl);
  });

  it('applies newer remote Supabase snapshots over older local seeds and honors force sync', () => {
    const localOlder: SharedTrip = {
      ...pilotTrip,
      updatedAt: '2026-11-21T12:00:00+07:00',
    };
    const remoteNewer: SharedTrip = {
      ...pilotTrip,
      coverPhotoUrl:
        'https://example.supabase.co/storage/v1/object/public/trip-assets/SOLO-27/hero-999.jpg',
      updatedAt: '2026-11-23T07:45:00Z',
    };

    expect(shouldApplyRemoteTrip(localOlder, remoteNewer)).toBe(true);
    expect(
      shouldApplyRemoteTrip(remoteNewer, localOlder, {
        hasPendingLocalMutations: true,
      }),
    ).toBe(false);
    expect(shouldApplyRemoteTrip(remoteNewer, localOlder, { force: true })).toBe(true);
  });

  it('does NOT let an offline queue flush failure block pullLatestSharedTrip from fetching shared_trips', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const remoteHeroUrl =
      'https://example.supabase.co/storage/v1/object/public/trip-assets/SOLO-27/hero-fresh.jpg';
    const localOlder: SharedTrip = {
      ...pilotTrip,
      coverPhotoUrl: undefined,
      heroCoverUrl: undefined,
      updatedAt: '2026-11-21T12:00:00+07:00',
    };
    const remoteTrip: SharedTrip = {
      ...pilotTrip,
      coverPhotoUrl: remoteHeroUrl,
      updatedAt: '2026-11-23T08:00:00Z',
    };

    const mockClient = createMockSupabaseSelectClient({
      data: { payload: remoteTrip, updated_at: '2026-11-23T08:00:00Z' },
      error: null,
    });
    const persistedTrips: SharedTrip[] = [];

    const res = await pullLatestSharedTrip('SOLO-27', localOlder, {
      force: false,
      deps: {
        client: mockClient,
        isOnline: true,
        getQueue: async (): Promise<OfflineQueueItem[]> => [
          {
            id: 'q-corrupt',
            tripId: localOlder.id,
            entity: 'trip',
            action: 'upsert',
            payload: localOlder,
            timestamp: '2026-11-21T12:01:00Z',
          },
        ],
        flushQueue: async () => {
          throw new Error('Corrupt offline queue item');
        },
        persistShared: async (t) => {
          persistedTrips.push(t);
        },
      },
    });

    expect(res.status).toBe('updated');
    expect(res.trip?.coverPhotoUrl).toBe(remoteHeroUrl);
    expect(persistedTrips).toHaveLength(1);
    expect(persistedTrips[0].coverPhotoUrl).toBe(remoteHeroUrl);
    errSpy.mockRestore();
  });

  it('surfaces real Supabase error code and message when pullLatestSharedTrip fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockClient = createMockSupabaseSelectClient({
      data: null,
      error: { code: '42501', message: 'permission denied for table shared_trips' },
    });

    const res = await pullLatestSharedTrip('SOLO-27', pilotTrip, {
      force: true,
      deps: {
        client: mockClient,
        isOnline: true,
      },
    });

    expect(res.status).toBe('error');
    expect(res.errorMessage).toContain('42501');
    expect(res.errorMessage).toContain('permission denied for table shared_trips');
    expect(formatSupabaseError(new Error('Failed to fetch'))).toBe('Failed to fetch');
    errSpy.mockRestore();
  });

  it('falls back to direct upsert when RPC is missing and surfaces real push error on failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 1. Missing RPC -> direct upsert succeeds
    const upsertOk = vi.fn().mockResolvedValue({ error: null });
    const clientFallbackOk = {
      rpc: vi.fn().mockResolvedValue({
        error: { code: 'PGRST202', message: 'Could not find the function public.create_or_mutate_trip' },
      }),
      from: vi.fn().mockReturnValue({ upsert: upsertOk }),
    } as unknown as SupabaseClient;

    const okRes = await pushOrQueueSharedTrip(pilotTrip, {
      client: clientFallbackOk,
      isOnline: true,
      enqueue: vi.fn(),
    });
    expect(okRes.status).toBe('synced');
    expect(upsertOk).toHaveBeenCalledTimes(1);

    // 2. PIN mismatch or RLS failure -> returns queued with real errorMessage
    const enqueueMock = vi.fn().mockResolvedValue({});
    const clientDenied = {
      rpc: vi.fn().mockResolvedValue({
        error: { code: 'P0001', message: 'Invalid crew edit PIN' },
      }),
    } as unknown as SupabaseClient;

    const failRes = await pushOrQueueSharedTrip(pilotTrip, {
      client: clientDenied,
      isOnline: true,
      enqueue: enqueueMock,
    });
    expect(failRes.status).toBe('queued');
    expect(failRes.errorMessage).toContain('Invalid crew edit PIN');
    expect(enqueueMock).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
    errSpy.mockRestore();
  });
});
