import { describe, expect, it } from 'vitest';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { LocalPersonalData, SharedTrip } from '../types/trip';
import { applyRemoteSharedTrip } from './supabaseSync';

const pilotTrip = seedData as unknown as SharedTrip;

describe('Dual-Layer Isolation — Sync Pull & Personal Prep Protection', () => {
  it('NEVER overwrites Layer 2 (local_personal: Personal Prep, Personal Wallet, Cover, activeMemberId) when pulling Layer 1 remote updates', async () => {
    // Simulated Layer 1 & Layer 2 stores
    const sharedStore = new Map<string, SharedTrip>();
    const localStore = new Map<string, LocalPersonalData>();

    // Seed Layer 2 personal data on user's phone
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

    // Incoming remote Layer 1 update (even if someone maliciously injected a personal tx)
    const remoteUpdate: SharedTrip = {
      ...pilotTrip,
      title: 'Solo – Jogja (Updated)',
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

    const persisted = await applyRemoteSharedTrip(remoteUpdate, async (trip) => {
      sharedStore.set(trip.id, trip);
    });

    // Layer 1 updated cleanly & personal tx stripped
    expect(sharedStore.get(pilotTrip.id)?.title).toBe('Solo – Jogja (Updated)');
    expect(persisted.transactions.some((tx) => tx.pocket === 'personal')).toBe(false);
    expect(persisted.groupPrep.some((t) => t.id === 'gp-new')).toBe(true);

    // Layer 2 stays 100% IDENTICAL & UNTOUCHED
    const userLocalAfter = localStore.get(pilotTrip.id);
    expect(userLocalAfter).toEqual(userLocalBefore);
    expect(userLocalAfter?.personalPrep).toHaveLength(2);
    expect(userLocalAfter?.personalTransactions[0].title).toBe('Soto Triwindu');
    expect(userLocalAfter?.activeMemberId).toBe('m-kris');
  });
});
