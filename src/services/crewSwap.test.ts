import { describe, expect, it } from 'vitest';
import type { StayRoom, TransportPod } from '../types/trip';
import {
  assignMotorbikeMember,
  findMemberBikeAssignment,
  toggleStayRoomMember,
} from './crewSwap';

function sampleBikePods(): TransportPod[] {
  return [
    {
      id: 'bike-1',
      mode: 'bike',
      label: 'Bike 1',
      slots: [
        { role: 'Driver', memberId: 'm-kris' },
        { role: 'Passenger', memberId: 'm-rani' },
      ],
    },
    {
      id: 'bike-2',
      mode: 'bike',
      label: 'Bike 2',
      slots: [
        { role: 'Driver', memberId: 'm-chika' },
        { role: 'Rider', memberId: 'm-valen' },
      ],
    },
    {
      id: 'bike-3',
      mode: 'bike',
      label: 'Bike 3',
      slots: [
        { role: 'Driver', memberId: null },
        { role: 'Rider', memberId: null },
      ],
    },
  ];
}

describe('Crew Motorbike Auto-Swap & Anti-Duplicate Stay Rooms (crewSwap)', () => {
  it('auto-swaps two riders across different bikes without creating duplicates', () => {
    const res = assignMotorbikeMember(sampleBikePods(), 'bike-2', 'Rider', 'm-rani');
    expect(res.changed).toBe(true);
    expect(res.swappedWithId).toBe('m-valen');
    expect(res.movedFromBikeLabel).toBe('Bike 1');

    // Rani moved to Bike 2 Rider; Valen auto-swapped into Bike 1 Passenger
    expect(res.pods[1].slots[1].memberId).toBe('m-rani');
    expect(res.pods[0].slots[1].memberId).toBe('m-valen');

    // Every rider appears at most once across all bikes
    const allIds = res.pods.flatMap((p) => p.slots.map((s) => s.memberId)).filter(Boolean);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('auto-swaps Driver and Passenger on the same bike cleanly', () => {
    const res = assignMotorbikeMember(sampleBikePods(), 'bike-1', 0, 'm-rani');
    expect(res.changed).toBe(true);
    expect(res.sameBikeSwap).toBe(true);
    expect(res.swappedWithId).toBe('m-kris');
    expect(res.pods[0].slots[0].memberId).toBe('m-rani');
    expect(res.pods[0].slots[1].memberId).toBe('m-kris');
  });

  it('moves a rider into an open bike slot and vacates their old bike slot', () => {
    const res = assignMotorbikeMember(sampleBikePods(), 'bike-3', 0, 'm-rani');
    expect(res.changed).toBe(true);
    expect(res.swappedWithId).toBeUndefined();
    expect(res.movedFromBikeLabel).toBe('Bike 1');
    expect(res.pods[2].slots[0].memberId).toBe('m-rani');
    expect(res.pods[0].slots[1].memberId).toBeNull();
    expect(findMemberBikeAssignment(res.pods, 'm-rani')?.bikeLabel).toBe('Bike 3');
  });

  it('returns changed: false when selecting the same occupant', () => {
    const initial = sampleBikePods();
    const res = assignMotorbikeMember(initial, 'bike-1', 0, 'm-kris');
    expect(res.changed).toBe(false);
    expect(res.pods).toBe(initial);
  });

  it('enforces anti-duplicate rooms when moving a member between rooms in the same stay', () => {
    const rooms: StayRoom[] = [
      { id: 'r1', label: 'Room 1', memberIds: ['m-kris', 'm-jason'] },
      { id: 'r2', label: 'Room 2', memberIds: ['m-rani'] },
    ];

    // Add Kris to Room 2 -> automatically removed from Room 1
    const moved = toggleStayRoomMember(rooms, 'r2', 'm-kris');
    expect(moved[0].memberIds).toEqual(['m-jason']);
    expect(moved[1].memberIds).toEqual(['m-rani', 'm-kris']);

    // Tap Kris again in Room 2 -> removed cleanly
    const removed = toggleStayRoomMember(moved, 'r2', 'm-kris');
    expect(removed[1].memberIds).toEqual(['m-rani']);
  });
});
