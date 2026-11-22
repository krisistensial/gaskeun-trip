import { describe, expect, it } from 'vitest';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { SharedTrip } from '../types/trip';
import {
  canEditTrip,
  getMemberRoleLabel,
  isHostMember,
  toggleStopDoneStatus,
} from './permissions';

const pilotTrip = seedData as unknown as SharedTrip;

describe('Role-Based Edit Permissions & Manual Done Status Toggle', () => {
  it('grants edit rights to Host (Kris) and Host-designated Editors, hides edit for Viewers & Guests', () => {
    // Kris is creator / Host
    expect(isHostMember(pilotTrip, 'm-kris')).toBe(true);
    expect(canEditTrip(pilotTrip, 'm-kris', false)).toBe(true);
    expect(getMemberRoleLabel(pilotTrip, 'm-kris', false)).toBe('Host');

    // Rani is NOT in editorMemberIds by default -> Viewer
    expect(canEditTrip(pilotTrip, 'm-rani', false)).toBe(false);
    expect(getMemberRoleLabel(pilotTrip, 'm-rani', false)).toBe('Viewer');

    // Guest -> Viewer unless PIN unlocked
    expect(canEditTrip(pilotTrip, 'guest', false)).toBe(false);
    expect(canEditTrip(pilotTrip, 'guest', true)).toBe(true);

    // Host designates Rani as Editor -> gains edit rights without PIN
    const withRaniEditor: SharedTrip = {
      ...pilotTrip,
      editorMemberIds: ['m-kris', 'm-rani'],
    };
    expect(canEditTrip(withRaniEditor, 'm-rani', false)).toBe(true);
    expect(getMemberRoleLabel(withRaniEditor, 'm-rani', false)).toBe('Editor');
    expect(canEditTrip(withRaniEditor, 'm-dora', false)).toBe(false);
  });

  it('toggles itinerary stop Done status cleanly', () => {
    expect(toggleStopDoneStatus('upcoming')).toBe('done');
    expect(toggleStopDoneStatus('active')).toBe('done');
    expect(toggleStopDoneStatus('done')).toBe('upcoming');
  });
});
