import { describe, expect, it } from 'vitest';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { LocalPersonalData, SharedTrip } from '../types/trip';
import {
  applyRemoteSharedTrip,
  normalizeSharedTripPayload,
  shouldApplyRemoteTrip,
} from './supabaseSync';

const pilotTrip = seedData as unknown as SharedTrip;

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

    // Layer 1 updated cleanly, coverPhotoUrl & passcodes preserved, personal tx stripped
    expect(sharedStore.get(pilotTrip.id)?.title).toBe('Solo – Jogja (Updated)');
    expect(sharedStore.get(pilotTrip.id)?.coverPhotoUrl).toBe(sharedHeroUrl);
    expect(persisted.coverPhotoUrl).toBe(sharedHeroUrl);
    expect(persisted.heroCoverUrl).toBe(sharedHeroUrl);
    expect(persisted.members.find((m) => m.id === 'm-kris')?.passcode).toBe('2580');
    expect(persisted.transactions.some((tx) => tx.pocket === 'personal')).toBe(false);
    expect(persisted.groupPrep.some((t) => t.id === 'gp-new')).toBe(true);
    expect(persisted.updatedAt).toBe('2026-11-23T07:30:00Z');

    // Layer 2 stays 100% IDENTICAL & UNTOUCHED
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

    // Local strictly newer with queued offline mutations should not be clobbered by older remote
    expect(
      shouldApplyRemoteTrip(remoteNewer, localOlder, {
        hasPendingLocalMutations: true,
      }),
    ).toBe(false);

    // Manual Force Sync always applies cloud truth
    expect(shouldApplyRemoteTrip(remoteNewer, localOlder, { force: true })).toBe(true);
  });
});
