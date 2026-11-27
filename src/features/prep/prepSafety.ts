import type { PrepBag, PrepTask } from '../../types/trip';

export type PrepScope = 'personal' | 'group';

export const PREP_UNDO_LIMIT = 20;

export interface PrepUndoEntry {
  snapshot: PrepTask[];
  label: string;
}

export interface PrepUndoStacks {
  personal: PrepUndoEntry[];
  group: PrepUndoEntry[];
}

export function createEmptyUndoStacks(): PrepUndoStacks {
  return { personal: [], group: [] };
}

function cloneTasks(tasks: PrepTask[]): PrepTask[] {
  return tasks.map((t) => ({ ...t }));
}

/**
 * Records a deep-cloned snapshot onto the target scope's undo stack,
 * keeping at most `maxDepth` (default 20) entries per scope independently.
 */
export function pushUndoSnapshot(
  stacks: PrepUndoStacks,
  scope: PrepScope,
  currentTasks: PrepTask[],
  label: string,
  maxDepth = PREP_UNDO_LIMIT,
): PrepUndoStacks {
  const prevStack = stacks[scope];
  const nextEntry: PrepUndoEntry = {
    snapshot: cloneTasks(currentTasks),
    label,
  };
  const nextStack = [...prevStack, nextEntry].slice(-Math.max(1, maxDepth));
  return {
    ...stacks,
    [scope]: nextStack,
  };
}

/**
 * Pops the most recent snapshot for the target scope (LIFO) without affecting the other scope.
 */
export function popUndoSnapshot(
  stacks: PrepUndoStacks,
  scope: PrepScope,
): { entry: PrepUndoEntry | null; nextStacks: PrepUndoStacks } {
  const stack = stacks[scope];
  if (stack.length === 0) {
    return { entry: null, nextStacks: stacks };
  }
  const entry = stack[stack.length - 1];
  return {
    entry: {
      snapshot: cloneTasks(entry.snapshot),
      label: entry.label,
    },
    nextStacks: {
      ...stacks,
      [scope]: stack.slice(0, -1),
    },
  };
}

export function canUndoScope(stacks: PrepUndoStacks, scope: PrepScope): boolean {
  return stacks[scope].length > 0;
}

/* --- 2-Step Verification State Machine: Delete Prep Item --- */

export type DeleteVerifyState =
  | { stage: 'idle' }
  | { stage: 'step1'; task: PrepTask }
  | { stage: 'step2'; task: PrepTask; confirmedCheck: boolean };

export function startDeleteVerify(task: PrepTask): DeleteVerifyState {
  return { stage: 'step1', task: { ...task } };
}

export function advanceDeleteVerify(state: DeleteVerifyState): DeleteVerifyState {
  if (state.stage !== 'step1') return state;
  return {
    stage: 'step2',
    task: state.task,
    confirmedCheck: false,
  };
}

export function setDeleteVerifyCheck(
  state: DeleteVerifyState,
  checked: boolean,
): DeleteVerifyState {
  if (state.stage !== 'step2') return state;
  return {
    ...state,
    confirmedCheck: checked,
  };
}

export function canExecuteDelete(state: DeleteVerifyState): boolean {
  return state.stage === 'step2' && state.confirmedCheck;
}

export function cancelDeleteVerify(): DeleteVerifyState {
  return { stage: 'idle' };
}

/* --- 2-Step Verification State Machine: Edit Existing Prep Item --- */

export type EditVerifyState =
  | { stage: 'idle' }
  | {
      stage: 'editing';
      task: PrepTask;
      draftTitle: string;
      draftAssigneeId?: string;
      draftBagId?: string;
    }
  | {
      stage: 'confirming';
      task: PrepTask;
      draftTitle: string;
      draftAssigneeId?: string;
      draftBagId?: string;
    };

export function startEditVerify(task: PrepTask): EditVerifyState {
  return {
    stage: 'editing',
    task: { ...task },
    draftTitle: task.title,
    draftAssigneeId: task.assigneeId,
    draftBagId: task.bagId,
  };
}

export function updateEditVerifyDraft(
  state: EditVerifyState,
  patch: {
    draftTitle?: string;
    draftAssigneeId?: string | undefined;
    draftBagId?: string | undefined;
  },
): EditVerifyState {
  if (state.stage === 'idle') return state;
  return {
    ...state,
    stage: 'editing',
    draftTitle: patch.draftTitle !== undefined ? patch.draftTitle : state.draftTitle,
    draftAssigneeId:
      'draftAssigneeId' in patch ? patch.draftAssigneeId : state.draftAssigneeId,
    draftBagId: 'draftBagId' in patch ? patch.draftBagId : state.draftBagId,
  };
}

export function validateEditVerifyDraft(
  state: EditVerifyState,
): { ok: true; cleanTitle: string } | { ok: false; error: string } {
  if (state.stage === 'idle') {
    return { ok: false, error: 'No item selected' };
  }
  const cleanTitle = state.draftTitle.trim();
  if (!cleanTitle) {
    return { ok: false, error: 'Item name cannot be empty' };
  }
  const sameTitle = cleanTitle === state.task.title.trim();
  const sameAssignee = (state.draftAssigneeId || undefined) === (state.task.assigneeId || undefined);
  const sameBag = (state.draftBagId || undefined) === (state.task.bagId || undefined);
  if (sameTitle && sameAssignee && sameBag) {
    return { ok: false, error: 'Make a change before saving' };
  }
  return { ok: true, cleanTitle };
}

export function advanceEditToConfirm(
  state: EditVerifyState,
): { next: EditVerifyState; error?: string } {
  if (state.stage !== 'editing') return { next: state };
  const validation = validateEditVerifyDraft(state);
  if (!validation.ok) {
    return { next: state, error: validation.error };
  }
  return {
    next: {
      stage: 'confirming',
      task: state.task,
      draftTitle: validation.cleanTitle,
      draftAssigneeId: state.draftAssigneeId,
      draftBagId: state.draftBagId,
    },
  };
}

export function backEditToForm(state: EditVerifyState): EditVerifyState {
  if (state.stage !== 'confirming') return state;
  return {
    stage: 'editing',
    task: state.task,
    draftTitle: state.draftTitle,
    draftAssigneeId: state.draftAssigneeId,
    draftBagId: state.draftBagId,
  };
}

/* --- Personal Bags / Packing Locations Pure Helpers (Layer 2) --- */

/**
 * Sorts personal bags with pinned (starred) bags first, preserving creation order within each group.
 */
export function sortPersonalBags(bags: readonly PrepBag[]): PrepBag[] {
  return [...bags].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * Removes a personal bag and cleanly unassigns (bagId: undefined) any items that lived inside it
 * so zero packed items are ever lost when a bag is removed.
 */
export function removePersonalBagPreservingItems(
  bags: readonly PrepBag[],
  tasks: readonly PrepTask[],
  bagId: string,
): { nextBags: PrepBag[]; nextTasks: PrepTask[] } {
  return {
    nextBags: bags.filter((b) => b.id !== bagId),
    nextTasks: tasks.map((t) => (t.bagId === bagId ? { ...t, bagId: undefined } : t)),
  };
}

export function canCommitEdit(state: EditVerifyState): boolean {
  return state.stage === 'confirming' && state.draftTitle.trim().length > 0;
}

export function cancelEditVerify(): EditVerifyState {
  return { stage: 'idle' };
}
