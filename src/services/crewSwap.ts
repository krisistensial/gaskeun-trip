import type { CarSeats, StayRoom, TransportPod } from '../types/trip';

export interface BikeAssignmentResult {
  pods: TransportPod[];
  changed: boolean;
  previousMemberId: string | null;
  swappedWithId?: string;
  movedFromBikeId?: string;
  movedFromBikeLabel?: string;
  movedFromRole?: string;
  sameBikeSwap?: boolean;
}

/**
 * Pure Auto-Swap helper for Crew Motorbike Formations (`mode === 'bike'`).
 * Guarantees that no crew member can ever occupy two motorbike slots simultaneously:
 * - If `newMemberId` is already seated on another bike (or opposite slot on the same bike),
 *   their previous slot receives `previousMemberId` (true 2-way auto-swap if occupied,
 *   or `null` if the target slot was empty).
 * - Leaves non-bike pods (`train`, `car`) completely untouched.
 */
export function assignMotorbikeMember(
  pods: TransportPod[],
  targetBikeId: string,
  targetRoleOrIndex: number | string,
  newMemberId: string | null,
): BikeAssignmentResult {
  const targetPodIdx = pods.findIndex((p) => p.id === targetBikeId && p.mode === 'bike');
  if (targetPodIdx < 0) {
    return { pods, changed: false, previousMemberId: null };
  }

  const targetPod = pods[targetPodIdx];
  const targetSlotIdx =
    typeof targetRoleOrIndex === 'number'
      ? targetRoleOrIndex
      : targetPod.slots.findIndex(
          (s) => s.role.trim().toLowerCase() === targetRoleOrIndex.trim().toLowerCase(),
        );

  if (targetSlotIdx < 0 || targetSlotIdx >= targetPod.slots.length) {
    return { pods, changed: false, previousMemberId: null };
  }

  const previousMemberId = targetPod.slots[targetSlotIdx].memberId ?? null;
  if (previousMemberId === newMemberId) {
    return { pods, changed: false, previousMemberId };
  }

  // Deep-clone only the bike pods' slots arrays so input stays immutable
  const nextPods: TransportPod[] = pods.map((pod) =>
    pod.mode === 'bike'
      ? { ...pod, slots: pod.slots.map((s) => ({ ...s })) }
      : pod,
  );

  // Clearing target slot
  if (!newMemberId) {
    nextPods[targetPodIdx].slots[targetSlotIdx].memberId = null;
    return {
      pods: nextPods,
      changed: true,
      previousMemberId,
    };
  }

  // Locate if `newMemberId` already occupies any bike slot
  let sourcePodIdx = -1;
  let sourceSlotIdx = -1;
  for (let pIdx = 0; pIdx < nextPods.length; pIdx += 1) {
    const pod = nextPods[pIdx];
    if (pod.mode !== 'bike') continue;
    const foundSlot = pod.slots.findIndex((s) => s.memberId === newMemberId);
    if (foundSlot >= 0) {
      sourcePodIdx = pIdx;
      sourceSlotIdx = foundSlot;
      break;
    }
  }

  // Assign newMemberId into target slot
  nextPods[targetPodIdx].slots[targetSlotIdx].memberId = newMemberId;

  // Auto-swap or move from previous bike slot
  if (sourcePodIdx >= 0 && sourceSlotIdx >= 0) {
    const sourcePod = nextPods[sourcePodIdx];
    const sourceRole = sourcePod.slots[sourceSlotIdx].role;
    // Place displaced previous occupant (or null) into source slot
    sourcePod.slots[sourceSlotIdx].memberId = previousMemberId;

    // Defensive sweep: ensure no stray duplicates remain across all bikes
    for (let pIdx = 0; pIdx < nextPods.length; pIdx += 1) {
      const pod = nextPods[pIdx];
      if (pod.mode !== 'bike') continue;
      for (let sIdx = 0; sIdx < pod.slots.length; sIdx += 1) {
        if (pIdx === targetPodIdx && sIdx === targetSlotIdx) continue;
        if (pod.slots[sIdx].memberId === newMemberId) {
          pod.slots[sIdx].memberId = null;
        }
      }
    }

    return {
      pods: nextPods,
      changed: true,
      previousMemberId,
      swappedWithId: previousMemberId ?? undefined,
      movedFromBikeId: sourcePod.id,
      movedFromBikeLabel: sourcePod.label,
      movedFromRole: sourceRole,
      sameBikeSwap: sourcePod.id === targetBikeId,
    };
  }

  return {
    pods: nextPods,
    changed: true,
    previousMemberId,
  };
}

/**
 * Finds the current motorbike assignment for a crew member, if any.
 */
export function findMemberBikeAssignment(
  pods: TransportPod[],
  memberId: string,
): { bikeId: string; bikeLabel: string; role: string; slotIndex: number } | null {
  for (const pod of pods) {
    if (pod.mode !== 'bike') continue;
    const slotIndex = pod.slots.findIndex((s) => s.memberId === memberId);
    if (slotIndex >= 0) {
      return {
        bikeId: pod.id,
        bikeLabel: pod.label,
        role: pod.slots[slotIndex].role,
        slotIndex,
      };
    }
  }
  return null;
}

/**
 * Anti-Duplicate Stay Room Assignment:
 * - Toggling a member already in `targetRoomId` removes them from that room.
 * - Adding a member to `targetRoomId` automatically removes them from any other
 *   room in the same homestay so one person is never listed in two rooms.
 */
export function toggleStayRoomMember(
  rooms: StayRoom[],
  targetRoomId: string,
  memberId: string,
): StayRoom[] {
  const target = rooms.find((r) => r.id === targetRoomId);
  if (!target) return rooms;

  const alreadyInTarget = target.memberIds.includes(memberId);
  if (alreadyInTarget) {
    return rooms.map((rm) =>
      rm.id === targetRoomId
        ? { ...rm, memberIds: rm.memberIds.filter((id) => id !== memberId) }
        : rm,
    );
  }

  return rooms.map((rm) => {
    const cleaned = rm.memberIds.filter((id) => id !== memberId);
    if (rm.id === targetRoomId) {
      return { ...rm, memberIds: [...cleaned, memberId] };
    }
    return { ...rm, memberIds: cleaned };
  });
}

/* ==========================================================================
   Indonesian Right-Hand Drive (RHD) Car Cabin Seating Helpers
   - Front Row: max 1 person each (`frontLeft` Co-Pilot, `frontRight` Driver)
   - Middle & Back Rows: unlimited passengers, strictly anti-duplicate
   ========================================================================== */

export type CarFrontSlot = 'frontLeft' | 'frontRight';
export type CarBenchRow = 'middle' | 'back';
export type CarSeatLocation = CarFrontSlot | CarBenchRow;

export function formatCarSeatLocation(loc: CarSeatLocation): string {
  if (loc === 'frontRight') return 'Driver';
  if (loc === 'frontLeft') return 'Front Left';
  if (loc === 'middle') return 'Middle Row';
  return 'Back Row';
}

/**
 * Returns a clean, deduplicated `CarSeats` structure for any car pod
 * (gracefully migrating legacy `slots`-only car pods on read).
 */
export function normalizeCarSeats(
  pod?: Pick<TransportPod, 'carSeats' | 'slots'> | null,
): CarSeats {
  if (pod?.carSeats) {
    const seen = new Set<string>();
    const takeOne = (id?: string): string | undefined => {
      if (!id || seen.has(id)) return undefined;
      seen.add(id);
      return id;
    };
    const takeList = (ids?: string[]): string[] => {
      const out: string[] = [];
      for (const id of ids ?? []) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
      return out;
    };
    const frontRight = takeOne(pod.carSeats.frontRight);
    const frontLeft = takeOne(pod.carSeats.frontLeft);
    const middle = takeList(pod.carSeats.middle);
    const back = takeList(pod.carSeats.back);
    return { frontLeft, frontRight, middle, back };
  }

  // Legacy migration from flat `slots` array (slot 0 = Driver -> frontRight, slot 1 -> frontLeft, rest -> middle/back)
  const slots = pod?.slots ?? [];
  const seen = new Set<string>();
  const pick = (idx: number): string | undefined => {
    const id = slots[idx]?.memberId ?? undefined;
    if (!id || seen.has(id)) return undefined;
    seen.add(id);
    return id;
  };
  const frontRight = pick(0);
  const frontLeft = pick(1);
  const middle: string[] = [];
  const back: string[] = [];
  for (let i = 2; i < slots.length; i += 1) {
    const id = slots[i]?.memberId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (i < 5) middle.push(id);
    else back.push(id);
  }
  return { frontLeft, frontRight, middle, back };
}

/**
 * Removes a member from all seats of a single `CarSeats` object.
 */
export function removeMemberFromCarSeats(car: CarSeats, memberId: string): CarSeats {
  return {
    frontLeft: car.frontLeft === memberId ? undefined : car.frontLeft,
    frontRight: car.frontRight === memberId ? undefined : car.frontRight,
    middle: car.middle.filter((id) => id !== memberId),
    back: car.back.filter((id) => id !== memberId),
  };
}

/**
 * Counts total seated crew inside a car cabin.
 */
export function countCarSeated(car: CarSeats): number {
  return (
    (car.frontLeft ? 1 : 0) +
    (car.frontRight ? 1 : 0) +
    car.middle.length +
    car.back.length
  );
}

/**
 * Assigns (or clears) a single front seat (`frontLeft` or `frontRight` Driver):
 * - Max 1 occupant per front seat.
 * - If `newMemberId` sits in the opposite front seat, performs a clean 2-way auto-swap.
 * - If `newMemberId` sits in `middle` or `back`, removes them from that bench and places
 *   any displaced front occupant neatly into that same bench so nobody is lost.
 * - Guarantees zero duplicate appearances inside the car.
 */
export function assignCarFrontSeat(
  car: CarSeats,
  slot: CarFrontSlot,
  newMemberId: string | null | undefined,
): CarSeats {
  const cleanCar = normalizeCarSeats({ carSeats: car, slots: [] });
  const otherSlot: CarFrontSlot = slot === 'frontRight' ? 'frontLeft' : 'frontRight';
  const prevOccupant = cleanCar[slot];

  if (!newMemberId) {
    return { ...cleanCar, [slot]: undefined };
  }

  if (prevOccupant === newMemberId) {
    return cleanCar;
  }

  // Case 1: Member was in the opposite front seat -> 2-way auto-swap
  if (cleanCar[otherSlot] === newMemberId) {
    return {
      ...cleanCar,
      [slot]: newMemberId,
      [otherSlot]: prevOccupant,
    };
  }

  // Case 2: Member was in middle row -> move to target front seat; place displaced occupant in middle
  if (cleanCar.middle.includes(newMemberId)) {
    const nextMiddle = cleanCar.middle.filter((id) => id !== newMemberId);
    if (prevOccupant && !nextMiddle.includes(prevOccupant)) {
      nextMiddle.push(prevOccupant);
    }
    return {
      ...cleanCar,
      [slot]: newMemberId,
      middle: nextMiddle,
    };
  }

  // Case 3: Member was in back row -> move to target front seat; place displaced occupant in back
  if (cleanCar.back.includes(newMemberId)) {
    const nextBack = cleanCar.back.filter((id) => id !== newMemberId);
    if (prevOccupant && !nextBack.includes(prevOccupant)) {
      nextBack.push(prevOccupant);
    }
    return {
      ...cleanCar,
      [slot]: newMemberId,
      back: nextBack,
    };
  }

  // Case 4: Member was not in this car yet -> place directly in target front seat
  return {
    ...cleanCar,
    [slot]: newMemberId,
  };
}

/**
 * Toggles a crew member in an unlimited car bench row (`middle` or `back`):
 * - No maximum seat cap.
 * - If already seated in `row`, removes them.
 * - If not in `row`, automatically removes them from `frontLeft`, `frontRight`,
 *   and the other bench row before adding them to `row`.
 */
export function toggleCarRowMember(
  car: CarSeats,
  row: CarBenchRow,
  memberId: string,
): CarSeats {
  const cleanCar = normalizeCarSeats({ carSeats: car, slots: [] });
  if (cleanCar[row].includes(memberId)) {
    return {
      ...cleanCar,
      [row]: cleanCar[row].filter((id) => id !== memberId),
    };
  }

  const stripped = removeMemberFromCarSeats(cleanCar, memberId);
  return {
    ...stripped,
    [row]: [...stripped[row], memberId],
  };
}

/**
 * Locates where a crew member is currently seated across all car pods, if anywhere.
 */
export function findMemberCarAssignment(
  pods: TransportPod[],
  memberId: string,
): { carId: string; carLabel: string; location: CarSeatLocation; locationLabel: string } | null {
  for (const pod of pods) {
    if (pod.mode !== 'car') continue;
    const seats = normalizeCarSeats(pod);
    if (seats.frontRight === memberId) {
      return { carId: pod.id, carLabel: pod.label, location: 'frontRight', locationLabel: 'Driver' };
    }
    if (seats.frontLeft === memberId) {
      return {
        carId: pod.id,
        carLabel: pod.label,
        location: 'frontLeft',
        locationLabel: 'Front Left',
      };
    }
    if (seats.middle.includes(memberId)) {
      return {
        carId: pod.id,
        carLabel: pod.label,
        location: 'middle',
        locationLabel: 'Middle Row',
      };
    }
    if (seats.back.includes(memberId)) {
      return { carId: pod.id, carLabel: pod.label, location: 'back', locationLabel: 'Back Row' };
    }
  }
  return null;
}

export interface CarFrontAssignmentResult {
  pods: TransportPod[];
  changed: boolean;
  previousMemberId?: string;
  swappedWithId?: string;
  movedFromCarLabel?: string;
  sameCarSwap?: boolean;
}

/**
 * Multi-car anti-duplicate front-seat assignment across all `mode === 'car'` pods.
 * Prevents any crew member from ever sitting in two cars simultaneously.
 */
export function assignCarFrontSeatInPods(
  pods: TransportPod[],
  targetCarId: string,
  slot: CarFrontSlot,
  newMemberId: string | null,
): CarFrontAssignmentResult {
  const targetPod = pods.find((p) => p.id === targetCarId && p.mode === 'car');
  if (!targetPod) return { pods, changed: false };

  const targetSeats = normalizeCarSeats(targetPod);
  const previousMemberId = targetSeats[slot];
  if ((previousMemberId ?? null) === newMemberId) {
    return { pods, changed: false, previousMemberId };
  }

  if (!newMemberId) {
    return {
      pods: pods.map((p) =>
        p.id === targetCarId ? { ...p, carSeats: assignCarFrontSeat(targetSeats, slot, null) } : p,
      ),
      changed: true,
      previousMemberId,
    };
  }

  const existing = findMemberCarAssignment(pods, newMemberId);

  // Same car -> delegate to single-car auto-swap / bench shift
  if (!existing || existing.carId === targetCarId) {
    const updatedTarget = assignCarFrontSeat(targetSeats, slot, newMemberId);
    const sameCarSwap = Boolean(existing && existing.carId === targetCarId && previousMemberId);
    return {
      pods: pods.map((p) => (p.id === targetCarId ? { ...p, carSeats: updatedTarget } : p)),
      changed: true,
      previousMemberId,
      swappedWithId: sameCarSwap ? previousMemberId : undefined,
      sameCarSwap,
    };
  }

  // Different car -> strip from source car (swapping displaced occupant if source was also a front seat)
  const nextPods = pods.map((p) => {
    if (p.mode !== 'car') return p;
    const seats = normalizeCarSeats(p);
    if (p.id === targetCarId) {
      return { ...p, carSeats: { ...seats, [slot]: newMemberId } };
    }
    if (p.id === existing.carId) {
      const cleaned = removeMemberFromCarSeats(seats, newMemberId);
      if (
        previousMemberId &&
        (existing.location === 'frontLeft' || existing.location === 'frontRight')
      ) {
        return { ...p, carSeats: { ...cleaned, [existing.location]: previousMemberId } };
      }
      return { ...p, carSeats: cleaned };
    }
    return { ...p, carSeats: removeMemberFromCarSeats(seats, newMemberId) };
  });

  const crossCarSwapped = Boolean(
    previousMemberId &&
      (existing.location === 'frontLeft' || existing.location === 'frontRight'),
  );

  return {
    pods: nextPods,
    changed: true,
    previousMemberId,
    swappedWithId: crossCarSwapped ? previousMemberId : undefined,
    movedFromCarLabel: existing.carLabel,
  };
}

/**
 * Multi-car anti-duplicate bench-row toggle across all `mode === 'car'` pods.
 * Unlimited passengers per row; adding automatically removes the member from any other seat or car.
 */
export function toggleCarRowMemberInPods(
  pods: TransportPod[],
  targetCarId: string,
  row: CarBenchRow,
  memberId: string,
): { pods: TransportPod[]; action: 'added' | 'removed'; movedFromCarLabel?: string } {
  const targetPod = pods.find((p) => p.id === targetCarId && p.mode === 'car');
  if (!targetPod) return { pods, action: 'removed' };

  const targetSeats = normalizeCarSeats(targetPod);
  const alreadyInTargetRow = targetSeats[row].includes(memberId);

  if (alreadyInTargetRow) {
    return {
      pods: pods.map((p) =>
        p.id === targetCarId
          ? { ...p, carSeats: toggleCarRowMember(targetSeats, row, memberId) }
          : p,
      ),
      action: 'removed',
    };
  }

  const existing = findMemberCarAssignment(pods, memberId);
  const movedFromCarLabel =
    existing && existing.carId !== targetCarId ? existing.carLabel : undefined;

  const nextPods = pods.map((p) => {
    if (p.mode !== 'car') return p;
    const seats = normalizeCarSeats(p);
    if (p.id === targetCarId) {
      return { ...p, carSeats: toggleCarRowMember(seats, row, memberId) };
    }
    return { ...p, carSeats: removeMemberFromCarSeats(seats, memberId) };
  });

  return { pods: nextPods, action: 'added', movedFromCarLabel };
}
