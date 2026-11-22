import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock,
  ImagePlus,
  Link2,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Button, ConfirmDialog, Input, LiquidBottomSheet } from '../atoms';
import { PhotoCropperSheet } from './PhotoCropperSheet';
import {
  canManageContentIdea,
  detectContentPlatform,
  extractAutoThumbnail,
  formatPlatformLabel,
} from '../../services/contentIdeas';
import { uploadSharedImage } from '../../services/mediaUploader';
import type { CroppedImageResult } from '../../services/photoCrop';
import type { ContentIdea, ContentIdeaStatus, SharedTrip } from '../../types/trip';
import './sheets.css';

export interface ContentIdeaSheetProps {
  open: boolean;
  trip: SharedTrip;
  idea: ContentIdea | null;
  activeMemberId: string | null;
  activeMemberName: string;
  canEditTrip: boolean;
  defaultDayId?: string;
  onSave: (idea: ContentIdea, isNew: boolean) => void;
  onDelete: (ideaId: string) => void;
  onClose: () => void;
}

export function ContentIdeaSheet({
  open,
  trip,
  idea,
  activeMemberId,
  activeMemberName,
  canEditTrip,
  defaultDayId,
  onSave,
  onDelete,
  onClose,
}: ContentIdeaSheetProps) {
  const tripDays = useMemo(() => trip.days.filter((d) => !d.isIdeas), [trip.days]);
  const isNew = !idea;
  const editable = canManageContentIdea(idea, activeMemberId, canEditTrip);

  const [referenceUrl, setReferenceUrl] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(undefined);
  const [customThumb, setCustomThumb] = useState(false);
  const [status, setStatus] = useState<ContentIdeaStatus>('to-shoot');
  const [showInPlan, setShowInPlan] = useState(false);
  const [dayId, setDayId] = useState<string>(defaultDayId || tripDays[0]?.id || 'day-1');
  const [time, setTime] = useState('');
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (idea) {
      setReferenceUrl(idea.referenceUrl);
      setTitle(idea.title);
      setNotes(idea.notes ?? '');
      setThumbnailUrl(idea.thumbnailUrl);
      setCustomThumb(Boolean(idea.thumbnailUrl && idea.thumbnailUrl !== extractAutoThumbnail(idea.referenceUrl)));
      setStatus(idea.status);
      setShowInPlan(idea.showInPlan);
      setDayId(idea.dayId || defaultDayId || tripDays[0]?.id || 'day-1');
      setTime(idea.time ?? '');
    } else {
      setReferenceUrl('');
      setTitle('');
      setNotes('');
      setThumbnailUrl(undefined);
      setCustomThumb(false);
      setStatus('to-shoot');
      setShowInPlan(false);
      setDayId(defaultDayId || tripDays[0]?.id || 'day-1');
      setTime('');
    }
    setCropFile(null);
    setUploadingCover(false);
    setConfirmDelete(false);
  }, [open, idea, defaultDayId, tripDays]);

  const detected = useMemo(() => detectContentPlatform(referenceUrl), [referenceUrl]);
  const platformLabel = formatPlatformLabel(detected.platform, detected.normalizedUrl);

  const handleReferenceUrlChange = (nextRaw: string) => {
    setReferenceUrl(nextRaw);
    if (!customThumb) {
      const autoThumb = extractAutoThumbnail(nextRaw);
      setThumbnailUrl(autoThumb);
    }
  };

  const handleCoverCropped = async (cropped: CroppedImageResult) => {
    setCropFile(null);
    setThumbnailUrl(cropped.dataUrl);
    setCustomThumb(true);
    setUploadingCover(true);
    try {
      const uploaded = await uploadSharedImage(cropped, {
        kind: 'idea',
        trip,
        caption: title.trim() || 'Content Idea',
        uploaderName: activeMemberName,
        fileName: `idea-${Date.now().toString(36)}.jpg`,
      });
      setThumbnailUrl(uploaded.url || cropped.dataUrl);
      setCustomThumb(true);
    } catch {
      setThumbnailUrl(cropped.dataUrl);
      setCustomThumb(true);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!editable) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const nowIso = new Date().toISOString();
    const payload: ContentIdea = {
      id: idea?.id ?? `idea-${Date.now().toString(36)}`,
      title: cleanTitle,
      referenceUrl: detected.normalizedUrl,
      platform: detected.platform,
      notes: notes.trim() || undefined,
      thumbnailUrl: thumbnailUrl || undefined,
      status,
      showInPlan,
      dayId: showInPlan ? dayId : undefined,
      time: showInPlan && time.trim() ? time.trim() : undefined,
      createdBy: idea?.createdBy ?? (activeMemberId || 'guest'),
      createdAt: idea?.createdAt ?? nowIso,
    };

    onSave(payload, isNew);
    onClose();
  };

  return (
    <>
      <LiquidBottomSheet
        open={open}
        title={isNew ? 'New Content Idea' : editable ? 'Edit Content Idea' : 'Content Idea'}
        subtitle={
          !editable && idea
            ? 'Created by another crew member · Read-only'
            : 'Save IG Reels, TikTok, or photo inspiration'
        }
        onClose={onClose}
      >
        <form className="idea-sheet-form" onSubmit={handleSubmit}>
          {/* 1. Reference Link */}
          <div className="idea-link-block">
            <Input
              id="idea-ref-url"
              label="Reference Link"
              placeholder="Paste IG Reels, TikTok, or YouTube Shorts link"
              leftIcon={<Link2 size={15} strokeWidth={2} />}
              value={referenceUrl}
              readOnly={!editable}
              onChange={(e) => handleReferenceUrlChange(e.target.value)}
            />
            {detected.normalizedUrl && (
              <div className="idea-link-meta">
                <Badge tone="amber">{platformLabel}</Badge>
                <a
                  href={detected.normalizedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="idea-open-link tactile"
                >
                  <span>Open</span>
                  <ArrowUpRight size={13} strokeWidth={2.2} />
                </a>
              </div>
            )}
          </div>

          {/* 2. Title */}
          <Input
            id="idea-title"
            label="Title"
            placeholder="e.g. Train Window Aesthetic POV"
            value={title}
            readOnly={!editable}
            required
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* 3. Notes (Optional) */}
          <div className="gk-field">
            <label htmlFor="idea-notes" className="gk-field__label">
              NOTES (OPTIONAL)
            </label>
            <div className="gk-input-shell idea-notes-shell">
              <textarea
                id="idea-notes"
                rows={2}
                placeholder="Quick framing tip, lighting cue, or song idea..."
                value={notes}
                readOnly={!editable}
                className="gk-input__native idea-notes-textarea"
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* 4. Reference Cover (Optional Screenshot or Auto YouTube Thumbnail) */}
          <div className="gk-field">
            <span className="gk-field__label">REFERENCE COVER (OPTIONAL)</span>
            {thumbnailUrl ? (
              <div className="idea-cover-preview-wrap">
                <img src={thumbnailUrl} alt={title || 'Reference cover'} className="idea-cover-preview" />
                {editable && (
                  <div className="idea-cover-preview-actions">
                    <Button
                      variant="glass"
                      size="sm"
                      disabled={uploadingCover}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadingCover ? 'Uploading...' : 'Replace'}
                    </Button>
                    <button
                      type="button"
                      className="idea-cover-remove tactile"
                      aria-label="Remove reference cover"
                      onClick={() => {
                        setThumbnailUrl(undefined);
                        setCustomThumb(true);
                      }}
                    >
                      <X size={14} strokeWidth={2.2} />
                    </button>
                  </div>
                )}
              </div>
            ) : editable ? (
              <button
                type="button"
                className="idea-cover-drop tactile"
                disabled={uploadingCover}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={16} strokeWidth={2} />
                <span>{uploadingCover ? 'Uploading screenshot...' : '+ Add Screenshot'}</span>
              </button>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setCropFile(f);
                  e.target.value = '';
                }
              }}
            />
          </div>

          {/* 5. Show in Plan Rundown Toggle + Day & Time Picker */}
          <div className="idea-plan-box">
            <button
              type="button"
              disabled={!editable}
              aria-pressed={showInPlan}
              className="idea-plan-toggle-row"
              onClick={() => editable && setShowInPlan((v) => !v)}
            >
              <span className="idea-plan-toggle-copy">
                <span className="idea-plan-toggle-title">Show in Plan Rundown</span>
                <span className="idea-plan-toggle-sub">
                  Appears as an amber Content card in the daily trail
                </span>
              </span>
              <span className={`idea-switch ${showInPlan ? 'idea-switch--on' : ''}`}>
                <span className="idea-switch__knob" />
              </span>
            </button>

            {showInPlan && (
              <div className="idea-plan-schedule">
                <div>
                  <div className="idea-sub-label">
                    <CalendarDays size={12} strokeWidth={2} />
                    <span>TRIP DAY</span>
                  </div>
                  <div className="plan-filter-row">
                    {tripDays.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        disabled={!editable}
                        className={`plan-chip tactile ${dayId === d.id ? 'idea-day-chip--active' : ''}`}
                        onClick={() => setDayId(d.id)}
                      >
                        {d.dayLabel} {d.dateNum}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="idea-sub-label">
                    <Clock size={12} strokeWidth={2} />
                    <span>TIME (OPTIONAL)</span>
                  </div>
                  <div className="idea-time-row">
                    <input
                      type="time"
                      aria-label="Content time"
                      disabled={!editable}
                      value={time}
                      className="idea-time-input"
                      onChange={(e) => setTime(e.target.value)}
                    />
                    {editable && time && (
                      <Button variant="ghost" size="sm" onClick={() => setTime('')}>
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Status Pill when editing an existing idea */}
          {!isNew && editable && (
            <div className="idea-status-row">
              <span className="gk-field__label">STATUS</span>
              <button
                type="button"
                className={`idea-status-pill tactile ${status === 'shot' ? 'idea-status-pill--shot' : ''}`}
                onClick={() => setStatus((s) => (s === 'shot' ? 'to-shoot' : 'shot'))}
              >
                {status === 'shot' && <Check size={13} strokeWidth={2.5} />}
                <span>{status === 'shot' ? 'Shot' : 'To Shoot'}</span>
              </button>
            </div>
          )}

          {/* Ergonomic Action Footer: Red Delete on LEFT, Matcha Save on RIGHT */}
          <div className="idea-sheet-actions">
            {!isNew && editable ? (
              <Button
                variant="danger"
                size="md"
                leftIcon={<Trash2 size={15} strokeWidth={2} />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            ) : (
              <Button variant="glass" size="md" onClick={onClose}>
                {editable ? 'Cancel' : 'Close'}
              </Button>
            )}

            {editable && (
              <Button
                type="submit"
                variant="matcha"
                size="md"
                disabled={!title.trim() || uploadingCover}
              >
                Save Idea
              </Button>
            )}
          </div>
        </form>
      </LiquidBottomSheet>

      <PhotoCropperSheet
        open={Boolean(cropFile)}
        file={cropFile}
        preset="idea"
        onCancel={() => setCropFile(null)}
        onConfirm={(res) => void handleCoverCropped(res)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this content idea?"
        description={
          idea
            ? `Remove "${idea.title}" from Album Ideas and Plan rundown?`
            : 'Remove this content idea?'
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (idea) onDelete(idea.id);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </>
  );
}
