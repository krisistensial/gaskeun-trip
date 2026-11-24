import type { SharedTrip } from '../types/trip';

export interface SavedSession {
  tripCode: string;
  activeMemberId: string;
  pinUnlockedCodes: string[];
}

const SESSION_KEY = 'gaskeun_session_v1';
export const JOINED_TRIPS_KEY = 'gaskeun_joined_trip_codes';

export function loadJoinedTripCodes(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(JOINED_TRIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.trim().toUpperCase()),
      ),
    );
  } catch {
    return [];
  }
}

export function recordJoinedTripCode(code: string): string[] {
  const clean = code.trim().toUpperCase();
  const current = loadJoinedTripCodes();
  if (!clean) return current;
  const next = Array.from(new Set([...current, clean]));
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(JOINED_TRIPS_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore storage quota errors
  }
  return next;
}

/**
 * Pure filter for Landing Gate `YOUR TRIPS`:
 * Only trips whose code was explicitly joined or created on this device are shown,
 * preventing bundled pilot seed trips (e.g. `SOLO-27`) from leaking on fresh/Incognito devices.
 */
export function filterJoinedTrips(trips: SharedTrip[], joinedCodes: string[]): SharedTrip[] {
  if (!joinedCodes.length) return [];
  const allowed = new Set(joinedCodes.map((c) => c.trim().toUpperCase()));
  return trips.filter((t) => allowed.has(t.code.trim().toUpperCase()));
}

export function loadSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (!parsed.tripCode || !parsed.activeMemberId) return null;
    return {
      tripCode: parsed.tripCode.toUpperCase(),
      activeMemberId: parsed.activeMemberId,
      pinUnlockedCodes: Array.isArray(parsed.pinUnlockedCodes) ? parsed.pinUnlockedCodes : [],
    };
  } catch {
    return null;
  }
}

export function saveActiveSession(session: SavedSession): void {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        tripCode: session.tripCode.toUpperCase(),
        activeMemberId: session.activeMemberId,
        pinUnlockedCodes: Array.from(
          new Set(session.pinUnlockedCodes.map((c) => c.toUpperCase())),
        ),
      }),
    );
  } catch {
    // ignore storage quota errors
  }
}

export function clearActiveSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
