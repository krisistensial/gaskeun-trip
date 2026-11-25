import { describe, expect, it } from 'vitest';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { SharedTrip } from '../types/trip';
import {
  canEditModule,
  canEditTrip,
  changeOwnPasscode,
  formatMemberAccessLabel,
  getHostReadableCrewEditPin,
  getMemberEditScopes,
  getMemberRoleLabel,
  isHostMember,
  isTripEditorOrHost,
  isValidPasscode,
  memberHasPasscode,
  normalizePasscode,
  resetMemberPasscodeByHost,
  setCrewEditPinByHost,
  setMemberEditScopesByHost,
  setMemberPasscodeByHost,
  setMemberPasscodeInTrip,
  toggleMemberEditScopeByHost,
  toggleStopDoneStatus,
  verifyCrewEditPin,
  verifyMemberPasscode,
} from './permissions';

const pilotTrip = seedData as unknown as SharedTrip;

describe('Granular Role-Based Edit Permissions & Manual Done Status Toggle', () => {
  it('gives Host all module scopes while denying global PIN bypass for non-editors', () => {
    // Kris is creator / Host -> always gets all 4 scopes
    expect(isHostMember(pilotTrip, 'm-kris')).toBe(true);
    expect(getMemberEditScopes(pilotTrip, 'm-kris')).toEqual(['crew', 'plan', 'wallet', 'prep']);
    expect(canEditTrip(pilotTrip, 'm-kris')).toBe(true);
    expect(getMemberRoleLabel(pilotTrip, 'm-kris')).toBe('Host');
    expect(formatMemberAccessLabel(pilotTrip, 'm-kris')).toBe('Host');

    // Rani is NOT assigned any scope by default -> Member
    expect(canEditTrip(pilotTrip, 'm-rani')).toBe(false);
    expect(getMemberRoleLabel(pilotTrip, 'm-rani')).toBe('Member');
    expect(formatMemberAccessLabel(pilotTrip, 'm-rani')).toBe('Member');

    // Guest & unassigned members stay blocked even if pinUnlocked=true (no PIN bypass)
    expect(canEditTrip(pilotTrip, 'guest', false)).toBe(false);
    expect(canEditTrip(pilotTrip, 'guest', true)).toBe(false);
    expect(canEditTrip(pilotTrip, 'm-rani', true)).toBe(false);

    // Legacy editorMemberIds without explicit memberPermissions falls back cleanly to all scopes
    const legacyEditorTrip: SharedTrip = {
      ...pilotTrip,
      editorMemberIds: ['m-kris', 'm-rani'],
    };
    expect(getMemberEditScopes(legacyEditorTrip, 'm-rani')).toEqual([
      'crew',
      'plan',
      'wallet',
      'prep',
    ]);
    expect(canEditTrip(legacyEditorTrip, 'm-rani')).toBe(true);
    expect(getMemberRoleLabel(legacyEditorTrip, 'm-rani')).toBe('Editor');
  });

  it('lets Host assign independent per-module edit permissions (crew, plan, wallet, prep)', () => {
    // Non-host cannot modify member permissions
    const denied = toggleMemberEditScopeByHost(pilotTrip, 'm-rani', 'm-dora', 'wallet');
    expect(denied.ok).toBe(false);

    // Host cannot strip Host's own permissions
    const stripHost = setMemberEditScopesByHost(pilotTrip, 'm-kris', 'm-kris', []);
    expect(stripHost.ok).toBe(false);

    // Host grants Rani ONLY Wallet + Crew access, and Dora ONLY Plan access
    const raniWallet = toggleMemberEditScopeByHost(pilotTrip, 'm-kris', 'm-rani', 'wallet');
    expect(raniWallet.ok).toBe(true);
    const raniWalletCrew = toggleMemberEditScopeByHost(
      raniWallet.trip,
      'm-kris',
      'm-rani',
      'crew',
    );
    expect(raniWalletCrew.ok).toBe(true);
    const finalRes = toggleMemberEditScopeByHost(
      raniWalletCrew.trip,
      'm-kris',
      'm-dora',
      'plan',
    );
    expect(finalRes.ok).toBe(true);
    const scopedTrip = finalRes.trip;

    expect(canEditModule(scopedTrip, 'm-rani', 'wallet')).toBe(true);
    expect(canEditModule(scopedTrip, 'm-rani', 'crew')).toBe(true);
    expect(canEditModule(scopedTrip, 'm-rani', 'plan')).toBe(false);
    expect(canEditModule(scopedTrip, 'm-rani', 'prep')).toBe(false);
    expect(formatMemberAccessLabel(scopedTrip, 'm-rani')).toBe('Crew · Wallet');
    expect(isTripEditorOrHost(scopedTrip, 'm-rani')).toBe(true);

    expect(canEditModule(scopedTrip, 'm-dora', 'plan')).toBe(true);
    expect(canEditModule(scopedTrip, 'm-dora', 'wallet')).toBe(false);
    expect(formatMemberAccessLabel(scopedTrip, 'm-dora')).toBe('Plan');

    // Toggling wallet off for Rani leaves crew intact
    const toggledOff = toggleMemberEditScopeByHost(scopedTrip, 'm-kris', 'm-rani', 'wallet');
    expect(getMemberEditScopes(toggledOff.trip, 'm-rani')).toEqual(['crew']);
  });

  it('toggles itinerary stop Done status cleanly', () => {
    expect(toggleStopDoneStatus('upcoming')).toBe('done');
    expect(toggleStopDoneStatus('active')).toBe('done');
    expect(toggleStopDoneStatus('done')).toBe('upcoming');
  });
});

describe('Per-Member 4-Digit Passcode Guard', () => {
  it('validates and normalizes strictly 4-digit numeric passcodes', () => {
    expect(normalizePasscode('12a3b45')).toBe('1234');
    expect(isValidPasscode('0427')).toBe(true);
    expect(isValidPasscode('123')).toBe(false);
    expect(isValidPasscode('12345')).toBe(false);
    expect(isValidPasscode('12ab')).toBe(false);
    expect(isValidPasscode('')).toBe(false);
  });

  it('verifies matching member passcode and rejects wrong codes', () => {
    const unlockedTrip = setMemberPasscodeInTrip(pilotTrip, 'm-rani', '2468');
    const rani = unlockedTrip.members.find((m) => m.id === 'm-rani');
    const dora = unlockedTrip.members.find((m) => m.id === 'm-dora');

    expect(memberHasPasscode(rani)).toBe(true);
    expect(memberHasPasscode(dora)).toBe(false);

    expect(verifyMemberPasscode(rani, '2468')).toBe(true);
    expect(verifyMemberPasscode(rani, '0000')).toBe(false);
    expect(verifyMemberPasscode(rani, '246')).toBe(false);
    // Member without passcode passes cleanly
    expect(verifyMemberPasscode(dora, '')).toBe(true);
  });

  it('requires current passcode for self-service change or removal', () => {
    // First-time set without existing passcode succeeds
    const initialSet = changeOwnPasscode(pilotTrip, 'm-rani', '', '1357');
    expect(initialSet.ok).toBe(true);
    const raniLocked = initialSet.trip.members.find((m) => m.id === 'm-rani');
    expect(raniLocked?.passcode).toBe('1357');

    // Wrong current passcode is rejected
    const wrongUpdate = changeOwnPasscode(initialSet.trip, 'm-rani', '9999', '2468');
    expect(wrongUpdate.ok).toBe(false);
    expect(wrongUpdate.error).toContain('incorrect');

    // Correct current passcode updates cleanly
    const goodUpdate = changeOwnPasscode(initialSet.trip, 'm-rani', '1357', '2468');
    expect(goodUpdate.ok).toBe(true);
    expect(goodUpdate.trip.members.find((m) => m.id === 'm-rani')?.passcode).toBe('2468');

    // Correct current passcode removes passcode cleanly
    const removed = changeOwnPasscode(goodUpdate.trip, 'm-rani', '2468', undefined);
    expect(removed.ok).toBe(true);
    expect(removed.trip.members.find((m) => m.id === 'm-rani')?.passcode).toBeUndefined();
  });

  it('allows Host to set and reset member passcodes while blocking non-hosts', () => {
    // Non-host cannot set or reset someone else's passcode
    const nonHostSet = setMemberPasscodeByHost(pilotTrip, 'm-rani', 'm-dora', '5678');
    expect(nonHostSet.ok).toBe(false);

    // Host (m-kris) sets initial passcode for Dora
    const hostSet = setMemberPasscodeByHost(pilotTrip, 'm-kris', 'm-dora', '5678');
    expect(hostSet.ok).toBe(true);
    expect(hostSet.trip.members.find((m) => m.id === 'm-dora')?.passcode).toBe('5678');

    // Non-host cannot reset Dora's passcode
    const nonHostReset = resetMemberPasscodeByHost(hostSet.trip, 'm-rani', 'm-dora');
    expect(nonHostReset.ok).toBe(false);
    expect(nonHostReset.trip.members.find((m) => m.id === 'm-dora')?.passcode).toBe('5678');

    // Host resets Dora's forgotten passcode cleanly
    const hostReset = resetMemberPasscodeByHost(hostSet.trip, 'm-kris', 'm-dora');
    expect(hostReset.ok).toBe(true);
    expect(hostReset.trip.members.find((m) => m.id === 'm-dora')?.passcode).toBeUndefined();
  });
});

describe('Host-Customizable Shared Crew Editing PIN', () => {
  it('verifies legacy hashed PIN, lets only Host update it, and rejects the old PIN immediately', async () => {
    // Legacy pilot trip without explicit crewEditPin falls back to crewPinHash
    expect(await verifyCrewEditPin(pilotTrip, '1234')).toBe(true);
    expect(await verifyCrewEditPin(pilotTrip, '9999')).toBe(false);

    // Non-host (Viewer, designated Editor, or Guest) cannot change Crew Editing PIN
    const viewerAttempt = setCrewEditPinByHost(pilotTrip, 'm-rani', '7890');
    expect(viewerAttempt.ok).toBe(false);
    expect(viewerAttempt.trip.crewEditPin).toBeUndefined();

    const withRaniEditor: SharedTrip = { ...pilotTrip, editorMemberIds: ['m-kris', 'm-rani'] };
    const editorAttempt = setCrewEditPinByHost(withRaniEditor, 'm-rani', '7890');
    expect(editorAttempt.ok).toBe(false);

    const guestAttempt = setCrewEditPinByHost(pilotTrip, 'guest', '7890');
    expect(guestAttempt.ok).toBe(false);

    // Invalid 4-digit formats are rejected even for Host
    expect(setCrewEditPinByHost(pilotTrip, 'm-kris', '123').ok).toBe(false);
    expect(setCrewEditPinByHost(pilotTrip, 'm-kris', 'abcd').ok).toBe(false);

    // Host updates Crew Editing PIN -> synced in Layer-1 trip payload
    const updated = setCrewEditPinByHost(pilotTrip, 'm-kris', '7890');
    expect(updated.ok).toBe(true);
    expect(updated.trip.crewEditPin).toBe('7890');
    expect(getHostReadableCrewEditPin(updated.trip)).toBe('7890');

    // Old PIN is immediately rejected and new PIN unlocks cleanly
    expect(await verifyCrewEditPin(updated.trip, '1234')).toBe(false);
    expect(await verifyCrewEditPin(updated.trip, '7890')).toBe(true);
  });
});
