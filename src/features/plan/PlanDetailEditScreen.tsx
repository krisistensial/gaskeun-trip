import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ImagePlus,
  List,
  ListChecks,
  MapPin,
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
import { PhotoCropperSheet } from '../../components/organisms/PhotoCropperSheet';
import { useRegisterOverlay } from '../../context/OverlayContext';
import { uploadSharedImage } from '../../services/mediaUploader';
import type { CroppedImageResult } from '../../services/photoCrop';
import { buildSavedPlanItem, isClosedOnDate, isValidMapsUrl } from '../../services/planUtils';
import type {
  PlanItem,
  PlanItemStatus,
  PlanItemType,
  RichNoteBlock,
  RouteTarget,
  SharedTrip,
  TripDay,
} from '../../types/trip';
import './plan.css';

const TEXT_COLORS = [
  { label: 'Default', hex: '#182420' },
  { label: 'Forest', hex: '#2D4A42' },
  { label: 'Matcha', hex: '#4A7468' },
  { label: 'Amber', hex: '#D99136' },
  { label: 'Coral', hex: '#CF4D5E' },
  { label: 'Muted', hex: '#52665E' },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildChecklistRowHtml(text: string, checked: boolean): string {
  return `<div class="note-check-line" data-checked="${checked ? 'true' : 'false'}"><span class="note-check-box" contenteditable="false"></span><span class="note-check-text">${text || '<br>'}</span></div>`;
}

function blocksToInitialHtml(blocks: RichNoteBlock[]): string {
  if (!blocks || blocks.length === 0) return '';
  const parts: string[] = [];
  let inBulletList = false;

  const closeBullets = () => {
    if (inBulletList) {
      parts.push('</ul>');
      inBulletList = false;
    }
  };

  for (const b of blocks) {
    const rawText = escapeHtml(b.text);
    const styles: string[] = [];
    if (b.bold) styles.push('font-weight:700');
    if (b.italic) styles.push('font-style:italic');
    if (b.underline) styles.push('text-decoration:underline');
    if (b.strikethrough) styles.push('text-decoration:line-through');
    if (b.color) styles.push(`color:${b.color}`);
    const content =
      styles.length > 0 ? `<span style="${styles.join(';')}">${rawText}</span>` : rawText;

    if (b.kind === 'bullet') {
      if (!inBulletList) {
        parts.push('<ul>');
        inBulletList = true;
      }
      parts.push(`<li>${content}</li>`);
      continue;
    }

    closeBullets();
    if (b.kind === 'h1') {
      parts.push(`<h1>${content}</h1>`);
    } else if (b.kind === 'h2') {
      parts.push(`<h2>${content}</h2>`);
    } else if (b.kind === 'checklist') {
      parts.push(buildChecklistRowHtml(content, Boolean(b.checked)));
    } else {
      parts.push(`<div>${content || '<br>'}</div>`);
    }
  }
  closeBullets();
  return parts.join('');
}

function placeCaretAtEnd(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export interface PlanDetailEditScreenProps {
  trip: SharedTrip;
  uploaderName: string;
  item: PlanItem;
  days: TripDay[];
  dayItems: PlanItem[];
  isNew: boolean;
  canEdit: boolean;
  onOpenRoute: (target: RouteTarget) => void;
  onQuickPersistNotesHtml?: (itemId: string, notesHtml: string) => void;
  onQuickPersistCover?: (itemId: string, coverUrl: string | undefined) => void;
  onNotify?: (msg: string, tone?: 'success' | 'info' | 'error') => void;
  onSave: (updated: PlanItem) => void;
  onDelete: (itemId: string) => void;
  onBack: () => void;
}

export function PlanDetailEditScreen({
  trip,
  uploaderName,
  item,
  days,
  dayItems,
  isNew,
  canEdit,
  onOpenRoute,
  onQuickPersistNotesHtml,
  onQuickPersistCover,
  onNotify,
  onSave,
  onDelete,
  onBack,
}: PlanDetailEditScreenProps) {
  const [draft, setDraft] = useState<PlanItem>(() => ({ ...item }));
  const [showEndTime, setShowEndTime] = useState<boolean>(Boolean(item.endTime));
  const [showColorRow, setShowColorRow] = useState<boolean>(false);
  const [activeInk, setActiveInk] = useState<string>('#182420');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const notesHtmlRef = useRef<string>(
    item.notesHtml !== undefined ? item.notesHtml : blocksToInitialHtml(item.notes),
  );

  // Auto-hide bottom dock while inside Plan Detail / Inline Editor
  useRegisterOverlay(true);

  useEffect(() => {
    const el = editorRef.current;
    if (el) {
      el.innerHTML = notesHtmlRef.current;
    }
  }, [item.id]);

  const selectedDay = days.find((d) => d.id === draft.dayId);
  const closedCheck = isClosedOnDate(draft.closedDays, selectedDay?.date);
  const mapsValid = isValidMapsUrl(draft.mapsUrl);

  const syncHtmlFromDom = (persistImmediately = false) => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    notesHtmlRef.current = html;
    if (persistImmediately && !isNew && onQuickPersistNotesHtml) {
      onQuickPersistNotesHtml(draft.id, html);
    }
  };

  const runExec = (command: string, value?: string) => {
    if (!canEdit) return;
    editorRef.current?.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      // ignore unsupported browser command
    }
    syncHtmlFromDom(false);
  };

  const insertChecklistLine = () => {
    if (!canEdit || !editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    const anchorEl =
      sel?.anchorNode instanceof HTMLElement ? sel.anchorNode : sel?.anchorNode?.parentElement;
    const existingCheck = anchorEl?.closest('.note-check-line') as HTMLElement | null;

    if (existingCheck) {
      // Convert checklist back to normal paragraph
      const text = existingCheck.querySelector('.note-check-text')?.textContent ?? '';
      const div = document.createElement('div');
      div.textContent = text;
      if (!text) div.innerHTML = '<br>';
      existingCheck.replaceWith(div);
      placeCaretAtEnd(div);
      syncHtmlFromDom(false);
      return;
    }

    const row = document.createElement('div');
    row.className = 'note-check-line';
    row.dataset.checked = 'false';

    const box = document.createElement('span');
    box.className = 'note-check-box';
    box.setAttribute('contenteditable', 'false');

    const textSpan = document.createElement('span');
    textSpan.className = 'note-check-text';
    textSpan.innerHTML = '<br>';

    row.appendChild(box);
    row.appendChild(textSpan);

    // Find top-level block inside editor to insert after
    let topBlock: HTMLElement | null = anchorEl ?? null;
    while (topBlock && topBlock.parentElement !== editorRef.current) {
      topBlock = topBlock.parentElement;
    }
    if (topBlock && topBlock.parentElement === editorRef.current) {
      const existingText = topBlock.textContent?.trim() ?? '';
      if (existingText && topBlock.tagName === 'DIV') {
        textSpan.textContent = existingText;
        topBlock.replaceWith(row);
      } else {
        topBlock.after(row);
      }
    } else {
      editorRef.current.appendChild(row);
    }

    placeCaretAtEnd(textSpan);
    syncHtmlFromDom(false);
  };

  const removeCurrentLine = () => {
    if (!canEdit || !editorRef.current) return;
    const sel = window.getSelection();
    let node: HTMLElement | null =
      sel?.anchorNode instanceof HTMLElement
        ? sel.anchorNode
        : (sel?.anchorNode?.parentElement ?? null);
    while (node && node.parentElement !== editorRef.current) {
      node = node.parentElement;
    }
    if (node && node.parentElement === editorRef.current) {
      node.remove();
      syncHtmlFromDom(false);
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canEdit || e.key !== 'Enter') return;
    const sel = window.getSelection();
    const anchorEl =
      sel?.anchorNode instanceof HTMLElement ? sel.anchorNode : sel?.anchorNode?.parentElement;
    const checkLine = anchorEl?.closest('.note-check-line') as HTMLElement | null;
    if (!checkLine) return; // Let native contentEditable handle paragraphs & bullets!

    e.preventDefault();
    const textEl = checkLine.querySelector('.note-check-text') as HTMLElement | null;
    const currentText = textEl?.textContent?.trim() ?? '';

    if (!currentText) {
      // Pressing Enter on an empty checklist line exits checklist cleanly
      const div = document.createElement('div');
      div.innerHTML = '<br>';
      checkLine.replaceWith(div);
      placeCaretAtEnd(div);
    } else {
      const nextRow = document.createElement('div');
      nextRow.className = 'note-check-line';
      nextRow.dataset.checked = 'false';

      const box = document.createElement('span');
      box.className = 'note-check-box';
      box.setAttribute('contenteditable', 'false');

      const nextText = document.createElement('span');
      nextText.className = 'note-check-text';
      nextText.innerHTML = '<br>';

      nextRow.appendChild(box);
      nextRow.appendChild(nextText);
      checkLine.after(nextRow);
      placeCaretAtEnd(nextText);
    }
    syncHtmlFromDom(false);
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const box = target?.closest('.note-check-box') as HTMLElement | null;
    if (!box || !canEdit) return;
    const line = box.closest('.note-check-line') as HTMLElement | null;
    if (!line) return;
    e.preventDefault();
    const nextChecked = line.dataset.checked !== 'true';
    line.dataset.checked = nextChecked ? 'true' : 'false';
    syncHtmlFromDom(true);
  };

  const handleSave = () => {
    if (!canEdit) return;
    const currentHtml = editorRef.current ? editorRef.current.innerHTML : notesHtmlRef.current;
    const trimmedText = editorRef.current?.textContent?.trim() ?? '';

    onSave(
      buildSavedPlanItem({
        draft,
        selectedDay,
        showEndTime,
        notesHtml: currentHtml,
        hasNoteText: Boolean(trimmedText),
      }),
    );
  };

  const handleCroppedCover = async (cropped: CroppedImageResult) => {
    setCoverCropFile(null);
    // Show immediate crisp preview in the editor right after cropping
    setDraft((prev) => ({ ...prev, coverUrl: cropped.dataUrl }));
    setUploadingCover(true);
    try {
      const uploaded = await uploadSharedImage(cropped, {
        kind: 'plan',
        trip,
        dayId: draft.dayId,
        dayLabel: selectedDay?.dayLabel || 'Trip',
        caption: draft.title.trim() || 'Stop Cover',
        uploaderName,
        fileName: 'plan-cover.jpg',
      });
      const finalUrl = uploaded.url || cropped.dataUrl;
      setDraft((prev) => ({ ...prev, coverUrl: finalUrl }));
      if (!isNew && onQuickPersistCover) {
        onQuickPersistCover(draft.id, finalUrl);
      }
      onNotify?.(
        uploaded.source === 'supabase'
          ? 'Stop cover photo saved'
          : uploaded.reason
            ? `Saved locally (${uploaded.reason})`
            : 'Stop cover photo saved locally',
        uploaded.source === 'supabase' ? 'success' : 'info',
      );
    } catch (err) {
      console.warn('[GASKEUN PlanDetailEditScreen] Cover upload failed:', err);
      setDraft((prev) => ({ ...prev, coverUrl: cropped.dataUrl }));
      if (!isNew && onQuickPersistCover) {
        onQuickPersistCover(draft.id, cropped.dataUrl);
      }
      onNotify?.('Saved locally (Upload error)', 'info');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleRemoveCover = () => {
    setDraft((prev) => ({ ...prev, coverUrl: undefined }));
    if (!isNew && onQuickPersistCover) {
      onQuickPersistCover(draft.id, undefined);
    }
    onNotify?.('Stop cover photo removed', 'info');
  };

  const hasReadOnlyNotes = Boolean(notesHtmlRef.current.replace(/<[^>]+>/g, '').trim());

  return (
    <section className="detail-root" aria-label="Plan stop detail and editor">
      {/* Clean Header Row: Back Orb Left + Route Right */}
      <div className="detail-nav">
        <CornerOrb kind="back" ariaLabel="Back to plan" onClick={onBack} />
        {(draft.type === 'place' || draft.type === 'transit') && (
          <Button
            variant="matcha"
            size="sm"
            rightIcon={<ArrowUpRight size={14} strokeWidth={2} />}
            onClick={() =>
              onOpenRoute({
                title: draft.title || 'Selected Stop',
                subtitle: draft.locationHint,
                address: draft.address,
                parkingNote: draft.parkingNote,
                mapsUrl: draft.mapsUrl,
                coords: draft.coords,
                dayLabel: selectedDay?.isIdeas
                  ? 'Ideas'
                  : `${selectedDay?.dayLabel ?? ''} ${selectedDay?.dateNum ?? ''}`.trim(),
                dayItems,
                focusedItemId: draft.id,
              })
            }
          >
            Route
          </Button>
        )}
      </div>

      {/* Cover Photo Strip (Hidden when empty in Viewer read-only mode) */}
      {(canEdit || draft.coverUrl) && (
        <>
          {canEdit ? (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="cover-drop-strip tactile"
                onClick={() => coverInputRef.current?.click()}
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
              {draft.coverUrl && (
                <button
                  type="button"
                  aria-label="Remove cover photo"
                  onClick={handleRemoveCover}
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: 'rgba(24, 36, 32, 0.72)',
                    color: '#FFFFFF',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={14} strokeWidth={2.2} />
                </button>
              )}
            </div>
          ) : (
            <div className="cover-drop-strip" style={{ border: 'none' }}>
              <img
                src={draft.coverUrl}
                alt={draft.title}
                style={{ width: '100%', height: 148, objectFit: 'cover', display: 'block' }}
              />
            </div>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            aria-hidden="true"
            tabIndex={-1}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) {
                setCoverCropFile(f);
              }
            }}
          />
          {uploadingCover && (
            <div style={{ fontSize: 11.5, color: 'var(--brand-matcha)', fontWeight: 600 }}>
              Uploading stop photo...
            </div>
          )}
        </>
      )}

      {/* Title (Editable for Editors, Clean Read-Only Heading for Viewers) */}
      {canEdit ? (
        <input
          className="detail-title-input"
          value={draft.title}
          placeholder="Stop name..."
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
        />
      ) : (
        <h1 className="detail-title-input" style={{ margin: 0 }}>
          {draft.title || 'Untitled Stop'}
        </h1>
      )}

      {/* Type + Status Pills (Editors) OR Clean Summary Badges (Viewers) */}
      {canEdit ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['place', 'transit', 'activity'] as PlanItemType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`mode-chip tactile ${draft.type === t ? 'mode-chip--active' : ''}`}
                onClick={() => setDraft((prev) => ({ ...prev, type: t }))}
              >
                {t === 'place' ? 'Place' : t === 'transit' ? 'Transit' : 'Activity'}
              </button>
            ))}
          </div>

          {!selectedDay?.isIdeas && (
            <div className="detail-status-row" aria-label="Stop status">
              {(
                [
                  { id: 'upcoming', label: 'Upcoming' },
                  { id: 'active', label: 'Now' },
                  { id: 'done', label: 'Done' },
                ] as { id: PlanItemStatus; label: string }[]
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  className={`plan-chip tactile ${draft.status === st.id ? 'plan-chip--active' : ''}`}
                  onClick={() => setDraft((prev) => ({ ...prev, status: st.id }))}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}

          {/* Date & Time Strip */}
          <div className="datetime-strip">
            <select
              aria-label="Select trip day"
              className="glass-pill-input"
              value={draft.dayId}
              onChange={(e) => setDraft((prev) => ({ ...prev, dayId: e.target.value }))}
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
              onChange={(e) => setDraft((prev) => ({ ...prev, startTime: e.target.value }))}
            />

            {showEndTime ? (
              <input
                aria-label="End time"
                type="time"
                className="glass-pill-input glass-pill-input--time"
                value={draft.endTime ?? '11:30'}
                onChange={(e) => setDraft((prev) => ({ ...prev, endTime: e.target.value }))}
              />
            ) : (
              <button
                type="button"
                className="glass-pill-input tactile"
                style={{ borderStyle: 'dashed', color: 'var(--text-secondary)' }}
                onClick={() => {
                  setShowEndTime(true);
                  setDraft((prev) => ({ ...prev, endTime: prev.endTime ?? '11:30' }));
                }}
              >
                + End time
              </button>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Badge tone="matcha">{draft.type}</Badge>
          {draft.status === 'done' && <Badge tone="mint">Done</Badge>}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {selectedDay?.isIdeas
              ? 'Ideas'
              : `${selectedDay?.dayLabel ?? ''}, ${selectedDay?.dateNum ?? ''}`}{' '}
            · {draft.startTime}
            {draft.endTime ? `–${draft.endTime}` : ''}
          </span>
        </div>
      )}

      {/* Smart Closed-Day Conflict Alert */}
      {closedCheck.closed && (
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
            Usually closed on {closedCheck.weekdayName}! Consider moving to another day.
          </div>
        </GlassCard>
      )}

      {/* Location Hint & Google Maps Link */}
      {canEdit ? (
        <>
          <Input
            id="detail-hint"
            label="Landmark & Parking Hint"
            placeholder="e.g. Valley trail · Parking Rp 2k–5k"
            value={draft.locationHint}
            onChange={(e) => setDraft((prev) => ({ ...prev, locationHint: e.target.value }))}
          />

          <Input
            id="detail-maps"
            label="Google Maps Link"
            placeholder="https://maps.app.goo.gl/..."
            value={draft.mapsUrl ?? ''}
            leftIcon={<MapPin size={16} strokeWidth={1.8} />}
            status={draft.mapsUrl ? (mapsValid ? 'verified' : 'error') : 'default'}
            verifiedLabel="Verified"
            errorMessage={
              draft.mapsUrl && !mapsValid
                ? 'Use a Google Maps link (maps.app.goo.gl or google.com/maps)'
                : undefined
            }
            onChange={(e) => setDraft((prev) => ({ ...prev, mapsUrl: e.target.value }))}
          />
        </>
      ) : (
        (draft.locationHint || draft.parkingNote) && (
          <GlassCard variant="clear" padding="md">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <MapPin size={16} strokeWidth={1.8} color="var(--brand-matcha)" style={{ marginTop: 2 }} />
              <div>
                {draft.locationHint && (
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{draft.locationHint}</div>
                )}
                {draft.parkingNote && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {draft.parkingNote}
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        )
      )}

      {/* Top-Sticky Formatting Toolbar Pill (Editors Only) */}
      {canEdit && (
        <>
          <div className="format-toolbar" role="toolbar" aria-label="Text formatting">
            <button
              type="button"
              className={`fmt-btn ${showColorRow ? 'fmt-btn--active' : ''}`}
              style={{ color: activeInk }}
              aria-label="Text color"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowColorRow((v) => !v)}
            >
              A⋮
            </button>
            <span className="fmt-div" />
            <button
              type="button"
              className="fmt-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runExec('formatBlock', 'H1')}
            >
              H1
            </button>
            <button
              type="button"
              className="fmt-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runExec('formatBlock', 'H2')}
            >
              H2
            </button>
            <button
              type="button"
              className="fmt-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runExec('formatBlock', 'DIV')}
            >
              Aa
            </button>
            <span className="fmt-div" />
            <button
              type="button"
              className="fmt-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runExec('bold')}
            >
              B
            </button>
            <button
              type="button"
              className="fmt-btn"
              style={{ fontStyle: 'italic' }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runExec('italic')}
            >
              I
            </button>
            <button
              type="button"
              className="fmt-btn"
              style={{ textDecoration: 'underline' }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runExec('underline')}
            >
              U
            </button>
            <button
              type="button"
              className="fmt-btn"
              style={{ textDecoration: 'line-through' }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runExec('strikeThrough')}
            >
              S
            </button>
            <span className="fmt-div" />
            <button
              type="button"
              className="fmt-btn"
              aria-label="Bullet list"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runExec('insertUnorderedList')}
            >
              <List size={15} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="fmt-btn"
              aria-label="Checklist"
              onMouseDown={(e) => e.preventDefault()}
              onClick={insertChecklistLine}
            >
              <ListChecks size={15} strokeWidth={2} />
            </button>
            <span className="fmt-div" />
            <button
              type="button"
              className="fmt-btn"
              aria-label="Remove line"
              onMouseDown={(e) => e.preventDefault()}
              onClick={removeCurrentLine}
            >
              <Trash2 size={14} strokeWidth={1.9} color="var(--accent-coral)" />
            </button>
            <button
              type="button"
              className="fmt-btn"
              aria-label="Close keyboard"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setShowColorRow(false);
                editorRef.current?.blur();
              }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>

          {showColorRow && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 18,
                background: 'rgba(255, 255, 255, 0.84)',
                border: '1.25px solid rgba(255, 255, 255, 0.96)',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                Ink:
              </span>
              {TEXT_COLORS.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  aria-label={`Color ${swatch.label}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setActiveInk(swatch.hex);
                    runExec('foreColor', swatch.hex);
                    setShowColorRow(false);
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: swatch.hex,
                    border:
                      activeInk === swatch.hex
                        ? '2.5px solid var(--brand-sage-tint)'
                        : '1.5px solid #FFFFFF',
                    boxShadow:
                      activeInk === swatch.hex ? '0 0 0 2px var(--brand-matcha)' : 'none',
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Seamless Single-Flow Apple-Notes Canvas (NO + Note / + Checklist buttons) */}
      {(canEdit || hasReadOnlyNotes) && (
        <GlassCard variant="clear" padding="lg" className="notes-canvas">
          <div
            ref={editorRef}
            className="notes-rich-canvas"
            contentEditable={canEdit}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Stop notes"
            data-placeholder="Write notes, meeting times, tips..."
            onInput={() => syncHtmlFromDom(false)}
            onKeyDown={handleEditorKeyDown}
            onClick={handleEditorClick}
          />
        </GlassCard>
      )}

      {/* Ergonomic Action Bar: Delete (LEFT) + Save Stop (RIGHT) — Editors Only */}
      {canEdit && (
        <div className="detail-footer-actions">
          {!isNew && (
            <Button
              variant="danger"
              size="lg"
              leftIcon={<Trash2 size={16} strokeWidth={2} />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )}
          <Button variant="matcha" size="lg" fullWidth onClick={handleSave} disabled={uploadingCover}>
            Save Stop
          </Button>
        </div>
      )}

      <PhotoCropperSheet
        open={Boolean(coverCropFile)}
        file={coverCropFile}
        preset="plan-cover"
        onCancel={() => setCoverCropFile(null)}
        onConfirm={(res) => void handleCroppedCover(res)}
      />

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
