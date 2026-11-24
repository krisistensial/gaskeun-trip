import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUpRight,
  BedDouble,
  Bike,
  Camera,
  Car,
  Check,
  ChevronDown,
  Crown,
  Images,
  LogOut,
  Pencil,
  Plus,
  Settings2,
  TrainFront,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  CornerOrb,
  GlassCard,
  LiquidBottomSheet,
} from '../../components/atoms';
import type { HomePhase } from '../../components/organisms/TripMenuSheet';
import { PhotoCropperSheet } from '../../components/organisms/PhotoCropperSheet';
import {
  assignCarFrontSeatInPods,
  assignMotorbikeMember,
  findMemberBikeAssignment,
  findMemberCarAssignment,
  normalizeCarSeats,
  removeMemberFromCarSeats,
  toggleCarRowMemberInPods,
  type CarBenchRow,
  type CarFrontSlot,
} from '../../services/crewSwap';
import { calculateLedger, formatCompactIDR } from '../../services/ledger';
import type { CroppedImageResult } from '../../services/photoCrop';
import { resolvePlanLiveState } from '../../services/planSchedule';
import type {
  AlbumPhoto,
  DockTabId,
  RouteTarget,
  SharedTrip,
  StayLodging,
  TrainPassInfo,
  TransportPod,
  TripMember,
} from '../../types/trip';
import { CarCabinCard } from './CarCabinCard';
import {
  CrewMembersSheet,
  PodEditorSheet,
  StayEditorSheet,
  TrainPassEditorSheet,
} from './CrewEditors';
import { assignOrSwapTrainSeat, TrainSeatMap } from './TrainSeatMap';
import './home.css';

interface CountdownParts {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
}

function getCountdownParts(targetIso: string): CountdownParts {
  const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return {
    days: String(days),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

export interface HomeScreenProps {
  trip: SharedTrip;
  phase: HomePhase;
  coverUrl: string;
  hasCoverPhoto: boolean;
  albumPhotos?: AlbumPhoto[];
  activeMemberName: string;
  canEdit: boolean;
  onOpenMenu: () => void;
  onOpenTripSettings: () => void;
  onSwitchTrip: () => void;
  onNavigateTab: (tab: DockTabId) => void;
  isDockVisible?: boolean;
  onRevealDock?: () => void;
  onUploadCover: (cropped: CroppedImageResult) => void;
  onRequestUnlockPin: () => void;
  onNotify?: (msg: string, tone?: 'success' | 'info' | 'error') => void;
  onOpenRoute: (target: RouteTarget) => void;
  onUpdateTrip: (updater: (prev: SharedTrip) => SharedTrip, toastMsg?: string) => void;
}

export function HomeScreen({
  trip,
  phase,
  coverUrl,
  hasCoverPhoto,
  albumPhotos = [],
  activeMemberName,
  canEdit,
  onOpenMenu,
  onOpenTripSettings,
  onSwitchTrip,
  onNavigateTab,
  isDockVisible = true,
  onRevealDock,
  onUploadCover,
  onRequestUnlockPin,
  onNotify,
  onOpenRoute,
  onUpdateTrip,
}: HomeScreenProps) {
  const [countdown, setCountdown] = useState<CountdownParts>(() =>
    getCountdownParts(trip.departureAt),
  );
  const [transportFilter, setTransportFilter] = useState<'bike' | 'train' | 'car'>('bike');
  const [editingCrew, setEditingCrew] = useState(false);

  const [titleSheetOpen, setTitleSheetOpen] = useState(false);
  const [trainSheetOpen, setTrainSheetOpen] = useState(false);
  const [trainEditorOpen, setTrainEditorOpen] = useState(false);
  const [crewManagerOpen, setCrewManagerOpen] = useState(false);
  const [podEditor, setPodEditor] = useState<{ open: boolean; pod: TransportPod | null }>({
    open: false,
    pod: null,
  });
  const [stayEditor, setStayEditor] = useState<{ open: boolean; stay: StayLodging | null }>({
    open: false,
    stay: null,
  });
  const [slotPicker, setSlotPicker] = useState<{
    podId: string;
    slotIndex: number;
    label: string;
  } | null>(null);
  const [carFrontPicker, setCarFrontPicker] = useState<{
    podId: string;
    slot: CarFrontSlot;
  } | null>(null);
  const [carRowPicker, setCarRowPicker] = useState<{
    podId: string;
    row: CarBenchRow;
  } | null>(null);
  const [showCrewJump, setShowCrewJump] = useState(true);
  const [heroCropFile, setHeroCropFile] = useState<File | null>(null);
  const [spotlightPhotoErrorUrl, setSpotlightPhotoErrorUrl] = useState<string>('');
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Record<string, boolean>>({});

  const markPhotoFailed = (url?: string) => {
    if (!url) return;
    setFailedPhotoUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  };

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const crewSectionRef = useRef<HTMLElement | null>(null);

  // One-time surprise dock reveal on first scroll past 32px in Pre-Trip Home (persistent per session)
  useEffect(() => {
    if (isDockVisible || phase !== 'pre-trip') return;

    const checkScrollReveal = () => {
      if (window.scrollY >= 32) {
        onRevealDock?.();
      }
    };

    checkScrollReveal();
    window.addEventListener('scroll', checkScrollReveal, { passive: true });
    return () => {
      window.removeEventListener('scroll', checkScrollReveal);
    };
  }, [isDockVisible, phase, onRevealDock]);

  useEffect(() => {
    setCountdown(getCountdownParts(trip.departureAt));
    const id = window.setInterval(() => {
      setCountdown(getCountdownParts(trip.departureAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [trip.departureAt]);

  useEffect(() => {
    if (!canEdit) setEditingCrew(false);
  }, [canEdit]);

  useEffect(() => {
    const el = crewSectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setShowCrewJump(!entry.isIntersecting);
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const ledger = useMemo(() => calculateLedger(trip), [trip]);
  const memberById = useMemo(
    () => new Map<string, TripMember>(trip.members.map((m) => [m.id, m])),
    [trip.members],
  );

  const bikePods = trip.transportPods.filter((p) => p.mode === 'bike');
  const trainPods = trip.transportPods.filter((p) => p.mode === 'train');
  const carPods = trip.transportPods.filter((p) => p.mode === 'car');

  const liveSchedule = useMemo(
    () =>
      resolvePlanLiveState(trip.days, trip.itinerary, new Date(), {
        simulateLive: phase === 'on-trip',
      }),
    [trip.days, trip.itinerary, phase],
  );

  const activeStop =
    (liveSchedule.activeStopId
      ? trip.itinerary.find((item) => item.id === liveSchedule.activeStopId)
      : undefined) ?? trip.itinerary.find((item) => item.status !== 'idea');
  const activeIndex = activeStop
    ? trip.itinerary.findIndex((item) => item.id === activeStop.id)
    : -1;
  const nextStop =
    activeIndex >= 0
      ? trip.itinerary.slice(activeIndex + 1).find((item) => item.status !== 'idea')
      : undefined;

  const maxContribution = Math.max(
    1,
    ...ledger.topContributors.map((c) => c.paidPool),
    trip.financeConfig.poolTargetPerPerson,
  );

  const requireEdit = (action: () => void) => {
    if (!canEdit) {
      onRequestUnlockPin();
      return;
    }
    action();
  };

  const activeDayStops = activeStop
    ? trip.itinerary
        .filter((item) => item.dayId === activeStop.dayId)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
    : [];

  const openStopInRoute = (stop: typeof activeStop) => {
    if (!stop) return;
    const dayObj = trip.days.find((d) => d.id === stop.dayId);
    onOpenRoute({
      title: stop.title,
      subtitle: stop.locationHint,
      address: stop.address,
      parkingNote: stop.parkingNote,
      mapsUrl: stop.mapsUrl,
      coords: stop.coords,
      dayLabel: dayObj ? `${dayObj.dayLabel} ${dayObj.dateNum}` : 'Route',
      dayItems: activeDayStops,
      focusedItemId: stop.id,
    });
  };

  const handleSaveTrainPass = (info: TrainPassInfo) => {
    onUpdateTrip((prev) => ({ ...prev, trainPass: info }), 'Train pass saved');
  };

  const handleSaveMember = (member: TripMember, isNew: boolean) => {
    onUpdateTrip(
      (prev) => ({
        ...prev,
        members: isNew
          ? [...prev.members, member]
          : prev.members.map((m) => (m.id === member.id ? member : m)),
      }),
      isNew ? `${member.name} added to crew` : `${member.name} updated`,
    );
  };

  const handleDeleteMember = (memberId: string) => {
    onUpdateTrip(
      (prev) => ({
        ...prev,
        members: prev.members.filter((m) => m.id !== memberId),
        transportPods: prev.transportPods.map((pod) => ({
          ...pod,
          carSeats: pod.mode === 'car'
            ? removeMemberFromCarSeats(normalizeCarSeats(pod), memberId)
            : pod.carSeats,
          slots: pod.slots.map((s) => (s.memberId === memberId ? { ...s, memberId: null } : s)),
        })),
        stays: prev.stays.map((st) => ({
          ...st,
          rooms: st.rooms.map((rm) => ({
            ...rm,
            memberIds: rm.memberIds.filter((id) => id !== memberId),
          })),
        })),
      }),
      'Member removed from crew',
    );
  };

  const handleAssignCarFrontSeat = (
    podId: string,
    slot: CarFrontSlot,
    memberId: string | null,
  ) => {
    const preview = assignCarFrontSeatInPods(trip.transportPods, podId, slot, memberId);
    if (!preview.changed) return;

    const newName = memberId ? memberById.get(memberId)?.name ?? 'Rider' : '';
    const prevName = preview.swappedWithId
      ? memberById.get(preview.swappedWithId)?.name ?? 'Rider'
      : '';
    const seatTitle = slot === 'frontRight' ? 'Driver' : 'Front Left';

    let toastMsg = `${seatTitle} updated`;
    if (!memberId) {
      toastMsg = `${seatTitle} cleared`;
    } else if (preview.swappedWithId && prevName) {
      toastMsg = `Swapped ${newName} ↔ ${prevName}`;
    } else if (preview.movedFromCarLabel) {
      toastMsg = `Moved ${newName} from ${preview.movedFromCarLabel}`;
    } else {
      toastMsg = `Assigned ${newName} to ${seatTitle}`;
    }

    onUpdateTrip(
      (prev) => ({
        ...prev,
        transportPods: assignCarFrontSeatInPods(prev.transportPods, podId, slot, memberId).pods,
      }),
      toastMsg,
    );
  };

  const handleToggleCarBenchMember = (
    podId: string,
    row: CarBenchRow,
    memberId: string,
  ) => {
    const preview = toggleCarRowMemberInPods(trip.transportPods, podId, row, memberId);
    const name = memberById.get(memberId)?.name ?? 'Rider';
    const rowTitle = row === 'middle' ? 'Middle Row' : 'Back Row';

    const toastMsg =
      preview.action === 'removed'
        ? `Removed ${name} from ${rowTitle}`
        : preview.movedFromCarLabel
          ? `Moved ${name} from ${preview.movedFromCarLabel} to ${rowTitle}`
          : `Added ${name} to ${rowTitle}`;

    onUpdateTrip(
      (prev) => ({
        ...prev,
        transportPods: toggleCarRowMemberInPods(prev.transportPods, podId, row, memberId).pods,
      }),
      toastMsg,
    );
  };

  const handleUpdateTransportSlot = (
    podId: string,
    slotIndex: number,
    memberId: string | null,
  ) => {
    const targetPod = trip.transportPods.find((p) => p.id === podId);

    // Motorbike Auto-Swap: never allow one crew member on two bikes simultaneously
    if (targetPod?.mode === 'bike') {
      const preview = assignMotorbikeMember(trip.transportPods, podId, slotIndex, memberId);
      if (!preview.changed) return;

      const newName = memberId ? memberById.get(memberId)?.name ?? 'Rider' : '';
      const prevName = preview.swappedWithId
        ? memberById.get(preview.swappedWithId)?.name ?? 'Rider'
        : '';

      let toastMsg = 'Motorbike slot updated';
      if (!memberId) {
        toastMsg = 'Slot cleared';
      } else if (preview.swappedWithId && prevName) {
        toastMsg = `Swapped ${newName} ↔ ${prevName}`;
      } else if (preview.movedFromBikeLabel && !preview.sameBikeSwap) {
        toastMsg = `Moved ${newName} from ${preview.movedFromBikeLabel}`;
      } else if (preview.sameBikeSwap) {
        toastMsg = `Moved ${newName} on ${targetPod.label}`;
      } else {
        toastMsg = `Assigned ${newName}`;
      }

      onUpdateTrip(
        (prev) => ({
          ...prev,
          transportPods: assignMotorbikeMember(prev.transportPods, podId, slotIndex, memberId).pods,
        }),
        toastMsg,
      );
      return;
    }

    let toastMsg = 'Transport slot updated';
    if (targetPod?.mode === 'train') {
      const prevOccupantId = targetPod.slots[slotIndex]?.memberId ?? null;
      const existingIdx = memberId
        ? targetPod.slots.findIndex((s) => s.memberId === memberId)
        : -1;
      if (!memberId) {
        toastMsg = 'Seat cleared';
      } else if (existingIdx >= 0 && existingIdx !== slotIndex && prevOccupantId) {
        toastMsg = 'Seats swapped';
      } else if (existingIdx >= 0 && existingIdx !== slotIndex) {
        toastMsg = 'Seat moved';
      } else {
        toastMsg = 'Seat assigned';
      }
    }

    onUpdateTrip(
      (prev) => ({
        ...prev,
        transportPods: prev.transportPods.map((pod) => {
          if (pod.id !== podId) return pod;
          if (pod.mode === 'train') {
            return {
              ...pod,
              slots: assignOrSwapTrainSeat(pod.slots, slotIndex, memberId),
            };
          }
          return {
            ...pod,
            slots: pod.slots.map((s, idx) => (idx === slotIndex ? { ...s, memberId } : s)),
          };
        }),
      }),
      toastMsg,
    );
  };

  const handleSavePod = (pod: TransportPod, isNew: boolean) => {
    setTransportFilter(pod.mode);
    onUpdateTrip(
      (prev) => ({
        ...prev,
        transportPods: isNew
          ? [...prev.transportPods, pod]
          : prev.transportPods.map((p) => (p.id === pod.id ? pod : p)),
      }),
      isNew ? `${pod.label} added` : `${pod.label} updated`,
    );
  };

  const handleDeletePod = (podId: string) => {
    onUpdateTrip(
      (prev) => ({
        ...prev,
        transportPods: prev.transportPods.filter((p) => p.id !== podId),
      }),
      'Transport pod removed',
    );
  };

  const handleSaveStay = (stay: StayLodging, isNew: boolean) => {
    onUpdateTrip(
      (prev) => ({
        ...prev,
        stays: isNew
          ? [...prev.stays, stay]
          : prev.stays.map((s) => (s.id === stay.id ? stay : s)),
      }),
      isNew ? `${stay.name} added` : `${stay.name} updated`,
    );
  };

  const handleDeleteStay = (stayId: string) => {
    onUpdateTrip(
      (prev) => ({ ...prev, stays: prev.stays.filter((s) => s.id !== stayId) }),
      'Stay removed',
    );
  };

  const resolvedCoverUrl = trip.coverPhotoUrl || trip.heroCoverUrl || coverUrl;
  const resolvedHasCoverPhoto = Boolean(
    trip.coverPhotoUrl || trip.heroCoverUrl || hasCoverPhoto,
  );

  return (
    <div className="home-root">
      {/* Full-Bleed Customizable Editorial Hero (Zero Top Bar · Full-Screen Pre-Trip Reveal) */}
      <section
        ref={heroRef}
        className={[
          'home-hero',
          phase === 'on-trip' ? 'home-hero--compact' : 'home-hero--fullscreen',
          phase === 'pre-trip' && isDockVisible ? 'home-hero--dock-visible' : '',
          resolvedHasCoverPhoto ? 'home-hero--photo' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <img src={resolvedCoverUrl} alt="" className="home-hero__bg" />
        <div className="home-hero__fade" aria-hidden="true" />

        <div className="home-hero__corners">
          <CornerOrb
            kind="custom"
            ariaLabel={canEdit ? 'Change shared cover photo' : 'Unlock to change cover photo'}
            icon={<Camera size={18} strokeWidth={1.8} />}
            onClick={() => {
              if (!canEdit) {
                onNotify?.('Unlock with Crew PIN to change the cover photo', 'info');
                onRequestUnlockPin();
                return;
              }
              coverInputRef.current?.click();
            }}
          />
          <CornerOrb kind="menu" ariaLabel="Trip menu" onClick={onOpenMenu} />
        </div>

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
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) {
              setHeroCropFile(file);
            }
          }}
        />

        {/* Boxless Editorial Magazine Serif Countdown — Elevated & Centered over Hero Photo */}
        {phase === 'pre-trip' ? (
          <div className="home-hero__center">
            <div className="countdown-hero-card" aria-label="Departure countdown">
              <div className="countdown-days-block">
                <span className="countdown-days-val">{countdown.days}</span>
                <span className="countdown-days-lbl">Days</span>
              </div>
              <div className="countdown-sub-grid">
                <div className="countdown-sub-cell">
                  <span className="countdown-val">{countdown.hours}</span>
                  <span className="countdown-lbl">Hours</span>
                </div>
                <div className="countdown-sub-cell">
                  <span className="countdown-val">{countdown.minutes}</span>
                  <span className="countdown-lbl">Mins</span>
                </div>
                <div className="countdown-sub-cell">
                  <span className="countdown-val">{countdown.seconds}</span>
                  <span className="countdown-lbl">Secs</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="home-hero__spacer" aria-hidden="true" />
        )}

        <div className="home-hero__bottom">
          <div>
            <button
              type="button"
              className="home-title-trigger tactile"
              onClick={() => setTitleSheetOpen(true)}
            >
              <h1 className="home-title">{trip.title}</h1>
              <ChevronDown size={22} strokeWidth={2} color="var(--text-secondary)" />
            </button>
            <p className="home-subtitle">{trip.subtitle}</p>
          </div>

          {phase === 'pre-trip' && !isDockVisible && (
            <button
              type="button"
              className="home-scroll-cue tactile"
              onClick={() => {
                onRevealDock?.();
                const heroHeight = heroRef.current?.offsetHeight ?? window.innerHeight * 0.85;
                window.scrollTo({
                  top: Math.max(240, heroHeight - 56),
                  behavior: 'smooth',
                });
              }}
            >
              <span>Scroll to explore</span>
              <ChevronDown size={14} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </section>

      {/* On-Trip Spotlight Now & Up Next */}
      {phase === 'on-trip' && activeStop && (() => {
        const showSpotlightPhoto = Boolean(
          activeStop.coverUrl && spotlightPhotoErrorUrl !== activeStop.coverUrl,
        );
        return (
          <section aria-label="Current stop spotlight">
            <GlassCard
              variant="spotlight"
              padding="lg"
              className={`spotlight-now ${showSpotlightPhoto ? 'card-has-photo' : ''}`}
            >
              {showSpotlightPhoto && (
                <>
                  <img
                    src={activeStop.coverUrl}
                    alt=""
                    aria-hidden="true"
                    className="card-bg-photo"
                    loading="lazy"
                    onError={() => setSpotlightPhotoErrorUrl(activeStop.coverUrl ?? '')}
                  />
                  <div className="card-bg-scrim" aria-hidden="true" />
                </>
              )}
              <div className="spotlight-now__top">
                <span className="spotlight-live-tag">
                  <span className="spotlight-live-dot" aria-hidden="true" />
                  <span>Now</span>
                </span>
                <span className="spotlight-time">{activeStop.startTime}</span>
              </div>

              <div>
                <h2 className="spotlight-place">{activeStop.title}</h2>
                <p className="spotlight-hint">{activeStop.locationHint}</p>
                {activeStop.parkingNote && (
                  <p className="spotlight-parking">{activeStop.parkingNote}</p>
                )}
              </div>

              <div className="spotlight-footer">
                <Badge tone="matcha">
                  {activeStop.type.charAt(0).toUpperCase() + activeStop.type.slice(1)}
                </Badge>
                <Button
                  variant={showSpotlightPhoto ? 'glass' : 'matcha'}
                  size="sm"
                  className={showSpotlightPhoto ? 'card-photo-route-btn' : undefined}
                  rightIcon={<ArrowUpRight size={15} strokeWidth={2} />}
                  onClick={() => openStopInRoute(activeStop)}
                >
                  Route
                </Button>
              </div>
            </GlassCard>

            {nextStop && (
              <>
                <div className="upnext-connector" aria-hidden="true" />
                <GlassCard
                  variant="clear"
                  padding="md"
                  interactive
                  className="upnext-card"
                  onClick={() => onNavigateTab('plan')}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Up Next · {nextStop.startTime}
                    </span>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 17,
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      {nextStop.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {nextStop.locationHint}
                    </div>
                  </div>
                  <CornerOrb
                    kind="custom"
                    ariaLabel="Open route for next stop"
                    icon={<ArrowUpRight size={18} strokeWidth={1.8} />}
                    onClick={() => openStopInRoute(nextStop)}
                  />
                </GlassCard>
              </>
            )}
          </section>
        );
      })()}

      {/* Bento Quick-Access Duo (Seamless Full-Bleed Train Pass + Dynamic Album Collage) */}
      {(() => {
        const trainPhotoUrl = trip.trainPass?.trainPhotoDataUrl;
        const showTrainPhoto = Boolean(trainPhotoUrl && !failedPhotoUrls[trainPhotoUrl]);
        const validAlbumPhotos = albumPhotos.filter((p) => p.url && !failedPhotoUrls[p.url]);
        const collagePhotos = validAlbumPhotos.slice(0, 4);

        return (
          <section className="bento-duo" aria-label="Quick access">
            <GlassCard
              variant="clear"
              padding="md"
              interactive
              className="train-pass-tile"
              onClick={() => setTrainSheetOpen(true)}
            >
              {showTrainPhoto && trainPhotoUrl && (
                <>
                  <img
                    src={trainPhotoUrl}
                    alt=""
                    aria-hidden="true"
                    className="bento-photo-bg bento-photo-bg--train"
                    onError={() => markPhotoFailed(trainPhotoUrl)}
                  />
                  <div className="bento-photo-scrim bento-photo-scrim--train" aria-hidden="true" />
                </>
              )}

              <div className="bento-card-fg">
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Train Pass
                    </span>
                    <TrainFront size={16} strokeWidth={1.8} color="var(--brand-matcha)" />
                  </div>
                  <div className="train-route-code" style={{ marginTop: 4 }}>
                    {trip.trainPass?.outboundRoute ?? 'Add Ticket'}
                  </div>
                </div>
                <div className="train-pass-notch">
                  <span>{trip.trainPass?.outboundTime ?? 'Tap to set up'}</span>
                  <strong>{trip.trainPass?.outboundCode ?? ''}</strong>
                </div>
              </div>
            </GlassCard>

            <GlassCard
              variant="clear"
              padding="md"
              interactive
              className="album-stack-tile"
              onClick={() => onNavigateTab('album')}
            >
              {collagePhotos.length > 0 && (
                <>
                  <div
                    className={`album-collage album-collage--${collagePhotos.length}`}
                    aria-hidden="true"
                  >
                    {collagePhotos.map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.url}
                        alt=""
                        loading="lazy"
                        className="album-collage__img"
                        onError={() => markPhotoFailed(photo.url)}
                      />
                    ))}
                  </div>
                  <div className="bento-photo-scrim bento-photo-scrim--album" aria-hidden="true" />
                </>
              )}

              <div className="bento-card-fg">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Album
                  </span>
                  <Images size={16} strokeWidth={1.8} color="var(--brand-matcha)" />
                </div>

                {collagePhotos.length > 0 ? (
                  <span className="album-count-pill">
                    {validAlbumPhotos.length} {validAlbumPhotos.length === 1 ? 'photo' : 'photos'}
                  </span>
                ) : (
                  <div>
                    <div className="album-fanned" aria-hidden="true">
                      <span className="album-polaroid album-polaroid--1" />
                      <span className="album-polaroid album-polaroid--2" />
                      <span className="album-polaroid album-polaroid--3" />
                    </div>
                    <div className="album-empty-sub">Tap to add photos</div>
                  </div>
                )}
              </div>
            </GlassCard>
          </section>
        );
      })()}

      {/* Top Contributors Bar Chart */}
      {ledger.topContributors.length > 0 && (
        <section aria-label="Top contributors">
          <GlassCard variant="clear" padding="md">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    fontSize: 17,
                    fontWeight: 600,
                  }}
                >
                  Top Contributors
                </h2>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  Pool {ledger.poolProgressPct}% · {formatCompactIDR(ledger.poolCollected)} of{' '}
                  {formatCompactIDR(ledger.poolTarget)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                rightIcon={<ArrowUpRight size={14} strokeWidth={2} />}
                onClick={() => onNavigateTab('wallet')}
              >
                Wallet
              </Button>
            </div>

            <div className="bar-chart-scroller">
              {ledger.topContributors.map((entry, idx) => {
                const heightPct = Math.max(
                  12,
                  Math.round((entry.paidPool / maxContribution) * 100),
                );
                return (
                  <button
                    key={entry.member.id}
                    type="button"
                    className="bar-col tactile"
                    onClick={() => onNavigateTab('wallet')}
                  >
                    <span className="bar-col__amt">
                      {idx === 0 && (
                        <Crown
                          size={12}
                          strokeWidth={2.2}
                          color="var(--accent-amber)"
                          style={{ marginRight: 2, verticalAlign: '-1px' }}
                        />
                      )}
                      {entry.paidPool > 0
                        ? formatCompactIDR(entry.paidPool).replace('Rp ', '')
                        : '0'}
                    </span>
                    <span className="bar-col__track">
                      <span
                        className={`bar-col__fill ${idx === 0 ? 'bar-col__fill--crown' : ''}`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </span>
                    <Avatar
                      initials={entry.member.initials}
                      name={entry.member.name}
                      src={entry.member.avatarDataUrl}
                      size="sm"
                      bg={entry.member.avatarBg}
                      color={entry.member.avatarColor}
                    />
                    <span className="bar-col__name">{entry.member.name}</span>
                  </button>
                );
              })}
            </div>
          </GlassCard>
        </section>
      )}

      {/* Crew & Stay Section (01c_Home_CrewSection) */}
      <section id="crew-section" ref={crewSectionRef} className="crew-section">
        <div className="crew-header">
          <div>
            <h2 className="crew-title">Crew &amp; Stay</h2>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {trip.members.length} riders · {trip.stays.length} stays
            </span>
          </div>
          {canEdit && (
            <Button
              variant={editingCrew ? 'matcha' : 'glass'}
              size="sm"
              leftIcon={<Pencil size={13} strokeWidth={2} />}
              onClick={() => requireEdit(() => setEditingCrew((prev) => !prev))}
            >
              {editingCrew ? 'Done' : 'Edit'}
            </Button>
          )}
        </div>

        {editingCrew && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button
              variant="glass"
              size="sm"
              leftIcon={<Users size={14} strokeWidth={1.8} />}
              onClick={() => setCrewManagerOpen(true)}
            >
              Add / Edit Crew
            </Button>
            <Button
              variant="glass"
              size="sm"
              leftIcon={<Plus size={14} strokeWidth={2} />}
              onClick={() => setPodEditor({ open: true, pod: null })}
            >
              Add Pod
            </Button>
            <Button
              variant="glass"
              size="sm"
              leftIcon={<BedDouble size={14} strokeWidth={1.8} />}
              onClick={() => setStayEditor({ open: true, stay: null })}
            >
              Add Stay
            </Button>
          </div>
        )}

        {/* Multi-Mode Transport Pods Filter */}
        <div className="mode-filter-row" role="tablist" aria-label="Transport modes">
          <button
            type="button"
            role="tab"
            aria-selected={transportFilter === 'bike'}
            className={`mode-chip tactile ${transportFilter === 'bike' ? 'mode-chip--active' : ''}`}
            onClick={() => setTransportFilter('bike')}
          >
            <Bike size={15} strokeWidth={1.8} />
            <span>Bikes ({bikePods.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={transportFilter === 'train'}
            className={`mode-chip tactile ${transportFilter === 'train' ? 'mode-chip--active' : ''}`}
            onClick={() => setTransportFilter('train')}
          >
            <TrainFront size={15} strokeWidth={1.8} />
            <span>Train Seats</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={transportFilter === 'car'}
            className={`mode-chip tactile ${transportFilter === 'car' ? 'mode-chip--active' : ''}`}
            onClick={() => setTransportFilter('car')}
          >
            <Car size={15} strokeWidth={1.8} />
            <span>{carPods.length > 0 ? `Cars (${carPods.length})` : 'Cars'}</span>
          </button>
        </div>

        {/* Bikes List (with Pod Detail Pencil Edit in Edit Mode) */}
        {transportFilter === 'bike' && (
          <div className="bike-pod-list">
            {bikePods.length === 0 && (
              <GlassCard variant="clear" padding="md">
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  No bikes configured yet. Tap <strong>Edit</strong> to add a motorbike pod.
                </div>
              </GlassCard>
            )}
            {bikePods.map((pod) => {
              const subtitle =
                [pod.roleNote, pod.vehicleModel].filter(Boolean).join(' · ') || pod.meta;
              return (
                <GlassCard key={pod.id} variant="clear" padding="sm" className="bike-pod">
                  <button
                    type="button"
                    className={`bike-pod__info-btn ${editingCrew ? 'tactile' : ''}`}
                    onClick={() => {
                      if (!editingCrew) return;
                      setPodEditor({ open: true, pod });
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <span>{pod.label}</span>
                        {editingCrew && (
                          <Pencil size={12} strokeWidth={2} color="var(--brand-matcha)" />
                        )}
                      </div>
                      {subtitle && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{subtitle}</div>
                      )}
                    </div>
                  </button>

                  <div className="bike-pod__pair">
                    {pod.slots.map((slot, slotIdx) => {
                      const m = slot.memberId ? memberById.get(slot.memberId) : undefined;
                      const isTentative = m?.status === 'tentative';
                      const avatarVariant = isTentative
                        ? 'tentative'
                        : slot.lockedPassenger
                          ? 'passenger'
                          : 'solid';

                      return (
                        <button
                          key={`${pod.id}-${slotIdx}`}
                          type="button"
                          className={`bike-slot-btn ${editingCrew ? 'bike-slot-btn--editable tactile' : ''}`}
                          onClick={() => {
                            if (!editingCrew) return;
                            setSlotPicker({
                              podId: pod.id,
                              slotIndex: slotIdx,
                              label: `${pod.label} · ${slot.role}`,
                            });
                          }}
                        >
                          <Avatar
                            initials={m?.initials ?? '?'}
                            name={m?.name}
                            src={m?.avatarDataUrl}
                            size="sm"
                            bg={m?.avatarBg ?? '#EAEFED'}
                            color={m?.avatarColor ?? '#546860'}
                            variant={avatarVariant}
                          />
                          <span>{m ? (isTentative ? `${m.name}?` : m.name) : 'Open'}</span>
                        </button>
                      );
                    })}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}

        {/* KAI-Style Train Seat Map (3–2 & 2–2 with Window/Aisle & Facing Rows) */}
        {transportFilter === 'train' && (
          <div className="bike-pod-list">
            {trainPods.length === 0 && (
              <GlassCard variant="clear" padding="md">
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  No train car configured yet. Tap <strong>Edit → Add Pod</strong> to set up a 3–2
                  or 2–2 KAI seat map.
                </div>
              </GlassCard>
            )}
            {trainPods.map((pod) => (
              <TrainSeatMap
                key={pod.id}
                pod={pod}
                memberById={memberById}
                editingCrew={editingCrew}
                onTapSeat={(slotIdx, seatCode) =>
                  setSlotPicker({
                    podId: pod.id,
                    slotIndex: slotIdx,
                    label: `${pod.label} · Seat ${seatCode}`,
                  })
                }
                onEditLayout={() => setPodEditor({ open: true, pod })}
                onDeletePod={() => handleDeletePod(pod.id)}
              />
            ))}
          </div>
        )}

        {/* Top-Down RHD Car Cabin Seating Cards */}
        {transportFilter === 'car' && (
          <div className="bike-pod-list">
            {carPods.length === 0 && (
              <GlassCard variant="clear" padding="md">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    No cars added yet. Set up a right-hand drive cabin with unlimited middle &amp;
                    back rows.
                  </div>
                  {canEdit && (
                    <Button
                      variant="matcha"
                      size="sm"
                      leftIcon={<Plus size={14} strokeWidth={2.2} />}
                      onClick={() => setPodEditor({ open: true, pod: null })}
                    >
                      Add Car
                    </Button>
                  )}
                </div>
              </GlassCard>
            )}
            {carPods.map((pod) => (
              <CarCabinCard
                key={pod.id}
                pod={pod}
                memberById={memberById}
                canEdit={canEdit}
                editingCrew={editingCrew}
                onTapFrontSeat={(slot) =>
                  requireEdit(() => setCarFrontPicker({ podId: pod.id, slot }))
                }
                onTapBenchRow={(row) =>
                  requireEdit(() => setCarRowPicker({ podId: pod.id, row }))
                }
                onRemoveFromBench={(row, memberId) =>
                  requireEdit(() => handleToggleCarBenchMember(pod.id, row, memberId))
                }
                onEditCar={() => requireEdit(() => setPodEditor({ open: true, pod }))}
              />
            ))}
          </div>
        )}

        {/* Homestay Cards with Seamless Full-Bleed Edge-to-Edge Photo */}
        {trip.stays.map((stay) => {
          const showStayPhoto = Boolean(stay.photoDataUrl && !failedPhotoUrls[stay.photoDataUrl]);
          return (
            <GlassCard key={stay.id} variant="clear" padding="md" className="stay-card">
              {showStayPhoto && stay.photoDataUrl && (
                <>
                  <img
                    src={stay.photoDataUrl}
                    alt=""
                    aria-hidden="true"
                    className="stay-card__bg"
                    onError={() => markPhotoFailed(stay.photoDataUrl)}
                  />
                  <div className="stay-card__scrim" aria-hidden="true" />
                </>
              )}

              <div className="stay-card__fg">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <BedDouble size={16} strokeWidth={1.8} color="var(--brand-matcha)" />
                      <h3
                        style={{
                          margin: 0,
                          fontFamily: 'var(--font-display)',
                          fontSize: 17,
                          fontWeight: 600,
                        }}
                      >
                        {stay.name}
                      </h3>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                      {stay.checkIn} → {stay.checkOut}
                    </div>
                  </div>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    {editingCrew && (
                      <Button
                        variant="glass"
                        size="sm"
                        leftIcon={<Pencil size={12} strokeWidth={2} />}
                        onClick={() => setStayEditor({ open: true, stay })}
                      >
                        Edit
                      </Button>
                    )}
                    {stay.mapsUrl && (
                      <Button
                        variant="glass"
                        size="sm"
                        rightIcon={<ArrowUpRight size={13} strokeWidth={2} />}
                        onClick={() =>
                          onOpenRoute({
                            title: stay.name,
                            subtitle: `${stay.city} · ${stay.checkIn}`,
                            address: stay.address,
                            mapsUrl: stay.mapsUrl,
                            dayLabel: 'Stay',
                          })
                        }
                      >
                        Route
                      </Button>
                    )}
                  </div>
                </div>

                {stay.rooms.map((room) => (
                  <div key={room.id} className="stay-room-row">
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{room.label}</div>
                      {room.hasExtraBed && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          + Extra bed
                        </span>
                      )}
                    </div>
                    <div className="stay-avatars">
                      {room.memberIds.map((mid) => {
                        const m = memberById.get(mid);
                        if (!m) return null;
                        return (
                          <Avatar
                            key={mid}
                            initials={m.initials}
                            name={m.name}
                            src={m.avatarDataUrl}
                            size="sm"
                            bg={m.avatarBg}
                            color={m.avatarColor}
                            variant={m.status === 'tentative' ? 'tentative' : 'solid'}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          );
        })}
      </section>

      {/* Floating Jump Pill (Crew ↓) above Dock — stays hidden during initial full-screen countdown */}
      {showCrewJump && isDockVisible && (
        <button
          type="button"
          className="floating-crew-jump"
          onClick={() => crewSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span>Crew</span>
          <ArrowDown size={14} strokeWidth={2} />
        </button>
      )}

      {/* Trip Title Quick Switcher / Edit Details Sheet */}
      <LiquidBottomSheet
        open={titleSheetOpen}
        title={trip.title}
        subtitle={trip.subtitle}
        onClose={() => setTitleSheetOpen(false)}
      >
        <div className="gk-menu-list">
          {canEdit && (
            <button
              type="button"
              className="gk-menu-item"
              onClick={() => {
                setTitleSheetOpen(false);
                onOpenTripSettings();
              }}
            >
              <span className="gk-menu-item__left">
                <span className="gk-menu-item__icon">
                  <Settings2 size={18} strokeWidth={1.8} />
                </span>
                <span>
                  <div className="gk-menu-item__title">Edit Trip Details</div>
                  <div className="gk-menu-item__sub">
                    Update title, subtitle, countdown &amp; targets
                  </div>
                </span>
              </span>
            </button>
          )}

          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              setTitleSheetOpen(false);
              onSwitchTrip();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <LogOut size={18} strokeWidth={1.8} />
              </span>
              <span>
                <div className="gk-menu-item__title">Switch or Create Trip</div>
                <div className="gk-menu-item__sub">Return to Trip Code gate</div>
              </span>
            </span>
          </button>
        </div>
      </LiquidBottomSheet>

      {/* Train Pass Detail Sheet (Portal + Seamless Full-Bleed Photo inside Outbound Card) */}
      <LiquidBottomSheet
        open={trainSheetOpen}
        title={trip.trainPass?.trainName ?? 'Train Pass'}
        subtitle={
          trip.trainPass?.outboundCode
            ? `${trip.trainPass.outboundCode} · Round Trip`
            : 'Add your boarding schedule'
        }
        onClose={() => setTrainSheetOpen(false)}
      >
        {trip.trainPass ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <GlassCard variant="tinted" padding="md" className="train-detail-hero-card">
              {trip.trainPass.trainPhotoDataUrl &&
                !failedPhotoUrls[trip.trainPass.trainPhotoDataUrl] && (
                  <>
                    <img
                      src={trip.trainPass.trainPhotoDataUrl}
                      alt=""
                      aria-hidden="true"
                      className="bento-photo-bg bento-photo-bg--train"
                      onError={() => markPhotoFailed(trip.trainPass?.trainPhotoDataUrl)}
                    />
                    <div className="bento-photo-scrim bento-photo-scrim--train" aria-hidden="true" />
                  </>
                )}
              <div className="stay-card__fg">
                <Badge tone="matcha">Outbound</Badge>
                <div className="train-route-code" style={{ marginTop: 8 }}>
                  {trip.trainPass.outboundRoute}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                  {trip.trainPass.outboundDate} · {trip.trainPass.outboundTime}
                </div>
              </div>
            </GlassCard>

            {trip.trainPass.returnRoute && (
              <GlassCard variant="clear" padding="md">
                <Badge tone="neutral">Return</Badge>
                <div className="train-route-code" style={{ marginTop: 8 }}>
                  {trip.trainPass.returnRoute}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                  {trip.trainPass.returnDate} · {trip.trainPass.returnTime}
                </div>
              </GlassCard>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            No train or transit boarding pass added yet.
          </p>
        )}

        {canEdit && (
          <div style={{ marginTop: 14 }}>
            <Button
              variant="glass"
              size="md"
              fullWidth
              leftIcon={<Pencil size={15} strokeWidth={1.8} />}
              onClick={() => {
                setTrainSheetOpen(false);
                requireEdit(() => setTrainEditorOpen(true));
              }}
            >
              {trip.trainPass ? 'Edit Train Pass' : 'Add Train Pass'}
            </Button>
          </div>
        )}
      </LiquidBottomSheet>

      {/* Inline Transport Slot Avatar Picker Sheet (Portal + Smart Bike & Train Auto-Swap) */}
      <LiquidBottomSheet
        open={Boolean(slotPicker)}
        title="Assign Rider"
        subtitle={slotPicker?.label}
        onClose={() => setSlotPicker(null)}
      >
        {slotPicker &&
          (() => {
            const activeSlotPod = trip.transportPods.find((p) => p.id === slotPicker.podId);
            const isTrainPicker = activeSlotPod?.mode === 'train';
            const isBikePicker = activeSlotPod?.mode === 'bike';
            const currentOccupantId = activeSlotPod?.slots[slotPicker.slotIndex]?.memberId ?? null;
            const currentOccupant = currentOccupantId
              ? memberById.get(currentOccupantId)
              : undefined;

            return (
              <div
                className={`slot-picker-grid ${isTrainPicker || isBikePicker ? 'slot-picker-grid--train' : ''}`}
              >
                {trip.members.map((m) => {
                  const isCurrent = m.id === currentOccupantId;
                  const existingSeat = isTrainPicker
                    ? activeSlotPod?.slots.find((s) => s.memberId === m.id)?.role
                    : undefined;
                  const existingBike = isBikePicker
                    ? findMemberBikeAssignment(trip.transportPods, m.id)
                    : null;

                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`slot-picker-option tactile ${isCurrent ? 'slot-picker-option--current' : ''}`}
                      onClick={() => {
                        handleUpdateTransportSlot(slotPicker.podId, slotPicker.slotIndex, m.id);
                        setSlotPicker(null);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <Avatar
                          initials={m.initials}
                          name={m.name}
                          src={m.avatarDataUrl}
                          size="sm"
                          bg={m.avatarBg}
                          color={m.avatarColor}
                          variant={m.status === 'tentative' ? 'tentative' : 'solid'}
                        />
                        <span>{m.status === 'tentative' ? `${m.name}?` : m.name}</span>
                      </span>

                      {isTrainPicker && (
                        <span>
                          {isCurrent ? (
                            <Badge tone="matcha">Current</Badge>
                          ) : existingSeat && currentOccupant ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--brand-matcha)',
                              }}
                            >
                              <ArrowLeftRight size={12} strokeWidth={2} />
                              <span>
                                Seat {existingSeat} · Swap with {currentOccupant.name}
                              </span>
                            </span>
                          ) : existingSeat ? (
                            <Badge tone="neutral">Seat {existingSeat}</Badge>
                          ) : currentOccupant ? (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              Swap with {currentOccupant.name}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              No seat
                            </span>
                          )}
                        </span>
                      )}

                      {isBikePicker && (
                        <span>
                          {isCurrent ? (
                            <Badge tone="matcha">Current</Badge>
                          ) : existingBike && currentOccupant ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--brand-matcha)',
                              }}
                            >
                              <ArrowLeftRight size={12} strokeWidth={2} />
                              <span>
                                {existingBike.bikeLabel} · Swap with {currentOccupant.name}
                              </span>
                            </span>
                          ) : existingBike ? (
                            <Badge tone="neutral">{existingBike.bikeLabel}</Badge>
                          ) : currentOccupant ? (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              Swap with {currentOccupant.name}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              Unassigned
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="slot-picker-option tactile"
                  onClick={() => {
                    handleUpdateTransportSlot(slotPicker.podId, slotPicker.slotIndex, null);
                    setSlotPicker(null);
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Clear slot</span>
                </button>
              </div>
            );
          })()}
      </LiquidBottomSheet>

      {/* Car Front Seat Single-Select Picker (RHD Driver & Front Left, Auto-Swap, Portal) */}
      <LiquidBottomSheet
        open={Boolean(carFrontPicker)}
        title={carFrontPicker?.slot === 'frontRight' ? 'Assign Driver' : 'Assign Front Left'}
        subtitle={
          carFrontPicker
            ? `${trip.transportPods.find((p) => p.id === carFrontPicker.podId)?.label ?? 'Car'} · ${
                carFrontPicker.slot === 'frontRight' ? 'Front Right (Driver)' : 'Front Left'
              }`
            : undefined
        }
        onClose={() => setCarFrontPicker(null)}
      >
        {carFrontPicker &&
          (() => {
            const targetPod = trip.transportPods.find((p) => p.id === carFrontPicker.podId);
            const targetSeats = normalizeCarSeats(targetPod);
            const currentOccupantId = targetSeats[carFrontPicker.slot];
            const currentOccupant = currentOccupantId
              ? memberById.get(currentOccupantId)
              : undefined;

            return (
              <div className="slot-picker-grid slot-picker-grid--train">
                {trip.members.map((m) => {
                  const isCurrent = m.id === currentOccupantId;
                  const existing = findMemberCarAssignment(trip.transportPods, m.id);
                  const existingText = existing
                    ? existing.carId === carFrontPicker.podId
                      ? existing.locationLabel
                      : `${existing.carLabel} · ${existing.locationLabel}`
                    : null;

                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`slot-picker-option tactile ${isCurrent ? 'slot-picker-option--current' : ''}`}
                      onClick={() => {
                        handleAssignCarFrontSeat(carFrontPicker.podId, carFrontPicker.slot, m.id);
                        setCarFrontPicker(null);
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <Avatar
                          initials={m.initials}
                          name={m.name}
                          src={m.avatarDataUrl}
                          size="sm"
                          bg={m.avatarBg}
                          color={m.avatarColor}
                          variant={m.status === 'tentative' ? 'tentative' : 'solid'}
                        />
                        <span>{m.status === 'tentative' ? `${m.name}?` : m.name}</span>
                      </span>

                      <span>
                        {isCurrent ? (
                          <Badge tone="matcha">Current</Badge>
                        ) : existingText && currentOccupant ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              color: 'var(--brand-matcha)',
                            }}
                          >
                            <ArrowLeftRight size={12} strokeWidth={2} />
                            <span>
                              {existingText} · Swap with {currentOccupant.name}
                            </span>
                          </span>
                        ) : existingText ? (
                          <Badge tone="neutral">{existingText}</Badge>
                        ) : currentOccupant ? (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            Replace {currentOccupant.name}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Unassigned
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  className="slot-picker-option tactile"
                  onClick={() => {
                    handleAssignCarFrontSeat(carFrontPicker.podId, carFrontPicker.slot, null);
                    setCarFrontPicker(null);
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Clear seat</span>
                </button>
              </div>
            );
          })()}
      </LiquidBottomSheet>

      {/* Car Bench Row Multi-Select Picker (Unlimited Middle & Back Rows, Portal) */}
      <LiquidBottomSheet
        open={Boolean(carRowPicker)}
        title={carRowPicker?.row === 'middle' ? 'Middle Row Riders' : 'Back Row Riders'}
        subtitle={
          carRowPicker
            ? `${trip.transportPods.find((p) => p.id === carRowPicker.podId)?.label ?? 'Car'} · Tap crew to add or remove (unlimited)`
            : undefined
        }
        onClose={() => setCarRowPicker(null)}
      >
        {carRowPicker &&
          (() => {
            const targetPod = trip.transportPods.find((p) => p.id === carRowPicker.podId);
            const targetSeats = normalizeCarSeats(targetPod);
            const seatedInRow = new Set(targetSeats[carRowPicker.row]);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="slot-picker-grid slot-picker-grid--train">
                  {trip.members.map((m) => {
                    const inThisRow = seatedInRow.has(m.id);
                    const existing = findMemberCarAssignment(trip.transportPods, m.id);
                    const elsewhereLabel =
                      existing && !inThisRow
                        ? existing.carId === carRowPicker.podId
                          ? existing.locationLabel
                          : `${existing.carLabel} · ${existing.locationLabel}`
                        : null;

                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={inThisRow}
                        className={`slot-picker-option tactile ${inThisRow ? 'slot-picker-option--current' : ''}`}
                        onClick={() =>
                          handleToggleCarBenchMember(carRowPicker.podId, carRowPicker.row, m.id)
                        }
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          <Avatar
                            initials={m.initials}
                            name={m.name}
                            src={m.avatarDataUrl}
                            size="sm"
                            bg={m.avatarBg}
                            color={m.avatarColor}
                            variant={m.status === 'tentative' ? 'tentative' : 'solid'}
                          />
                          <span>{m.status === 'tentative' ? `${m.name}?` : m.name}</span>
                        </span>

                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {elsewhereLabel && <Badge tone="neutral">{elsewhereLabel}</Badge>}
                          <span className={`car-picker-check ${inThisRow ? 'car-picker-check--on' : ''}`}>
                            {inThisRow && <Check size={13} strokeWidth={2.6} />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <Button variant="matcha" size="lg" fullWidth onClick={() => setCarRowPicker(null)}>
                  Done ({seatedInRow.size} seated)
                </Button>
              </div>
            );
          })()}
      </LiquidBottomSheet>

      {/* Full Crew / Train Pass / Pod / Stay Editor Sheets (All Portaled!) */}
      <TrainPassEditorSheet
        key={`tp-${trainEditorOpen ? 'open' : 'closed'}`}
        open={trainEditorOpen}
        trip={trip}
        uploaderName={activeMemberName}
        initial={trip.trainPass}
        onSave={handleSaveTrainPass}
        onClose={() => setTrainEditorOpen(false)}
      />

      <CrewMembersSheet
        open={crewManagerOpen}
        members={trip.members}
        transactions={trip.transactions}
        onSaveMember={handleSaveMember}
        onDeleteMember={handleDeleteMember}
        onClose={() => setCrewManagerOpen(false)}
      />

      <PodEditorSheet
        key={`pod-${podEditor.open ? podEditor.pod?.id ?? `new-${transportFilter}` : 'closed'}`}
        open={podEditor.open}
        initial={podEditor.pod}
        defaultMode={transportFilter}
        existingCount={trip.transportPods.filter((p) => p.mode === transportFilter).length}
        onSave={handleSavePod}
        onDelete={handleDeletePod}
        onClose={() => setPodEditor({ open: false, pod: null })}
      />

      <StayEditorSheet
        key={`stay-${stayEditor.open ? stayEditor.stay?.id ?? 'new' : 'closed'}`}
        open={stayEditor.open}
        trip={trip}
        uploaderName={activeMemberName}
        initial={stayEditor.stay}
        members={trip.members}
        onSave={handleSaveStay}
        onDelete={handleDeleteStay}
        onClose={() => setStayEditor({ open: false, stay: null })}
      />

      <PhotoCropperSheet
        open={Boolean(heroCropFile)}
        file={heroCropFile}
        preset="home-hero"
        onCancel={() => setHeroCropFile(null)}
        onConfirm={(cropped) => {
          setHeroCropFile(null);
          onUploadCover(cropped);
        }}
      />
    </div>
  );
}
