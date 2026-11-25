import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import seedData from './data/seed-solo-jogja-2027.json';
import { ConfirmDialog, Toast, type ToastTone } from './components/atoms';
import { ExpandingGlassDock } from './components/organisms/ExpandingGlassDock';
import { PinUnlockSheet } from './components/organisms/PinUnlockSheet';
import { TripMenuSheet, type HomePhase } from './components/organisms/TripMenuSheet';
import { OverlayProvider } from './context/OverlayContext';
import { useKeyboardOffset } from './hooks/useVisualViewport';
import { LandingGateScreen } from './features/gate/LandingGateScreen';
import { WhoAreYouScreen } from './features/gate/WhoAreYouScreen';
import { HomeScreen } from './features/home/HomeScreen';
import {
  ensureSeedTrip,
  getLocalPersonal,
  getSharedTripByCode,
  listSharedTrips,
  saveLocalAlbumPhotos,
  saveLocalPersonal,
  savePersonalPrep,
  saveSharedTrip,
  setActiveMemberLocal,
  upsertPersonalTransaction,
} from './services/db';
import { fetchDriveAlbumWithStatus, isAssetFileName } from './services/gdriveAlbum';
import { appendEditLog } from './services/activityLog';
import { triggerFeedback } from './services/feedback';
import { uploadSharedImage } from './services/mediaUploader';
import {
  canEditTrip,
  getMemberRoleLabel,
  isHostMember,
  setCrewEditPinByHost,
  setMemberPasscodeInTrip,
} from './services/permissions';
import type { CroppedImageResult } from './services/photoCrop';
import { pwaHistory, useBackHandler } from './services/pwaHistory';
import {
  clearActiveSession,
  filterJoinedTrips,
  loadJoinedTripCodes,
  loadSavedSession,
  recordJoinedTripCode,
  saveActiveSession,
} from './services/session';
import {
  applyRemoteSharedTrip,
  fetchRemoteTripByCode,
  flushOfflineMutationQueue,
  pullLatestSharedTrip,
  pushOrQueueSharedTrip,
  shouldApplyRemoteTrip,
  subscribeToSharedTrip,
  subscribeToTripPresence,
} from './services/supabaseSync';
import { buildInviteUrl } from './services/tripFactory';
import type {
  AlbumPhoto,
  DockTabId,
  LocalPersonalData,
  OnlinePresenceUser,
  PrepTask,
  RouteTarget,
  SharedTrip,
  Transaction,
} from './types/trip';
import './App.css';

// Route & Heavy Sheet Code-Splitting (keeps initial Home bundle lean & fast on mobile)
const PlanScreen = lazy(() =>
  import('./features/plan/PlanScreen').then((m) => ({ default: m.PlanScreen })),
);
const RouteMapView = lazy(() =>
  import('./features/plan/RouteMapView').then((m) => ({ default: m.RouteMapView })),
);
const WalletScreen = lazy(() =>
  import('./features/wallet/WalletScreen').then((m) => ({ default: m.WalletScreen })),
);
const AlbumScreen = lazy(() =>
  import('./features/album/AlbumScreen').then((m) => ({ default: m.AlbumScreen })),
);
const PrepScreen = lazy(() =>
  import('./features/prep/PrepScreen').then((m) => ({ default: m.PrepScreen })),
);
const CreateTripScreen = lazy(() =>
  import('./features/gate/CreateTripScreen').then((m) => ({ default: m.CreateTripScreen })),
);
const TripSettingsSheet = lazy(() =>
  import('./components/organisms/TripSettingsSheet').then((m) => ({
    default: m.TripSettingsSheet,
  })),
);

type AppRoute = 'landing' | 'who' | 'create' | 'hub';

const pilotSeed = seedData as unknown as SharedTrip;
const defaultCoverPath = `${import.meta.env.BASE_URL}assets/default-cover.svg`;

const DRIVE_ALBUM_CACHE_PREFIX = 'gaskeun_drive_album_v1_';
const VIEW_ONLY_STORAGE_KEY = 'gaskeun_view_only_mode';

function loadViewOnlyMode(): boolean {
  try {
    return localStorage.getItem(VIEW_ONLY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadCachedDrivePhotos(tripId: string): AlbumPhoto[] {
  try {
    const raw = localStorage.getItem(`${DRIVE_ALBUM_CACHE_PREFIX}${tripId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AlbumPhoto[];
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.url === 'string') : [];
  } catch {
    return [];
  }
}

function saveCachedDrivePhotos(tripId: string, photos: AlbumPhoto[]): void {
  try {
    localStorage.setItem(`${DRIVE_ALBUM_CACHE_PREFIX}${tripId}`, JSON.stringify(photos.slice(0, 40)));
  } catch {
    // ignore storage quota errors
  }
}

export default function App() {
  useKeyboardOffset();

  const [route, setRoute] = useState<AppRoute>('landing');
  const [savedTrips, setSavedTrips] = useState<SharedTrip[]>([pilotSeed]);
  const [joinedTripCodes, setJoinedTripCodes] = useState<string[]>(() => loadJoinedTripCodes());
  const [activeTrip, setActiveTrip] = useState<SharedTrip>(pilotSeed);
  const [localData, setLocalData] = useState<LocalPersonalData | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [onlineMembers, setOnlineMembers] = useState<OnlinePresenceUser[]>([]);
  const [driveAlbumPhotos, setDriveAlbumPhotos] = useState<AlbumPhoto[]>(() =>
    loadCachedDrivePhotos(pilotSeed.id),
  );

  const [activeTab, setActiveTab] = useState<DockTabId>('home');
  const [phase, setPhase] = useState<HomePhase>('pre-trip');
  const [hasRevealedDock, setHasRevealedDock] = useState<boolean>(false);
  const [viewOnlyMode, setViewOnlyMode] = useState<boolean>(() => loadViewOnlyMode());
  const [pinUnlockedCodes, setPinUnlockedCodes] = useState<string[]>(
    () => loadSavedSession()?.pinUnlockedCodes ?? [],
  );

  const [activeRouteTarget, setActiveRouteTarget] = useState<RouteTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
  const [pendingAfterUnlock, setPendingAfterUnlock] = useState<(() => void) | null>(null);
  const [pendingImportTrip, setPendingImportTrip] = useState<SharedTrip | null>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string; tone: ToastTone }>({
    open: false,
    message: '',
    tone: 'success',
  });

  const activeTripRef = useRef<SharedTrip>(activeTrip);
  activeTripRef.current = activeTrip;
  const activeTabRef = useRef<DockTabId>(activeTab);
  activeTabRef.current = activeTab;
  const lastAutoPullMsRef = useRef<number>(0);
  const shellRef = useRef<HTMLElement | null>(null);

  // Initialize root history marker (`depth: 0`) so Android/PWA hardware Back exits cleanly only at root
  useEffect(() => {
    pwaHistory.initRoot();
  }, []);

  // Register full-screen sub-views (`RouteMapView`, `CreateTripScreen`, `WhoAreYouScreen`) on the back stack
  useBackHandler(
    route === 'hub' && Boolean(activeRouteTarget),
    () => setActiveRouteTarget(null),
    'view',
    'route-map',
  );
  useBackHandler(route === 'create', () => setRoute('landing'), 'view', 'create-trip');
  useBackHandler(route === 'who', () => setRoute('landing'), 'view', 'who-are-you');

  // Clear tab history entries whenever leaving the main Hub so Landing/Gate back stack stays clean
  useEffect(() => {
    if (route !== 'hub') {
      pwaHistory.clearByKind('tab');
    }
  }, [route]);

  const handleNavigateTab = useCallback((nextTab: DockTabId) => {
    const prevTab = activeTabRef.current;
    if (prevTab === nextTab) return;
    pwaHistory.push({
      kind: 'tab',
      key: nextTab,
      onBack: () => setActiveTab(prevTab),
    });
    setActiveTab(nextTab);
  }, []);

  // Permanently keep the Floating Glass Dock visible for the session once user leaves Home or enters Live Trail View
  useEffect(() => {
    if (activeTab !== 'home' || phase === 'on-trip') {
      setHasRevealedDock(true);
    }
  }, [activeTab, phase]);

  // Reset window & root scroll position synchronously on every tab/route change so scrolled Home offsets
  // never carry over and clip the top header of Plan, Wallet, Album, or Prep.
  useLayoutEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      } catch {
        window.scrollTo(0, 0);
      }
    }
    if (typeof document !== 'undefined') {
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
    if (shellRef.current) {
      shellRef.current.scrollTop = 0;
    }
  }, [activeTab, route, activeRouteTarget]);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast({ open: true, message, tone });
  }, []);

  /**
   * Pulls the latest Layer-1 `SharedTrip` payload (including shared `coverPhotoUrl`,
   * Plan card covers, `contentIdeas`, and crew passcodes) from Supabase and merges
   * cleanly without touching Layer 2 (`local_personal`).
   */
  const syncActiveTripFromCloud = useCallback(
    async (
      tripCode: string,
      localSnapshot: SharedTrip | null,
      options?: { force?: boolean; notify?: boolean },
    ) => {
      if (!tripCode) return;
      setIsSyncingCloud(true);
      try {
        const res = await pullLatestSharedTrip(tripCode, localSnapshot, {
          force: options?.force,
        });
        if (res.status === 'updated' && res.trip) {
          setActiveTrip(res.trip);
          setLastSyncedAt(res.syncedAt);
          setLastSyncError(null);
          void listSharedTrips().then(setSavedTrips);
          if (options?.notify) showToast('Synced latest trip updates', 'success');
        } else if (res.status === 'up-to-date') {
          setLastSyncedAt(res.syncedAt);
          setLastSyncError(null);
          if (options?.notify) showToast('Already up to date', 'info');
        } else if (res.status === 'error') {
          const reason = res.errorMessage || 'Unknown Supabase error';
          setLastSyncError(reason);
          console.error('[GASKEUN Sync] Sync failed:', reason);
          if (options?.notify) showToast(`Sync failed: ${reason}`, 'error');
        } else if (options?.notify) {
          if (res.status === 'offline') showToast('Device is offline', 'info');
          else if (res.status === 'unconfigured') showToast('Cloud sync not configured', 'info');
          else if (res.status === 'not-found') showToast('No cloud copy yet — saving locally', 'info');
        }
      } finally {
        setIsSyncingCloud(false);
      }
    },
    [showToast],
  );

  // Bootstrap IndexedDB pilot seed + URL ?code= deep-link + Auto-Restore remembered session + Cloud Pull
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureSeedTrip(pilotSeed);
        const all = await listSharedTrips();
        if (!alive) return;
        setSavedTrips(all);

        const params = new URLSearchParams(window.location.search);
        const queryCode = params.get('code')?.trim().toUpperCase();
        if (queryCode) {
          const remoteMatched = await fetchRemoteTripByCode(queryCode);
          const matched = remoteMatched ?? (await getSharedTripByCode(queryCode));
          if (matched && alive) {
            const refreshed = await listSharedTrips();
            setSavedTrips(refreshed);
            const local = await getLocalPersonal(matched.id);
            setJoinedTripCodes(recordJoinedTripCode(matched.code));
            setActiveTrip(matched);
            setLocalData(local);
            if (remoteMatched) setLastSyncedAt(new Date().toISOString());
            if (local.activeMemberId) {
              saveActiveSession({
                tripCode: matched.code,
                activeMemberId: local.activeMemberId,
                pinUnlockedCodes: loadSavedSession()?.pinUnlockedCodes ?? [],
              });
              setRoute('hub');
            } else {
              setRoute('who');
            }
            return;
          }
        }

        // Auto-remember last login session so reopening the PWA lands straight on Home,
        // then immediately pull latest updates from Supabase in the background.
        const saved = loadSavedSession();
        if (saved) {
          const restored =
            (await getSharedTripByCode(saved.tripCode)) ??
            all.find((t) => t.code.toUpperCase() === saved.tripCode.toUpperCase());
          if (restored && alive) {
            const local = await getLocalPersonal(restored.id);
            const memberId = local.activeMemberId ?? saved.activeMemberId;
            const syncedLocal =
              local.activeMemberId === memberId
                ? local
                : await setActiveMemberLocal(restored.id, memberId);
            setJoinedTripCodes(recordJoinedTripCode(restored.code));
            setActiveTrip(restored);
            setLocalData(syncedLocal);
            setPinUnlockedCodes(saved.pinUnlockedCodes);
            setRoute('hub');
            lastAutoPullMsRef.current = Date.now();
            void syncActiveTripFromCloud(restored.code, restored, {
              force: false,
              notify: false,
            });
          }
        }
      } catch {
        // Fallback cleanly to in-memory pilot seed
      }
    })();
    return () => {
      alive = false;
    };
  }, [syncActiveTripFromCloud]);

  // Dynamic Android/PWA status bar `theme-color`: dark (#141A18) while viewing Home Hero top,
  // switching seamlessly back to soft sage-white (#F6F8F5) past the hero or on any other tab/route.
  useEffect(() => {
    const metaEl =
      (document.getElementById('dynamic-theme-color') as HTMLMetaElement | null) ??
      (document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null);
    if (!metaEl) return;

    const isHomeHeroScreen = route === 'hub' && !activeRouteTarget && activeTab === 'home';

    const updateThemeColor = () => {
      const heroThreshold = Math.max(240, window.innerHeight * 0.55);
      const nextColor =
        isHomeHeroScreen && window.scrollY < heroThreshold ? '#141A18' : '#F6F8F5';
      if (metaEl.getAttribute('content') !== nextColor) {
        metaEl.setAttribute('content', nextColor);
      }
    };

    updateThemeColor();
    if (!isHomeHeroScreen) return;

    window.addEventListener('scroll', updateThemeColor, { passive: true });
    window.addEventListener('resize', updateThemeColor, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateThemeColor);
      window.removeEventListener('resize', updateThemeColor);
    };
  }, [route, activeTab, activeRouteTarget]);

  // Realtime Supabase subscription for active trip (`postgres_changes` on `shared_trips`)
  useEffect(() => {
    if (route !== 'hub' && route !== 'who') return;
    const code = activeTrip.code;
    if (!code) return;

    const unsubscribe = subscribeToSharedTrip(code, (remoteTrip) => {
      const current = activeTripRef.current;
      if (!shouldApplyRemoteTrip(current, remoteTrip)) return;
      void applyRemoteSharedTrip(remoteTrip).then((persisted) => {
        setActiveTrip(persisted);
        setLastSyncedAt(new Date().toISOString());
        void listSharedTrips().then(setSavedTrips);
      });
    });

    return unsubscribe;
  }, [route, activeTrip.code]);

  // Auto-pull from Supabase when tab becomes visible or window regains focus
  useEffect(() => {
    if (route !== 'hub' && route !== 'who') return;

    const triggerPull = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastAutoPullMsRef.current < 2500) return;
      lastAutoPullMsRef.current = now;
      const current = activeTripRef.current;
      void syncActiveTripFromCloud(current.code, current, { force: false, notify: false });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') triggerPull();
    };

    window.addEventListener('focus', triggerPull);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', triggerPull);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [route, syncActiveTripFromCloud]);

  // Automatically flush offline Layer-1 mutation queue and pull latest when connectivity returns
  useEffect(() => {
    const handleOnline = () => {
      void flushOfflineMutationQueue().then((flushedCount) => {
        if (flushedCount > 0) {
          showToast('Synced', 'success');
        }
        const current = activeTripRef.current;
        if (current?.code) {
          void syncActiveTripFromCloud(current.code, current, { force: false, notify: false });
        }
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [showToast, syncActiveTripFromCloud]);

  // Load cached Drive album photos immediately on trip change & silently refresh in background
  // so the Home ALBUM collage displays live photos right away without visiting the Album tab first.
  useEffect(() => {
    setDriveAlbumPhotos(loadCachedDrivePhotos(activeTrip.id));
  }, [activeTrip.id]);

  useEffect(() => {
    if (route !== 'hub') return;
    const scriptUrl = activeTrip.gdriveScriptUrl?.trim();
    if (!scriptUrl) return;

    let alive = true;
    const folderUrl = activeTrip.gdriveFolderUrl || activeTrip.albumUrl;
    const runFetch = () => {
      if (!alive) return;
      void fetchDriveAlbumWithStatus(scriptUrl, activeTrip.id, folderUrl).then((res) => {
        if (!alive || !res.ok) return;
        setDriveAlbumPhotos(res.photos);
        saveCachedDrivePhotos(activeTrip.id, res.photos);
      });
    };

    // On Album tab fetch immediately; on initial Home load defer until idle so Hero LCP wins bandwidth
    if (activeTab === 'album') {
      runFetch();
      return () => {
        alive = false;
      };
    }

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(runFetch, { timeout: 3500 });
      return () => {
        alive = false;
        win.cancelIdleCallback?.(idleId);
      };
    }
    const timerId = window.setTimeout(runFetch, 2000);
    return () => {
      alive = false;
      window.clearTimeout(timerId);
    };
  }, [
    route,
    activeTab,
    activeTrip.id,
    activeTrip.gdriveScriptUrl,
    activeTrip.gdriveFolderUrl,
    activeTrip.albumUrl,
  ]);

  const handleDrivePhotosSync = useCallback(
    (photos: AlbumPhoto[]) => {
      setDriveAlbumPhotos(photos);
      saveCachedDrivePhotos(activeTrip.id, photos);
    },
    [activeTrip.id],
  );

  // Merged non-asset Album photos (Drive + Local) sorted newest-first for the Home ALBUM collage
  const homeAlbumPhotos = useMemo(() => {
    const seen = new Set<string>();
    const combined: AlbumPhoto[] = [];
    for (const p of [...driveAlbumPhotos, ...(localData?.localAlbumPhotos ?? [])]) {
      if (!p?.id || !p.url || seen.has(p.id)) continue;
      if (isAssetFileName(p.caption)) continue;
      seen.add(p.id);
      combined.push(p);
    }
    return combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [driveAlbumPhotos, localData?.localAlbumPhotos]);

  // Home Hero Cover is Layer 1 (`SharedTrip.coverPhotoUrl`) so every device displays the same cover
  const sharedCoverUrl = activeTrip.coverPhotoUrl || activeTrip.heroCoverUrl || '';
  const hasCustomCoverPhoto = Boolean(sharedCoverUrl);
  const effectiveCoverUrl = sharedCoverUrl || defaultCoverPath;

  const activeMemberId = localData?.activeMemberId ?? null;
  const activeMember = useMemo(
    () =>
      activeMemberId && activeMemberId !== 'guest'
        ? activeTrip.members.find((m) => m.id === activeMemberId)
        : undefined,
    [activeTrip.members, activeMemberId],
  );
  const activeMemberName = activeMember?.name ?? 'Guest';

  // Live Supabase Realtime Presence so crew see who else is currently active on Home
  useEffect(() => {
    if (route !== 'hub' || !activeTrip.code || !activeMemberId) {
      setOnlineMembers([]);
      return;
    }

    const memberSnapshot = activeTripRef.current.members.find((m) => m.id === activeMemberId);
    const selfPayload = memberSnapshot
      ? {
          memberId: memberSnapshot.id,
          name: memberSnapshot.name,
          initials: memberSnapshot.initials,
          avatarBg: memberSnapshot.avatarBg,
          avatarColor: memberSnapshot.avatarColor,
          isGuest: false,
        }
      : {
          memberId: activeMemberId,
          name: 'Guest',
          initials: 'G',
          avatarBg: '#EAEFED',
          avatarColor: '#546860',
          isGuest: true,
        };

    return subscribeToTripPresence(
      activeTrip.code,
      selfPayload,
      () => activeTripRef.current.members,
      setOnlineMembers,
    );
  }, [route, activeTrip.code, activeMemberId]);

  const pinUnlocked = pinUnlockedCodes.includes(activeTrip.code.toUpperCase());
  const isHost = isHostMember(activeTrip, activeMemberId);
  const rawCanEdit = canEditTrip(activeTrip, activeMemberId, pinUnlocked);
  const isViewOnlyActive = rawCanEdit && viewOnlyMode;
  const canEdit = rawCanEdit && !isViewOnlyActive;
  const roleLabel = getMemberRoleLabel(activeTrip, activeMemberId, pinUnlocked);

  const handleToggleViewOnlyMode = (next: boolean) => {
    triggerFeedback('toggle');
    setViewOnlyMode(next);
    try {
      localStorage.setItem(VIEW_ONLY_STORAGE_KEY, String(next));
    } catch {
      // ignore storage quota errors
    }
    showToast(
      next ? 'View-Only Mode enabled — edit controls hidden' : 'Edit controls restored',
      'info',
    );
  };

  const persistSession = (tripCode: string, memberId: string, unlockedList: string[]) => {
    saveActiveSession({
      tripCode,
      activeMemberId: memberId,
      pinUnlockedCodes: unlockedList,
    });
  };

  const handleUpdateTrip = (
    updater: (prev: SharedTrip) => SharedTrip,
    toastMsg?: string,
    options?: { skipLog?: boolean },
  ) => {
    const actor = {
      id: activeMemberId ?? 'guest',
      name: activeMemberName,
    };
    setActiveTrip((prev) => {
      const nowIso = new Date().toISOString();
      const updatedBody = updater(prev);
      const next: SharedTrip = {
        ...updatedBody,
        editLog: options?.skipLog
          ? updatedBody.editLog
          : appendEditLog(prev, updatedBody, actor, toastMsg, nowIso),
        updatedAt: nowIso,
      };
      void saveSharedTrip(next)
        .then(() => listSharedTrips().then(setSavedTrips))
        .then(() => pushOrQueueSharedTrip(next))
        .then((res) => {
          if (res.status === 'synced') {
            setLastSyncedAt(new Date().toISOString());
            setLastSyncError(null);
          } else if (res.status === 'queued' && res.errorMessage) {
            setLastSyncError(res.errorMessage);
            console.error('[GASKEUN Sync] Cloud push failed:', res.errorMessage);
            showToast(`Cloud save failed: ${res.errorMessage}`, 'error');
          }
        });
      return next;
    });
    if (toastMsg) showToast(toastMsg, 'success');
  };

  const handleClearEditLog = () => {
    if (!isHost) return;
    triggerFeedback('warning');
    handleUpdateTrip(
      (prev) => ({
        ...prev,
        editLog: [],
      }),
      'Activity log cleared',
      { skipLog: true },
    );
  };

  const requestUnlockPin = (onSuccess?: () => void) => {
    setPendingAfterUnlock(() => onSuccess ?? null);
    setPinSheetOpen(true);
  };

  const openTripSettingsGated = () => {
    if (canEdit) {
      setSettingsOpen(true);
    } else {
      requestUnlockPin(() => setSettingsOpen(true));
    }
  };

  const handleJoinCode = async (code: string): Promise<boolean> => {
    // Try Supabase pull first (if configured & online) -> caches to Layer 1 only!
    const remote = await fetchRemoteTripByCode(code);
    const found =
      remote ??
      (await getSharedTripByCode(code)) ??
      savedTrips.find((t) => t.code.toUpperCase() === code.toUpperCase());
    if (!found) return false;

    if (remote) {
      setLastSyncedAt(new Date().toISOString());
      const refreshed = await listSharedTrips();
      setSavedTrips(refreshed);
    }

    const local = await getLocalPersonal(found.id);
    setJoinedTripCodes(recordJoinedTripCode(found.code));
    setActiveTrip(found);
    setLocalData(local);
    setActiveRouteTarget(null);
    setActiveTab('home');
    setRoute('who');
    return true;
  };

  const handleSelectProfile = async (memberId: string) => {
    const nextLocal = await setActiveMemberLocal(activeTrip.id, memberId);
    setLocalData(nextLocal);
    persistSession(activeTrip.code, memberId, pinUnlockedCodes);
    setRoute('hub');
    const name =
      memberId === 'guest'
        ? 'Guest'
        : activeTrip.members.find((m) => m.id === memberId)?.name ?? 'Guest';
    showToast(`Welcome, ${name}`, 'success');
  };

  const handleUpdateMemberAvatar = (memberId: string, avatarDataUrl: string) => {
    handleUpdateTrip(
      (prev) => ({
        ...prev,
        members: prev.members.map((m) => (m.id === memberId ? { ...m, avatarDataUrl } : m)),
      }),
      'Profile photo updated',
    );
  };

  const handleSetMemberPasscode = (
    memberId: string,
    passcode: string | undefined,
    toastMsg?: string,
  ) => {
    handleUpdateTrip(
      (prev) => setMemberPasscodeInTrip(prev, memberId, passcode),
      toastMsg,
    );
  };

  const handleUpdateCrewEditPin = (newPin: string) => {
    const check = setCrewEditPinByHost(activeTrip, activeMemberId, newPin);
    if (!check.ok) {
      showToast(check.error || 'Could not update Crew Editing PIN', 'error');
      return;
    }
    handleUpdateTrip(
      (prev) => {
        const res = setCrewEditPinByHost(prev, activeMemberId, newPin);
        return res.ok ? res.trip : prev;
      },
      'Crew Editing PIN updated',
    );
  };

  const handleToggleEditorMember = (memberId: string) => {
    handleUpdateTrip((prev) => {
      const hostIds = prev.members.filter((m) => m.isCreator).map((m) => m.id);
      const current = new Set([...(prev.editorMemberIds ?? []), ...hostIds]);
      if (hostIds.includes(memberId)) return prev;
      if (current.has(memberId)) current.delete(memberId);
      else current.add(memberId);
      return { ...prev, editorMemberIds: Array.from(current) };
    }, 'Editor permissions updated');
  };

  const handleLeaveTrip = () => {
    clearActiveSession();
    pwaHistory.clearAll();
    setActiveRouteTarget(null);
    setRoute('landing');
    showToast('Returned to Landing Gate', 'info');
  };

  const handleTripCreated = async (newTrip: SharedTrip) => {
    await saveSharedTrip(newTrip);
    void pushOrQueueSharedTrip(newTrip).then((res) => {
      if (res.status === 'synced') {
        setLastSyncedAt(new Date().toISOString());
        setLastSyncError(null);
      } else if (res.status === 'queued' && res.errorMessage) {
        setLastSyncError(res.errorMessage);
        showToast(`Cloud save failed: ${res.errorMessage}`, 'error');
      }
    });
    const all = await listSharedTrips();
    setSavedTrips(all);
    setJoinedTripCodes(recordJoinedTripCode(newTrip.code));
    const creatorId = newTrip.members[0]?.id ?? 'guest';
    const local = await setActiveMemberLocal(newTrip.id, creatorId);
    const nextUnlocked = Array.from(new Set([...pinUnlockedCodes, newTrip.code.toUpperCase()]));
    setActiveTrip(newTrip);
    setLocalData(local);
    setPinUnlockedCodes(nextUnlocked);
    persistSession(newTrip.code, creatorId, nextUnlocked);
  };

  const handleCopyText = (text: string, label: string) => {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text);
    }
    showToast(`${label} copied`, 'success');
  };

  const handleCopyInvite = (url?: string) => {
    const target = url ?? buildInviteUrl(activeTrip.code);
    handleCopyText(target, `Invite link for ${activeTrip.code}`);
  };

  const handleUploadCover = async (cropped: CroppedImageResult) => {
    if (!canEdit) {
      showToast('Unlock with Crew PIN to change the cover photo', 'info');
      requestUnlockPin();
      return;
    }

    try {
      // Optimistically show the cropped photo right away so mobile feels instant
      setActiveTrip((prev) => ({
        ...prev,
        coverPhotoUrl: cropped.dataUrl,
        heroCoverUrl: cropped.dataUrl,
      }));

      const uploaded = await uploadSharedImage(cropped, {
        kind: 'hero',
        trip: activeTrip,
        caption: activeTrip.title,
        uploaderName: activeMemberName,
        fileName: 'hero-cover.jpg',
      });
      const finalUrl = uploaded.url || cropped.dataUrl;
      const msg =
        uploaded.source === 'supabase'
          ? 'Shared cover updated for the crew'
          : uploaded.reason
            ? `Saved locally (${uploaded.reason})`
            : 'Shared cover saved locally';

      handleUpdateTrip(
        (prev) => ({
          ...prev,
          coverPhotoUrl: finalUrl,
          heroCoverUrl: finalUrl,
        }),
        msg,
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Could not process that photo';
      console.warn('[GASKEUN handleUploadCover] Failed:', err);
      showToast(`Cover upload failed (${detail})`, 'error');
    }
  };

  const handleUpsertPersonalTx = async (tx: Transaction, isNew: boolean) => {
    const nextLocal = await upsertPersonalTransaction(activeTrip.id, tx);
    setLocalData(nextLocal);
    showToast(isNew ? 'Personal expense saved locally' : 'Personal expense updated', 'success');
  };

  const handleDeletePersonalTx = async (txId: string) => {
    const current = localData ?? (await getLocalPersonal(activeTrip.id));
    const nextLocal: LocalPersonalData = {
      ...current,
      personalTransactions: current.personalTransactions.filter((t) => t.id !== txId),
    };
    await saveLocalPersonal(nextLocal);
    setLocalData(nextLocal);
    showToast('Personal expense deleted', 'info');
  };

  const handleUpdatePersonalPrep = async (tasks: PrepTask[], toastMsg?: string) => {
    const nextLocal = await savePersonalPrep(activeTrip.id, tasks);
    setLocalData(nextLocal);
    if (toastMsg) showToast(toastMsg, 'success');
  };

  const handleSaveLocalAlbumPhotos = async (photos: AlbumPhoto[], toastMsg?: string) => {
    const nextLocal = await saveLocalAlbumPhotos(activeTrip.id, photos);
    setLocalData(nextLocal);
    if (toastMsg) showToast(toastMsg, 'success');
  };

  const handleExportExcel = async () => {
    try {
      const { exportTripToExcel } = await import('./services/excelExporter');
      await exportTripToExcel(activeTrip);
      showToast(`Exported gaskeun-${activeTrip.code.toLowerCase()}.xlsx`, 'success');
    } catch {
      showToast('Could not export Excel workbook', 'error');
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(activeTrip, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gaskeun-${activeTrip.code.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${activeTrip.code} shared backup`, 'success');
  };

  const handleImportJsonFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as SharedTrip;
      if (!parsed.id || !parsed.code || !Array.isArray(parsed.members)) {
        showToast('Invalid trip backup file', 'error');
        return;
      }
      setPendingImportTrip(parsed);
    } catch {
      showToast('Could not read JSON file', 'error');
    }
  };

  const confirmImportJson = async () => {
    if (!pendingImportTrip) return;
    await saveSharedTrip(pendingImportTrip);
    const all = await listSharedTrips();
    setSavedTrips(all);
    setActiveTrip(pendingImportTrip);
    setPendingImportTrip(null);
    showToast('Shared trip updated — personal data stayed untouched', 'success');
  };

  const visibleSavedTrips = useMemo(
    () => filterJoinedTrips(savedTrips, joinedTripCodes),
    [savedTrips, joinedTripCodes],
  );

  const showDock = route === 'hub' && !activeRouteTarget;
  const isDockVisible = hasRevealedDock || phase === 'on-trip' || activeTab !== 'home';
  const dockHiddenForHero =
    route === 'hub' &&
    !activeRouteTarget &&
    activeTab === 'home' &&
    phase === 'pre-trip' &&
    !isDockVisible;

  return (
    <OverlayProvider>
      <div className="app-viewport">
        <div className="ambient-mesh" aria-hidden="true">
          <div className="ambient-blob ambient-blob--matcha" />
          <div className="ambient-blob ambient-blob--sunlight" />
          <div className="ambient-blob ambient-blob--mint" />
        </div>

        <main
          ref={shellRef}
          className="app-shell"
          style={!showDock ? { paddingBottom: 'calc(var(--safe-bottom) + 20px)' } : undefined}
        >
          {route === 'landing' && (
            <LandingGateScreen
              savedTrips={visibleSavedTrips}
              onJoinCode={handleJoinCode}
              onOpenCreate={() => setRoute('create')}
            />
          )}

          {route === 'who' && (
            <WhoAreYouScreen
              trip={activeTrip}
              selectedMemberId={activeMemberId}
              canEdit={canEdit}
              onSelectProfile={handleSelectProfile}
              onSetMemberPasscode={handleSetMemberPasscode}
              onRequestUnlockPin={() => requestUnlockPin()}
              onBack={() => setRoute('landing')}
            />
          )}

          <Suspense
            fallback={
              <div className="route-suspense-shell" aria-busy="true" aria-label="Loading view">
                <div className="route-suspense-pill" />
              </div>
            }
          >
            {route === 'create' && (
              <CreateTripScreen
                onCreated={handleTripCreated}
                onOpenTrip={(trip) => {
                  setActiveTrip(trip);
                  setActiveTab('home');
                  setRoute('hub');
                }}
                onCopyInvite={(url) => handleCopyInvite(url)}
                onBack={() => setRoute('landing')}
              />
            )}

            {route === 'hub' && activeRouteTarget && (
              <RouteMapView
                target={activeRouteTarget}
                onBack={() => setActiveRouteTarget(null)}
                onSelectPlanItem={(stop) => {
                  setActiveRouteTarget((prev) =>
                    prev
                      ? {
                          ...prev,
                          title: stop.title,
                          subtitle: stop.locationHint,
                          address: stop.address,
                          parkingNote: stop.parkingNote,
                          mapsUrl: stop.mapsUrl,
                          coords: stop.coords,
                          focusedItemId: stop.id,
                        }
                      : null,
                  );
                }}
              />
            )}

            {route === 'hub' && !activeRouteTarget && activeTab === 'plan' && (
              <PlanScreen
                trip={activeTrip}
                homePhase={phase}
                activeMemberId={activeMemberId}
                activeMemberName={activeMemberName}
                canEdit={canEdit}
                onRequestUnlockPin={() => requestUnlockPin()}
                onOpenRoute={(target) => setActiveRouteTarget(target)}
                onUpdateTrip={handleUpdateTrip}
                onNotify={showToast}
              />
            )}

            {route === 'hub' && !activeRouteTarget && activeTab === 'wallet' && (
              <WalletScreen
                trip={activeTrip}
                personalTransactions={localData?.personalTransactions ?? []}
                canEdit={canEdit}
                viewOnlyMode={isViewOnlyActive}
                onOpenMenu={() => setMenuOpen(true)}
                onRequestUnlockPin={() => requestUnlockPin()}
                onUpdateTrip={handleUpdateTrip}
                onUpsertPersonalTx={(tx, isNew) => void handleUpsertPersonalTx(tx, isNew)}
                onDeletePersonalTx={(id) => void handleDeletePersonalTx(id)}
              />
            )}

            {route === 'hub' && !activeRouteTarget && activeTab === 'album' && (
              <AlbumScreen
                trip={activeTrip}
                localPhotos={localData?.localAlbumPhotos ?? []}
                cachedDrivePhotos={driveAlbumPhotos}
                activeMemberId={activeMemberId}
                activeMemberName={activeMemberName}
                canEdit={canEdit}
                viewOnlyMode={isViewOnlyActive}
                onDrivePhotosSync={handleDrivePhotosSync}
                onSaveLocalPhotos={(photos, msg) => void handleSaveLocalAlbumPhotos(photos, msg)}
                onUpdateTrip={handleUpdateTrip}
                onOpenSettings={openTripSettingsGated}
                onNotify={showToast}
              />
            )}

            {route === 'hub' && !activeRouteTarget && activeTab === 'prep' && (
              <PrepScreen
                trip={activeTrip}
                personalPrep={localData?.personalPrep ?? []}
                canEdit={canEdit}
                viewOnlyMode={isViewOnlyActive}
                onOpenMenu={() => setMenuOpen(true)}
                onRequestUnlockPin={() => requestUnlockPin()}
                onUpdatePersonalPrep={(tasks, msg) => void handleUpdatePersonalPrep(tasks, msg)}
                onUpdateGroupPrep={(tasks, msg) =>
                  handleUpdateTrip((prev) => ({ ...prev, groupPrep: tasks }), msg)
                }
              />
            )}
          </Suspense>

          {route === 'hub' && !activeRouteTarget && activeTab === 'home' && (
            <HomeScreen
              trip={activeTrip}
              phase={phase}
              coverUrl={effectiveCoverUrl}
              hasCoverPhoto={hasCustomCoverPhoto}
              albumPhotos={homeAlbumPhotos}
              activeMemberId={activeMemberId}
              activeMember={activeMember}
              activeMemberName={activeMemberName}
              onlineMembers={onlineMembers}
              canEdit={canEdit}
              viewOnlyMode={isViewOnlyActive}
              onOpenMenu={() => setMenuOpen(true)}
              onOpenTripSettings={openTripSettingsGated}
              onSwitchTrip={handleLeaveTrip}
              onNavigateTab={handleNavigateTab}
              isDockVisible={isDockVisible}
              onRevealDock={() => setHasRevealedDock(true)}
              onUploadCover={(cropped) => void handleUploadCover(cropped)}
              onRequestUnlockPin={() => requestUnlockPin()}
              onNotify={showToast}
              onOpenRoute={(target) => setActiveRouteTarget(target)}
              onUpdateTrip={handleUpdateTrip}
            />
          )}
        </main>

        {showDock && (
          <ExpandingGlassDock
            activeTab={activeTab}
            hidden={dockHiddenForHero}
            onChange={handleNavigateTab}
          />
        )}

        <TripMenuSheet
          open={menuOpen}
          trip={activeTrip}
          phase={phase}
          canEdit={canEdit}
          hasEditRights={rawCanEdit}
          viewOnlyMode={isViewOnlyActive}
          isHost={isHost}
          pinUnlocked={pinUnlocked}
          roleLabel={roleLabel}
          activeMember={activeMember}
          activeMemberName={activeMemberName}
          lastSyncedAt={lastSyncedAt}
          lastSyncError={lastSyncError}
          isSyncingCloud={isSyncingCloud}
          onForceSync={() =>
            void syncActiveTripFromCloud(activeTrip.code, activeTrip, {
              force: true,
              notify: true,
            })
          }
          onToggleViewOnlyMode={handleToggleViewOnlyMode}
          onPhaseChange={(next) => {
            triggerFeedback('tap');
            setPhase(next);
            showToast(
              next === 'pre-trip' ? 'Switched to Countdown View' : 'Switched to Live Trail View',
              'info',
            );
          }}
          onUpdateActiveAvatar={(avatarDataUrl) => {
            if (activeMember) {
              handleUpdateMemberAvatar(activeMember.id, avatarDataUrl);
            }
          }}
          onSetMemberPasscode={handleSetMemberPasscode}
          onUpdateCrewEditPin={handleUpdateCrewEditPin}
          onToggleEditorMember={handleToggleEditorMember}
          onClearEditLog={handleClearEditLog}
          onRequestUnlock={() => requestUnlockPin()}
          onLockEditing={() => {
            const codeUpper = activeTrip.code.toUpperCase();
            const nextUnlocked = pinUnlockedCodes.filter((c) => c !== codeUpper);
            setPinUnlockedCodes(nextUnlocked);
            if (activeMemberId) {
              persistSession(activeTrip.code, activeMemberId, nextUnlocked);
            }
            showToast('Crew editing locked', 'info');
          }}
          onOpenTripSettings={openTripSettingsGated}
          onCopyInvite={() => handleCopyInvite()}
          onSwitchProfile={() => setRoute('who')}
          onLeaveTrip={handleLeaveTrip}
          onExportExcel={() => void handleExportExcel()}
          onExportJson={handleExportJson}
          onImportJson={handleImportJsonFile}
          onClose={() => setMenuOpen(false)}
        />

        {settingsOpen && (
          <Suspense fallback={null}>
            <TripSettingsSheet
              key={`ts-${activeTrip.id}`}
              open={settingsOpen}
              trip={activeTrip}
              onSave={(patch) => {
                handleUpdateTrip(
                  (prev) => ({
                    ...prev,
                    title: patch.title,
                    subtitle: patch.subtitle,
                    departureAt: patch.departureAt,
                    albumUrl: patch.gdriveFolderUrl || prev.albumUrl,
                    gdriveFolderUrl: patch.gdriveFolderUrl,
                    gdriveScriptUrl: patch.gdriveScriptUrl,
                    financeConfig: {
                      ...prev.financeConfig,
                      poolTargetPerPerson: patch.poolTargetPerPerson,
                      fundraiseTarget: patch.fundraiseTarget,
                      minimumDpPerPerson: patch.minimumDpPerPerson,
                    },
                  }),
                  'Trip settings updated',
                );
              }}
              onCopyText={handleCopyText}
              onClose={() => setSettingsOpen(false)}
            />
          </Suspense>
        )}

        <PinUnlockSheet
          open={pinSheetOpen}
          trip={activeTrip}
          onUnlocked={() => {
            const codeUpper = activeTrip.code.toUpperCase();
            const nextUnlocked = Array.from(new Set([...pinUnlockedCodes, codeUpper]));
            setPinUnlockedCodes(nextUnlocked);
            if (activeMemberId) {
              persistSession(activeTrip.code, activeMemberId, nextUnlocked);
            }
            setPinSheetOpen(false);
            showToast('Crew editing unlocked', 'success');
            if (pendingAfterUnlock) {
              const cb = pendingAfterUnlock;
              setPendingAfterUnlock(null);
              cb();
            }
          }}
          onClose={() => {
            setPinSheetOpen(false);
            setPendingAfterUnlock(null);
          }}
        />

        <ConfirmDialog
          open={Boolean(pendingImportTrip)}
          title="Import shared trip backup?"
          description={
            pendingImportTrip
              ? `Update "${pendingImportTrip.title}" (${pendingImportTrip.code})? Your personal wallet and private packing list stay untouched.`
              : ''
          }
          confirmLabel="Import Update"
          onCancel={() => setPendingImportTrip(null)}
          onConfirm={() => void confirmImportJson()}
        />

        <Toast
          open={toast.open}
          message={toast.message}
          tone={toast.tone}
          onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        />
      </div>
    </OverlayProvider>
  );
}
