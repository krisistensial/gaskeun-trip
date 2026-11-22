export interface SavedSession {
  tripCode: string;
  activeMemberId: string;
  pinUnlockedCodes: string[];
}

const SESSION_KEY = 'gaskeun_session_v1';

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
