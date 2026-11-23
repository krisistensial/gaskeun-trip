import type { StayRoom, TransportPod } from '../types/trip';

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
