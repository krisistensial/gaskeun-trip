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
import { createPortal } from 'react-dom';
import seedData from './data/seed-solo-jogja-2027.json';
import { Avatar, ConfirmDialog, Toast, type ToastTone } from './components/atoms';
import { ExpandingGlassDock } from './components/organisms/ExpandingGlassDock';
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
import {
  countUnreadMessages,
  createChatPoll,
  createStickerChatMessage,
  createTextChatMessage,
  extractMentionedMemberIds,
  loadChatLastRead,
  mergeChatMessages,
  mergeChatPolls,
  mergeChatReadReceipts,
  saveChatLastRead,
  toggleMessageReaction,
  togglePollVote,
} from './services/chat';
import {
  appendClearedChatIds,
  fetchRemoteChatMessages,
  loadClearedChatIds,
  loadLocalChatCache,
  markMultipleRemoteChatDeleted,
  patchRemoteChatReaction,
  saveLocalChatCache,
  subscribeToCrewChat,
  upsertRemoteChatMessage,
  type CrewChatChannelController,
} from './services/chatSync';
import {
  buildCrewRadarTarget,
  getConvoyStatusInfo,
  mergeCrewLivePins,
  subscribeToCrewRadar,
  type CrewRadarController,
} from './services/crewRadar';
import { triggerFeedback } from './services/feedback';
import {
  formatChatNotificationCopy,
  formatTripUpdateNotificationCopy,
  shouldFireOsNotification,
  showDeviceNotification,
} from './services/notifications';
import { uploadSharedImage } from './services/mediaUploader';
import {
  getMemberEditScopes,
  isHostMember,
  setMemberPasscodeInTrip,
  toggleMemberEditScopeByHost,
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
  ChatMessage,
  ChatReadReceipt,
  ChatReplyPreview,
  DockTabId,
  LocalPersonalData,
  OnlinePresenceUser,
  PrepTask,
  RouteTarget,
  SharedTrip,
  Transaction,
  TripEditScope,
  ConvoyStatusKind,
  CrewLivePin,
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
const CrewChatScreen = lazy(() =>
  import('./features/chat/CrewChatScreen').then((m) => ({
    default: m.CrewChatScreen,
  })),
);
const TripRecapSheet = lazy(() =>
  import('./components/organisms/TripRecapSheet').then((m) => ({
    default: m.TripRecapSheet,
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
  const [liveRadarPins, setLiveRadarPins] = useState<Record<string, CrewLivePin>>({});
  const [driveAlbumPhotos, setDriveAlbumPhotos] = useState<AlbumPhoto[]>(() =>
    loadCachedDrivePhotos(pilotSeed.id),
  );

  const [activeTab, setActiveTab] = useState<DockTabId>('home');
  const [phase, setPhase] = useState<HomePhase>('pre-trip');
  const [hasRevealedDock, setHasRevealedDock] = useState<boolean>(false);
  const [viewOnlyMode, setViewOnlyMode] = useState<boolean>(() => loadViewOnlyMode());

  const [activeRouteTarget, setActiveRouteTarget] = useState<RouteTarget | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [clearedChatIds, setClearedChatIds] = useState<string[]>(() =>
    loadClearedChatIds(pilotSeed.code, null),
  );
  const [chatReadReceipts, setChatReadReceipts] = useState<
    Record<string, ChatReadReceipt>
  >({});
  const [chatLastReadIso, setChatLastReadIso] = useState<string>('');
  const [chatTypingMap, setChatTypingMap] = useState<
    Record<string, { memberName: string; expiresAt: number }>
  >({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingImportTrip, setPendingImportTrip] = useState<SharedTrip | null>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string; tone: ToastTone }>({
    open: false,
    message: '',
    tone: 'success',
  });
  const [chatHeadsUp, setChatHeadsUp] = useState<{
    id: string;
    senderName: string;
    body: string;
    initials: string;
    avatarDataUrl?: string;
    avatarBg: string;
    avatarColor: string;
  } | null>(null);

  const activeTripRef = useRef<SharedTrip>(activeTrip);
  activeTripRef.current = activeTrip;
  const activeTabRef = useRef<DockTabId>(activeTab);
  activeTabRef.current = activeTab;
  const chatOpenRef = useRef<boolean>(chatOpen);
  chatOpenRef.current = chatOpen;
  const chatChannelRef = useRef<CrewChatChannelController | null>(null);
  const radarChannelRef = useRef<CrewRadarController | null>(null);
  const useSharedTripChatFallbackRef = useRef(false);
  const lastAutoPullMsRef = useRef<number>(0);
  const lastTripNotifMsRef = useRef<number>(0);
  const shellRef = useRef<HTMLElement | null>(null);

  // Initialize root history marker (`depth: 0`) so Android/PWA hardware Back exits cleanly only at root
  useEffect(() => {
    pwaHistory.initRoot();
  }, []);

  // Register full-screen sub-views (`RouteMapView`, `CrewChatScreen`, `CreateTripScreen`, `WhoAreYouScreen`) on the back stack
  useBackHandler(
    route === 'hub' && Boolean(activeRouteTarget),
    () => setActiveRouteTarget(null),
    'view',
    'route-map',
  );
  useBackHandler(
    route === 'hub' && !activeRouteTarget && chatOpen,
    () => setChatOpen(false),
    'view',
    'crew-chat',
  );
  useBackHandler(route === 'create', () => setRoute('landing'), 'view', 'create-trip');
  useBackHandler(route === 'who', () => setRoute('landing'), 'view', 'who-are-you');

  // Clear tab history entries & chat view whenever leaving the main Hub so Landing/Gate back stack stays clean
  useEffect(() => {
    if (route !== 'hub') {
      pwaHistory.clearByKind('tab');
      setChatOpen(false);
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
                pinUnlockedCodes: [],
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

    const isHomeHeroScreen =
      route === 'hub' && !activeRouteTarget && !chatOpen && activeTab === 'home';

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
  }, [route, activeTab, activeRouteTarget, chatOpen]);

  // Realtime Supabase subscription for active trip (`postgres_changes` on `shared_trips`)
  useEffect(() => {
    if (route !== 'hub' && route !== 'who') return;
    const code = activeTrip.code;
    if (!code) return;

    const unsubscribe = subscribeToSharedTrip(code, (remoteTrip) => {
      const current = activeTripRef.current;
      if (!shouldApplyRemoteTrip(current, remoteTrip)) return;
      const prevTopLogId = current.editLog?.[0]?.id;
      const nextTopLog = remoteTrip.editLog?.[0];
      void applyRemoteSharedTrip(remoteTrip).then((persisted) => {
        setActiveTrip(persisted);
        setLastSyncedAt(new Date().toISOString());
        void listSharedTrips().then(setSavedTrips);
        if (
          nextTopLog &&
          nextTopLog.id !== prevTopLogId &&
          nextTopLog.actorId !== activeMemberId &&
          typeof document !== 'undefined' &&
          shouldFireOsNotification(document.visibilityState === 'hidden') &&
          Date.now() - lastTripNotifMsRef.current >= 15_000
        ) {
          lastTripNotifMsRef.current = Date.now();
          const copy = formatTripUpdateNotificationCopy({
            tripTitle: remoteTrip.title,
            actorName: nextTopLog.actorName,
            action: nextTopLog.action,
          });
          void showDeviceNotification({
            title: copy.title,
            body: copy.body,
            tag: `trip-${remoteTrip.code}`,
          });
        }
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

  // Seed Crew Chat & Read Receipts from local cache + SharedTrip whenever trip/member changes
  useEffect(() => {
    if (!activeTrip.code) {
      setChatMessages([]);
      setClearedChatIds([]);
      setChatReadReceipts({});
      setChatLastReadIso('');
      return;
    }
    setClearedChatIds(loadClearedChatIds(activeTrip.code, activeMemberId));
    setChatLastReadIso(loadChatLastRead(activeTrip.code, activeMemberId ?? 'guest'));
    setChatMessages((prev) => {
      const cached = loadLocalChatCache(activeTrip.code);
      const shared = activeTrip.chatMessages ?? [];
      return mergeChatMessages(prev.filter((m) => m.tripCode === activeTrip.code), [
        ...cached,
        ...shared,
      ]);
    });
    setChatReadReceipts((prev) =>
      mergeChatReadReceipts(prev, activeTrip.chatReadReceipts),
    );
  }, [activeTrip.code, activeTrip.chatMessages, activeTrip.chatReadReceipts, activeMemberId]);

  const notifyIncomingChat = useCallback(
    (incoming: ChatMessage, currentCode: string) => {
      const msgAgeMs = Date.now() - Date.parse(incoming.createdAt);
      const isHidden =
        typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (
        incoming.deleted ||
        incoming.senderId === (activeMemberId ?? 'guest') ||
        !Number.isFinite(msgAgeMs) ||
        msgAgeMs > 180_000
      ) {
        return;
      }

      const tripSnapshot = activeTripRef.current;
      const isMentioned = Boolean(
        activeMemberId &&
          activeMemberId !== 'guest' &&
          incoming.kind === 'text' &&
          extractMentionedMemberIds(incoming.text, tripSnapshot.members).includes(activeMemberId),
      );
      const copy = formatChatNotificationCopy({
        tripTitle: tripSnapshot.title || currentCode,
        senderName: incoming.senderName,
        kind: incoming.kind,
        text: incoming.text,
        unreadFromOthers: Math.max(1, unreadChatCountRef.current + 1),
        isMentioned,
      });

      // Only alert OS tray when backgrounded/hidden — foreground uses the single in-app banner
      if (shouldFireOsNotification(isHidden)) {
        void showDeviceNotification({
          title: copy.title,
          body: copy.body,
          tag: `chat-${currentCode}`,
          renotify: isMentioned,
        });
      }

      if (!chatOpenRef.current) {
        const sender = tripSnapshot.members.find(
          (m) => m.id === incoming.senderId,
        );
        triggerFeedback(isMentioned ? 'complete' : 'success');
        setChatHeadsUp({
          id: incoming.id,
          senderName: incoming.senderName,
          body: isMentioned ? `Mentioned you: ${incoming.text}` : incoming.kind === 'sticker' ? 'Sent a sticker ✨' : incoming.text,
          initials: sender?.initials ?? incoming.senderName.slice(0, 2).toUpperCase(),
          avatarDataUrl: sender?.avatarDataUrl,
          avatarBg: sender?.avatarBg ?? '#E3EDE6',
          avatarColor: sender?.avatarColor ?? '#2D4A42',
        });
      }
    },
    [activeMemberId],
  );

  useEffect(() => {
    if (!chatHeadsUp) return;
    const t = window.setTimeout(() => setChatHeadsUp(null), 4400);
    return () => window.clearTimeout(t);
  }, [chatHeadsUp]);

  // Live Supabase Realtime Crew Chat (`trip_messages` + Broadcast channel for <50ms typing/reactions/stickers)
  useEffect(() => {
    if (route !== 'hub' || !activeTrip.code) {
      chatChannelRef.current = null;
      return;
    }
    const code = activeTrip.code;
    let alive = true;

    void fetchRemoteChatMessages(code).then((res) => {
      if (!alive) return;
      if (res.ok) {
        useSharedTripChatFallbackRef.current = false;
        setChatMessages((prev) => {
          const prevIds = new Set(prev.map((m) => m.id));
          const merged = mergeChatMessages(prev, res.messages);
          saveLocalChatCache(code, merged);
          const freshIncoming = res.messages.filter((m) => !prevIds.has(m.id));
          const newest = freshIncoming[freshIncoming.length - 1];
          if (newest) notifyIncomingChat(newest, code);
          return merged;
        });
      } else if (res.tableMissing) {
        useSharedTripChatFallbackRef.current = true;
      }
    });

    const sender = activeMemberId
      ? { memberId: activeMemberId, memberName: activeMemberName }
      : null;

    const controller = subscribeToCrewChat(code, sender, {
      onMessage: (incoming) => {
        setChatMessages((prev) => {
          const alreadyKnown = prev.some((m) => m.id === incoming.id);
          const next = mergeChatMessages(prev, [incoming]);
          saveLocalChatCache(code, next);
          if (!alreadyKnown) {
            notifyIncomingChat(incoming, code);
          }
          return next;
        });
      },
      onReaction: ({ id, reactions }) => {
        setChatMessages((prev) => {
          const next = prev.map((m) => (m.id === id ? { ...m, reactions } : m));
          saveLocalChatCache(code, next);
          return next;
        });
      },
      onDelete: ({ ids }) => {
        const idSet = new Set(ids);
        setChatMessages((prev) => {
          const next = prev.map((m) =>
            idSet.has(m.id) ? { ...m, deleted: true, text: '', reactions: {} } : m,
          );
          saveLocalChatCache(code, next);
          return next;
        });
      },
      onTyping: ({ memberId, memberName, isTyping }) => {
        setChatTypingMap((prev) => {
          const next = { ...prev };
          if (!isTyping) {
            delete next[memberId];
          } else {
            next[memberId] = { memberName, expiresAt: Date.now() + 3400 };
          }
          return next;
        });
      },
      onSeen: (receipt) => {
        setChatReadReceipts((prev) =>
          mergeChatReadReceipts(prev, { [receipt.memberId]: receipt }),
        );
      },
      onPoll: (incomingPoll) => {
        setActiveTrip((prev) => ({
          ...prev,
          chatPolls: mergeChatPolls(prev.chatPolls ?? [], [incomingPoll]),
        }));
      },
      onPin: ({ messageId }) => {
        setActiveTrip((prev) => ({
          ...prev,
          pinnedChatMessageId: messageId ?? undefined,
        }));
      },
    });
    chatChannelRef.current = controller;

    const radarController = subscribeToCrewRadar(code, (incomingPin) => {
      setLiveRadarPins((prev) =>
        mergeCrewLivePins(prev, { [incomingPin.memberId]: incomingPin }),
      );
    });
    radarChannelRef.current = radarController;

    return () => {
      alive = false;
      controller.unsubscribe();
      radarController.unsubscribe();
      if (chatChannelRef.current === controller) {
        chatChannelRef.current = null;
      }
      if (radarChannelRef.current === radarController) {
        radarChannelRef.current = null;
      }
    };
  }, [route, activeTrip.code, activeMemberId, activeMemberName]);

  // Prune stale typing indicators
  useEffect(() => {
    const entries = Object.entries(chatTypingMap);
    if (entries.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setChatTypingMap((prev) => {
        let changed = false;
        const next: typeof prev = {};
        for (const [id, info] of Object.entries(prev)) {
          if (info.expiresAt > now) {
            next[id] = info;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [chatTypingMap]);

  const typingUsers = useMemo(
    () =>
      Object.entries(chatTypingMap).map(([memberId, info]) => ({
        memberId,
        memberName: info.memberName,
      })),
    [chatTypingMap],
  );

  const clearedChatSet = useMemo(() => new Set(clearedChatIds), [clearedChatIds]);

  const visibleChatMessages = useMemo(
    () => chatMessages.filter((m) => !clearedChatSet.has(m.id)),
    [chatMessages, clearedChatSet],
  );

  const unreadChatCount = useMemo(
    () =>
      chatOpen ? 0 : countUnreadMessages(visibleChatMessages, chatLastReadIso, activeMemberId),
    [chatOpen, visibleChatMessages, chatLastReadIso, activeMemberId],
  );
  const unreadChatCountRef = useRef<number>(unreadChatCount);
  unreadChatCountRef.current = unreadChatCount;

  const handleMarkChatRead = useCallback(() => {
    const code = activeTripRef.current.code;
    if (!code) return;
    const latestMsg = chatMessages[chatMessages.length - 1];
    const latestIso = latestMsg?.createdAt ?? new Date().toISOString();
    const memberKey = activeMemberId ?? 'guest';

    saveChatLastRead(code, memberKey, latestIso);
    setChatLastReadIso(latestIso);

    if (activeMemberId && activeMemberId !== 'guest' && latestMsg) {
      const prevReceipt = chatReadReceipts[activeMemberId];
      const shouldAdvance =
        !prevReceipt?.lastReadAt ||
        Date.parse(latestIso) > Date.parse(prevReceipt.lastReadAt);

      if (shouldAdvance) {
        const nextReceipt: ChatReadReceipt = {
          memberId: activeMemberId,
          lastReadAt: latestIso,
          lastMessageId: latestMsg.id,
        };
        setChatReadReceipts((prev) =>
          mergeChatReadReceipts(prev, { [activeMemberId]: nextReceipt }),
        );
        chatChannelRef.current?.sendSeenReceipt(nextReceipt);
        handleUpdateTrip(
          (prev) => ({
            ...prev,
            chatReadReceipts: mergeChatReadReceipts(prev.chatReadReceipts, {
              [activeMemberId]: nextReceipt,
            }),
          }),
          undefined,
          { skipLog: true },
        );
      }
    }
  }, [activeMemberId, chatMessages, chatReadReceipts]);

  const isHost = isHostMember(activeTrip, activeMemberId);
  const activeEditScopes = getMemberEditScopes(activeTrip, activeMemberId);
  const hasEditRights = activeEditScopes.length > 0;
  const isViewOnlyActive = hasEditRights && viewOnlyMode;
  const canEditCrew = !isViewOnlyActive && activeEditScopes.includes('crew');
  const canEditPlan = !isViewOnlyActive && activeEditScopes.includes('plan');
  const canEditWallet = !isViewOnlyActive && activeEditScopes.includes('wallet');
  const canEditPrep = !isViewOnlyActive && activeEditScopes.includes('prep');
  const canEdit = canEditCrew || canEditPlan || canEditWallet || canEditPrep;
  const canDeleteIdeas = !isViewOnlyActive && (isHost || activeEditScopes.includes('plan'));

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

  const persistSession = (tripCode: string, memberId: string) => {
    saveActiveSession({
      tripCode,
      activeMemberId: memberId,
      pinUnlockedCodes: [],
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

  const openTripSettingsGated = () => {
    if (isHost && !isViewOnlyActive) {
      setSettingsOpen(true);
    } else {
      showToast(
        isViewOnlyActive
          ? 'Turn off View-Only Mode to open Trip Settings'
          : 'Only the Trip Host can open Trip Settings',
        'info',
      );
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
    persistSession(activeTrip.code, memberId);
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

  const handleToggleMemberScope = (memberId: string, scope: TripEditScope) => {
    handleUpdateTrip((prev) => {
      const res = toggleMemberEditScopeByHost(prev, activeMemberId, memberId, scope);
      return res.ok ? res.trip : prev;
    }, 'Member permissions updated');
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
    setActiveTrip(newTrip);
    setLocalData(local);
    persistSession(newTrip.code, creatorId);
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
    if (!canEditCrew) {
      showToast('Ask your Trip Host for Crew edit access to update the cover', 'info');
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

  const persistChatMutation = (nextMessages: ChatMessage[], remoteWork: () => Promise<{ tableMissing?: boolean }>) => {
    saveLocalChatCache(activeTrip.code, nextMessages);
    void remoteWork().then((res) => {
      if (res?.tableMissing || useSharedTripChatFallbackRef.current) {
        useSharedTripChatFallbackRef.current = true;
        handleUpdateTrip(
          (prev) => ({ ...prev, chatMessages: nextMessages }),
          undefined,
          { skipLog: true },
        );
      }
    });
  };

  const handleSendChatText = (text: string, replyTo?: ChatReplyPreview) => {
    const msg = createTextChatMessage({
      tripCode: activeTrip.code,
      senderId: activeMemberId ?? 'guest',
      senderName: activeMemberName,
      text,
      replyTo,
    });
    if (!msg) return;
    const next = mergeChatMessages(chatMessages, [msg]);
    setChatMessages(next);
    chatChannelRef.current?.broadcastMessage(msg);
    persistChatMutation(next, () => upsertRemoteChatMessage(msg));
  };

  const handleSendChatSticker = (
    payload: { stickerId?: string; stickerUrl?: string; stickerCaption?: string },
    replyTo?: ChatReplyPreview,
  ) => {
    const msg = createStickerChatMessage({
      tripCode: activeTrip.code,
      senderId: activeMemberId ?? 'guest',
      senderName: activeMemberName,
      stickerId: payload.stickerId,
      stickerUrl: payload.stickerUrl,
      stickerCaption: payload.stickerCaption,
      replyTo,
    });
    if (!msg) return;
    const next = mergeChatMessages(chatMessages, [msg]);
    setChatMessages(next);
    chatChannelRef.current?.broadcastMessage(msg);
    persistChatMutation(next, () => upsertRemoteChatMessage(msg));
  };

  const handleToggleChatReaction = (messageId: string, emoji: string) => {
    const actorId = activeMemberId ?? 'guest';
    const current = chatMessages.find((m) => m.id === messageId);
    if (!current || current.deleted) return;
    const updatedMsg = toggleMessageReaction(current, emoji, actorId);
    const next = chatMessages.map((m) => (m.id === messageId ? updatedMsg : m));
    setChatMessages(next);
    chatChannelRef.current?.broadcastReaction(
      updatedMsg.id,
      updatedMsg.reactions,
    );
    persistChatMutation(next, () => patchRemoteChatReaction(updatedMsg));
  };

  const handleUnsendMultipleChatMessages = (messageIds: string[]) => {
    const actor = activeMemberId ?? 'guest';
    const eligibleIds = messageIds.filter((id) => {
      const m = chatMessages.find((item) => item.id === id);
      return Boolean(m && !m.deleted && (m.senderId === actor || isHost));
    });
    if (eligibleIds.length === 0) return;

    const idSet = new Set(eligibleIds);
    const next = chatMessages.map((m) =>
      idSet.has(m.id) ? { ...m, deleted: true, text: '', reactions: {} } : m,
    );
    setChatMessages(next);
    chatChannelRef.current?.broadcastDelete(eligibleIds);
    persistChatMutation(next, () =>
      markMultipleRemoteChatDeleted(eligibleIds, activeTrip.code),
    );
    showToast(
      eligibleIds.length === 1
        ? 'Message unsent'
        : `${eligibleIds.length} messages unsent`,
      'info',
    );
  };

  const handleUnsendChatMessage = (messageId: string) => {
    handleUnsendMultipleChatMessages([messageId]);
  };

  const handleDeleteSelectedChatMessages = (messageIds: string[]) => {
    if (messageIds.length === 0 || !activeTrip.code) return;
    const next = appendClearedChatIds(activeTrip.code, activeMemberId, messageIds);
    setClearedChatIds(next);
    showToast(
      messageIds.length === 1
        ? 'Message cleared from chat'
        : `${messageIds.length} messages cleared from chat`,
      'info',
    );
  };

  const handleCreateChatPoll = (payload: {
    question: string;
    options: string[];
    allowMultiple: boolean;
  }) => {
    const poll = createChatPoll({
      tripCode: activeTrip.code,
      question: payload.question,
      optionLabels: payload.options,
      allowMultiple: payload.allowMultiple,
      createdBy: activeMemberId ?? 'guest',
      createdByName: activeMemberName,
    });
    if (!poll) return;
    chatChannelRef.current?.broadcastPoll(poll);
    handleUpdateTrip(
      (prev) => ({
        ...prev,
        chatPolls: mergeChatPolls(prev.chatPolls ?? [], [poll]),
      }),
      'Poll posted',
      { skipLog: true },
    );
  };

  const handleVoteChatPoll = (pollId: string, optionId: string) => {
    const voterId = activeMemberId ?? 'guest';
    if (voterId === 'guest') {
      showToast('Select a crew profile to vote', 'info');
      return;
    }
    const existing = (activeTrip.chatPolls ?? []).find((p) => p.id === pollId);
    if (!existing) return;
    const nextPoll = togglePollVote(existing, optionId, voterId);
    chatChannelRef.current?.broadcastPoll(nextPoll);
    handleUpdateTrip(
      (prev) => ({
        ...prev,
        chatPolls: mergeChatPolls(prev.chatPolls ?? [], [nextPoll]),
      }),
      undefined,
      { skipLog: true },
    );
  };

  const handleToggleCloseChatPoll = (pollId: string) => {
    const existing = (activeTrip.chatPolls ?? []).find((p) => p.id === pollId);
    if (!existing) return;
    const nextPoll = { ...existing, closed: !existing.closed };
    chatChannelRef.current?.broadcastPoll(nextPoll);
    handleUpdateTrip(
      (prev) => ({
        ...prev,
        chatPolls: mergeChatPolls(prev.chatPolls ?? [], [nextPoll]),
      }),
      nextPoll.closed ? 'Poll closed' : 'Poll reopened',
      { skipLog: true },
    );
  };

  const handleTogglePinChatMessage = (messageId: string | null) => {
    chatChannelRef.current?.broadcastPin(messageId);
    handleUpdateTrip(
      (prev) => ({
        ...prev,
        pinnedChatMessageId: messageId ?? undefined,
      }),
      messageId ? 'Message pinned' : 'Pin removed',
      { skipLog: true },
    );
  };

  const mergedCrewPins = useMemo(
    () => mergeCrewLivePins(activeTrip.crewLivePins, liveRadarPins),
    [activeTrip.crewLivePins, liveRadarPins],
  );

  const handleUpsertCrewPin = (
    pin: CrewLivePin,
    options?: { syncLayer1?: boolean; toastMsg?: string },
  ) => {
    setLiveRadarPins((prev) => mergeCrewLivePins(prev, { [pin.memberId]: pin }));
    radarChannelRef.current?.broadcastPin(pin);
    if (options?.syncLayer1 !== false) {
      handleUpdateTrip(
        (prev) => ({
          ...prev,
          crewLivePins: mergeCrewLivePins(prev.crewLivePins, { [pin.memberId]: pin }),
        }),
        options?.toastMsg,
        { skipLog: true },
      );
    } else if (options?.toastMsg) {
      showToast(options.toastMsg, 'success');
    }
  };

  const handleClearOwnCrewPin = () => {
    if (!activeMemberId || activeMemberId === 'guest') return;
    const prevPin = mergedCrewPins[activeMemberId];
    const cleared: CrewLivePin = {
      memberId: activeMemberId,
      memberName: activeMemberName,
      convoyStatus: prevPin?.convoyStatus,
      isLiveStreaming: false,
      updatedAt: new Date().toISOString(),
    };
    setLiveRadarPins((prev) => ({ ...prev, [activeMemberId]: cleared }));
    radarChannelRef.current?.broadcastPin(cleared);
    handleUpdateTrip(
      (prev) => ({
        ...prev,
        crewLivePins: {
          ...(prev.crewLivePins ?? {}),
          [activeMemberId]: cleared,
        },
      }),
      'GPS pin cleared from map',
      { skipLog: true },
    );
  };

  const handleSetConvoyStatus = (nextStatus: ConvoyStatusKind) => {
    if (!activeMemberId || activeMemberId === 'guest') return;
    const curr = mergedCrewPins[activeMemberId];
    const toggled = curr?.convoyStatus === nextStatus ? undefined : nextStatus;
    handleUpsertCrewPin(
      {
        memberId: activeMemberId,
        memberName: activeMemberName,
        lat: curr?.lat,
        lng: curr?.lng,
        accuracyMeters: curr?.accuracyMeters,
        isLiveStreaming: curr?.isLiveStreaming,
        convoyStatus: toggled,
        updatedAt: new Date().toISOString(),
      },
      {
        syncLayer1: true,
        toastMsg: toggled
          ? `Status: ${getConvoyStatusInfo(toggled)?.label ?? toggled}`
          : 'Status cleared',
      },
    );
  };

  const handleChatTypingChange = useCallback((isTyping: boolean) => {
    chatChannelRef.current?.sendTypingPing(isTyping);
  }, []);

  const visibleSavedTrips = useMemo(
    () => filterJoinedTrips(savedTrips, joinedTripCodes),
    [savedTrips, joinedTripCodes],
  );

  const showDock = route === 'hub' && !activeRouteTarget && !chatOpen;
  const isDockVisible = hasRevealedDock || phase === 'on-trip' || activeTab !== 'home';
  const dockHiddenForHero =
    route === 'hub' &&
    !activeRouteTarget &&
    !chatOpen &&
    activeTab === 'home' &&
    phase === 'pre-trip' &&
    !isDockVisible;

  const isPlanBottomBleed =
    route === 'hub' && !activeRouteTarget && !chatOpen && activeTab === 'plan';

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
          style={
            isPlanBottomBleed
              ? { paddingBottom: 0 }
              : !showDock
                ? { paddingBottom: 'calc(var(--safe-bottom) + 20px)' }
                : undefined
          }
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
              onSelectProfile={handleSelectProfile}
              onSetMemberPasscode={handleSetMemberPasscode}
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
                trip={activeTrip}
                activeMemberId={activeMemberId}
                activeMemberName={activeMemberName}
                livePins={mergedCrewPins}
                onUpsertCrewPin={handleUpsertCrewPin}
                onClearOwnPin={handleClearOwnCrewPin}
                onNotify={showToast}
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

            {route === 'hub' && !activeRouteTarget && chatOpen && (
              <CrewChatScreen
                trip={activeTrip}
                messages={visibleChatMessages}
                polls={activeTrip.chatPolls ?? []}
                pinnedMessageId={activeTrip.pinnedChatMessageId}
                readReceipts={chatReadReceipts}
                activeMemberId={activeMemberId}
                activeMember={activeMember}
                activeMemberName={activeMemberName}
                isHost={isHost}
                onlineMembers={onlineMembers}
                typingUsers={typingUsers}
                onSendText={handleSendChatText}
                onSendSticker={handleSendChatSticker}
                onToggleReaction={handleToggleChatReaction}
                onUnsendMessage={handleUnsendChatMessage}
                onUnsendMultiple={handleUnsendMultipleChatMessages}
                onDeleteSelected={handleDeleteSelectedChatMessages}
                onCreatePoll={handleCreateChatPoll}
                onVotePoll={handleVoteChatPoll}
                onToggleClosePoll={handleToggleCloseChatPoll}
                onTogglePinMessage={handleTogglePinChatMessage}
                onTypingChange={handleChatTypingChange}
                onMarkRead={handleMarkChatRead}
                onNotify={showToast}
                onBack={() => setChatOpen(false)}
              />
            )}

            {route === 'hub' && !activeRouteTarget && activeTab === 'plan' && (
              <PlanScreen
                trip={activeTrip}
                homePhase={phase}
                activeMemberId={activeMemberId}
                activeMemberName={activeMemberName}
                canEdit={canEditPlan}
                canDeleteIdeas={canDeleteIdeas}
                onRequestUnlockPin={() =>
                  showToast('Ask your Trip Host for Plan edit access', 'info')
                }
                onOpenRoute={(target) => setActiveRouteTarget(target)}
                onUpdateTrip={handleUpdateTrip}
                onNotify={showToast}
              />
            )}

            {route === 'hub' && !activeRouteTarget && activeTab === 'wallet' && (
              <WalletScreen
                trip={activeTrip}
                personalTransactions={localData?.personalTransactions ?? []}
                canEdit={canEditWallet}
                isHost={isHost}
                viewOnlyMode={isViewOnlyActive}
                onOpenMenu={() => setMenuOpen(true)}
                onRequestUnlockPin={() =>
                  showToast('Ask your Trip Host for Wallet edit access', 'info')
                }
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
                canEdit={canEditPlan}
                canEditSettings={!isViewOnlyActive && isHost}
                canDeleteIdeas={canDeleteIdeas}
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
                canEdit={canEditPrep}
                viewOnlyMode={isViewOnlyActive}
                onOpenMenu={() => setMenuOpen(true)}
                onRequestUnlockPin={() =>
                  showToast('Ask your Trip Host for Group Prep edit access', 'info')
                }
                onUpdatePersonalPrep={(tasks, msg) => void handleUpdatePersonalPrep(tasks, msg)}
                onUpdateGroupPrep={(tasks, msg) =>
                  handleUpdateTrip((prev) => ({ ...prev, groupPrep: tasks }), msg)
                }
              />
            )}
          </Suspense>

          {route === 'hub' && !activeRouteTarget && !chatOpen && activeTab === 'home' && (
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
              radarPins={mergedCrewPins}
              unreadChatCount={unreadChatCount}
              canEdit={canEditCrew}
              viewOnlyMode={isViewOnlyActive}
              onOpenMenu={() => setMenuOpen(true)}
              onOpenChat={() => setChatOpen(true)}
              onOpenRadar={() => setActiveRouteTarget(buildCrewRadarTarget(activeTrip))}
              onOpenRecap={() => setRecapOpen(true)}
              onSetConvoyStatus={handleSetConvoyStatus}
              onOpenTripSettings={openTripSettingsGated}
              onSwitchTrip={handleLeaveTrip}
              onNavigateTab={handleNavigateTab}
              isDockVisible={isDockVisible}
              onRevealDock={() => setHasRevealedDock(true)}
              onUploadCover={(cropped) => void handleUploadCover(cropped)}
              onRequestUnlockPin={() =>
                showToast('Ask your Trip Host for Crew edit access', 'info')
              }
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
          hasEditRights={hasEditRights}
          viewOnlyMode={isViewOnlyActive}
          isHost={isHost}
          activeMember={activeMember}
          activeMemberName={activeMemberName}
          lastSyncedAt={lastSyncedAt}
          lastSyncError={lastSyncError}
          isSyncingCloud={isSyncingCloud}
          unreadChatCount={unreadChatCount}
          onForceSync={() =>
            void syncActiveTripFromCloud(activeTrip.code, activeTrip, {
              force: true,
              notify: true,
            })
          }
          onOpenChat={() => setChatOpen(true)}
          onOpenRecap={() => setRecapOpen(true)}
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
          onToggleMemberScope={handleToggleMemberScope}
          onClearEditLog={handleClearEditLog}
          onOpenTripSettings={openTripSettingsGated}
          onCopyInvite={() => handleCopyInvite()}
          onSwitchProfile={() => setRoute('who')}
          onLeaveTrip={handleLeaveTrip}
          onExportExcel={() => void handleExportExcel()}
          onExportJson={handleExportJson}
          onImportJson={handleImportJsonFile}
          onNotify={showToast}
          onClose={() => setMenuOpen(false)}
        />

        {recapOpen && (
          <Suspense fallback={null}>
            <TripRecapSheet
              open={recapOpen}
              trip={activeTrip}
              messages={visibleChatMessages}
              polls={activeTrip.chatPolls ?? []}
              albumPhotos={homeAlbumPhotos}
              onNotify={showToast}
              onClose={() => setRecapOpen(false)}
            />
          </Suspense>
        )}

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

        {chatHeadsUp &&
          typeof document !== 'undefined' &&
          createPortal(
            <button
              type="button"
              className="gk-chat-heads-up tactile"
              onClick={() => {
                triggerFeedback('tap');
                setChatHeadsUp(null);
                setChatOpen(true);
              }}
            >
              <Avatar
                initials={chatHeadsUp.initials}
                name={chatHeadsUp.senderName}
                src={chatHeadsUp.avatarDataUrl}
                size="sm"
                bg={chatHeadsUp.avatarBg}
                color={chatHeadsUp.avatarColor}
                variant="solid"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {chatHeadsUp.senderName}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {chatHeadsUp.body}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--brand-matcha)',
                  flexShrink: 0,
                }}
              >
                Reply
              </span>
            </button>,
            document.body,
          )}
      </div>
    </OverlayProvider>
  );
}
