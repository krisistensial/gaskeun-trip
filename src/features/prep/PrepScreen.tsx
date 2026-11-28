import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Briefcase,
  Check,
  Lock,
  Pencil,
  Plus,
  Star,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Button,
  ConfirmDialog,
  CornerOrb,
  EmptyState,
  GlassCard,
  Input,
  LiquidBottomSheet,
} from '../../components/atoms';
import { useRegisterOverlay } from '../../context/OverlayContext';
import { useHorizontalScrollFade } from '../../hooks/useHorizontalScrollFade';
import { triggerFeedback } from '../../services/feedback';
import { useBackHandler } from '../../services/pwaHistory';
import type { PrepBag, PrepTask, SharedTrip, TripMember } from '../../types/trip';
import {
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
  type DeleteVerifyState,
  type EditVerifyState,
  type PrepScope,
  type PrepUndoStacks,
} from './prepSafety';
import './prep.css';

export interface PrepScreenProps {
  trip: SharedTrip;
  personalPrep: PrepTask[];
  personalBags?: PrepBag[];
  canEdit: boolean;
  viewOnlyMode?: boolean;
  onOpenMenu: () => void;
  onRequestUnlockPin: () => void;
  onUpdatePersonalPrep: (tasks: PrepTask[], toastMsg?: string) => void;
  onUpdatePersonalBags?: (bags: PrepBag[], tasksOverride?: PrepTask[], toastMsg?: string) => void;
  onUpdateGroupPrep: (tasks: PrepTask[], toastMsg?: string) => void;
}

interface UndoToastState {
  open: boolean;
  message: string;
  scope: PrepScope;
  token: number;
}

export function PrepScreen({
  trip,
  personalPrep,
  personalBags = [],
  canEdit,
  onOpenMenu,
  onRequestUnlockPin,
  onUpdatePersonalPrep,
  onUpdatePersonalBags,
  onUpdateGroupPrep,
}: PrepScreenProps) {
  const [tab, setTab] = useState<PrepScope>('personal');
  const [isEditMode, setIsEditMode] = useState(false);

  // Personal Bags filter & editor states (Strictly Layer 2 private)
  const [selectedBagFilter, setSelectedBagFilter] = useState<string>('all');
  const [bagSheetOpen, setBagSheetOpen] = useState(false);
  const [editingBag, setEditingBag] = useState<PrepBag | null>(null);
  const [bagNameDraft, setBagNameDraft] = useState('');
  const [bagPinnedDraft, setBagPinnedDraft] = useState(false);
  const [deletingBag, setDeletingBag] = useState<PrepBag | null>(null);
  const [movingTask, setMovingTask] = useState<PrepTask | null>(null);

  // Multi-step undo stacks (max 20 per scope: personal & group)
  const [undoStacks, setUndoStacks] = useState<PrepUndoStacks>(() => createEmptyUndoStacks());
  const [undoToast, setUndoToast] = useState<UndoToastState>({
    open: false,
    message: '',
    scope: 'personal',
    token: 0,
  });

  // Add Item Sheet state (reachable anytime from bottom-right floating + button)
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<string>(trip.members[0]?.id ?? '');
  const [newBagId, setNewBagId] = useState<string>('');

  // Group PIC picker sheet (only in Edit Mode)
  const [picPickerTaskId, setPicPickerTaskId] = useState<string | null>(null);

  // 2-Step Verification states for Delete & Edit
  const [deleteState, setDeleteState] = useState<DeleteVerifyState>({ stage: 'idle' });
  const [editState, setEditState] = useState<EditVerifyState>({ stage: 'idle' });
  const [editError, setEditError] = useState<string>('');

  const bagFilterRef = useRef<HTMLDivElement | null>(null);
  const sortedBags = useMemo(() => sortPersonalBags(personalBags), [personalBags]);
  const bagFilterFade = useHorizontalScrollFade(bagFilterRef, [sortedBags.length, tab]);

  useRegisterOverlay(deleteState.stage !== 'idle');
  useBackHandler(
    deleteState.stage !== 'idle',
    () => setDeleteState(cancelDeleteVerify()),
    'sheet',
    'prep-delete-dialog',
  );

  const canEditActiveTab = tab === 'personal' || canEdit;

  // Reset selected bag filter if the selected bag was removed
  useEffect(() => {
    if (selectedBagFilter !== 'all' && !sortedBags.some((b) => b.id === selectedBagFilter)) {
      setSelectedBagFilter('all');
    }
  }, [selectedBagFilter, sortedBags]);

  // Exit edit mode safely when switching to Group without editor permission or enabling View-Only Mode
  useEffect(() => {
    if (!canEditActiveTab) {
      setIsEditMode(false);
    }
  }, [canEditActiveTab]);

  // Ensure all add/edit/bag/move/delete controls & sheets close whenever Edit Mode is off
  useEffect(() => {
    if (!isEditMode) {
      setAddSheetOpen(false);
      setBagSheetOpen(false);
      setEditingBag(null);
      setDeletingBag(null);
      setMovingTask(null);
      setPicPickerTaskId(null);
      setDeleteState(cancelDeleteVerify());
      setEditState(cancelEditVerify());
      setEditError('');
    }
  }, [isEditMode]);

  // 5-second auto-dismiss timer for top Undo toast
  useEffect(() => {
    if (!undoToast.open) return;
    const id = window.setTimeout(() => {
      setUndoToast((prev) => ({ ...prev, open: false }));
    }, 5000);
    return () => window.clearTimeout(id);
  }, [undoToast.open, undoToast.token]);

  const memberById = useMemo(
    () => new Map<string, TripMember>(trip.members.map((m) => [m.id, m])),
    [trip.members],
  );

  const bagById = useMemo(
    () => new Map<string, PrepBag>(sortedBags.map((b) => [b.id, b])),
    [sortedBags],
  );

  const activeTasks = tab === 'personal' ? personalPrep : trip.groupPrep;
  const doneCount = activeTasks.filter((t) => t.done).length;
  const totalCount = activeTasks.length;
  const readyPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const hasUndo = canUndoScope(undoStacks, tab);

  const visibleBags = useMemo(
    () =>
      selectedBagFilter === 'all'
        ? sortedBags
        : sortedBags.filter((b) => b.id === selectedBagFilter),
    [sortedBags, selectedBagFilter],
  );

  const unassignedPersonalTasks = useMemo(
    () => personalPrep.filter((t) => !t.bagId || !bagById.has(t.bagId)),
    [personalPrep, bagById],
  );

  const commitChangeWithUndo = (
    scope: PrepScope,
    nextTasks: PrepTask[],
    toastMessage: string,
  ) => {
    const prevTasks = scope === 'personal' ? personalPrep : trip.groupPrep;
    setUndoStacks((prev) => pushUndoSnapshot(prev, scope, prevTasks, toastMessage));
    if (scope === 'personal') onUpdatePersonalPrep(nextTasks);
    else onUpdateGroupPrep(nextTasks);
    setUndoToast({
      open: true,
      message: toastMessage,
      scope,
      token: Date.now(),
    });
  };

  const handleUndo = (targetScope: PrepScope = tab) => {
    const { entry, nextStacks } = popUndoSnapshot(undoStacks, targetScope);
    if (!entry) return;
    triggerFeedback('success');
    setUndoStacks(nextStacks);
    setUndoToast((prev) => ({ ...prev, open: false }));
    if (targetScope === 'personal') {
      onUpdatePersonalPrep(entry.snapshot, 'Undid last change');
    } else {
      onUpdateGroupPrep(entry.snapshot, 'Undid last change');
    }
  };

  const guardGroupEdit = (fn: () => void) => {
    if (tab === 'personal') {
      fn();
      return;
    }
    if (!canEdit) {
      onRequestUnlockPin();
      return;
    }
    fn();
  };

  const handleSwitchTab = (nextTab: PrepScope) => {
    if (nextTab === tab) return;
    triggerFeedback('tap');
    setTab(nextTab);
    setIsEditMode(false);
    setAddSheetOpen(false);
    setMovingTask(null);
    setPicPickerTaskId(null);
    setDeleteState(cancelDeleteVerify());
    setEditState(cancelEditVerify());
    setEditError('');
  };

  const openAddItemSheet = (preselectedBagId?: string) => {
    if (!isEditMode) return;
    guardGroupEdit(() => {
      triggerFeedback('tap');
      setNewTitle('');
      if (tab === 'personal') {
        const defaultBag =
          preselectedBagId !== undefined
            ? preselectedBagId
            : selectedBagFilter !== 'all'
              ? selectedBagFilter
              : sortedBags[0]?.id ?? '';
        setNewBagId(defaultBag);
      }
      setAddSheetOpen(true);
    });
  };

  const openCreateBagSheet = () => {
    if (!isEditMode) return;
    triggerFeedback('tap');
    setEditingBag(null);
    setBagNameDraft('');
    setBagPinnedDraft(sortedBags.length === 0);
    setBagSheetOpen(true);
  };

  const openRenameBagSheet = (bag: PrepBag) => {
    if (!isEditMode) return;
    triggerFeedback('tap');
    setEditingBag(bag);
    setBagNameDraft(bag.name);
    setBagPinnedDraft(Boolean(bag.pinned));
    setBagSheetOpen(true);
  };

  const handleSaveBagSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = bagNameDraft.trim();
    if (!cleanName || !onUpdatePersonalBags) return;

    triggerFeedback('success');
    if (editingBag) {
      const nextBags = personalBags.map((b) =>
        b.id === editingBag.id ? { ...b, name: cleanName, pinned: bagPinnedDraft } : b,
      );
      onUpdatePersonalBags(nextBags, undefined, `Renamed bag to "${cleanName}"`);
    } else {
      const createdBag: PrepBag = {
        id: `bag-${Date.now().toString(36)}`,
        name: cleanName,
        pinned: bagPinnedDraft,
        createdAt: new Date().toISOString(),
      };
      onUpdatePersonalBags([...personalBags, createdBag], undefined, `Added "${cleanName}"`);
      if (addSheetOpen) {
        setNewBagId(createdBag.id);
      }
    }
    setBagSheetOpen(false);
    setEditingBag(null);
    setBagNameDraft('');
  };

  const handleToggleBagPin = (bag: PrepBag) => {
    if (!isEditMode || !onUpdatePersonalBags) return;
    triggerFeedback('toggle');
    const nextPinned = !bag.pinned;
    const nextBags = personalBags.map((b) =>
      b.id === bag.id ? { ...b, pinned: nextPinned } : b,
    );
    onUpdatePersonalBags(
      nextBags,
      undefined,
      nextPinned ? `Pinned "${bag.name}" to top` : `Unpinned "${bag.name}"`,
    );
  };

  const handleConfirmDeleteBag = () => {
    if (!deletingBag || !onUpdatePersonalBags) return;
    triggerFeedback('warning');
    const { nextBags, nextTasks } = removePersonalBagPreservingItems(
      personalBags,
      personalPrep,
      deletingBag.id,
    );
    onUpdatePersonalBags(nextBags, nextTasks, `Removed "${deletingBag.name}"`);
    if (selectedBagFilter === deletingBag.id) {
      setSelectedBagFilter('all');
    }
    setDeletingBag(null);
  };

  const handleMovePersonalTask = (task: PrepTask, targetBagId: string | undefined) => {
    const currentBagId = task.bagId && bagById.has(task.bagId) ? task.bagId : undefined;
    if (currentBagId === targetBagId) {
      setMovingTask(null);
      return;
    }
    triggerFeedback('success');
    const next = personalPrep.map((t) =>
      t.id === task.id
        ? { ...t, bagId: targetBagId }
        : t,
    );
    const destLabel = targetBagId ? bagById.get(targetBagId)?.name ?? 'Bag' : 'Unassigned';
    commitChangeWithUndo('personal', next, `Moved "${task.title}" to ${destLabel}`);
    setMovingTask(null);
  };

  const handleToggle = (task: PrepTask) => {
    guardGroupEdit(() => {
      const next = activeTasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t));
      const checkingOn = !task.done;
      const allNowDone = checkingOn && next.length > 0 && next.every((t) => t.done);
      triggerFeedback(allNowDone ? 'complete' : checkingOn ? 'check' : 'uncheck');
      const actionMsg = task.done ? `Unchecked "${task.title}"` : `Checked "${task.title}"`;
      commitChangeWithUndo(tab, next, actionMsg);
    });
  };

  const handleAssignPic = (taskId: string, assigneeId: string | undefined) => {
    guardGroupEdit(() => {
      triggerFeedback('success');
      const target = trip.groupPrep.find((t) => t.id === taskId);
      const next = trip.groupPrep.map((t) => (t.id === taskId ? { ...t, assigneeId } : t));
      const assigneeName = assigneeId ? memberById.get(assigneeId)?.name ?? 'Crew' : 'Unassigned';
      commitChangeWithUndo(
        'group',
        next,
        target ? `Assigned "${target.title}" to ${assigneeName}` : 'Assignee updated',
      );
      setPicPickerTaskId(null);
    });
  };

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = newTitle.trim();
    if (!clean) return;

    guardGroupEdit(() => {
      triggerFeedback('success');
      const resolvedBagId = tab === 'personal' && newBagId ? newBagId : undefined;
      const created: PrepTask = {
        id: `${tab === 'personal' ? 'pp' : 'gp'}-${Date.now().toString(36)}`,
        title: clean,
        done: false,
        assigneeId: tab === 'group' ? newAssigneeId || undefined : undefined,
        ...(resolvedBagId ? { bagId: resolvedBagId } : {}),
      };
      const next = [...activeTasks, created];
      const bagLabel = resolvedBagId ? bagById.get(resolvedBagId)?.name : undefined;
      commitChangeWithUndo(
        tab,
        next,
        bagLabel ? `Added "${clean}" to ${bagLabel}` : `Added "${clean}"`,
      );
      setNewTitle('');
      setAddSheetOpen(false);
    });
  };

  const handleConfirmDeleteStep2 = () => {
    if (!canExecuteDelete(deleteState) || deleteState.stage !== 'step2') return;
    const victim = deleteState.task;
    guardGroupEdit(() => {
      triggerFeedback('warning');
      const next = activeTasks.filter((t) => t.id !== victim.id);
      commitChangeWithUndo(tab, next, `Removed "${victim.title}"`);
      setDeleteState(cancelDeleteVerify());
    });
  };

  const handleReviewEdit = (e: FormEvent) => {
    e.preventDefault();
    const res = advanceEditToConfirm(editState);
    if (res.error) {
      triggerFeedback('warning');
      setEditError(res.error);
      return;
    }
    triggerFeedback('tap');
    setEditError('');
    setEditState(res.next);
  };

  const handleConfirmEditSave = () => {
    if (!canCommitEdit(editState) || editState.stage !== 'confirming') return;
    const { task, draftTitle, draftAssigneeId, draftBagId } = editState;
    const cleanTitle = draftTitle.trim();
    guardGroupEdit(() => {
      triggerFeedback('success');
      const next = activeTasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              title: cleanTitle,
              assigneeId: tab === 'group' ? draftAssigneeId : t.assigneeId,
              bagId: tab === 'personal' ? draftBagId || undefined : t.bagId,
            }
          : t,
      );
      commitChangeWithUndo(tab, next, `Updated "${cleanTitle}"`);
      setEditState(cancelEditVerify());
      setEditError('');
    });
  };

  const editValidation = editState.stage === 'editing' ? validateEditVerifyDraft(editState) : null;

  const renderTaskRow = (task: PrepTask) => {
    const pic = task.assigneeId ? memberById.get(task.assigneeId) : undefined;
    const canCheckRow = tab === 'personal' || canEdit;
    return (
      <div
        key={task.id}
        className={`prep-item ${task.done ? 'prep-item--done' : ''} ${
          isEditMode ? 'prep-item--editing' : ''
        }`}
      >
        <button
          type="button"
          disabled={!canCheckRow}
          aria-label={`Mark ${task.title} ${task.done ? 'incomplete' : 'complete'}`}
          className={`prep-check ${task.done ? 'prep-check--done' : ''}`}
          onClick={() => canCheckRow && handleToggle(task)}
        >
          {task.done && <Check size={13} strokeWidth={2.6} />}
        </button>

        <span className="prep-item__text">{task.title}</span>

        {tab === 'group' && (
          <button
            type="button"
            disabled={!isEditMode || !canEdit}
            aria-label={pic ? `Assigned to ${pic.name}` : 'Assign member'}
            onClick={() => isEditMode && canEdit && setPicPickerTaskId(task.id)}
            className={`prep-pic-btn ${isEditMode && canEdit ? 'prep-pic-btn--editable' : ''}`}
          >
            <Avatar
              initials={pic?.initials ?? '+'}
              name={pic?.name}
              src={pic?.avatarDataUrl}
              size="sm"
              bg={pic?.avatarBg ?? '#EAEFED'}
              color={pic?.avatarColor ?? '#546860'}
            />
          </button>
        )}

        {isEditMode && canEditActiveTab && (
          <div className="prep-row-actions">
            {tab === 'personal' && (
              <button
                type="button"
                className="prep-icon-btn prep-icon-btn--move tactile"
                aria-label={`Move ${task.title} to another bag`}
                title="Move to another bag"
                onClick={() => {
                  triggerFeedback('tap');
                  setMovingTask(task);
                }}
              >
                <ArrowRightLeft size={13.5} strokeWidth={2.1} />
              </button>
            )}
            <button
              type="button"
              className="prep-icon-btn prep-icon-btn--edit tactile"
              aria-label={`Edit ${task.title}`}
              onClick={() => {
                setEditError('');
                setEditState(startEditVerify(task));
              }}
            >
              <Pencil size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="prep-icon-btn prep-icon-btn--delete tactile"
              aria-label={`Delete ${task.title}`}
              onClick={() => setDeleteState(startDeleteVerify(task))}
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="prep-root">
      <header className="prep-header">
        <h1 className="prep-title">Prep</h1>
        <div className="prep-header-actions">
          {isEditMode && canEditActiveTab && (
            <Button
              variant="glass"
              size="sm"
              disabled={!hasUndo}
              aria-label="Undo last prep change"
              leftIcon={<Undo2 size={13} strokeWidth={2.1} />}
              onClick={() => handleUndo(tab)}
            >
              Undo
            </Button>
          )}
          {canEditActiveTab && (
            <span data-tour="prep-add" style={{ display: 'inline-flex' }}>
              <Button
                variant={isEditMode ? 'matcha' : 'glass'}
                size="sm"
                leftIcon={isEditMode ? <Check size={13} strokeWidth={2.4} /> : <Pencil size={13} strokeWidth={2} />}
                onClick={() => {
                  triggerFeedback('tap');
                  setIsEditMode((prev) => !prev);
                }}
              >
                {isEditMode ? 'Done' : 'Edit'}
              </Button>
            </span>
          )}
          <CornerOrb kind="menu" ariaLabel="Trip menu" onClick={onOpenMenu} />
        </div>
      </header>

      {/* Dual Segmented Pill: Personal (Local, PIN-Free) | Group (Shared, Editor-Gated) */}
      <div data-tour="prep-overview" className="prep-seg" role="tablist" aria-label="Checklist scope">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'personal'}
          className={`prep-seg__btn ${tab === 'personal' ? 'prep-seg__btn--active' : ''}`}
          onClick={() => handleSwitchTab('personal')}
        >
          <Lock size={14} strokeWidth={2} />
          <span>Personal</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'group'}
          className={`prep-seg__btn ${tab === 'group' ? 'prep-seg__btn--active' : ''}`}
          onClick={() => handleSwitchTab('group')}
        >
          <Users size={14} strokeWidth={2} />
          <span>Group</span>
        </button>
      </div>

      {/* Fluid Progress Bar Card */}
      <GlassCard variant="spotlight" padding="md">
        <div className="prep-progress-head">
          <div>
            <div className="gk-field__label">
              {tab === 'personal' ? 'SAVED ON THIS DEVICE ONLY' : 'SHARED CREW CHECKLIST'}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>
              {doneCount} of {totalCount} ready
            </div>
          </div>
          <span className="prep-progress-pct">{readyPct}%</span>
        </div>
        <div className="wallet-progress-track" style={{ marginBottom: 2 }}>
          <div className="wallet-progress-fill" style={{ width: `${readyPct}%` }} />
        </div>
      </GlassCard>

      {/* Personal Only: Bags & Packing Locations Bar (Layer 2 Private) */}
      {tab === 'personal' && (
        <div data-tour="prep-bags"><GlassCard variant="clear" padding="sm" className="prep-bags-card">
          <div className="prep-bags-card__head">
            <span className="gk-field__label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Briefcase size={12} strokeWidth={2.2} color="var(--brand-matcha)" />
              <span>BAGS &amp; PLACES</span>
            </span>
            <span className="prep-bags-card__count">
              {sortedBags.length} {sortedBags.length === 1 ? 'bag' : 'bags'}
            </span>
          </div>

          <div
            ref={bagFilterRef}
            data-fade={bagFilterFade.dataFade}
            className="prep-bag-strip"
            role="tablist"
            aria-label="Filter personal items by bag"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedBagFilter === 'all'}
              className={`prep-bag-pill tactile ${
                selectedBagFilter === 'all' ? 'prep-bag-pill--active' : ''
              }`}
              onClick={() => {
                triggerFeedback('tap');
                setSelectedBagFilter('all');
              }}
            >
              All
            </button>

            {sortedBags.map((bag) => {
              const active = selectedBagFilter === bag.id;
              return (
                <button
                  key={bag.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`prep-bag-pill tactile ${active ? 'prep-bag-pill--active' : ''}`}
                  onClick={() => {
                    triggerFeedback('tap');
                    setSelectedBagFilter((prev) => (prev === bag.id ? 'all' : bag.id));
                  }}
                >
                  {bag.pinned && (
                    <Star
                      size={11.5}
                      strokeWidth={2.2}
                      fill={active ? '#FFE099' : '#D99136'}
                      color={active ? '#FFE099' : '#D99136'}
                    />
                  )}
                  <span>{bag.name}</span>
                </button>
              );
            })}

            {isEditMode && onUpdatePersonalBags && (
              <button
                type="button"
                className="prep-bag-pill prep-bag-pill--add tactile"
                onClick={openCreateBagSheet}
              >
                <Plus size={12.5} strokeWidth={2.4} />
                <span>Bag</span>
              </button>
            )}
          </div>
        </GlassCard></div>
      )}

      {/* Subtle Edit Mode Banner (Add button now floats at bottom-right for 1-thumb reach) */}
      {isEditMode && canEditActiveTab && (
        <div className="prep-edit-bar">
          <span className="prep-edit-bar__hint">
            Tap pencil to edit, move bag, or trash to remove
          </span>
        </div>
      )}

      {/* Checklist Content: Grouped by Bags in Personal tab, flat list in Group tab */}
      {tab === 'personal' ? (
        sortedBags.length === 0 && personalPrep.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={20} strokeWidth={1.8} />}
            title="Your packing list is clear"
            description={
              isEditMode
                ? 'Tap + Bag above or the + button below to start adding items.'
                : 'Tap Edit above to add bags and packing items.'
            }
            action={
              isEditMode && onUpdatePersonalBags ? (
                <Button
                  variant="matcha"
                  size="sm"
                  leftIcon={<Plus size={14} strokeWidth={2.2} />}
                  onClick={openCreateBagSheet}
                >
                  Add First Bag
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={`prep-bag-groups ${isEditMode ? 'prep-bag-groups--editing' : ''}`}>
            {visibleBags.map((bag) => {
              const bagItems = personalPrep.filter((t) => t.bagId === bag.id);
              const bagDone = bagItems.filter((t) => t.done).length;
              const allBagDone = bagItems.length > 0 && bagDone === bagItems.length;

              return (
                <section key={bag.id} className="prep-bag-section" aria-label={bag.name}>
                  <div className="prep-bag-head">
                    <div className="prep-bag-head__left">
                      {isEditMode ? (
                        <button
                          type="button"
                          className={`prep-bag-star tactile ${bag.pinned ? 'prep-bag-star--on' : ''}`}
                          aria-label={bag.pinned ? `Unpin ${bag.name}` : `Pin ${bag.name} to top`}
                          onClick={() => handleToggleBagPin(bag)}
                        >
                          <Star
                            size={16}
                            strokeWidth={2}
                            fill={bag.pinned ? '#D99136' : 'none'}
                          />
                        </button>
                      ) : bag.pinned ? (
                        <span
                          className="prep-bag-star prep-bag-star--on prep-bag-star--readonly"
                          aria-label="Pinned bag"
                        >
                          <Star size={14} strokeWidth={2} fill="#D99136" />
                        </span>
                      ) : null}
                      <h2 className="prep-bag-head__title">{bag.name}</h2>
                      <span
                        className={`prep-bag-head__stat ${
                          allBagDone ? 'prep-bag-head__stat--done' : ''
                        }`}
                      >
                        {bagDone}/{bagItems.length}
                      </span>
                    </div>

                    {isEditMode && (
                      <div className="prep-bag-head__actions">
                        <button
                          type="button"
                          className="prep-bag-mini-btn prep-bag-mini-btn--add tactile"
                          aria-label={`Add item to ${bag.name}`}
                          title={`Add to ${bag.name}`}
                          onClick={() => openAddItemSheet(bag.id)}
                        >
                          <Plus size={14} strokeWidth={2.4} />
                        </button>
                        {onUpdatePersonalBags && (
                          <>
                            <button
                              type="button"
                              className="prep-bag-mini-btn tactile"
                              aria-label={`Rename ${bag.name}`}
                              title="Rename bag"
                              onClick={() => openRenameBagSheet(bag)}
                            >
                              <Pencil size={13} strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              className="prep-bag-mini-btn prep-bag-mini-btn--delete tactile"
                              aria-label={`Remove ${bag.name}`}
                              title="Remove bag"
                              onClick={() => {
                                triggerFeedback('tap');
                                setDeletingBag(bag);
                              }}
                            >
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {bagItems.length === 0 ? (
                    <div className="prep-bag-empty">
                      <span>No items in this bag yet.</span>
                    </div>
                  ) : (
                    <div className="prep-list">{bagItems.map(renderTaskRow)}</div>
                  )}
                </section>
              );
            })}

            {selectedBagFilter === 'all' && unassignedPersonalTasks.length > 0 && (
              <section className="prep-bag-section" aria-label="Unassigned items">
                <div className="prep-bag-head">
                  <div className="prep-bag-head__left">
                    <h2 className="prep-bag-head__title prep-bag-head__title--muted">
                      Unassigned
                    </h2>
                    <span className="prep-bag-head__stat">
                      {unassignedPersonalTasks.filter((t) => t.done).length}/
                      {unassignedPersonalTasks.length}
                    </span>
                  </div>
                </div>
                <div className="prep-list">{unassignedPersonalTasks.map(renderTaskRow)}</div>
              </section>
            )}
          </div>
        )
      ) : activeTasks.length === 0 ? (
        <EmptyState
          icon={<Users size={20} strokeWidth={1.8} />}
          title="No group tasks yet"
          description={
            canEditActiveTab
              ? isEditMode
                ? 'Tap the + button below to add your first shared crew task.'
                : 'Tap Edit above to add your first shared crew task.'
              : 'Shared crew prep tasks will appear here.'
          }
        />
      ) : (
        <div className="prep-list">{activeTasks.map(renderTaskRow)}</div>
      )}

      {/* Floating Bottom-Right Glass (+) FAB — strictly visible in Edit Mode to prevent accidental taps */}
      {isEditMode && canEditActiveTab && (
        <CornerOrb
          kind="add"
          size="lg"
          portal
          ariaLabel={tab === 'personal' ? 'Add personal packing item' : 'Add group prep task'}
          className="floating-glass-fab"
          onClick={() => openAddItemSheet()}
        />
      )}

      {/* Add Prep Item Sheet */}
      <LiquidBottomSheet
        open={addSheetOpen}
        title="Add Prep Item"
        subtitle={tab === 'personal' ? 'Saved privately on this device' : 'Shared with the crew'}
        onClose={() => setAddSheetOpen(false)}
      >
        <form className="prep-sheet-form" onSubmit={handleAddSubmit}>
          <Input
            id="prep-add-title"
            label="Item Name"
            placeholder={
              tab === 'personal' ? 'e.g. Raincoat & powerbank' : 'e.g. First-aid kit for bikes'
            }
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />

          {tab === 'personal' && (
            <div>
              <div className="gk-field__label" style={{ marginBottom: 6 }}>
                BAG / PLACE (OPTIONAL)
              </div>
              <div className="prep-assignee-strip">
                <button
                  type="button"
                  className={`prep-bag-choice tactile ${
                    !newBagId ? 'prep-bag-choice--active' : ''
                  }`}
                  onClick={() => setNewBagId('')}
                >
                  Unassigned
                </button>
                {sortedBags.map((bag) => (
                  <button
                    key={bag.id}
                    type="button"
                    className={`prep-bag-choice tactile ${
                      newBagId === bag.id ? 'prep-bag-choice--active' : ''
                    }`}
                    onClick={() => setNewBagId(bag.id)}
                  >
                    {bag.pinned && <Star size={11} strokeWidth={2.2} fill="#D99136" color="#D99136" />}
                    <span>{bag.name}</span>
                  </button>
                ))}
                {onUpdatePersonalBags && (
                  <button
                    type="button"
                    className="prep-bag-choice prep-bag-choice--new tactile"
                    onClick={openCreateBagSheet}
                  >
                    <Plus size={12} strokeWidth={2.4} />
                    <span>New Bag</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'group' && trip.members.length > 0 && (
            <div>
              <div className="gk-field__label" style={{ marginBottom: 6 }}>
                ASSIGNED CREW (OPTIONAL)
              </div>
              <div className="prep-assignee-strip">
                {trip.members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`prep-assignee-pill tactile ${
                      newAssigneeId === m.id ? 'prep-assignee-pill--active' : ''
                    }`}
                    onClick={() => setNewAssigneeId((prev) => (prev === m.id ? '' : m.id))}
                  >
                    <Avatar
                      initials={m.initials}
                      name={m.name}
                      src={m.avatarDataUrl}
                      size="sm"
                      bg={m.avatarBg}
                      color={m.avatarColor}
                    />
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="gk-dialog__actions" style={{ marginTop: 4 }}>
            <Button variant="glass" size="md" onClick={() => setAddSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="matcha" size="md" disabled={!newTitle.trim()}>
              Add Item
            </Button>
          </div>
        </form>
      </LiquidBottomSheet>

      {/* 1-Tap Move Personal Item to Another Bag / Place Sheet */}
      <LiquidBottomSheet
        open={Boolean(movingTask)}
        title="Move to Bag"
        subtitle={movingTask ? `Choose where to pack "${movingTask.title}"` : ''}
        onClose={() => setMovingTask(null)}
      >
        {movingTask && (
          <div className="prep-move-list">
            {sortedBags.map((bag) => {
              const isCurrent = movingTask.bagId === bag.id;
              const count = personalPrep.filter((t) => t.bagId === bag.id).length;
              return (
                <button
                  key={bag.id}
                  type="button"
                  className={`prep-move-option tactile ${
                    isCurrent ? 'prep-move-option--active' : ''
                  }`}
                  onClick={() => handleMovePersonalTask(movingTask, bag.id)}
                >
                  <span className="prep-move-option__left">
                    <span className="prep-move-option__icon">
                      {bag.pinned ? (
                        <Star size={15} strokeWidth={2.1} fill="#D99136" color="#D99136" />
                      ) : (
                        <Briefcase size={15} strokeWidth={2} />
                      )}
                    </span>
                    <span className="prep-move-option__copy">
                      <span className="prep-move-option__name">{bag.name}</span>
                      <span className="prep-move-option__meta">
                        {count} {count === 1 ? 'item' : 'items'}
                      </span>
                    </span>
                  </span>
                  {isCurrent && (
                    <span className="prep-move-option__badge">
                      <Check size={13} strokeWidth={2.6} />
                      <span>Current</span>
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              className={`prep-move-option tactile ${
                !movingTask.bagId || !bagById.has(movingTask.bagId)
                  ? 'prep-move-option--active'
                  : ''
              }`}
              onClick={() => handleMovePersonalTask(movingTask, undefined)}
            >
              <span className="prep-move-option__left">
                <span className="prep-move-option__icon prep-move-option__icon--muted">
                  <ArrowRightLeft size={14} strokeWidth={2} />
                </span>
                <span className="prep-move-option__copy">
                  <span className="prep-move-option__name">Unassigned</span>
                  <span className="prep-move-option__meta">Not placed in a specific bag</span>
                </span>
              </span>
              {(!movingTask.bagId || !bagById.has(movingTask.bagId)) && (
                <span className="prep-move-option__badge">
                  <Check size={13} strokeWidth={2.6} />
                  <span>Current</span>
                </span>
              )}
            </button>

            {onUpdatePersonalBags && (
              <Button
                variant="glass"
                size="md"
                fullWidth
                leftIcon={<Plus size={15} strokeWidth={2.2} />}
                onClick={() => {
                  setMovingTask(null);
                  openCreateBagSheet();
                }}
              >
                Create New Bag / Place
              </Button>
            )}
          </div>
        )}
      </LiquidBottomSheet>

      {/* Add / Rename Personal Bag Sheet */}
      <LiquidBottomSheet
        open={bagSheetOpen}
        title={editingBag ? 'Rename Bag / Place' : 'New Bag / Place'}
        subtitle="Keep track of where each personal item is packed"
        onClose={() => {
          setBagSheetOpen(false);
          setEditingBag(null);
        }}
      >
        <form className="prep-sheet-form" onSubmit={handleSaveBagSubmit}>
          <Input
            id="prep-bag-name"
            label="Bag or Spot Name"
            placeholder="e.g. Camera Bag, Backpack, Jacket Pocket"
            value={bagNameDraft}
            onChange={(e) => setBagNameDraft(e.target.value)}
            autoFocus
          />

          <button
            type="button"
            role="switch"
            aria-checked={bagPinnedDraft}
            className={`prep-bag-pin-row tactile ${
              bagPinnedDraft ? 'prep-bag-pin-row--on' : ''
            }`}
            onClick={() => {
              triggerFeedback('toggle');
              setBagPinnedDraft((prev) => !prev);
            }}
          >
            <span className="prep-bag-pin-row__left">
              <Star
                size={16}
                strokeWidth={2.1}
                fill={bagPinnedDraft ? '#D99136' : 'none'}
                color={bagPinnedDraft ? '#D99136' : 'var(--text-secondary)'}
              />
              <span>Pin this bag to the top</span>
            </span>
            <span
              className={`menu-toggle-switch ${
                bagPinnedDraft ? 'menu-toggle-switch--amber' : ''
              }`}
              aria-hidden="true"
            >
              <span className="menu-toggle-switch__knob" />
            </span>
          </button>

          <div className="gk-dialog__actions" style={{ marginTop: 4 }}>
            <Button
              variant="glass"
              size="md"
              onClick={() => {
                setBagSheetOpen(false);
                setEditingBag(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="matcha" size="md" disabled={!bagNameDraft.trim()}>
              {editingBag ? 'Save Bag' : 'Create Bag'}
            </Button>
          </div>
        </form>
      </LiquidBottomSheet>

      {/* Edit Prep Item Sheet with 2-Step Verification (Before -> After Summary) */}
      <LiquidBottomSheet
        open={editState.stage !== 'idle'}
        title="Edit Prep Item"
        subtitle={
          editState.stage === 'confirming'
            ? 'Step 2 of 2 · Confirm changes before saving'
            : 'Step 1 of 2 · Update item details'
        }
        onClose={() => {
          setEditState(cancelEditVerify());
          setEditError('');
        }}
      >
        {editState.stage === 'editing' && (
          <form className="prep-sheet-form" onSubmit={handleReviewEdit}>
            <div className="prep-current-box">
              <span className="gk-field__label">CURRENT TEXT</span>
              <span className="prep-current-box__val">{editState.task.title}</span>
            </div>

            <Input
              id="prep-edit-title"
              label="Updated Item Name"
              value={editState.draftTitle}
              errorMessage={
                editError ||
                (!editState.draftTitle.trim() ? 'Item name cannot be empty' : undefined)
              }
              onChange={(e) => {
                setEditError('');
                setEditState((prev) => updateEditVerifyDraft(prev, { draftTitle: e.target.value }));
              }}
            />

            {tab === 'personal' && sortedBags.length > 0 && (
              <div>
                <div className="gk-field__label" style={{ marginBottom: 6 }}>
                  BAG / PLACE
                </div>
                <div className="prep-assignee-strip">
                  <button
                    type="button"
                    className={`prep-bag-choice tactile ${
                      !editState.draftBagId ? 'prep-bag-choice--active' : ''
                    }`}
                    onClick={() => {
                      setEditError('');
                      setEditState((prev) => updateEditVerifyDraft(prev, { draftBagId: undefined }));
                    }}
                  >
                    Unassigned
                  </button>
                  {sortedBags.map((bag) => (
                    <button
                      key={bag.id}
                      type="button"
                      className={`prep-bag-choice tactile ${
                        editState.draftBagId === bag.id ? 'prep-bag-choice--active' : ''
                      }`}
                      onClick={() => {
                        setEditError('');
                        setEditState((prev) => updateEditVerifyDraft(prev, { draftBagId: bag.id }));
                      }}
                    >
                      {bag.pinned && (
                        <Star size={11} strokeWidth={2.2} fill="#D99136" color="#D99136" />
                      )}
                      <span>{bag.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'group' && trip.members.length > 0 && (
              <div>
                <div className="gk-field__label" style={{ marginBottom: 6 }}>
                  ASSIGNED CREW
                </div>
                <div className="prep-assignee-strip">
                  {trip.members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`prep-assignee-pill tactile ${
                        editState.draftAssigneeId === m.id ? 'prep-assignee-pill--active' : ''
                      }`}
                      onClick={() => {
                        setEditError('');
                        setEditState((prev) =>
                          updateEditVerifyDraft(prev, {
                            draftAssigneeId:
                              prev.stage !== 'idle' && prev.draftAssigneeId === m.id
                                ? undefined
                                : m.id,
                          }),
                        );
                      }}
                    >
                      <Avatar
                        initials={m.initials}
                        name={m.name}
                        src={m.avatarDataUrl}
                        size="sm"
                        bg={m.avatarBg}
                        color={m.avatarColor}
                      />
                      <span>{m.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="gk-dialog__actions" style={{ marginTop: 4 }}>
              <Button
                variant="glass"
                size="md"
                onClick={() => {
                  setEditState(cancelEditVerify());
                  setEditError('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="matcha"
                size="md"
                disabled={Boolean(editValidation && !editValidation.ok)}
              >
                Review Changes
              </Button>
            </div>
          </form>
        )}

        {editState.stage === 'confirming' && (
          <div className="prep-sheet-form">
            <div className="prep-diff-card">
              <div className="prep-diff-col">
                <span className="gk-field__label">BEFORE</span>
                <span className="prep-diff-before">{editState.task.title}</span>
                {tab === 'personal' && (
                  <span className="prep-diff-meta">
                    {editState.task.bagId
                      ? bagById.get(editState.task.bagId)?.name ?? 'Unassigned'
                      : 'Unassigned'}
                  </span>
                )}
                {tab === 'group' && (
                  <span className="prep-diff-meta">
                    {editState.task.assigneeId
                      ? memberById.get(editState.task.assigneeId)?.name ?? 'Crew'
                      : 'Unassigned'}
                  </span>
                )}
              </div>
              <ArrowRight size={16} strokeWidth={2.2} color="var(--brand-matcha)" style={{ flexShrink: 0 }} />
              <div className="prep-diff-col">
                <span className="gk-field__label">AFTER</span>
                <span className="prep-diff-after">{editState.draftTitle}</span>
                {tab === 'personal' && (
                  <span className="prep-diff-meta">
                    {editState.draftBagId
                      ? bagById.get(editState.draftBagId)?.name ?? 'Unassigned'
                      : 'Unassigned'}
                  </span>
                )}
                {tab === 'group' && (
                  <span className="prep-diff-meta">
                    {editState.draftAssigneeId
                      ? memberById.get(editState.draftAssigneeId)?.name ?? 'Crew'
                      : 'Unassigned'}
                  </span>
                )}
              </div>
            </div>

            <p className="prep-verify-note">
              This will replace the existing checklist item. You can still tap Undo anytime.
            </p>

            <div className="gk-dialog__actions">
              <Button
                variant="glass"
                size="md"
                onClick={() => setEditState((prev) => backEditToForm(prev))}
              >
                Back
              </Button>
              <Button
                variant="matcha"
                size="md"
                disabled={!canCommitEdit(editState)}
                onClick={handleConfirmEditSave}
              >
                Confirm &amp; Save
              </Button>
            </div>
          </div>
        )}
      </LiquidBottomSheet>

      {/* Group PIC Avatar Picker Sheet (Edit Mode Only) */}
      <LiquidBottomSheet
        open={Boolean(picPickerTaskId)}
        title="Assign Task"
        subtitle="Pick who handles this item"
        onClose={() => setPicPickerTaskId(null)}
      >
        {picPickerTaskId && (
          <div className="slot-picker-grid">
            {trip.members.map((m) => (
              <button
                key={m.id}
                type="button"
                className="slot-picker-option tactile"
                onClick={() => handleAssignPic(picPickerTaskId, m.id)}
              >
                <Avatar
                  initials={m.initials}
                  name={m.name}
                  src={m.avatarDataUrl}
                  size="sm"
                  bg={m.avatarBg}
                  color={m.avatarColor}
                />
                <span>{m.name}</span>
              </button>
            ))}
            <button
              type="button"
              className="slot-picker-option tactile"
              onClick={() => handleAssignPic(picPickerTaskId, undefined)}
            >
              <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
            </button>
          </div>
        )}
      </LiquidBottomSheet>

      {/* Delete Bag Confirmation Dialog (keeps all packed items safe as Unassigned) */}
      <ConfirmDialog
        open={Boolean(deletingBag)}
        title={deletingBag ? `Remove "${deletingBag.name}"?` : 'Remove bag?'}
        description="Your items inside this bag will NOT be deleted — they will simply move to Unassigned."
        confirmLabel="Remove Bag"
        destructive
        onCancel={() => setDeletingBag(null)}
        onConfirm={handleConfirmDeleteBag}
      />

      {/* 2-Step Verification Delete Dialog (Portaled to document.body) */}
      {deleteState.stage !== 'idle' &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="gk-dialog-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prep-delete-title"
            onClick={() => setDeleteState(cancelDeleteVerify())}
          >
            <div className="gk-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="prep-delete-badge">
                <AlertTriangle size={14} strokeWidth={2.2} />
                <span>{deleteState.stage === 'step1' ? 'Step 1 of 2' : 'Step 2 of 2'}</span>
              </div>

              <h3 id="prep-delete-title" className="gk-dialog__title">
                {deleteState.stage === 'step1'
                  ? 'Delete this item?'
                  : 'Confirm permanent removal'}
              </h3>

              <div className="prep-delete-preview">{deleteState.task.title}</div>

              {deleteState.stage === 'step1' ? (
                <>
                  <p className="gk-dialog__desc">
                    Review the item above before continuing to final confirmation.
                  </p>
                  <div className="gk-dialog__actions">
                    <Button
                      variant="glass"
                      size="md"
                      onClick={() => setDeleteState(cancelDeleteVerify())}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="md"
                      onClick={() => setDeleteState((prev) => advanceDeleteVerify(prev))}
                    >
                      Continue to Delete
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <label className="prep-verify-check">
                    <input
                      type="checkbox"
                      checked={deleteState.confirmedCheck}
                      onChange={(e) =>
                        setDeleteState((prev) => setDeleteVerifyCheck(prev, e.target.checked))
                      }
                    />
                    <span>I confirm removing this item</span>
                  </label>
                  <div className="gk-dialog__actions">
                    <Button
                      variant="glass"
                      size="md"
                      onClick={() => setDeleteState(cancelDeleteVerify())}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="md"
                      disabled={!canExecuteDelete(deleteState)}
                      onClick={handleConfirmDeleteStep2}
                    >
                      Yes, Delete Permanently
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* 5-Second Floating Top Undo Toast (Top-mounted so bottom FAB & list items stay unobstructed) */}
      {undoToast.open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="prep-undo-toast-host" role="status" aria-live="polite">
            <div className="prep-undo-toast">
              <span className="prep-undo-toast__msg">{undoToast.message}</span>
              <button
                type="button"
                className="prep-undo-toast__btn tactile"
                onClick={() => handleUndo(undoToast.scope)}
              >
                <Undo2 size={13} strokeWidth={2.2} />
                <span>Undo</span>
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
