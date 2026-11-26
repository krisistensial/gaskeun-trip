import { describe, expect, it } from 'vitest';
import type { CarSeats, StayRoom, TransportPod } from '../types/trip';
import {
  assignCarFrontSeat,
  assignCarFrontSeatInPods,
  assignMotorbikeMember,
  findMemberBikeAssignment,
  findMemberCarAssignment,
  toggleCarRowMember,
  toggleCarRowMemberInPods,
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

  it('moves or clears lockedPassenger flag with the rider instead of leaving it behind on old slots', () => {
    const pods: TransportPod[] = [
      {
        id: 'bike-1',
        mode: 'bike',
        label: 'Bike 1',
        slots: [
          { role: 'Driver', memberId: 'm-kris' },
          { role: 'Passenger', memberId: 'm-anggi', lockedPassenger: true },
        ],
      },
      {
        id: 'bike-2',
        mode: 'bike',
        label: 'Bike 2',
        slots: [
          { role: 'Driver', memberId: 'm-chika' },
          { role: 'Passenger', memberId: 'm-valen' },
        ],
      },
    ];

    // Swap Anggi (lockedPassenger: true) with Valen (driver)
    const swapped = assignMotorbikeMember(pods, 'bike-2', 'Passenger', 'm-anggi');
    expect(swapped.pods[1].slots[1].memberId).toBe('m-anggi');
    expect(swapped.pods[1].slots[1].lockedPassenger).toBe(true);
    expect(swapped.pods[0].slots[1].memberId).toBe('m-valen');
    expect(swapped.pods[0].slots[1].lockedPassenger).toBeUndefined();

    // Clear Anggi's new slot -> lockedPassenger is cleanly removed too
    const cleared = assignMotorbikeMember(swapped.pods, 'bike-2', 'Passenger', null);
    expect(cleared.pods[1].slots[1].memberId).toBeNull();
    expect(cleared.pods[1].slots[1].lockedPassenger).toBeUndefined();
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

describe('Indonesian RHD Car Cabin Seating (assignCarFrontSeat & toggleCarRowMember)', () => {
  it('assigns and auto-swaps frontRight (Driver) <-> frontLeft without duplicates', () => {
    const initial: CarSeats = {
      frontLeft: 'm-anggi',
      frontRight: 'm-kris',
      middle: ['m-rani', 'm-dora'],
      back: ['m-elano'],
    };

    // Assign Anggi (frontLeft) to frontRight (Driver) -> auto-swaps Kris into frontLeft
    const swapped = assignCarFrontSeat(initial, 'frontRight', 'm-anggi');
    expect(swapped.frontRight).toBe('m-anggi');
    expect(swapped.frontLeft).toBe('m-kris');
    expect(swapped.middle).toEqual(['m-rani', 'm-dora']);
    expect(swapped.back).toEqual(['m-elano']);

    // Clear frontLeft cleanly
    const cleared = assignCarFrontSeat(swapped, 'frontLeft', null);
    expect(cleared.frontLeft).toBeUndefined();
    expect(cleared.frontRight).toBe('m-anggi');
  });

  it('moves a member from middle or back row to frontRight (Driver) without duplicates', () => {
    const initial: CarSeats = {
      frontLeft: 'm-anggi',
      frontRight: 'm-kris',
      middle: ['m-rani', 'm-dora'],
      back: ['m-elano', 'm-louis'],
    };

    // Move Rani from middle -> frontRight (Driver); Kris shifts neatly into middle
    const fromMiddle = assignCarFrontSeat(initial, 'frontRight', 'm-rani');
    expect(fromMiddle.frontRight).toBe('m-rani');
    expect(fromMiddle.middle).toEqual(['m-dora', 'm-kris']);
    expect(fromMiddle.middle).not.toContain('m-rani');

    // Move Louis from back -> frontRight (Driver); Rani shifts neatly into back
    const fromBack = assignCarFrontSeat(fromMiddle, 'frontRight', 'm-louis');
    expect(fromBack.frontRight).toBe('m-louis');
    expect(fromBack.back).toEqual(['m-elano', 'm-rani']);
    expect(fromBack.back).not.toContain('m-louis');

    // Assert zero duplicates across the entire cabin
    const allIds = [
      fromBack.frontLeft,
      fromBack.frontRight,
      ...fromBack.middle,
      ...fromBack.back,
    ].filter(Boolean);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('supports unlimited passengers in middle and back rows and prevents cross-row/cross-car duplicates', () => {
    let car: CarSeats = {
      frontLeft: 'm-anggi',
      frontRight: 'm-kris',
      middle: [],
      back: [],
    };

    // Add 5 passengers to middle row without any cap
    for (const id of ['m-rani', 'm-dora', 'm-chika', 'm-mayang', 'm-jason']) {
      car = toggleCarRowMember(car, 'middle', id);
    }
    expect(car.middle).toEqual(['m-rani', 'm-dora', 'm-chika', 'm-mayang', 'm-jason']);

    // Add 4 passengers to back row (including moving Kris out of Driver & Jason out of middle!)
    for (const id of ['m-elano', 'm-louis', 'm-valen', 'm-kris', 'm-jason']) {
      car = toggleCarRowMember(car, 'back', id);
    }
    expect(car.back).toEqual(['m-elano', 'm-louis', 'm-valen', 'm-kris', 'm-jason']);
    expect(car.frontRight).toBeUndefined(); // Kris automatically vacated Driver
    expect(car.middle).not.toContain('m-jason'); // Jason automatically vacated middle

    // Toggling an existing back-row member removes them cleanly
    car = toggleCarRowMember(car, 'back', 'm-valen');
    expect(car.back).toEqual(['m-elano', 'm-louis', 'm-kris', 'm-jason']);

    // Cross-car uniqueness across 2 cars
    const cars: TransportPod[] = [
      {
        id: 'car-1',
        mode: 'car',
        label: 'Innova 1',
        carSeats: { frontRight: 'm-kris', frontLeft: 'm-anggi', middle: ['m-rani'], back: [] },
        slots: [],
      },
      {
        id: 'car-2',
        mode: 'car',
        label: 'Innova 2',
        carSeats: { frontRight: 'm-elano', middle: [], back: [] },
        slots: [],
      },
    ];

    // Move Rani from Car 1 middle -> Car 2 back
    const movedRow = toggleCarRowMemberInPods(cars, 'car-2', 'back', 'm-rani');
    expect(movedRow.action).toBe('added');
    expect(movedRow.movedFromCarLabel).toBe('Innova 1');
    expect(movedRow.pods[0].carSeats?.middle).toEqual([]);
    expect(movedRow.pods[1].carSeats?.back).toEqual(['m-rani']);
    expect(findMemberCarAssignment(movedRow.pods, 'm-rani')?.carLabel).toBe('Innova 2');

    // Swap Car 1 Driver (Kris) into Car 2 Driver (Elano) -> cross-car front swap!
    const crossSwap = assignCarFrontSeatInPods(movedRow.pods, 'car-2', 'frontRight', 'm-kris');
    expect(crossSwap.changed).toBe(true);
    expect(crossSwap.swappedWithId).toBe('m-elano');
    expect(crossSwap.pods[1].carSeats?.frontRight).toBe('m-kris');
    expect(crossSwap.pods[0].carSeats?.frontRight).toBe('m-elano');
  });
});
