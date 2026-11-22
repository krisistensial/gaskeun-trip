import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowUpRight,
  CloudUpload,
  Download,
  ImagePlus,
  Images,
  RefreshCw,
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
  LiquidBottomSheet,
} from '../../components/atoms';
import { PhotoCropperSheet } from '../../components/organisms/PhotoCropperSheet';
import { useRegisterOverlay } from '../../context/OverlayContext';
import {
  extractDriveFolderId,
  fetchDriveAlbumWithStatus,
  uploadPhotoToDrive,
} from '../../services/gdriveAlbum';
import type { CroppedImageResult } from '../../services/photoCrop';
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

type SyncHealth =
  | { status: 'idle' }
  | { status: 'syncing' }
  | { status: 'ok' }
  | { status: 'error'; error: string };

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
  const [syncHealth, setSyncHealth] = useState<SyncHealth>({ status: 'idle' });
  const [pushingLocal, setPushingLocal] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<AlbumPhoto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useRegisterOverlay(Boolean(lightboxPhoto));

  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [compressedBase64, setCompressedBase64] = useState('');
  const [fileName, setFileName] = useState('photo.jpg');
  const [caption, setCaption] = useState('');
  const [uploadDayId, setUploadDayId] = useState<string>(tripDays[0]?.id ?? 'day-1');
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const driveFolderUrl = trip.gdriveFolderUrl || trip.albumUrl;
  const hasLinkedFolder = Boolean(extractDriveFolderId(driveFolderUrl));
  const hasSyncScript = Boolean(trip.gdriveScriptUrl?.trim());

  const syncFromDrive = useCallback(
    async (notifyResult = false) => {
      const scriptUrl = trip.gdriveScriptUrl?.trim();
      if (!scriptUrl) {
        setDrivePhotos([]);
        setSyncHealth({ status: 'idle' });
        return;
      }
      setSyncHealth({ status: 'syncing' });
      const res = await fetchDriveAlbumWithStatus(scriptUrl, trip.id, driveFolderUrl);
      if (res.ok) {
        setDrivePhotos(res.photos);
        setSyncHealth({ status: 'ok' });
        if (notifyResult) {
          onNotify(
            res.photos.length > 0
              ? `Synced ${res.photos.length} ${res.photos.length === 1 ? 'photo' : 'photos'} from Drive`
              : 'Google Drive album is up to date',
            'success',
          );
        }
      } else {
        setSyncHealth({ status: 'error', error: res.error || 'Connection failed' });
        if (notifyResult) {
          onNotify(`Drive sync failed: ${res.error || 'Connection failed'}`, 'error');
        }
      }
    },
    [trip.gdriveScriptUrl, trip.id, driveFolderUrl, onNotify],
  );

  useEffect(() => {
    let alive = true;
    const scriptUrl = trip.gdriveScriptUrl?.trim();
    if (!scriptUrl) {
      setDrivePhotos([]);
      setSyncHealth({ status: 'idle' });
      return;
    }
    setSyncHealth({ status: 'syncing' });
    void fetchDriveAlbumWithStatus(scriptUrl, trip.id, driveFolderUrl).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setDrivePhotos(res.photos);
        setSyncHealth({ status: 'ok' });
      } else {
        setSyncHealth({ status: 'error', error: res.error || 'Connection failed' });
      }
    });
    return () => {
      alive = false;
    };
  }, [trip.gdriveScriptUrl, trip.id, driveFolderUrl]);

  const allPhotos = useMemo(() => {
    const merged = [...drivePhotos, ...localPhotos].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    if (dayFilter === 'all') return merged;
    return merged.filter((p) => p.dayId === dayFilter);
  }, [drivePhotos, localPhotos, dayFilter]);

  const handleCropConfirmed = (cropped: CroppedImageResult) => {
    const pickedName = cropFile?.name.replace(/\.[^.]+$/, '') || 'photo';
    setCropFile(null);
    setPreviewUrl(cropped.dataUrl);
    setCompressedBase64(cropped.base64);
    setFileName(`${pickedName}.jpg`);
    setUploadOpen(true);
  };

  const resetUpload = () => {
    setUploadOpen(false);
    setPreviewUrl('');
    setCompressedBase64('');
    setCaption('');
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
      const uploadRes = await uploadPhotoToDrive({
        scriptUrl: trip.gdriveScriptUrl.trim(),
        folderUrl: driveFolderUrl,
        tripId: trip.id,
        dayId: uploadDayId,
        dayLabel,
        caption: cleanCaption,
        uploaderName: activeMemberName,
        base64: compressedBase64,
        fileName,
      });
      if (uploadRes.ok && uploadRes.photo) {
        setDrivePhotos((prev) => [uploadRes.photo!, ...prev]);
        setSyncHealth({ status: 'ok' });
        onNotify('Uploaded to Google Drive', 'success');
        resetUpload();
        return;
      }
      if (uploadRes.error) {
        setSyncHealth({ status: 'error', error: uploadRes.error });
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
        ? 'Saved locally — tap Push to Drive once connected'
        : 'Photo saved locally to Album',
    );
    resetUpload();
  };

  const pushSingleLocalPhoto = async (photo: AlbumPhoto): Promise<boolean> => {
    const scriptUrl = trip.gdriveScriptUrl?.trim();
    if (!scriptUrl || !navigator.onLine) return false;
    const base64 = photo.url.includes(',') ? photo.url.split(',')[1] : '';
    if (!base64) return false;

    const res = await uploadPhotoToDrive({
      scriptUrl,
      folderUrl: driveFolderUrl,
      tripId: trip.id,
      dayId: photo.dayId,
      dayLabel: photo.dayLabel,
      caption: photo.caption || 'Highlight',
      uploaderName: photo.uploaderName || activeMemberName,
      base64,
      fileName: `${photo.id}.jpg`,
    });

    if (res.ok && res.photo) {
      setDrivePhotos((prev) => [res.photo!, ...prev]);
      setSyncHealth({ status: 'ok' });
      return true;
    }
    if (res.error) {
      setSyncHealth({ status: 'error', error: res.error });
    }
    return false;
  };

  const handlePushAllLocalToDrive = async () => {
    if (pushingLocal || localPhotos.length === 0) return;
    setPushingLocal(true);
    const remaining: AlbumPhoto[] = [];
    let pushedCount = 0;

    for (const photo of localPhotos) {
      const ok = await pushSingleLocalPhoto(photo);
      if (ok) pushedCount += 1;
      else remaining.push(photo);
    }

    setPushingLocal(false);
    if (pushedCount > 0) {
      onSaveLocalPhotos(
        remaining,
        `Pushed ${pushedCount} ${pushedCount === 1 ? 'photo' : 'photos'} to Google Drive`,
      );
    } else {
      onNotify('Could not upload to Drive — check Sync URL access', 'error');
    }
  };

  const handlePushLightboxPhoto = async () => {
    if (!lightboxPhoto || lightboxPhoto.source !== 'local' || pushingLocal) return;
    setPushingLocal(true);
    const ok = await pushSingleLocalPhoto(lightboxPhoto);
    setPushingLocal(false);
    if (ok) {
      onSaveLocalPhotos(
        localPhotos.filter((p) => p.id !== lightboxPhoto.id),
        'Uploaded to Google Drive',
      );
      setLightboxPhoto(null);
    } else {
      onNotify('Drive upload failed — check Sync URL access', 'error');
    }
  };

  const handleDownload = (photo: AlbumPhoto) => {
    const a = document.createElement('a');
    a.href = photo.fullUrl || photo.url;
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

  const isSyncing = syncHealth.status === 'syncing';

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
            setCropFile(f);
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

      {/* Real Google Drive Health Check Status Bar */}
      {hasSyncScript ? (
        syncHealth.status === 'error' ? (
          <GlassCard
            variant="clear"
            padding="sm"
            style={{
              borderColor: 'rgba(207, 77, 94, 0.4)',
              background: 'rgba(255, 245, 246, 0.78)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={15} strokeWidth={2} color="var(--accent-coral)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-coral)' }}>
                Drive sync failed — {syncHealth.error}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="glass"
                size="sm"
                leftIcon={<RefreshCw size={13} strokeWidth={2} />}
                onClick={() => void syncFromDrive(true)}
              >
                Retry
              </Button>
              <Button
                variant="glass"
                size="sm"
                leftIcon={<Settings2 size={13} strokeWidth={2} />}
                onClick={onOpenSettings}
              >
                Settings
              </Button>
            </div>
          </GlassCard>
        ) : (
          <GlassCard
            variant="clear"
            padding="sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background:
                    syncHealth.status === 'ok' ? 'var(--accent-mint)' : 'var(--accent-amber)',
                  flexShrink: 0,
                }}
              />
              <span>
                {isSyncing
                  ? 'Checking Google Drive...'
                  : `Google Drive synced · ${drivePhotos.length} ${drivePhotos.length === 1 ? 'photo' : 'photos'}`}
              </span>
            </span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {localPhotos.length > 0 && syncHealth.status === 'ok' && (
                <Button
                  variant="matcha"
                  size="sm"
                  disabled={pushingLocal}
                  leftIcon={<CloudUpload size={13} strokeWidth={2} />}
                  onClick={() => void handlePushAllLocalToDrive()}
                >
                  {pushingLocal ? 'Pushing...' : `Push to Drive (${localPhotos.length})`}
                </Button>
              )}
              <Button
                variant="glass"
                size="sm"
                disabled={isSyncing}
                leftIcon={
                  <RefreshCw
                    size={13}
                    strokeWidth={2}
                    style={isSyncing ? { animation: 'gaskeun-spin 0.9s linear infinite' } : undefined}
                  />
                }
                onClick={() => void syncFromDrive(true)}
              >
                Sync
              </Button>
            </div>
          </GlassCard>
        )
      ) : (
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
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
            {hasLinkedFolder
              ? 'Drive folder linked. Add your Apps Script URL to auto-sync photos here.'
              : 'Photos save locally until Google Drive sync is connected.'}
          </span>
          <Button
            variant="glass"
            size="sm"
            leftIcon={<Settings2 size={13} strokeWidth={2} />}
            onClick={onOpenSettings}
          >
            Connect Sync URL
          </Button>
        </GlassCard>
      )}

      {/* 2-Column Masonry Grid */}
      {allPhotos.length === 0 ? (
        <EmptyState
          icon={<Images size={22} strokeWidth={1.8} />}
          title="No trip photos yet"
          description="Upload highlights from your gallery — crop and compress automatically for fast sharing."
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

      {/* Interactive Photo Cropper Sheet (Original | 4:5 | 1:1 | 16:9) */}
      <PhotoCropperSheet
        open={Boolean(cropFile)}
        file={cropFile}
        preset="album"
        onCancel={() => setCropFile(null)}
        onConfirm={handleCropConfirmed}
      />

      {/* Upload Sheet (+ Upload) */}
      <LiquidBottomSheet
        open={uploadOpen}
        title="Add to Album"
        subtitle={`Uploading as ${activeMemberName}`}
        onClose={resetUpload}
      >
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

          <Button type="submit" variant="matcha" size="lg" fullWidth disabled={uploading}>
            {uploading
              ? 'Uploading Photo...'
              : hasSyncScript && navigator.onLine
                ? 'Upload to Drive'
                : 'Save to Local Album'}
          </Button>
        </form>
      </LiquidBottomSheet>

      {/* Full-Screen Lightbox (Portaled to document.body, uses fullUrl w2000) */}
      {lightboxPhoto &&
        typeof document !== 'undefined' &&
        createPortal(
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
                src={lightboxPhoto.fullUrl || lightboxPhoto.url}
                alt={lightboxPhoto.caption}
                className="album-lightbox__img"
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }} onClick={(e) => e.stopPropagation()}>
              <Button
                variant="danger"
                size="md"
                aria-label="Delete photo"
                leftIcon={<Trash2 size={16} strokeWidth={2} />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
              {lightboxPhoto.source === 'local' && hasSyncScript && (
                <Button
                  variant="matcha"
                  size="md"
                  fullWidth
                  disabled={pushingLocal}
                  leftIcon={<CloudUpload size={16} strokeWidth={2} />}
                  onClick={() => void handlePushLightboxPhoto()}
                >
                  {pushingLocal ? 'Pushing...' : 'Push to Drive'}
                </Button>
              )}
              <Button
                variant="glass"
                size="md"
                fullWidth={lightboxPhoto.source !== 'local' || !hasSyncScript}
                leftIcon={<Download size={16} strokeWidth={2} />}
                onClick={() => handleDownload(lightboxPhoto)}
              >
                Download
              </Button>
            </div>
          </div>,
          document.body,
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
