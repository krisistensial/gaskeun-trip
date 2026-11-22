import type { PlanItemStatus, SharedTrip, TripMember } from '../types/trip';

export type TripAccessRole = 'Host' | 'Editor' | 'Viewer';

/**
 * Returns true if the active member is the trip Host (creator).
 */
export function isHostMember(trip: SharedTrip, activeMemberId: string | null): boolean {
  if (!activeMemberId || activeMemberId === 'guest') return false;
  const member = trip.members.find((m) => m.id === activeMemberId);
  return Boolean(member?.isCreator);
}

/**
 * Returns true if the current user can edit Layer-1 Shared Trip data:
 * - Unlocked via 4-digit Crew PIN, OR
 * - Is the trip Host (creator), OR
 * - Is explicitly designated in `trip.editorMemberIds`.
 */
export function canEditTrip(
  trip: SharedTrip,
  activeMemberId: string | null,
  pinUnlocked: boolean,
): boolean {
  if (pinUnlocked) return true;
  if (!activeMemberId || activeMemberId === 'guest') return false;
  if (isHostMember(trip, activeMemberId)) return true;
  return Array.isArray(trip.editorMemberIds) && trip.editorMemberIds.includes(activeMemberId);
}

export function getMemberRoleLabel(
  trip: SharedTrip,
  activeMemberId: string | null,
  pinUnlocked: boolean,
): TripAccessRole {
  if (isHostMember(trip, activeMemberId)) return 'Host';
  if (canEditTrip(trip, activeMemberId, pinUnlocked)) return 'Editor';
  return 'Viewer';
}

/**
 * Pure hybrid status toggle when an editor taps a TrailDot on Plan → Trail.
 * Toggles cleanly between `done` and `upcoming` (preserving `active` -> `done`).
 */
export function toggleStopDoneStatus(current: PlanItemStatus): PlanItemStatus {
  return current === 'done' ? 'upcoming' : 'done';
}

/* ==========================================================================
   Per-Member 4-Digit Passcode Guard (Anti-Wrong-Profile Protection)
   ========================================================================== */

/**
 * Strips non-digit characters and caps input to 4 digits for numeric PIN fields.
 */
export function normalizePasscode(raw?: string | null): string {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 4);
}

/**
 * Validates that a passcode is strictly a 4-digit numeric string (e.g. "0427").
 */
export function isValidPasscode(raw?: string | null): boolean {
  return typeof raw === 'string' && /^\d{4}$/.test(raw.trim());
}

/**
 * Returns true if the given crew member currently has a valid 4-digit passcode set.
 */
export function memberHasPasscode(member?: Pick<TripMember, 'passcode'> | null): boolean {
  return isValidPasscode(member?.passcode);
}

/**
 * Verifies a user-entered passcode against a member's stored 4-digit passcode.
 * Members without a passcode pass immediately.
 */
export function verifyMemberPasscode(
  member: Pick<TripMember, 'passcode'> | undefined | null,
  input: string,
): boolean {
  if (!memberHasPasscode(member)) return true;
  if (!isValidPasscode(input)) return false;
  return member!.passcode!.trim() === input.trim();
}

/**
 * Pure helper to set or clear a member's normalized 4-digit passcode in a SharedTrip.
 * Passing `undefined` or `''` clears the passcode cleanly.
 */
export function setMemberPasscodeInTrip(
  trip: SharedTrip,
  memberId: string,
  passcode: string | undefined,
): SharedTrip {
  const clearing = passcode === undefined || passcode.trim() === '';
  if (!clearing && !isValidPasscode(passcode)) {
    return trip;
  }
  const normalized = clearing ? undefined : passcode!.trim();
  return {
    ...trip,
    members: trip.members.map((m) =>
      m.id === memberId ? { ...m, passcode: normalized } : m,
    ),
  };
}

export interface PasscodeActionResult {
  ok: boolean;
  trip: SharedTrip;
  error?: string;
}

/**
 * Self-service passcode update/removal for the signed-in crew member.
 * Verifies the existing passcode first when one is already set.
 */
export function changeOwnPasscode(
  trip: SharedTrip,
  memberId: string,
  currentInput: string,
  nextPasscode: string | undefined,
): PasscodeActionResult {
  const member = trip.members.find((m) => m.id === memberId);
  if (!member) {
    return { ok: false, trip, error: 'Profile not found' };
  }
  if (memberHasPasscode(member) && !verifyMemberPasscode(member, currentInput)) {
    return { ok: false, trip, error: 'Current passcode is incorrect' };
  }
  const clearing = nextPasscode === undefined || nextPasscode.trim() === '';
  if (!clearing && !isValidPasscode(nextPasscode)) {
    return { ok: false, trip, error: 'Passcode must be 4 digits' };
  }
  return {
    ok: true,
    trip: setMemberPasscodeInTrip(trip, memberId, clearing ? undefined : nextPasscode!.trim()),
  };
}

/**
 * Host-only initial passcode assignment for a crew member.
 */
export function setMemberPasscodeByHost(
  trip: SharedTrip,
  actorMemberId: string | null,
  targetMemberId: string,
  newPasscode: string,
): PasscodeActionResult {
  if (!isHostMember(trip, actorMemberId)) {
    return { ok: false, trip, error: 'Only the trip host can set crew passcodes' };
  }
  if (!isValidPasscode(newPasscode)) {
    return { ok: false, trip, error: 'Passcode must be 4 digits' };
  }
  if (!trip.members.some((m) => m.id === targetMemberId)) {
    return { ok: false, trip, error: 'Member not found' };
  }
  return {
    ok: true,
    trip: setMemberPasscodeInTrip(trip, targetMemberId, newPasscode.trim()),
  };
}

/**
 * Host-only passcode reset for a crew member who forgot their 4-digit PIN.
 */
export function resetMemberPasscodeByHost(
  trip: SharedTrip,
  actorMemberId: string | null,
  targetMemberId: string,
): PasscodeActionResult {
  if (!isHostMember(trip, actorMemberId)) {
    return { ok: false, trip, error: 'Only the trip host can reset crew passcodes' };
  }
  if (!trip.members.some((m) => m.id === targetMemberId)) {
    return { ok: false, trip, error: 'Member not found' };
  }
  return {
    ok: true,
    trip: setMemberPasscodeInTrip(trip, targetMemberId, undefined),
  };
}
