import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { SharedTrip } from '../types/trip';
import {
  filterJoinedTrips,
  JOINED_TRIPS_KEY,
  loadJoinedTripCodes,
  recordJoinedTripCode,
} from './session';

const pilotTrip = seedData as unknown as SharedTrip;
const secondTrip: SharedTrip = {
  ...pilotTrip,
  id: 'trip-bali-27',
  code: 'BALI-27',
  title: 'Bali Getaway',
};

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (idx: number) => Array.from(map.keys())[idx] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, val: string) => {
      map.set(key, String(val));
    },
  };
}

describe('Landing Gate YOUR TRIPS privacy filter (gaskeun_joined_trip_codes)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty YOUR TRIPS on a fresh device / Incognito even when seed trips exist', () => {
    const joined = loadJoinedTripCodes();
    expect(joined).toEqual([]);
    expect(filterJoinedTrips([pilotTrip, secondTrip], joined)).toEqual([]);
  });

  it('shows SOLO-27 in YOUR TRIPS only after joining via code (case-insensitive & deduped)', () => {
    const afterJoin = recordJoinedTripCode(' solo-27 ');
    expect(afterJoin).toEqual(['SOLO-27']);
    expect(JSON.parse(localStorage.getItem(JOINED_TRIPS_KEY) ?? '[]')).toEqual(['SOLO-27']);

    const visible = filterJoinedTrips([pilotTrip, secondTrip], afterJoin);
    expect(visible.map((t) => t.code)).toEqual(['SOLO-27']);

    // Re-joining the same code should not create duplicates
    const afterRejoin = recordJoinedTripCode('SOLO-27');
    expect(afterRejoin).toEqual(['SOLO-27']);
  });

  it('reveals newly created trips alongside previously joined trips', () => {
    recordJoinedTripCode('SOLO-27');
    const updated = recordJoinedTripCode('bali-27');
    const visible = filterJoinedTrips([pilotTrip, secondTrip], updated);
    expect(visible.map((t) => t.code)).toEqual(['SOLO-27', 'BALI-27']);
  });
});
