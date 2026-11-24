import type { PlanItemStatus, SharedTrip, TripMember } from '../types/trip';
import { verifyPin } from './tripFactory';

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

/* ==========================================================================
   Shared Crew Editing PIN (Host-Customizable, Synced in Layer 1)
   ========================================================================== */

const LEGACY_PILOT_PIN_HASH =
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

/**
 * Verifies a 4-digit Crew Editing PIN against the trip's synced `crewEditPin`
 * when configured, falling back to `crewPinHash` for legacy trips.
 * Once the Host sets a custom `crewEditPin`, any older PIN is immediately rejected.
 */
export async function verifyCrewEditPin(
  trip: Pick<SharedTrip, 'crewPinHash' | 'crewEditPin'>,
  inputPin: string,
): Promise<boolean> {
  const clean = inputPin.trim();
  if (!isValidPasscode(clean)) return false;
  if (isValidPasscode(trip.crewEditPin)) {
    return clean === trip.crewEditPin!.trim();
  }
  return verifyPin(clean, trip.crewPinHash);
}

/**
 * Host-only update for the shared 4-digit Crew Editing PIN.
 * Stores `crewEditPin` inside Layer-1 `SharedTrip` so it syncs cleanly across all devices
 * while keeping `crewPinHash` compatible with existing Supabase RPC row hashes.
 */
export function setCrewEditPinByHost(
  trip: SharedTrip,
  actorMemberId: string | null,
  newPin: string,
): PasscodeActionResult {
  if (!isHostMember(trip, actorMemberId)) {
    return { ok: false, trip, error: 'Only the trip host can change the Crew Editing PIN' };
  }
  const clean = newPin.trim();
  if (!isValidPasscode(clean)) {
    return { ok: false, trip, error: 'Crew Editing PIN must be 4 digits' };
  }
  return {
    ok: true,
    trip: {
      ...trip,
      crewEditPin: clean,
    },
  };
}

/**
 * Returns the readable 4-digit Crew Editing PIN strictly for the Host-only reveal toggle
 * inside `Crew Access & Editors`. Never call or expose this in non-host UI.
 */
export function getHostReadableCrewEditPin(
  trip: Pick<SharedTrip, 'crewPinHash' | 'crewEditPin'>,
): string | null {
  if (isValidPasscode(trip.crewEditPin)) {
    return trip.crewEditPin!.trim();
  }
  if (trip.crewPinHash === LEGACY_PILOT_PIN_HASH) {
    return '1234';
  }
  return null;
}
