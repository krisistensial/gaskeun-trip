import { useEffect, useMemo, useState } from 'react';
import seedData from './data/seed-solo-jogja-2027.json';
import { ConfirmDialog, Toast, type ToastTone } from './components/atoms';
import { ExpandingGlassDock } from './components/organisms/ExpandingGlassDock';
import { PinUnlockSheet } from './components/organisms/PinUnlockSheet';
import { TripMenuSheet, type HomePhase } from './components/organisms/TripMenuSheet';
import { TripSettingsSheet } from './components/organisms/TripSettingsSheet';
import { OverlayProvider } from './context/OverlayContext';
import { AlbumScreen } from './features/album/AlbumScreen';
import { CreateTripScreen } from './features/gate/CreateTripScreen';
import { LandingGateScreen } from './features/gate/LandingGateScreen';
import { WhoAreYouScreen } from './features/gate/WhoAreYouScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { PlanScreen } from './features/plan/PlanScreen';
import { RouteMapView } from './features/plan/RouteMapView';
import { PrepScreen } from './features/prep/PrepScreen';
import { WalletScreen } from './features/wallet/WalletScreen';
import {
  ensureSeedTrip,
  getLocalPersonal,
  getSharedTripByCode,
  listSharedTrips,
  saveLocalAlbumPhotos,
  saveLocalCoverBlob,
  saveLocalPersonal,
  savePersonalPrep,
  saveSharedTrip,
  setActiveMemberLocal,
  upsertPersonalTransaction,
} from './services/db';
import { exportTripToExcel } from './services/excelExporter';
import { uploadSharedImage } from './services/mediaUploader';
import { canEditTrip, getMemberRoleLabel, isHostMember } from './services/permissions';
import type { CroppedImageResult } from './services/photoCrop';
import { clearActiveSession, loadSavedSession, saveActiveSession } from './services/session';
import {
  fetchRemoteTripByCode,
  flushOfflineMutationQueue,
  pushOrQueueSharedTrip,
} from './services/supabaseSync';
import { buildInviteUrl } from './services/tripFactory';
import type {
  AlbumPhoto,
  DockTabId,
  LocalPersonalData,
  PrepTask,
  RouteTarget,
  SharedTrip,
  Transaction,
} from './types/trip';
import './App.css';

type AppRoute = 'landing' | 'who' | 'create' | 'hub';

const pilotSeed = seedData as unknown as SharedTrip;
const defaultCoverPath = `${import.meta.env.BASE_URL}assets/default-cover.svg`;

export default function App() {
  const [route, setRoute] = useState<AppRoute>('landing');
  const [savedTrips, setSavedTrips] = useState<SharedTrip[]>([pilotSeed]);
  const [activeTrip, setActiveTrip] = useState<SharedTrip>(pilotSeed);
  const [localData, setLocalData] = useState<LocalPersonalData | null>(null);

  const [activeTab, setActiveTab] = useState<DockTabId>('home');
  const [phase, setPhase] = useState<HomePhase>('pre-trip');
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

  const showToast = (message: string, tone: ToastTone = 'success') => {
    setToast({ open: true, message, tone });
  };

  // Bootstrap IndexedDB pilot seed + URL ?code= deep-link + Auto-Restore remembered session
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
          const matched =
            (await fetchRemoteTripByCode(queryCode)) ??
            (await getSharedTripByCode(queryCode));
          if (matched && alive) {
            const refreshed = await listSharedTrips();
            setSavedTrips(refreshed);
            const local = await getLocalPersonal(matched.id);
            setActiveTrip(matched);
            setLocalData(local);
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

        // Auto-remember last login session so reopening the PWA lands straight on Home
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
            setActiveTrip(restored);
            setLocalData(syncedLocal);
            setPinUnlockedCodes(saved.pinUnlockedCodes);
            setRoute('hub');
          }
        }
      } catch {
        // Fallback cleanly to in-memory pilot seed
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Automatically flush offline Layer-1 mutation queue when connectivity returns
  useEffect(() => {
    const handleOnline = () => {
      void flushOfflineMutationQueue().then((flushedCount) => {
        if (flushedCount > 0) {
          showToast('Synced', 'success');
        }
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Maintain object URL for Layer 2 local cover blob fallback
  const [localCoverUrl, setLocalCoverUrl] = useState<string>('');
  useEffect(() => {
    if (!localData?.coverBlob) {
      setLocalCoverUrl('');
      return;
    }
    const url = URL.createObjectURL(localData.coverBlob);
    setLocalCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [localData?.coverBlob]);

  // Prefer Layer-1 shared heroCoverUrl so the whole crew sees the same cover, with offline blob cache fallback
  const effectiveCoverUrl = activeTrip.heroCoverUrl || localCoverUrl || defaultCoverPath;

  const activeMemberId = localData?.activeMemberId ?? null;
  const activeMember = useMemo(
    () =>
      activeMemberId && activeMemberId !== 'guest'
        ? activeTrip.members.find((m) => m.id === activeMemberId)
        : undefined,
    [activeTrip.members, activeMemberId],
  );
  const activeMemberName = activeMember?.name ?? 'Guest';

  const pinUnlocked = pinUnlockedCodes.includes(activeTrip.code.toUpperCase());
  const isHost = isHostMember(activeTrip, activeMemberId);
  const canEdit = canEditTrip(activeTrip, activeMemberId, pinUnlocked);
  const roleLabel = getMemberRoleLabel(activeTrip, activeMemberId, pinUnlocked);

  const persistSession = (tripCode: string, memberId: string, unlockedList: string[]) => {
    saveActiveSession({
      tripCode,
      activeMemberId: memberId,
      pinUnlockedCodes: unlockedList,
    });
  };

  const handleUpdateTrip = (updater: (prev: SharedTrip) => SharedTrip, toastMsg?: string) => {
    setActiveTrip((prev) => {
      const next: SharedTrip = {
        ...updater(prev),
        updatedAt: new Date().toISOString(),
      };
      void saveSharedTrip(next)
        .then(() => listSharedTrips().then(setSavedTrips))
        .then(() => pushOrQueueSharedTrip(next));
      return next;
    });
    if (toastMsg) showToast(toastMsg, 'success');
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
      const refreshed = await listSharedTrips();
      setSavedTrips(refreshed);
    }

    const local = await getLocalPersonal(found.id);
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
    setActiveRouteTarget(null);
    setRoute('landing');
    showToast('Returned to Landing Gate', 'info');
  };

  const handleTripCreated = async (newTrip: SharedTrip) => {
    await saveSharedTrip(newTrip);
    void pushOrQueueSharedTrip(newTrip);
    const all = await listSharedTrips();
    setSavedTrips(all);
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
    try {
      await saveLocalCoverBlob(activeTrip.id, cropped.blob);
      const refreshed = await getLocalPersonal(activeTrip.id);
      setLocalData(refreshed);

      if (canEdit) {
        const uploaded = await uploadSharedImage(cropped, {
          kind: 'hero',
          trip: activeTrip,
          caption: activeTrip.title,
          uploaderName: activeMemberName,
          fileName: 'hero-cover.jpg',
        });
        handleUpdateTrip(
          (prev) => ({ ...prev, heroCoverUrl: uploaded.url }),
          uploaded.source === 'drive'
            ? 'Shared cover updated for the crew'
            : 'Shared cover saved (syncs when online)',
        );
      } else {
        showToast('Cover photo saved locally on this device', 'success');
      }
    } catch {
      showToast('Could not process that photo', 'error');
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

  const handleExportExcel = () => {
    exportTripToExcel(activeTrip);
    showToast(`Exported gaskeun-${activeTrip.code.toLowerCase()}.xlsx`, 'success');
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

  const showDock = route === 'hub' && !activeRouteTarget;

  return (
    <OverlayProvider>
      <div className="app-viewport">
        <div className="ambient-mesh" aria-hidden="true">
          <div className="ambient-blob ambient-blob--matcha" />
          <div className="ambient-blob ambient-blob--sunlight" />
          <div className="ambient-blob ambient-blob--mint" />
        </div>

        <main
          className="app-shell"
          style={!showDock ? { paddingBottom: 'calc(var(--safe-bottom) + 20px)' } : undefined}
        >
          {route === 'landing' && (
            <LandingGateScreen
              savedTrips={savedTrips}
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
              onUpdateMemberAvatar={handleUpdateMemberAvatar}
              onRequestUnlockPin={() => requestUnlockPin()}
              onBack={() => setRoute('landing')}
            />
          )}

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

          {route === 'hub' && !activeRouteTarget && activeTab === 'home' && (
            <HomeScreen
              trip={activeTrip}
              phase={phase}
              coverUrl={effectiveCoverUrl}
              activeMemberName={activeMemberName}
              canEdit={canEdit}
              onOpenMenu={() => setMenuOpen(true)}
              onOpenTripSettings={openTripSettingsGated}
              onSwitchTrip={handleLeaveTrip}
              onNavigateTab={setActiveTab}
              onUploadCover={(cropped) => void handleUploadCover(cropped)}
              onRequestUnlockPin={() => requestUnlockPin()}
              onOpenRoute={(target) => setActiveRouteTarget(target)}
              onUpdateTrip={handleUpdateTrip}
            />
          )}

          {route === 'hub' && !activeRouteTarget && activeTab === 'plan' && (
            <PlanScreen
              trip={activeTrip}
              activeMemberName={activeMemberName}
              canEdit={canEdit}
              onRequestUnlockPin={() => requestUnlockPin()}
              onOpenRoute={(target) => setActiveRouteTarget(target)}
              onUpdateTrip={handleUpdateTrip}
            />
          )}

          {route === 'hub' && !activeRouteTarget && activeTab === 'wallet' && (
            <WalletScreen
              trip={activeTrip}
              personalTransactions={localData?.personalTransactions ?? []}
              canEdit={canEdit}
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
              activeMemberName={activeMemberName}
              onSaveLocalPhotos={(photos, msg) => void handleSaveLocalAlbumPhotos(photos, msg)}
              onOpenSettings={openTripSettingsGated}
              onNotify={showToast}
            />
          )}

          {route === 'hub' && !activeRouteTarget && activeTab === 'prep' && (
            <PrepScreen
              trip={activeTrip}
              personalPrep={localData?.personalPrep ?? []}
              canEdit={canEdit}
              onOpenMenu={() => setMenuOpen(true)}
              onRequestUnlockPin={() => requestUnlockPin()}
              onUpdatePersonalPrep={(tasks, msg) => void handleUpdatePersonalPrep(tasks, msg)}
              onUpdateGroupPrep={(tasks, msg) =>
                handleUpdateTrip((prev) => ({ ...prev, groupPrep: tasks }), msg)
              }
            />
          )}
        </main>

        {showDock && <ExpandingGlassDock activeTab={activeTab} onChange={setActiveTab} />}

        <TripMenuSheet
          open={menuOpen}
          trip={activeTrip}
          phase={phase}
          canEdit={canEdit}
          isHost={isHost}
          pinUnlocked={pinUnlocked}
          roleLabel={roleLabel}
          activeMember={activeMember}
          activeMemberName={activeMemberName}
          onPhaseChange={(next) => {
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
          onToggleEditorMember={handleToggleEditorMember}
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
          onExportExcel={handleExportExcel}
          onExportJson={handleExportJson}
          onImportJson={handleImportJsonFile}
          onClose={() => setMenuOpen(false)}
        />

        <TripSettingsSheet
          key={`ts-${settingsOpen ? activeTrip.id : 'closed'}`}
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

        <PinUnlockSheet
          open={pinSheetOpen}
          tripCode={activeTrip.code}
          expectedHash={activeTrip.crewPinHash}
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
              ? `Update "${pendingImportTrip.title}" (${pendingImportTrip.code})? Your local cover photo, personal wallet, and private packing list stay untouched.`
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
