import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  Check,
  Clapperboard,
  CloudUpload,
  Download,
  Film,
  ImagePlus,
  Images,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
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
import { ContentIdeaSheet } from '../../components/organisms/ContentIdeaSheet';
import { ImageSourceSheet } from '../../components/organisms/ImageSourceSheet';
import { PhotoCropperSheet } from '../../components/organisms/PhotoCropperSheet';
import { useRegisterOverlay } from '../../context/OverlayContext';
import { useHorizontalScrollFade } from '../../hooks/useHorizontalScrollFade';
import { useBackHandler } from '../../services/pwaHistory';
import { formatPlatformLabel } from '../../services/contentIdeas';
import { triggerFeedback } from '../../services/feedback';
import {
  extractDriveFolderId,
  fetchDriveAlbumWithStatus,
  uploadPhotoToDrive,
} from '../../services/gdriveAlbum';
import { uploadSharedImage } from '../../services/mediaUploader';
import type { CroppedImageResult } from '../../services/photoCrop';
import type {
  AlbumPhoto,
  ContentIdea,
  ContentIdeaStatus,
  ContentPlatform,
  SharedTrip,
} from '../../types/trip';
import './album.css';

export interface AlbumScreenProps {
  trip: SharedTrip;
  localPhotos: AlbumPhoto[];
  cachedDrivePhotos?: AlbumPhoto[];
  activeMemberId: string | null;
  activeMemberName: string;
  canEdit: boolean;
  canEditSettings?: boolean;
  canDeleteIdeas?: boolean;
  viewOnlyMode?: boolean;
  onDrivePhotosSync?: (photos: AlbumPhoto[]) => void;
  onSaveLocalPhotos: (photos: AlbumPhoto[], toastMsg?: string) => void;
  onUpdateTrip: (updater: (prev: SharedTrip) => SharedTrip, toastMsg?: string) => void;
  onOpenSettings: () => void;
  onNotify: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}

type AlbumSubTab = 'photos' | 'ideas';
type IdeaFilter = 'all' | ContentIdeaStatus;

type SyncHealth =
  | { status: 'idle' }
  | { status: 'syncing' }
  | { status: 'ok' }
  | { status: 'error'; error: string };

function PlatformThumbIcon({ platform }: { platform: ContentPlatform }) {
  if (platform === 'instagram') return <Clapperboard size={22} strokeWidth={1.8} />;
  if (platform === 'tiktok') return <Film size={22} strokeWidth={1.8} />;
  if (platform === 'youtube') return <Play size={22} strokeWidth={1.8} />;
  if (platform === 'pinterest') return <Sparkles size={22} strokeWidth={1.8} />;
  return <Link2 size={22} strokeWidth={1.8} />;
}

export function AlbumScreen({
  trip,
  localPhotos,
  cachedDrivePhotos = [],
  activeMemberId,
  activeMemberName,
  canEdit,
  canEditSettings = canEdit,
  canDeleteIdeas = canEdit,
  onDrivePhotosSync,
  onSaveLocalPhotos,
  onUpdateTrip,
  onOpenSettings,
  onNotify,
}: AlbumScreenProps) {
  const tripDays = useMemo(() => trip.days.filter((d) => !d.isIdeas), [trip.days]);
  const [albumTab, setAlbumTab] = useState<AlbumSubTab>('photos');

  // Photos tab state
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [drivePhotos, setDrivePhotos] = useState<AlbumPhoto[]>(cachedDrivePhotos);
  const [syncHealth, setSyncHealth] = useState<SyncHealth>({ status: 'idle' });
  const [pushingLocal, setPushingLocal] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<AlbumPhoto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Ideas tab state
  const [ideaFilter, setIdeaFilter] = useState<IdeaFilter>('all');
  const [ideaSheetOpen, setIdeaSheetOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<ContentIdea | null>(null);

  useRegisterOverlay(Boolean(lightboxPhoto));
  useBackHandler(Boolean(lightboxPhoto), () => setLightboxPhoto(null), 'sheet', 'album-lightbox');

  const [cropFile, setCropFile] = useState<File | null>(null);
  const [imageSourceOpen, setImageSourceOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [compressedBase64, setCompressedBase64] = useState('');
  const [uploadMimeType, setUploadMimeType] = useState('image/jpeg');
  const [fileName, setFileName] = useState('photo.jpg');
  const [caption, setCaption] = useState('');
  const [uploadDayId, setUploadDayId] = useState<string>(tripDays[0]?.id ?? 'day-1');
  const [uploading, setUploading] = useState(false);

  const drivePhotosRef = useRef<AlbumPhoto[]>(drivePhotos);
  drivePhotosRef.current = drivePhotos;

  const commitDrivePhotos = useCallback(
    (updater: AlbumPhoto[] | ((prev: AlbumPhoto[]) => AlbumPhoto[])) => {
      const next = typeof updater === 'function' ? updater(drivePhotosRef.current) : updater;
      drivePhotosRef.current = next;
      setDrivePhotos(next);
      onDrivePhotosSync?.(next);
    },
    [onDrivePhotosSync],
  );
  const dayFilterRef = useRef<HTMLDivElement | null>(null);
  const ideaFilterRef = useRef<HTMLDivElement | null>(null);
  const dayFilterFade = useHorizontalScrollFade(dayFilterRef, [tripDays.length, albumTab]);
  const ideaFilterFade = useHorizontalScrollFade(ideaFilterRef, [albumTab]);
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
        onDrivePhotosSync?.(res.photos);
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
    [trip.gdriveScriptUrl, trip.id, driveFolderUrl, onNotify, onDrivePhotosSync],
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
        onDrivePhotosSync?.(res.photos);
        setSyncHealth({ status: 'ok' });
      } else {
        setSyncHealth({ status: 'error', error: res.error || 'Connection failed' });
      }
    });
    return () => {
      alive = false;
    };
  }, [trip.gdriveScriptUrl, trip.id, driveFolderUrl, onDrivePhotosSync]);

  const allPhotos = useMemo(() => {
    const merged = [...drivePhotos, ...localPhotos].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    if (dayFilter === 'all') return merged;
    return merged.filter((p) => p.dayId === dayFilter);
  }, [drivePhotos, localPhotos, dayFilter]);

  const contentIdeas = trip.contentIdeas ?? [];
  const filteredIdeas = useMemo(() => {
    const sorted = [...contentIdeas].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'to-shoot' ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    if (ideaFilter === 'all') return sorted;
    return sorted.filter((i) => i.status === ideaFilter);
  }, [contentIdeas, ideaFilter]);

  const dayIndexLabel = useCallback(
    (dayId?: string) => {
      if (!dayId) return '';
      const idx = tripDays.findIndex((d) => d.id === dayId);
      if (idx >= 0) return `Day ${idx + 1}`;
      return '';
    },
    [tripDays],
  );

  const handleSaveIdea = (saved: ContentIdea, isNew: boolean) => {
    onUpdateTrip(
      (prev) => {
        const list = prev.contentIdeas ?? [];
        const exists = list.some((i) => i.id === saved.id);
        return {
          ...prev,
          contentIdeas: exists ? list.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...list],
        };
      },
      isNew ? 'Content idea added' : 'Content idea saved',
    );
  };

  const handleDeleteIdea = (ideaId: string) => {
    onUpdateTrip(
      (prev) => ({
        ...prev,
        contentIdeas: (prev.contentIdeas ?? []).filter((i) => i.id !== ideaId),
      }),
      'Content idea deleted',
    );
  };

  const handleToggleIdeaStatus = (idea: ContentIdea) => {
    const nextStatus: ContentIdeaStatus = idea.status === 'shot' ? 'to-shoot' : 'shot';
    onUpdateTrip(
      (prev) => ({
        ...prev,
        contentIdeas: (prev.contentIdeas ?? []).map((i) =>
          i.id === idea.id ? { ...i, status: nextStatus } : i,
        ),
      }),
      nextStatus === 'shot' ? `Marked "${idea.title}" shot` : `Marked "${idea.title}" to shoot`,
    );
  };

  const handleCropConfirmed = (cropped: CroppedImageResult) => {
    const rawName = cropFile?.name || 'photo.jpg';
    const baseName = rawName.replace(/\.[^.]+$/, '') || 'photo';
    const origExtMatch = rawName.match(/\.[a-zA-Z0-9]+$/);
    const ext = cropped.isOriginalPassthrough && origExtMatch ? origExtMatch[0].toLowerCase() : '.jpg';
    setCropFile(null);
    setPreviewUrl(cropped.dataUrl);
    setCompressedBase64(cropped.base64);
    setUploadMimeType(cropped.mimeType || 'image/jpeg');
    setFileName(`${baseName}${ext}`);
    setUploadOpen(true);
  };

  const resetUpload = () => {
    setUploadOpen(false);
    setPreviewUrl('');
    setCompressedBase64('');
    setUploadMimeType('image/jpeg');
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
      const uploaded = await uploadSharedImage(
        { dataUrl: previewUrl, base64: compressedBase64, mimeType: uploadMimeType },
        {
          kind: 'album',
          trip,
          dayId: uploadDayId,
          dayLabel,
          caption: cleanCaption,
          uploaderName: activeMemberName,
          fileName,
        },
      );
      if (uploaded.source === 'drive') {
        const drivePhoto: AlbumPhoto = {
          id: uploaded.driveId || `drv-${Date.now().toString(36)}`,
          tripId: trip.id,
          dayId: uploadDayId,
          dayLabel,
          caption: cleanCaption,
          uploaderName: activeMemberName,
          url: uploaded.url,
          fullUrl: uploaded.fullUrl,
          downloadUrl: uploaded.downloadUrl,
          source: 'drive',
          createdAt: new Date().toISOString(),
        };
        commitDrivePhotos((prev) => [drivePhoto, ...prev]);
        setSyncHealth({ status: 'ok' });
        onNotify('Uploaded to Google Drive', 'success');
        resetUpload();
        return;
      }
      if (uploaded.error) {
        setSyncHealth({ status: 'error', error: uploaded.error });
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
      fullUrl: previewUrl,
      downloadUrl: previewUrl,
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
    const mimeMatch = photo.url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);

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
      mimeType: mimeMatch?.[1] || 'image/jpeg',
    });

    if (res.ok && res.photo) {
      commitDrivePhotos((prev) => [res.photo!, ...prev]);
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
    a.href = photo.downloadUrl || photo.fullUrl || photo.url;
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
      commitDrivePhotos((prev) => prev.filter((p) => p.id !== lightboxPhoto.id));
      onNotify('Hidden from gallery view (remove file in Drive to delete permanently)', 'info');
    }
    setConfirmDelete(false);
    setLightboxPhoto(null);
  };

  const isSyncing = syncHealth.status === 'syncing';

  return (
    <div className="album-root">
      {/* Header with Photos | Ideas Segmented Pill Switcher (identical style to Plan Trail | Table) */}
      <header data-tour="album-overview" className="album-header">
        <h1 className="album-title">Album</h1>
        <div className="album-view-switch" role="tablist" aria-label="Album section">
          <button
            type="button"
            role="tab"
            aria-selected={albumTab === 'photos'}
            className={`album-view-btn ${albumTab === 'photos' ? 'album-view-btn--active' : ''}`}
            onClick={() => {
              triggerFeedback('tap');
              setAlbumTab('photos');
            }}
          >
            Photos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={albumTab === 'ideas'}
            className={`album-view-btn ${albumTab === 'ideas' ? 'album-view-btn--active' : ''}`}
            onClick={() => {
              triggerFeedback('tap');
              setAlbumTab('ideas');
            }}
          >
            Ideas
          </button>
        </div>
      </header>

      {albumTab === 'photos' ? (
        <>
          {/* Row 2: Full-Width Edge-to-Edge Day Filter Strip (Zero button collision) */}
          <div
            ref={dayFilterRef}
            data-fade={dayFilterFade.dataFade}
            className="album-day-strip"
            role="tablist"
            aria-label="Filter photos by day"
          >
            <button
              type="button"
              role="tab"
              aria-selected={dayFilter === 'all'}
              className={`plan-chip tactile ${dayFilter === 'all' ? 'plan-chip--active' : ''}`}
              onClick={() => {
                triggerFeedback('tap');
                setDayFilter('all');
              }}
            >
              All
            </button>
            {tripDays.map((day, idx) => (
              <button
                key={day.id}
                type="button"
                role="tab"
                aria-selected={dayFilter === day.id}
                className={`plan-chip tactile ${dayFilter === day.id ? 'plan-chip--active' : ''}`}
                onClick={() => {
                  triggerFeedback('tap');
                  setDayFilter(day.id);
                }}
              >
                Day {idx + 1}
              </button>
            ))}
          </div>

          {/* Row 3: Unified Drive Status & Actions Capsule */}
          <GlassCard
            variant="clear"
            padding="sm"
            className={`album-drive-capsule ${
              hasSyncScript && syncHealth.status === 'error' ? 'album-drive-capsule--error' : ''
            }`}
          >
            <div className="album-drive-capsule__main">
              {/* Left: Circular Google Drive Logo Orb + Compact 2-line Drive status */}
              <div className="album-drive-capsule__left">
                {driveFolderUrl ? (
                  <a
                    href={driveFolderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open Google Drive folder"
                    title="Open Google Drive folder"
                    className="album-sync-orb tactile"
                  >
                    <svg viewBox="0 0 87.3 78" width="16" height="15" aria-hidden="true">
                      <path
                        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
                        fill="#0066da"
                      />
                      <path
                        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
                        fill="#00ac47"
                      />
                      <path
                        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
                        fill="#ea4335"
                      />
                      <path
                        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
                        fill="#00832d"
                      />
                      <path
                        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
                        fill="#2684fc"
                      />
                      <path
                        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
                        fill="#ffba00"
                      />
                    </svg>
                  </a>
                ) : (
                  <button
                    type="button"
                    aria-label="Connect Google Drive folder"
                    title="Connect Google Drive folder"
                    className="album-sync-orb tactile"
                    onClick={onOpenSettings}
                  >
                    <svg viewBox="0 0 87.3 78" width="16" height="15" aria-hidden="true">
                      <path
                        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
                        fill="#0066da"
                      />
                      <path
                        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
                        fill="#00ac47"
                      />
                      <path
                        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
                        fill="#ea4335"
                      />
                      <path
                        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
                        fill="#00832d"
                      />
                      <path
                        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
                        fill="#2684fc"
                      />
                      <path
                        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
                        fill="#ffba00"
                      />
                    </svg>
                  </button>
                )}

                <div className="album-drive-capsule__info">
                  <div className="album-drive-capsule__top">
                    <span
                      className={[
                        'album-drive-dot',
                        hasSyncScript && syncHealth.status === 'error'
                          ? 'album-drive-dot--error'
                          : hasSyncScript && syncHealth.status === 'ok'
                            ? 'album-drive-dot--ok'
                            : 'album-drive-dot--idle',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                    <span className="album-drive-capsule__label">Google Drive</span>
                  </div>

                  <div className="album-drive-capsule__sub">
                    {hasSyncScript ? (
                      syncHealth.status === 'error' ? (
                        <span className="album-drive-capsule__err">
                          <span>Sync failed · {syncHealth.error}</span>
                          <button
                            type="button"
                            className="album-drive-settings-link"
                            onClick={onOpenSettings}
                          >
                            Settings
                          </button>
                        </span>
                      ) : isSyncing ? (
                        'Checking Google Drive...'
                      ) : (
                        `${drivePhotos.length} ${drivePhotos.length === 1 ? 'photo' : 'photos'} synced`
                      )
                    ) : hasLinkedFolder ? (
                      'Folder linked · Add Sync URL in Settings'
                    ) : (
                      'Saving locally until Drive sync is connected'
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Tight action cluster (Circular Sync/Settings Orb + Primary Upload CTA) */}
              <div className="album-drive-capsule__actions">
                {hasSyncScript ? (
                  <button
                    type="button"
                    disabled={isSyncing}
                    aria-label="Sync Google Drive"
                    className="album-sync-orb tactile"
                    onClick={() => void syncFromDrive(true)}
                  >
                    <RefreshCw
                      size={15}
                      strokeWidth={2}
                      style={
                        isSyncing
                          ? { animation: 'gaskeun-spin 0.9s linear infinite' }
                          : undefined
                      }
                    />
                  </button>
                ) : canEditSettings ? (
                  <button
                    type="button"
                    aria-label="Drive sync settings"
                    className="album-sync-orb tactile"
                    onClick={onOpenSettings}
                  >
                    <Settings2 size={15} strokeWidth={2} />
                  </button>
                ) : null}

                <Button
                  variant="matcha"
                  size="sm"
                  leftIcon={<Upload size={14} strokeWidth={2} />}
                  onClick={() => {
                    triggerFeedback('tap');
                    setImageSourceOpen(true);
                  }}
                >
                  Upload
                </Button>
              </div>
            </div>

            {/* Slim secondary row when local pending photos are ready to push */}
            {localPhotos.length > 0 && hasSyncScript && syncHealth.status === 'ok' && (
              <div className="album-drive-capsule__pending">
                <span className="album-drive-capsule__pending-text">
                  {localPhotos.length} local {localPhotos.length === 1 ? 'photo' : 'photos'} waiting
                  to upload
                </span>
                <Button
                  variant="matcha"
                  size="sm"
                  disabled={pushingLocal}
                  leftIcon={<CloudUpload size={13} strokeWidth={2} />}
                  onClick={() => void handlePushAllLocalToDrive()}
                >
                  {pushingLocal ? 'Pushing...' : 'Push to Drive'}
                </Button>
              </div>
            )}
          </GlassCard>

          {/* 2-Column Masonry Grid */}
          {allPhotos.length === 0 ? (
            <EmptyState
              icon={<Images size={22} strokeWidth={1.8} />}
              title="No trip photos yet"
              description="Upload highlights from your gallery — original quality is preserved for sharing."
              action={
                <Button
                  variant="matcha"
                  size="sm"
                  leftIcon={<ImagePlus size={15} strokeWidth={2} />}
                  onClick={() => {
                    triggerFeedback('tap');
                    setImageSourceOpen(true);
                  }}
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
        </>
      ) : (
        /* ==================== IDEAS TAB (Minimalist Content Inspiration Board) ==================== */
        <>
          <div className="album-ideas-bar">
            <div
              ref={ideaFilterRef}
              data-fade={ideaFilterFade.dataFade}
              className="album-ideas-filters"
              role="tablist"
              aria-label="Filter content ideas"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'to-shoot', label: 'To Shoot' },
                  { id: 'shot', label: 'Shot' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={ideaFilter === f.id}
                  className={`plan-chip tactile ${ideaFilter === f.id ? 'plan-chip--active' : ''}`}
                  onClick={() => {
                    triggerFeedback('tap');
                    setIdeaFilter(f.id);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button
              variant="matcha"
              size="sm"
              leftIcon={<Plus size={14} strokeWidth={2.2} />}
              onClick={() => {
                triggerFeedback('tap');
                setEditingIdea(null);
                setIdeaSheetOpen(true);
              }}
            >
              Idea
            </Button>
          </div>

          {filteredIdeas.length === 0 ? (
            <EmptyState
              icon={<Clapperboard size={22} strokeWidth={1.8} />}
              title={ideaFilter === 'all' ? 'No content ideas yet' : 'No matching ideas'}
              description="Save IG Reels, TikTok transitions, or group pose inspiration so the crew never forgets a shot."
              action={
                <Button
                  variant="matcha"
                  size="sm"
                  leftIcon={<Plus size={14} strokeWidth={2.2} />}
                  onClick={() => {
                    triggerFeedback('tap');
                    setEditingIdea(null);
                    setIdeaSheetOpen(true);
                  }}
                >
                  Add First Idea
                </Button>
              }
            />
          ) : (
            <div className="idea-list">
              {filteredIdeas.map((idea) => {
                const isShot = idea.status === 'shot';
                const planDayText = idea.showInPlan ? dayIndexLabel(idea.dayId) : '';
                const platLabel = formatPlatformLabel(idea.platform, idea.referenceUrl);

                return (
                  <GlassCard
                    key={idea.id}
                    variant="clear"
                    padding="sm"
                    interactive
                    className={`idea-card ${isShot ? 'idea-card--shot' : ''}`}
                    onClick={() => {
                      setEditingIdea(idea);
                      setIdeaSheetOpen(true);
                    }}
                  >
                    <div className="idea-card__thumb">
                      {idea.thumbnailUrl ? (
                        <img
                          src={idea.thumbnailUrl}
                          alt={idea.title}
                          className="idea-card__thumb-img"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className={`idea-card__thumb-placeholder idea-card__thumb-placeholder--${idea.platform}`}
                          aria-hidden="true"
                        >
                          <PlatformThumbIcon platform={idea.platform} />
                        </div>
                      )}
                    </div>

                    <div className="idea-card__body">
                      <div className="idea-card__badges">
                        <Badge tone="neutral">{platLabel}</Badge>
                        {idea.showInPlan && (
                          <Badge tone="amber">
                            In Plan{planDayText ? ` · ${planDayText}` : ''}
                          </Badge>
                        )}
                      </div>

                      <h3 className={`idea-card__title ${isShot ? 'idea-card__title--shot' : ''}`}>
                        {idea.title}
                      </h3>

                      {idea.notes && <p className="idea-card__notes">{idea.notes}</p>}

                      <div className="idea-card__actions">
                        {idea.referenceUrl && (
                          <a
                            href={idea.referenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="idea-watch-btn tactile"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span>Watch</span>
                            <ArrowUpRight size={13} strokeWidth={2.2} />
                          </a>
                        )}

                        <button
                          type="button"
                          className={`idea-toggle-btn tactile ${
                            isShot ? 'idea-toggle-btn--shot' : ''
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleIdeaStatus(idea);
                          }}
                        >
                          {isShot && <Check size={12.5} strokeWidth={2.6} />}
                          <span>{isShot ? 'Shot' : 'To Shoot'}</span>
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Content Idea Add/Edit Sheet */}
      <ContentIdeaSheet
        open={ideaSheetOpen}
        trip={trip}
        idea={editingIdea}
        activeMemberId={activeMemberId}
        activeMemberName={activeMemberName}
        canEditTrip={canEdit}
        canDeleteIdea={canDeleteIdeas}
        onSave={handleSaveIdea}
        onDelete={handleDeleteIdea}
        onClose={() => {
          setIdeaSheetOpen(false);
          setEditingIdea(null);
        }}
      />

      <ImageSourceSheet
        open={imageSourceOpen}
        title="Upload Trip Photo"
        onPick={(file) => setCropFile(file)}
        onInvalidFile={(msg) => onNotify(msg, 'error')}
        onClose={() => setImageSourceOpen(false)}
      />

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

      {/* Full-Screen Lightbox (Portaled to document.body, uses fullUrl w4096 + original downloadUrl) */}
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
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: '#FFFFFF' }}>
                  {lightboxPhoto.caption}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.88)' }}>
                  {lightboxPhoto.dayLabel} · {lightboxPhoto.uploaderName}
                  {lightboxPhoto.source === 'local' ? ' · Local' : ''}
                </div>
              </div>
              <CornerOrb
                kind="close"
                surface="dark"
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

            <div className="album-lightbox__actions" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="danger"
                size="md"
                aria-label="Delete photo"
                leftIcon={<Trash2 size={16} strokeWidth={2.1} />}
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
                  leftIcon={<CloudUpload size={16} strokeWidth={2.1} />}
                  onClick={() => void handlePushLightboxPhoto()}
                >
                  {pushingLocal ? 'Pushing...' : 'Push to Drive'}
                </Button>
              )}
              <Button
                variant="glass"
                surface="dark"
                size="md"
                fullWidth={lightboxPhoto.source !== 'local' || !hasSyncScript}
                leftIcon={<Download size={16} strokeWidth={2.2} />}
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
