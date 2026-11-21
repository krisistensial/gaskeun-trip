import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Download,
  ImagePlus,
  Images,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  CornerOrb,
  EmptyState,
  GlassCard,
  Input,
} from '../../components/atoms';
import {
  compressAlbumPhoto,
  fetchDriveAlbum,
  uploadPhotoToDrive,
} from '../../services/gdriveAlbum';
import type { AlbumPhoto, SharedTrip } from '../../types/trip';
import './album.css';

export interface AlbumScreenProps {
  trip: SharedTrip;
  localPhotos: AlbumPhoto[];
  activeMemberName: string;
  onSaveLocalPhotos: (photos: AlbumPhoto[], toastMsg?: string) => void;
  onOpenSettings: () => void;
  onNotify: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}

export function AlbumScreen({
  trip,
  localPhotos,
  activeMemberName,
  onSaveLocalPhotos,
  onOpenSettings,
  onNotify,
}: AlbumScreenProps) {
  const tripDays = useMemo(() => trip.days.filter((d) => !d.isIdeas), [trip.days]);
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [drivePhotos, setDrivePhotos] = useState<AlbumPhoto[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<AlbumPhoto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [compressedBase64, setCompressedBase64] = useState('');
  const [fileName, setFileName] = useState('photo.jpg');
  const [caption, setCaption] = useState('');
  const [uploadDayId, setUploadDayId] = useState<string>(tripDays[0]?.id ?? 'day-1');
  const [crewPinInput, setCrewPinInput] = useState('');
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    const scriptUrl = trip.gdriveScriptUrl?.trim();
    if (!scriptUrl) {
      setDrivePhotos([]);
      return;
    }
    void fetchDriveAlbum(scriptUrl, trip.id).then((remote) => {
      if (alive) setDrivePhotos(remote);
    });
    return () => {
      alive = false;
    };
  }, [trip.gdriveScriptUrl, trip.id]);

  const allPhotos = useMemo(() => {
    const merged = [...drivePhotos, ...localPhotos].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    if (dayFilter === 'all') return merged;
    return merged.filter((p) => p.dayId === dayFilter);
  }, [drivePhotos, localPhotos, dayFilter]);

  const driveFolderUrl = trip.gdriveFolderUrl || trip.albumUrl;

  const handlePickFile = async (file: File) => {
    try {
      const compressed = await compressAlbumPhoto(file);
      setPreviewUrl(compressed.dataUrl);
      setCompressedBase64(compressed.base64);
      setFileName(file.name.replace(/\.[^.]+$/, '') + '.jpg');
      setUploadOpen(true);
    } catch {
      onNotify('Could not read that photo', 'error');
    }
  };

  const resetUpload = () => {
    setUploadOpen(false);
    setPreviewUrl('');
    setCompressedBase64('');
    setCaption('');
    setCrewPinInput('');
    setUploading(false);
  };

  const handleConfirmUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!previewUrl) return;
    setUploading(true);

    const dayIdx = tripDays.findIndex((d) => d.id === uploadDayId);
    const dayObj = tripDays[dayIdx];
    const dayLabel = dayObj ? `Day ${dayIdx + 1}` : 'Trip';
    const cleanCaption = caption.trim() || dayObj?.city || 'Highlight';

    if (trip.gdriveScriptUrl?.trim() && navigator.onLine) {
      const remote = await uploadPhotoToDrive({
        scriptUrl: trip.gdriveScriptUrl.trim(),
        crewPin: crewPinInput.trim(),
        tripId: trip.id,
        dayId: uploadDayId,
        dayLabel,
        caption: cleanCaption,
        uploaderName: activeMemberName,
        base64: compressedBase64,
        fileName,
      });
      if (remote) {
        setDrivePhotos((prev) => [remote, ...prev]);
        onNotify('Uploaded to Google Drive', 'success');
        resetUpload();
        return;
      }
    }

    const localPhoto: AlbumPhoto = {
      id: `loc-${Date.now().toString(36)}`,
      tripId: trip.id,
      dayId: uploadDayId,
      dayLabel,
      caption: cleanCaption,
      uploaderName: activeMemberName,
      url: previewUrl,
      source: 'local',
      createdAt: new Date().toISOString(),
    };
    onSaveLocalPhotos(
      [localPhoto, ...localPhotos],
      trip.gdriveScriptUrl
        ? 'Saved locally (offline fallback)'
        : 'Photo saved locally to Album',
    );
    resetUpload();
  };

  const handleDownload = (photo: AlbumPhoto) => {
    const a = document.createElement('a');
    a.href = photo.url;
    a.download = `${photo.caption.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'gaskeun-photo'}.jpg`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const handleDeletePhoto = () => {
    if (!lightboxPhoto) return;
    if (lightboxPhoto.source === 'local') {
      onSaveLocalPhotos(
        localPhotos.filter((p) => p.id !== lightboxPhoto.id),
        'Photo removed from device',
      );
    } else {
      setDrivePhotos((prev) => prev.filter((p) => p.id !== lightboxPhoto.id));
      onNotify('Hidden from gallery view (remove file in Drive to delete permanently)', 'info');
    }
    setConfirmDelete(false);
    setLightboxPhoto(null);
  };

  return (
    <div className="album-root">
      <header className="album-header">
        <h1 className="album-title">Album</h1>
        <div className="album-actions">
          {driveFolderUrl && (
            <Button
              variant="glass"
              size="sm"
              rightIcon={<ArrowUpRight size={14} strokeWidth={2} />}
              onClick={() => window.open(driveFolderUrl, '_blank', 'noopener,noreferrer')}
            >
              Drive
            </Button>
          )}
          <Button
            variant="matcha"
            size="sm"
            leftIcon={<Upload size={14} strokeWidth={2} />}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload
          </Button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            void handlePickFile(f);
            e.target.value = '';
          }
        }}
      />

      {/* Dynamic Day Filter Pills */}
      <div className="plan-filter-row" role="tablist" aria-label="Filter photos by day">
        <button
          type="button"
          className={`plan-chip tactile ${dayFilter === 'all' ? 'plan-chip--active' : ''}`}
          onClick={() => setDayFilter('all')}
        >
          All
        </button>
        {tripDays.map((day, idx) => (
          <button
            key={day.id}
            type="button"
            className={`plan-chip tactile ${dayFilter === day.id ? 'plan-chip--active' : ''}`}
            onClick={() => setDayFilter(day.id)}
          >
            Day {idx + 1}
          </button>
        ))}
      </div>

      {/* Subtle Drive Connect Hint */}
      {!trip.gdriveScriptUrl && (
        <GlassCard
          variant="clear"
          padding="sm"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Photos save locally until Google Drive sync is connected.
          </span>
          <Button
            variant="glass"
            size="sm"
            leftIcon={<Settings2 size={13} strokeWidth={2} />}
            onClick={onOpenSettings}
          >
            Connect
          </Button>
        </GlassCard>
      )}

      {/* 2-Column Masonry Grid */}
      {allPhotos.length === 0 ? (
        <EmptyState
          icon={<Images size={22} strokeWidth={1.8} />}
          title="No trip photos yet"
          description="Upload highlights from your gallery — compressed automatically for fast sharing."
          action={
            <Button
              variant="matcha"
              size="sm"
              leftIcon={<ImagePlus size={15} strokeWidth={2} />}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload First Photo
            </Button>
          }
        />
      ) : (
        <div className="album-masonry">
          {allPhotos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              className="album-card"
              onClick={() => setLightboxPhoto(photo)}
            >
              <img src={photo.url} alt={photo.caption} className="album-card__img" loading="lazy" />
              {photo.source === 'local' && (
                <span className="album-card__badge">
                  <Badge tone="neutral">Local</Badge>
                </span>
              )}
              <span className="album-card__caption">
                {photo.caption} · {photo.uploaderName}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Upload Sheet (+ Upload) */}
      {uploadOpen && (
        <div className="gk-sheet-backdrop" role="dialog" aria-modal="true" onClick={resetUpload}>
          <div className="gk-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="gk-sheet__handle" />
            <div className="gk-sheet__head">
              <div>
                <h3 className="gk-sheet__title">Add to Album</h3>
                <p className="gk-sheet__sub">Uploading as {activeMemberName}</p>
              </div>
              <CornerOrb kind="close" ariaLabel="Close upload sheet" onClick={resetUpload} />
            </div>

            <form
              onSubmit={handleConfirmUpload}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {previewUrl && (
                <img src={previewUrl} alt="Upload preview" className="album-upload-preview" />
              )}

              <Input
                id="album-caption"
                label="Location / Caption (Optional)"
                placeholder="e.g. Goa Maria Ganjuran"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />

              <div>
                <div className="gk-field__label" style={{ marginBottom: 6 }}>
                  TRIP DAY
                </div>
                <div className="plan-filter-row">
                  {tripDays.map((d, idx) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`plan-chip ${uploadDayId === d.id ? 'plan-chip--active' : ''}`}
                      onClick={() => setUploadDayId(d.id)}
                    >
                      Day {idx + 1} · {d.dayLabel}
                    </button>
                  ))}
                </div>
              </div>

              {trip.gdriveScriptUrl && navigator.onLine && (
                <Input
                  id="album-drive-pin"
                  label="4-Digit Crew PIN (for Drive Upload)"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="1234"
                  value={crewPinInput}
                  onChange={(e) => setCrewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              )}

              <Button type="submit" variant="matcha" size="lg" fullWidth disabled={uploading}>
                {uploading
                  ? 'Saving Photo...'
                  : trip.gdriveScriptUrl && navigator.onLine
                    ? 'Upload to Drive'
                    : 'Save to Local Album'}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Lightbox */}
      {lightboxPhoto && (
        <div
          className="album-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ color: '#FFFFFF' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>
                {lightboxPhoto.caption}
              </div>
              <div style={{ fontSize: 12, opacity: 0.78 }}>
                {lightboxPhoto.dayLabel} · {lightboxPhoto.uploaderName}
                {lightboxPhoto.source === 'local' ? ' · Local' : ''}
              </div>
            </div>
            <CornerOrb
              kind="close"
              ariaLabel="Close lightbox"
              onClick={() => setLightboxPhoto(null)}
            />
          </div>

          <div className="album-lightbox__img-wrap" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.caption}
              className="album-lightbox__img"
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <Button
              variant="glass"
              size="md"
              fullWidth
              leftIcon={<Download size={16} strokeWidth={2} />}
              onClick={() => handleDownload(lightboxPhoto)}
            >
              Download
            </Button>
            <Button
              variant="danger"
              size="md"
              leftIcon={<Trash2 size={16} strokeWidth={2} />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this photo?"
        description="This removes the photo from your album gallery."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDeletePhoto}
      />
    </div>
  );
}
