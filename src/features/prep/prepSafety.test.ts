import { describe, expect, it } from 'vitest';
import type { PrepBag, PrepTask } from '../../types/trip';
import {
  PREP_UNDO_LIMIT,
  advanceDeleteVerify,
  advanceEditToConfirm,
  backEditToForm,
  canCommitEdit,
  canExecuteDelete,
  canUndoScope,
  cancelDeleteVerify,
  cancelEditVerify,
  createEmptyUndoStacks,
  popUndoSnapshot,
  pushUndoSnapshot,
  removePersonalBagPreservingItems,
  setDeleteVerifyCheck,
  sortPersonalBags,
  startDeleteVerify,
  startEditVerify,
  updateEditVerifyDraft,
  validateEditVerifyDraft,
} from './prepSafety';

const samplePersonal: PrepTask[] = [
  { id: 'pp-1', title: 'Raincoat', done: false },
  { id: 'pp-2', title: 'Powerbank 20k mAh', done: true },
];

const sampleGroup: PrepTask[] = [
  { id: 'gp-1', title: 'First-aid kit', done: false, assigneeId: 'm-1' },
];

describe('Prep Safety Guard — Multi-Step Undo Stack & 2-Step Verification', () => {
  it('maintains separate personal and group undo stacks with deep-copy isolation', () => {
    let stacks = createEmptyUndoStacks();
    expect(canUndoScope(stacks, 'personal')).toBe(false);
    expect(canUndoScope(stacks, 'group')).toBe(false);

    const mutablePersonal = samplePersonal.map((t) => ({ ...t }));
    stacks = pushUndoSnapshot(stacks, 'personal', mutablePersonal, 'Removed "Raincoat"');
    mutablePersonal[0].title = 'MUTATED';

    stacks = pushUndoSnapshot(stacks, 'group', sampleGroup, 'Checked "First-aid kit"');

    expect(canUndoScope(stacks, 'personal')).toBe(true);
    expect(canUndoScope(stacks, 'group')).toBe(true);

    const popP = popUndoSnapshot(stacks, 'personal');
    expect(popP.entry?.label).toBe('Removed "Raincoat"');
    expect(popP.entry?.snapshot[0].title).toBe('Raincoat'); // deep copy preserved
    expect(canUndoScope(popP.nextStacks, 'personal')).toBe(false);
    expect(canUndoScope(popP.nextStacks, 'group')).toBe(true); // group untouched

    const popG = popUndoSnapshot(popP.nextStacks, 'group');
    expect(popG.entry?.snapshot).toEqual(sampleGroup);
    expect(canUndoScope(popG.nextStacks, 'group')).toBe(false);

    const emptyPop = popUndoSnapshot(popG.nextStacks, 'group');
    expect(emptyPop.entry).toBeNull();
  });

  it('caps each undo stack at max 20 snapshots and pops in strict LIFO order', () => {
    let stacks = createEmptyUndoStacks();
    for (let i = 1; i <= 25; i += 1) {
      stacks = pushUndoSnapshot(
        stacks,
        'personal',
        [{ id: `pp-${i}`, title: `Item ${i}`, done: false }],
        `Step ${i}`,
      );
    }

    expect(stacks.personal).toHaveLength(PREP_UNDO_LIMIT);
    expect(stacks.personal[0].label).toBe('Step 6');
    expect(stacks.personal[stacks.personal.length - 1].label).toBe('Step 25');

    const firstPop = popUndoSnapshot(stacks, 'personal');
    expect(firstPop.entry?.label).toBe('Step 25');
    expect(firstPop.nextStacks.personal).toHaveLength(PREP_UNDO_LIMIT - 1);
  });

  it('enforces 2-step delete verification with explicit checkbox confirmation', () => {
    const task = samplePersonal[0];
    const step1 = startDeleteVerify(task);
    expect(step1.stage).toBe('step1');
    expect(canExecuteDelete(step1)).toBe(false);

    const step2Unchecked = advanceDeleteVerify(step1);
    expect(step2Unchecked.stage).toBe('step2');
    expect(canExecuteDelete(step2Unchecked)).toBe(false);

    const step2Checked = setDeleteVerifyCheck(step2Unchecked, true);
    expect(canExecuteDelete(step2Checked)).toBe(true);

    const step2RecheckedOff = setDeleteVerifyCheck(step2Checked, false);
    expect(canExecuteDelete(step2RecheckedOff)).toBe(false);

    const cancelled = cancelDeleteVerify();
    expect(cancelled.stage).toBe('idle');
    expect(canExecuteDelete(cancelled)).toBe(false);
  });

  it('enforces 2-step edit verification and blocks empty or unchanged titles', () => {
    const task = sampleGroup[0];
    const editing = startEditVerify(task);
    expect(editing.stage).toBe('editing');
    expect(canCommitEdit(editing)).toBe(false);

    // Unchanged draft cannot advance
    const unchangedRes = advanceEditToConfirm(editing);
    expect(unchangedRes.error).toBeTruthy();
    expect(unchangedRes.next.stage).toBe('editing');

    // Empty/whitespace draft is blocked
    const cleared = updateEditVerifyDraft(editing, { draftTitle: '   ' });
    const emptyCheck = validateEditVerifyDraft(cleared);
    expect(emptyCheck.ok).toBe(false);
    const emptyRes = advanceEditToConfirm(cleared);
    expect(emptyRes.error).toContain('empty');
    expect(emptyRes.next.stage).toBe('editing');

    // Valid edit advances to Step 2 confirmation (Before -> After)
    const renamed = updateEditVerifyDraft(editing, { draftTitle: 'First-aid & tire kit' });
    const reviewRes = advanceEditToConfirm(renamed);
    expect(reviewRes.error).toBeUndefined();
    expect(reviewRes.next.stage).toBe('confirming');
    expect(canCommitEdit(reviewRes.next)).toBe(true);

    // Stepping back returns cleanly to editing form with preserved draft
    const back = backEditToForm(reviewRes.next);
    expect(back.stage).toBe('editing');
    if (back.stage === 'editing') {
      expect(back.draftTitle).toBe('First-aid & tire kit');
    }

    expect(cancelEditVerify().stage).toBe('idle');
  });

  it('sorts pinned personal bags first, allows moving item bags in 2-step edit, and preserves items when deleting a bag', () => {
    const bags: PrepBag[] = [
      { id: 'b-1', name: 'Pocket', pinned: false, createdAt: '2026-11-27T08:00:00.000Z' },
      { id: 'b-2', name: 'Camera Bag', pinned: true, createdAt: '2026-11-27T09:00:00.000Z' },
      { id: 'b-3', name: 'Backpack', pinned: false, createdAt: '2026-11-27T07:00:00.000Z' },
    ];
    const sorted = sortPersonalBags(bags);
    expect(sorted.map((b) => b.name)).toEqual(['Camera Bag', 'Backpack', 'Pocket']);

    // Moving an item to a different bag counts as a valid edit even if title stays identical
    const task: PrepTask = { id: 'pp-10', title: 'Sandisk 64GB', done: false, bagId: 'b-3' };
    const editing = startEditVerify(task);
    const moved = updateEditVerifyDraft(editing, { draftBagId: 'b-2' });
    const review = advanceEditToConfirm(moved);
    expect(review.error).toBeUndefined();
    expect(review.next.stage).toBe('confirming');
    if (review.next.stage === 'confirming') {
      expect(review.next.draftBagId).toBe('b-2');
    }

    // Deleting a bag preserves items by unassigning their bagId
    const items: PrepTask[] = [
      { id: 'pp-10', title: 'Sandisk 64GB', done: false, bagId: 'b-2' },
      { id: 'pp-11', title: 'Raincoat', done: true, bagId: 'b-3' },
    ];
    const { nextBags, nextTasks } = removePersonalBagPreservingItems(bags, items, 'b-2');
    expect(nextBags.map((b) => b.id)).toEqual(['b-1', 'b-3']);
    expect(nextTasks[0].bagId).toBeUndefined();
    expect(nextTasks[0].title).toBe('Sandisk 64GB');
    expect(nextTasks[1].bagId).toBe('b-3');
  });
});
