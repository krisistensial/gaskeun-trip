import { useMemo, useState, type FormEvent } from 'react';
import { Check, Lock, Plus, Trash2, Users } from 'lucide-react';
import { Avatar, CornerOrb, EmptyState, GlassCard, LiquidBottomSheet } from '../../components/atoms';
import type { PrepTask, SharedTrip, TripMember } from '../../types/trip';
import './prep.css';

type PrepTab = 'personal' | 'group';

export interface PrepScreenProps {
  trip: SharedTrip;
  personalPrep: PrepTask[];
  canEdit: boolean;
  onOpenMenu: () => void;
  onRequestUnlockPin: () => void;
  onUpdatePersonalPrep: (tasks: PrepTask[], toastMsg?: string) => void;
  onUpdateGroupPrep: (tasks: PrepTask[], toastMsg?: string) => void;
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
  const [tab, setTab] = useState<PrepTab>('personal');
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<string>(trip.members[0]?.id ?? '');
  const [picPickerTaskId, setPicPickerTaskId] = useState<string | null>(null);

  const memberById = useMemo(
    () => new Map<string, TripMember>(trip.members.map((m) => [m.id, m])),
    [trip.members],
  );

  const activeTasks = tab === 'personal' ? personalPrep : trip.groupPrep;
  const doneCount = activeTasks.filter((t) => t.done).length;
  const totalCount = activeTasks.length;
  const readyPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

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

  const handleToggle = (taskId: string) => {
    guardGroupEdit(() => {
      const next = activeTasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
      if (tab === 'personal') onUpdatePersonalPrep(next);
      else onUpdateGroupPrep(next);
    });
  };

  const handleRename = (taskId: string, title: string) => {
    guardGroupEdit(() => {
      const next = activeTasks.map((t) => (t.id === taskId ? { ...t, title } : t));
      if (tab === 'personal') onUpdatePersonalPrep(next);
      else onUpdateGroupPrep(next);
    });
  };

  const handleDelete = (taskId: string) => {
    guardGroupEdit(() => {
      const next = activeTasks.filter((t) => t.id !== taskId);
      if (tab === 'personal') onUpdatePersonalPrep(next, 'Item removed');
      else onUpdateGroupPrep(next, 'Group task removed');
    });
  };

  const handleAssignPic = (taskId: string, assigneeId: string | undefined) => {
    guardGroupEdit(() => {
      const next = trip.groupPrep.map((t) => (t.id === taskId ? { ...t, assigneeId } : t));
      onUpdateGroupPrep(next, 'Assignee updated');
      setPicPickerTaskId(null);
    });
  };

  const handleQuickAdd = (e: FormEvent) => {
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
      if (tab === 'personal') {
        onUpdatePersonalPrep([...personalPrep, created], 'Added to Personal Prep');
      } else {
        onUpdateGroupPrep([...trip.groupPrep, created], 'Added to Group Prep');
      }
      setNewTitle('');
    });
  };

  return (
    <div className="prep-root">
      <header className="prep-header">
        <h1 className="prep-title">Prep</h1>
        <CornerOrb kind="menu" ariaLabel="Trip menu" onClick={onOpenMenu} />
      </header>

      {/* Dual Segmented Pill: Personal (Local, PIN-Free) | Group (Shared, PIN-Protected) */}
      <div className="prep-seg" role="tablist" aria-label="Checklist scope">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'personal'}
          className={`prep-seg__btn ${tab === 'personal' ? 'prep-seg__btn--active' : ''}`}
          onClick={() => setTab('personal')}
        >
          <Lock size={14} strokeWidth={2} />
          <span>Personal</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'group'}
          className={`prep-seg__btn ${tab === 'group' ? 'prep-seg__btn--active' : ''}`}
          onClick={() => setTab('group')}
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

      {/* Checklist Items */}
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
            tab === 'personal'
              ? 'Add items below — saved privately on this device.'
              : 'Shared crew prep tasks will appear here.'
          }
        />
      ) : (
        <div className="prep-list">
          {activeTasks.map((task) => {
            const pic = task.assigneeId ? memberById.get(task.assigneeId) : undefined;
            const isEditableRow = tab === 'personal' || canEdit;
            return (
              <div key={task.id} className={`prep-item ${task.done ? 'prep-item--done' : ''}`}>
                <button
                  type="button"
                  disabled={!isEditableRow}
                  aria-label={`Mark ${task.title} ${task.done ? 'incomplete' : 'complete'}`}
                  className={`prep-check ${task.done ? 'prep-check--done' : ''}`}
                  onClick={() => isEditableRow && handleToggle(task.id)}
                >
                  {task.done && <Check size={13} strokeWidth={2.6} />}
                </button>

                <input
                  className="prep-item__title"
                  value={task.title}
                  readOnly={!isEditableRow}
                  aria-label="Task title"
                  onChange={(e) => isEditableRow && handleRename(task.id, e.target.value)}
                />

                {tab === 'group' && (
                  <button
                    type="button"
                    disabled={!canEdit}
                    aria-label="Assign member"
                    onClick={() => canEdit && setPicPickerTaskId(task.id)}
                    style={{ display: 'inline-flex', alignItems: 'center' }}
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

                {isEditableRow && (
                  <button
                    type="button"
                    aria-label={`Delete ${task.title}`}
                    onClick={() => handleDelete(task.id)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.9} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline Quick-Add Pill — ALWAYS open on Personal, Editor-only on Group */}
      {(tab === 'personal' || canEdit) && (
        <form className="prep-quick-add" onSubmit={handleQuickAdd}>
          <input
            className="prep-quick-input"
            placeholder={
              tab === 'personal' ? 'Add personal packing item...' : 'Add shared crew task...'
            }
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          {tab === 'group' && trip.members.length > 0 && (
            <select
              aria-label="Assign new task"
              value={newAssigneeId}
              onChange={(e) => setNewAssigneeId(e.target.value)}
              style={{
                height: 30,
                borderRadius: 15,
                border: '1px solid var(--hairline)',
                background: 'var(--brand-sage-soft)',
                color: 'var(--brand-forest)',
                fontSize: 11.5,
                fontWeight: 600,
                padding: '0 8px',
                outline: 'none',
              }}
            >
              {trip.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button type="submit" className="prep-quick-btn tactile" aria-label="Add prep item">
            <Plus size={18} strokeWidth={2.2} />
          </button>
        </form>
      )}

      {/* Group PIC Avatar Picker Sheet */}
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
    </div>
  );
}
