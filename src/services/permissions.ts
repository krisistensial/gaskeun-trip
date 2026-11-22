import type { PlanItemStatus, SharedTrip } from '../types/trip';

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
