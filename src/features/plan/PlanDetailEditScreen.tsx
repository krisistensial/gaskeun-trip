import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ImagePlus,
  List,
  ListChecks,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  CornerOrb,
  GlassCard,
  Input,
} from '../../components/atoms';
import type { PlanItem, PlanItemType, RichNoteBlock, TripDay } from '../../types/trip';
import './plan.css';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isValidMapsUrl(url: string): boolean {
  const clean = url.trim().toLowerCase();
  if (!clean) return false;
  return (
    clean.includes('maps.app.goo.gl') ||
    clean.includes('google.com/maps') ||
    clean.includes('goo.gl/maps') ||
    clean.includes('maps.google.')
  );
}

export interface PlanDetailEditScreenProps {
  item: PlanItem;
  days: TripDay[];
  isNew: boolean;
  canEdit: boolean;
  onRequestUnlockPin: () => void;
  onSave: (updated: PlanItem) => void;
  onDelete: (itemId: string) => void;
  onBack: () => void;
}

export function PlanDetailEditScreen({
  item,
  days,
  isNew,
  canEdit,
  onRequestUnlockPin,
  onSave,
  onDelete,
  onBack,
}: PlanDetailEditScreenProps) {
  const [draft, setDraft] = useState<PlanItem>(() => ({
    ...item,
    notes:
      item.notes.length > 0
        ? item.notes
        : [{ id: `nb-${Date.now().toString(36)}`, kind: 'paragraph', text: '' }],
  }));
  const [showEndTime, setShowEndTime] = useState<boolean>(Boolean(item.endTime));
  const [focusedBlockId, setFocusedBlockId] = useState<string>(
    item.notes[0]?.id ?? '',
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const selectedDay = days.find((d) => d.id === draft.dayId);
  const dayOfWeek =
    selectedDay?.date ? new Date(`${selectedDay.date}T00:00:00`).getDay() : -1;
  const closedConflict =
    dayOfWeek >= 0 && Array.isArray(draft.closedDays) && draft.closedDays.includes(dayOfWeek);

  const mapsValid = isValidMapsUrl(draft.mapsUrl ?? '');
  const activeBlock = draft.notes.find((b) => b.id === focusedBlockId) ?? draft.notes[0];

  const guardEdit = (fn: () => void) => {
    if (!canEdit) {
      onRequestUnlockPin();
      return;
    }
    fn();
  };

  const updateBlock = (blockId: string, patch: Partial<RichNoteBlock>) => {
    setDraft((prev) => ({
      ...prev,
      notes: prev.notes.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    }));
  };

  const addBlock = (kind: RichNoteBlock['kind'] = 'paragraph') => {
    const next: RichNoteBlock = {
      id: `nb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      kind,
      text: '',
      checked: kind === 'checklist' ? false : undefined,
    };
    setDraft((prev) => ({ ...prev, notes: [...prev.notes, next] }));
    setFocusedBlockId(next.id);
  };

  const removeActiveBlock = () => {
    if (!activeBlock) return;
    setDraft((prev) => {
      const remaining = prev.notes.filter((b) => b.id !== activeBlock.id);
      return {
        ...prev,
        notes:
          remaining.length > 0
            ? remaining
            : [{ id: `nb-${Date.now().toString(36)}`, kind: 'paragraph', text: '' }],
      };
    });
  };

  const handleSave = () => {
    guardEdit(() => {
      const cleanedNotes = draft.notes.filter((b) => b.text.trim().length > 0);
      onSave({
        ...draft,
        title: draft.title.trim() || 'Untitled Stop',
        endTime: showEndTime ? draft.endTime : undefined,
        mapsVerified: mapsValid,
        status: selectedDay?.isIdeas ? 'idea' : draft.status === 'idea' ? 'upcoming' : draft.status,
        notes: cleanedNotes,
      });
    });
  };

  const handleCoverPick = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraft((prev) => ({ ...prev, coverUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="detail-root" aria-label="Plan stop detail and editor">
      {/* Header Row: Back Orb + Route (only for Place/Transit) */}
      <div className="detail-nav">
        <CornerOrb kind="back" ariaLabel="Back to plan" onClick={onBack} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {!isNew && canEdit && (
            <CornerOrb
              kind="custom"
              ariaLabel="Delete stop"
              icon={<Trash2 size={17} strokeWidth={1.8} color="var(--accent-coral)" />}
              onClick={() => setConfirmDelete(true)}
            />
          )}
          {(draft.type === 'place' || draft.type === 'transit') && draft.mapsUrl && (
            <Button
              variant="matcha"
              size="sm"
              rightIcon={<ArrowUpRight size={14} strokeWidth={2} />}
              onClick={() => window.open(draft.mapsUrl, '_blank', 'noopener,noreferrer')}
            >
              Route
            </Button>
          )}
        </div>
      </div>

      {/* Optional + Cover Photo Dashed Strip */}
      <button
        type="button"
        className="cover-drop-strip tactile"
        onClick={() => guardEdit(() => coverInputRef.current?.click())}
      >
        {draft.coverUrl ? (
          <img
            src={draft.coverUrl}
            alt={draft.title}
            style={{ width: '100%', height: 132, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <>
            <ImagePlus size={16} strokeWidth={1.8} />
            <span>+ Cover Photo</span>
          </>
        )}
      </button>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleCoverPick(f);
        }}
      />

      {/* Inline Editable Title */}
      <input
        className="detail-title-input"
        value={draft.title}
        placeholder="Stop name..."
        readOnly={!canEdit}
        onClick={() => {
          if (!canEdit) onRequestUnlockPin();
        }}
        onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
      />

      {/* Type Switcher Pills */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['place', 'transit', 'activity'] as PlanItemType[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`mode-chip tactile ${draft.type === t ? 'mode-chip--active' : ''}`}
            onClick={() => guardEdit(() => setDraft((prev) => ({ ...prev, type: t })))}
          >
            {t === 'place' ? 'Place' : t === 'transit' ? 'Transit' : 'Activity'}
          </button>
        ))}
      </div>

      {/* Date & Time Strip */}
      <div className="datetime-strip">
        <select
          aria-label="Select trip day"
          className="glass-pill-input"
          value={draft.dayId}
          onChange={(e) => guardEdit(() => setDraft((prev) => ({ ...prev, dayId: e.target.value })))}
        >
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              {d.isIdeas ? 'Ideas' : `${d.dayLabel}, ${d.dateNum} (${d.city || 'Trip'})`}
            </option>
          ))}
        </select>

        <input
          aria-label="Start time"
          type="time"
          className="glass-pill-input glass-pill-input--time"
          value={draft.startTime}
          onChange={(e) =>
            guardEdit(() => setDraft((prev) => ({ ...prev, startTime: e.target.value })))
          }
        />

        {showEndTime ? (
          <input
            aria-label="End time"
            type="time"
            className="glass-pill-input glass-pill-input--time"
            value={draft.endTime ?? '11:30'}
            onChange={(e) =>
              guardEdit(() => setDraft((prev) => ({ ...prev, endTime: e.target.value })))
            }
          />
        ) : (
          <button
            type="button"
            className="glass-pill-input tactile"
            style={{ borderStyle: 'dashed', color: 'var(--text-secondary)' }}
            onClick={() =>
              guardEdit(() => {
                setShowEndTime(true);
                setDraft((prev) => ({ ...prev, endTime: prev.endTime ?? '11:30' }));
              })
            }
          >
            + End time
          </button>
        )}
      </div>

      {/* Smart Closed-Day Conflict Alert */}
      {closedConflict && (
        <GlassCard
          variant="clear"
          padding="sm"
          style={{
            borderColor: 'rgba(207, 77, 94, 0.5)',
            background: 'var(--accent-coral-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AlertTriangle size={18} strokeWidth={2} color="var(--accent-coral)" />
          <div style={{ fontSize: 12, color: 'var(--accent-coral)', fontWeight: 600 }}>
            Usually closed on {WEEKDAY_NAMES[dayOfWeek]}! Consider moving to another day.
          </div>
        </GlassCard>
      )}

      {/* Location Hint & Parking Fallback */}
      <Input
        id="detail-hint"
        label="Landmark & Parking Hint"
        placeholder="e.g. Valley trail · Parking Rp 2k–5k"
        value={draft.locationHint}
        onChange={(e) =>
          guardEdit(() => setDraft((prev) => ({ ...prev, locationHint: e.target.value })))
        }
      />

      {/* Google Maps Link Input + Auto Verification */}
      <Input
        id="detail-maps"
        label="Google Maps Link"
        placeholder="https://maps.app.goo.gl/..."
        value={draft.mapsUrl ?? ''}
        leftIcon={<MapPin size={16} strokeWidth={1.8} />}
        status={draft.mapsUrl ? (mapsValid ? 'verified' : 'error') : 'default'}
        verifiedLabel="Verified"
        errorMessage={
          draft.mapsUrl && !mapsValid ? 'Use a Google Maps link (maps.app.goo.gl or google.com/maps)' : undefined
        }
        onChange={(e) =>
          guardEdit(() => setDraft((prev) => ({ ...prev, mapsUrl: e.target.value })))
        }
      />

      {/* Top-Sticky Formatting Toolbar Pill (Pinned ABOVE Rich-Text Notes Canvas!) */}
      <div className="format-toolbar" role="toolbar" aria-label="Text formatting">
        <button
          type="button"
          className="fmt-btn"
          style={{ color: 'var(--brand-matcha)' }}
          onClick={() => guardEdit(() => addBlock('paragraph'))}
          title="Add line"
        >
          <Plus size={14} strokeWidth={2.2} />
        </button>
        <span className="fmt-div" />
        <button
          type="button"
          className={`fmt-btn ${activeBlock?.kind === 'h1' ? 'fmt-btn--active' : ''}`}
          onClick={() => activeBlock && guardEdit(() => updateBlock(activeBlock.id, { kind: 'h1' }))}
        >
          H1
        </button>
        <button
          type="button"
          className={`fmt-btn ${activeBlock?.kind === 'h2' ? 'fmt-btn--active' : ''}`}
          onClick={() => activeBlock && guardEdit(() => updateBlock(activeBlock.id, { kind: 'h2' }))}
        >
          H2
        </button>
        <button
          type="button"
          className={`fmt-btn ${activeBlock?.kind === 'paragraph' ? 'fmt-btn--active' : ''}`}
          onClick={() =>
            activeBlock && guardEdit(() => updateBlock(activeBlock.id, { kind: 'paragraph' }))
          }
        >
          Aa
        </button>
        <span className="fmt-div" />
        <button
          type="button"
          className={`fmt-btn ${activeBlock?.bold ? 'fmt-btn--active' : ''}`}
          onClick={() =>
            activeBlock && guardEdit(() => updateBlock(activeBlock.id, { bold: !activeBlock.bold }))
          }
        >
          B
        </button>
        <button
          type="button"
          className={`fmt-btn ${activeBlock?.italic ? 'fmt-btn--active' : ''}`}
          style={{ fontStyle: 'italic' }}
          onClick={() =>
            activeBlock &&
            guardEdit(() => updateBlock(activeBlock.id, { italic: !activeBlock.italic }))
          }
        >
          I
        </button>
        <button
          type="button"
          className={`fmt-btn ${activeBlock?.underline ? 'fmt-btn--active' : ''}`}
          style={{ textDecoration: 'underline' }}
          onClick={() =>
            activeBlock &&
            guardEdit(() => updateBlock(activeBlock.id, { underline: !activeBlock.underline }))
          }
        >
          U
        </button>
        <button
          type="button"
          className={`fmt-btn ${activeBlock?.strikethrough ? 'fmt-btn--active' : ''}`}
          style={{ textDecoration: 'line-through' }}
          onClick={() =>
            activeBlock &&
            guardEdit(() =>
              updateBlock(activeBlock.id, { strikethrough: !activeBlock.strikethrough }),
            )
          }
        >
          S
        </button>
        <span className="fmt-div" />
        <button
          type="button"
          className={`fmt-btn ${activeBlock?.kind === 'bullet' ? 'fmt-btn--active' : ''}`}
          aria-label="Bullet list"
          onClick={() =>
            activeBlock && guardEdit(() => updateBlock(activeBlock.id, { kind: 'bullet' }))
          }
        >
          <List size={15} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`fmt-btn ${activeBlock?.kind === 'checklist' ? 'fmt-btn--active' : ''}`}
          aria-label="Checklist"
          onClick={() =>
            activeBlock &&
            guardEdit(() =>
              updateBlock(activeBlock.id, { kind: 'checklist', checked: Boolean(activeBlock.checked) }),
            )
          }
        >
          <ListChecks size={15} strokeWidth={2} />
        </button>
        <span className="fmt-div" />
        <button
          type="button"
          className="fmt-btn"
          aria-label="Remove line"
          onClick={() => guardEdit(removeActiveBlock)}
        >
          <Trash2 size={14} strokeWidth={1.9} color="var(--accent-coral)" />
        </button>
        <button
          type="button"
          className="fmt-btn"
          aria-label="Clear focus"
          onClick={() => setFocusedBlockId('')}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Rich-Text Notes Canvas */}
      <GlassCard variant="clear" padding="lg" className="notes-canvas">
        {draft.notes.map((block) => {
          const textDecor = [
            block.underline ? 'underline' : '',
            block.strikethrough || (block.kind === 'checklist' && block.checked)
              ? 'line-through'
              : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div key={block.id} className="note-block-row">
              {block.kind === 'bullet' && (
                <span style={{ color: 'var(--brand-matcha)', fontWeight: 700, marginTop: 1 }}>
                  &bull;
                </span>
              )}
              {block.kind === 'checklist' && (
                <button
                  type="button"
                  aria-label="Toggle checklist item"
                  className={`note-checkbox ${block.checked ? 'note-checkbox--checked' : ''}`}
                  onClick={() =>
                    guardEdit(() => updateBlock(block.id, { checked: !block.checked }))
                  }
                >
                  {block.checked && <Check size={12} strokeWidth={2.6} />}
                </button>
              )}
              <input
                className={`note-input ${block.kind === 'h1' ? 'note-input--h1' : block.kind === 'h2' ? 'note-input--h2' : ''}`}
                value={block.text}
                placeholder={
                  block.kind === 'h2'
                    ? 'Section heading...'
                    : block.kind === 'checklist'
                      ? 'To-do item...'
                      : 'Write a note...'
                }
                style={{
                  fontWeight: block.bold ? 700 : undefined,
                  fontStyle: block.italic ? 'italic' : undefined,
                  textDecoration: textDecor || undefined,
                  color:
                    block.strikethrough || (block.kind === 'checklist' && block.checked)
                      ? 'var(--text-muted)'
                      : undefined,
                }}
                onFocus={() => setFocusedBlockId(block.id)}
                onChange={(e) =>
                  guardEdit(() => updateBlock(block.id, { text: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    guardEdit(() =>
                      addBlock(block.kind === 'checklist' || block.kind === 'bullet' ? block.kind : 'paragraph'),
                    );
                  }
                }}
              />
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Badge
            tone="neutral"
            style={{ cursor: 'pointer' }}
            onClick={() => guardEdit(() => addBlock('paragraph'))}
          >
            + Note
          </Badge>
          <Badge
            tone="matcha"
            style={{ cursor: 'pointer' }}
            onClick={() => guardEdit(() => addBlock('checklist'))}
          >
            + Checklist
          </Badge>
        </div>
      </GlassCard>

      {/* Primary Save CTA */}
      <Button variant="matcha" size="lg" fullWidth onClick={handleSave}>
        {canEdit ? 'Save Stop' : 'Unlock PIN to Save Changes'}
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${draft.title}"?`}
        description="This removes the stop from the itinerary for everyone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete(draft.id);
        }}
      />
    </section>
  );
}
