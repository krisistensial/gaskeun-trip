import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Button,
  CornerOrb,
  EmptyState,
  GlassCard,
  Input,
  LiquidBottomSheet,
} from '../../components/atoms';
import { useRegisterOverlay } from '../../context/OverlayContext';
import type { PrepTask, SharedTrip, TripMember } from '../../types/trip';
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
  setDeleteVerifyCheck,
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
  canEdit: boolean;
  onOpenMenu: () => void;
  onRequestUnlockPin: () => void;
  onUpdatePersonalPrep: (tasks: PrepTask[], toastMsg?: string) => void;
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
  canEdit,
  onOpenMenu,
  onRequestUnlockPin,
  onUpdatePersonalPrep,
  onUpdateGroupPrep,
}: PrepScreenProps) {
  const [tab, setTab] = useState<PrepScope>('personal');
  const [isEditMode, setIsEditMode] = useState(false);

  // Multi-step undo stacks (max 20 per scope: personal & group)
  const [undoStacks, setUndoStacks] = useState<PrepUndoStacks>(() => createEmptyUndoStacks());
  const [undoToast, setUndoToast] = useState<UndoToastState>({
    open: false,
    message: '',
    scope: 'personal',
    token: 0,
  });

  // Add Item Sheet state (only accessible in Edit Mode)
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<string>(trip.members[0]?.id ?? '');

  // Group PIC picker sheet (only in Edit Mode)
  const [picPickerTaskId, setPicPickerTaskId] = useState<string | null>(null);

  // 2-Step Verification states for Delete & Edit
  const [deleteState, setDeleteState] = useState<DeleteVerifyState>({ stage: 'idle' });
  const [editState, setEditState] = useState<EditVerifyState>({ stage: 'idle' });
  const [editError, setEditError] = useState<string>('');

  useRegisterOverlay(deleteState.stage !== 'idle');

  const canEditActiveTab = tab === 'personal' || canEdit;

  // Exit edit mode safely when switching to Group without editor permission
  useEffect(() => {
    if (tab === 'group' && !canEdit) {
      setIsEditMode(false);
      setAddSheetOpen(false);
      setDeleteState(cancelDeleteVerify());
      setEditState(cancelEditVerify());
    }
  }, [tab, canEdit]);

  // 5-second auto-dismiss timer for floating Undo toast
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

  const activeTasks = tab === 'personal' ? personalPrep : trip.groupPrep;
  const doneCount = activeTasks.filter((t) => t.done).length;
  const totalCount = activeTasks.length;
  const readyPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const hasUndo = canUndoScope(undoStacks, tab);

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
    setTab(nextTab);
    setIsEditMode(false);
    setAddSheetOpen(false);
    setPicPickerTaskId(null);
    setDeleteState(cancelDeleteVerify());
    setEditState(cancelEditVerify());
    setEditError('');
  };

  const handleToggle = (task: PrepTask) => {
    guardGroupEdit(() => {
      const next = activeTasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t));
      const actionMsg = task.done ? `Unchecked "${task.title}"` : `Checked "${task.title}"`;
      commitChangeWithUndo(tab, next, actionMsg);
    });
  };

  const handleAssignPic = (taskId: string, assigneeId: string | undefined) => {
    guardGroupEdit(() => {
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
      const created: PrepTask = {
        id: `${tab === 'personal' ? 'pp' : 'gp'}-${Date.now().toString(36)}`,
        title: clean,
        done: false,
        assigneeId: tab === 'group' ? newAssigneeId || undefined : undefined,
      };
      const next = [...activeTasks, created];
      commitChangeWithUndo(tab, next, `Added "${clean}"`);
      setNewTitle('');
      setAddSheetOpen(false);
    });
  };

  const handleConfirmDeleteStep2 = () => {
    if (!canExecuteDelete(deleteState) || deleteState.stage !== 'step2') return;
    const victim = deleteState.task;
    guardGroupEdit(() => {
      const next = activeTasks.filter((t) => t.id !== victim.id);
      commitChangeWithUndo(tab, next, `Removed "${victim.title}"`);
      setDeleteState(cancelDeleteVerify());
    });
  };

  const handleReviewEdit = (e: FormEvent) => {
    e.preventDefault();
    const res = advanceEditToConfirm(editState);
    if (res.error) {
      setEditError(res.error);
      return;
    }
    setEditError('');
    setEditState(res.next);
  };

  const handleConfirmEditSave = () => {
    if (!canCommitEdit(editState) || editState.stage !== 'confirming') return;
    const { task, draftTitle, draftAssigneeId } = editState;
    const cleanTitle = draftTitle.trim();
    guardGroupEdit(() => {
      const next = activeTasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              title: cleanTitle,
              assigneeId: tab === 'group' ? draftAssigneeId : t.assigneeId,
            }
          : t,
      );
      commitChangeWithUndo(tab, next, `Updated "${cleanTitle}"`);
      setEditState(cancelEditVerify());
      setEditError('');
    });
  };

  const editValidation = editState.stage === 'editing' ? validateEditVerifyDraft(editState) : null;

  return (
    <div className="prep-root">
      <header className="prep-header">
        <h1 className="prep-title">Prep</h1>
        <div className="prep-header-actions">
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
          {canEditActiveTab && (
            <Button
              variant={isEditMode ? 'matcha' : 'glass'}
              size="sm"
              leftIcon={isEditMode ? <Check size={13} strokeWidth={2.4} /> : <Pencil size={13} strokeWidth={2} />}
              onClick={() => setIsEditMode((prev) => !prev)}
            >
              {isEditMode ? 'Done' : 'Edit'}
            </Button>
          )}
          <CornerOrb kind="menu" ariaLabel="Trip menu" onClick={onOpenMenu} />
        </div>
      </header>

      {/* Dual Segmented Pill: Personal (Local, PIN-Free) | Group (Shared, Editor-Gated) */}
      <div className="prep-seg" role="tablist" aria-label="Checklist scope">
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

      {/* Edit Mode Action Bar (+ Add Item only shown in Edit Mode) */}
      {isEditMode && canEditActiveTab && (
        <div className="prep-edit-bar">
          <span className="prep-edit-bar__hint">Tap pencil to edit or trash to remove</span>
          <Button
            variant="matcha"
            size="sm"
            leftIcon={<Plus size={14} strokeWidth={2.2} />}
            onClick={() => {
              setNewTitle('');
              setAddSheetOpen(true);
            }}
          >
            Add Item
          </Button>
        </div>
      )}

      {/* Checklist Items (Clean Read-Only Text by Default — Zero Accidental Typing or Deletion) */}
      {activeTasks.length === 0 ? (
        <EmptyState
          icon={
            tab === 'personal' ? (
              <Lock size={20} strokeWidth={1.8} />
            ) : (
              <Users size={20} strokeWidth={1.8} />
            )
          }
          title={tab === 'personal' ? 'Your packing list is clear' : 'No group tasks yet'}
          description={
            canEditActiveTab
              ? isEditMode
                ? 'Tap Add Item above to create your first checklist entry.'
                : 'Tap Edit in the top right to add or manage items safely.'
              : 'Shared crew prep tasks will appear here.'
          }
          action={
            canEditActiveTab && !isEditMode ? (
              <Button
                variant="glass"
                size="sm"
                leftIcon={<Pencil size={13} strokeWidth={2} />}
                onClick={() => setIsEditMode(true)}
              >
                Edit List
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="prep-list">
          {activeTasks.map((task) => {
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
          })}
        </div>
      )}

      {/* Add Prep Item Sheet (Only opened via + Add Item in Edit Mode) */}
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

      {/* 5-Second Floating Undo Toast */}
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
