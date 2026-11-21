import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  BedDouble,
  Bike,
  Camera,
  Car,
  ChevronDown,
  Crown,
  Images,
  Pencil,
  Plus,
  TrainFront,
  Trash2,
  Users,
} from 'lucide-react';
import { Avatar, Badge, Button, CornerOrb, GlassCard } from '../../components/atoms';
import type { HomePhase } from '../../components/organisms/TripMenuSheet';
import { calculateLedger, formatCompactIDR } from '../../services/ledger';
import type {
  DockTabId,
  RouteTarget,
  SharedTrip,
  StayLodging,
  TrainPassInfo,
  TransportPod,
  TripMember,
} from '../../types/trip';
import {
  AddPodSheet,
  CrewMembersSheet,
  StayEditorSheet,
  TrainPassEditorSheet,
} from './CrewEditors';
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
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

export interface HomeScreenProps {
  trip: SharedTrip;
  phase: HomePhase;
  coverUrl: string;
  canEdit: boolean;
  onOpenMenu: () => void;
  onSwitchTrip: () => void;
  onNavigateTab: (tab: DockTabId) => void;
  onUploadCover: (file: File) => void;
  onRequestUnlockPin: () => void;
  onOpenRoute: (target: RouteTarget) => void;
  onUpdateTrip: (updater: (prev: SharedTrip) => SharedTrip, toastMsg?: string) => void;
}

export function HomeScreen({
  trip,
  phase,
  coverUrl,
  canEdit,
  onOpenMenu,
  onSwitchTrip,
  onNavigateTab,
  onUploadCover,
  onRequestUnlockPin,
  onOpenRoute,
  onUpdateTrip,
}: HomeScreenProps) {
  const [countdown, setCountdown] = useState<CountdownParts>(() =>
    getCountdownParts(trip.departureAt),
  );
  const [transportFilter, setTransportFilter] = useState<'bike' | 'train' | 'car'>('bike');
  const [editingCrew, setEditingCrew] = useState(false);

  const [trainSheetOpen, setTrainSheetOpen] = useState(false);
  const [trainEditorOpen, setTrainEditorOpen] = useState(false);
  const [crewManagerOpen, setCrewManagerOpen] = useState(false);
  const [addPodOpen, setAddPodOpen] = useState(false);
  const [stayEditor, setStayEditor] = useState<{ open: boolean; stay: StayLodging | null }>({
    open: false,
    stay: null,
  });
  const [slotPicker, setSlotPicker] = useState<{
    podId: string;
    slotIndex: number;
    label: string;
  } | null>(null);
  const [showCrewJump, setShowCrewJump] = useState(true);

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const crewSectionRef = useRef<HTMLElement | null>(null);

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

  const activeStop =
    trip.itinerary.find((item) => item.status === 'active') ??
    trip.itinerary.find((item) => item.status === 'upcoming');
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

  const handleUpdateTransportSlot = (
    podId: string,
    slotIndex: number,
    memberId: string | null,
  ) => {
    onUpdateTrip(
      (prev) => ({
        ...prev,
        transportPods: prev.transportPods.map((pod) =>
          pod.id !== podId
            ? pod
            : {
                ...pod,
                slots: pod.slots.map((s, idx) => (idx === slotIndex ? { ...s, memberId } : s)),
              },
        ),
      }),
      'Transport slot updated',
    );
  };

  const handleAddPod = (pod: TransportPod) => {
    setTransportFilter(pod.mode);
    onUpdateTrip(
      (prev) => ({ ...prev, transportPods: [...prev.transportPods, pod] }),
      `${pod.label} added`,
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

  return (
    <div className="home-root">
      {/* Full-Bleed Customizable Editorial Hero (Zero Top Bar) */}
      <section className={`home-hero ${phase === 'on-trip' ? 'home-hero--compact' : ''}`}>
        <img src={coverUrl} alt="" className="home-hero__bg" />
        <div className="home-hero__fade" aria-hidden="true" />

        <div className="home-hero__corners">
          <CornerOrb
            kind="custom"
            ariaLabel="Change local cover photo"
            icon={<Camera size={18} strokeWidth={1.8} />}
            onClick={() => coverInputRef.current?.click()}
          />
          <CornerOrb kind="menu" ariaLabel="Trip menu" onClick={onOpenMenu} />
        </div>

        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onUploadCover(file);
              e.target.value = '';
            }
          }}
        />

        <div className="home-hero__bottom">
          <div>
            <button type="button" className="home-title-trigger tactile" onClick={onSwitchTrip}>
              <h1 className="home-title">{trip.title}</h1>
              <ChevronDown size={22} strokeWidth={2} color="var(--text-secondary)" />
            </button>
            <p className="home-subtitle">{trip.subtitle}</p>
          </div>

          {phase === 'pre-trip' && (
            <div className="countdown-grid" aria-label="Departure countdown">
              <div className="countdown-cell">
                <span className="countdown-val">{countdown.days}</span>
                <span className="countdown-lbl">Days</span>
              </div>
              <div className="countdown-cell">
                <span className="countdown-val">{countdown.hours}</span>
                <span className="countdown-lbl">Hours</span>
              </div>
              <div className="countdown-cell">
                <span className="countdown-val">{countdown.minutes}</span>
                <span className="countdown-lbl">Mins</span>
              </div>
              <div className="countdown-cell">
                <span className="countdown-val">{countdown.seconds}</span>
                <span className="countdown-lbl">Secs</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* On-Trip Spotlight Now & Up Next */}
      {phase === 'on-trip' && activeStop && (
        <section aria-label="Current stop spotlight">
          <GlassCard variant="spotlight" padding="lg" className="spotlight-now">
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
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {activeStop.parkingNote}
                </p>
              )}
            </div>

            <div className="spotlight-footer">
              <Badge tone="matcha">{activeStop.type}</Badge>
              <Button
                variant="matcha"
                size="sm"
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
      )}

      {/* Bento Quick-Access Duo (Train Pass + Album ONLY) */}
      <section className="bento-duo" aria-label="Quick access">
        <GlassCard
          variant="clear"
          padding="md"
          interactive
          className="train-pass-tile"
          onClick={() => setTrainSheetOpen(true)}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <div className="train-route-code" style={{ marginTop: 6 }}>
              {trip.trainPass?.outboundRoute ?? 'Add Ticket'}
            </div>
          </div>
          <div className="train-pass-notch">
            <span>{trip.trainPass?.outboundTime ?? 'Tap to set up'}</span>
            <strong>{trip.trainPass?.outboundCode ?? ''}</strong>
          </div>
        </GlassCard>

        <GlassCard
          variant="clear"
          padding="md"
          interactive
          className="album-stack-tile"
          onClick={() => onNavigateTab('album')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
          <div className="album-fanned" aria-hidden="true">
            <span className="album-polaroid album-polaroid--1" />
            <span className="album-polaroid album-polaroid--2" />
            <span className="album-polaroid album-polaroid--3" />
          </div>
        </GlassCard>
      </section>

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
          <Button
            variant={editingCrew ? 'matcha' : 'glass'}
            size="sm"
            leftIcon={<Pencil size={13} strokeWidth={2} />}
            onClick={() => requireEdit(() => setEditingCrew((prev) => !prev))}
          >
            {editingCrew ? 'Done' : 'Edit'}
          </Button>
        </div>

        {/* Crew Management Action Bar when Editing */}
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
              onClick={() => setAddPodOpen(true)}
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
          {carPods.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={transportFilter === 'car'}
              className={`mode-chip tactile ${transportFilter === 'car' ? 'mode-chip--active' : ''}`}
              onClick={() => setTransportFilter('car')}
            >
              <Car size={15} strokeWidth={1.8} />
              <span>Cars ({carPods.length})</span>
            </button>
          )}
        </div>

        {transportFilter === 'bike' ? (
          <div className="bike-pod-list">
            {bikePods.length === 0 && (
              <GlassCard variant="clear" padding="md">
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  No bikes configured yet. Tap <strong>Edit</strong> to add a transport pod.
                </div>
              </GlassCard>
            )}
            {bikePods.map((pod) => (
              <GlassCard key={pod.id} variant="clear" padding="sm" className="bike-pod">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {pod.label}
                  </div>
                  {pod.meta && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pod.meta}</div>
                  )}
                </div>

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
                          size="sm"
                          bg={m?.avatarBg ?? '#EAEFED'}
                          color={m?.avatarColor ?? '#546860'}
                          variant={avatarVariant}
                        />
                        <span>{m ? (isTentative ? `${m.name}?` : m.name) : 'Open'}</span>
                      </button>
                    );
                  })}
                  {editingCrew && (
                    <button
                      type="button"
                      aria-label={`Remove ${pod.label}`}
                      onClick={() => handleDeletePod(pod.id)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-coral)',
                        background: 'var(--accent-coral-soft)',
                      }}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <div className="bike-pod-list">
            {(transportFilter === 'train' ? trainPods : carPods).map((pod) => (
              <GlassCard key={pod.id} variant="clear" padding="md">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 16,
                        fontWeight: 600,
                      }}
                    >
                      {pod.label}
                    </div>
                    {pod.meta && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{pod.meta}</div>
                    )}
                  </div>
                  {editingCrew && (
                    <Button variant="danger" size="sm" onClick={() => handleDeletePod(pod.id)}>
                      <Trash2 size={13} strokeWidth={2} />
                    </Button>
                  )}
                </div>
                <div className="train-seat-grid">
                  {pod.slots.map((slot, idx) => {
                    const m = slot.memberId ? memberById.get(slot.memberId) : undefined;
                    return (
                      <button
                        key={`${pod.id}-${idx}`}
                        type="button"
                        className="train-seat-cell tactile"
                        onClick={() => {
                          if (!editingCrew) return;
                          setSlotPicker({
                            podId: pod.id,
                            slotIndex: idx,
                            label: `${pod.label} · ${slot.role}`,
                          });
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Avatar
                            initials={m?.initials ?? '?'}
                            size="sm"
                            bg={m?.avatarBg ?? '#EAEFED'}
                            color={m?.avatarColor ?? '#546860'}
                            variant={m?.status === 'tentative' ? 'tentative' : 'solid'}
                          />
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                            {m ? (m.status === 'tentative' ? `${m.name}?` : m.name) : 'Open'}
                          </span>
                        </span>
                        <Badge tone="neutral">{slot.role}</Badge>
                      </button>
                    );
                  })}
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Homestay Cards with Room 1 & Room 2 Slots */}
        {trip.stays.map((stay) => (
          <GlassCard key={stay.id} variant="clear" padding="md">
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
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+ Extra bed</span>
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
          </GlassCard>
        ))}
      </section>

      {/* Floating Jump Pill (Crew ↓) above Dock */}
      {showCrewJump && (
        <button
          type="button"
          className="floating-crew-jump"
          onClick={() => crewSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span>Crew</span>
          <ArrowDown size={14} strokeWidth={2} />
        </button>
      )}

      {/* Train Pass Detail Sheet (with Edit Button!) */}
      {trainSheetOpen && (
        <div
          className="gk-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setTrainSheetOpen(false)}
        >
          <div className="gk-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="gk-sheet__handle" />
            <div className="gk-sheet__head">
              <div>
                <h3 className="gk-sheet__title">
                  {trip.trainPass?.trainName ?? 'Train Pass'}
                </h3>
                <p className="gk-sheet__sub">
                  {trip.trainPass?.outboundCode
                    ? `${trip.trainPass.outboundCode} · Round Trip`
                    : 'Add your boarding schedule'}
                </p>
              </div>
              <CornerOrb
                kind="close"
                ariaLabel="Close train pass"
                onClick={() => setTrainSheetOpen(false)}
              />
            </div>

            {trip.trainPass ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <GlassCard variant="tinted" padding="md">
                  <Badge tone="matcha">Outbound</Badge>
                  <div className="train-route-code" style={{ marginTop: 8 }}>
                    {trip.trainPass.outboundRoute}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                    {trip.trainPass.outboundDate} · {trip.trainPass.outboundTime}
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
          </div>
        </div>
      )}

      {/* Inline Transport Slot Avatar Picker Sheet */}
      {slotPicker && (
        <div
          className="gk-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setSlotPicker(null)}
        >
          <div className="gk-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="gk-sheet__handle" />
            <div className="gk-sheet__head">
              <div>
                <h3 className="gk-sheet__title">Assign Rider</h3>
                <p className="gk-sheet__sub">{slotPicker.label}</p>
              </div>
              <CornerOrb
                kind="close"
                ariaLabel="Close picker"
                onClick={() => setSlotPicker(null)}
              />
            </div>
            <div className="slot-picker-grid">
              {trip.members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="slot-picker-option tactile"
                  onClick={() => {
                    handleUpdateTransportSlot(slotPicker.podId, slotPicker.slotIndex, m.id);
                    setSlotPicker(null);
                  }}
                >
                  <Avatar
                    initials={m.initials}
                    size="sm"
                    bg={m.avatarBg}
                    color={m.avatarColor}
                    variant={m.status === 'tentative' ? 'tentative' : 'solid'}
                  />
                  <span>{m.status === 'tentative' ? `${m.name}?` : m.name}</span>
                </button>
              ))}
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
          </div>
        </div>
      )}

      {/* Full Crew / Train Pass / Pod / Stay Editor Sheets */}
      <TrainPassEditorSheet
        key={`tp-${trainEditorOpen ? 'open' : 'closed'}`}
        open={trainEditorOpen}
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

      <AddPodSheet
        key={`pod-${addPodOpen ? transportFilter : 'closed'}`}
        open={addPodOpen}
        defaultMode={transportFilter}
        existingCount={trip.transportPods.filter((p) => p.mode === transportFilter).length}
        onAdd={handleAddPod}
        onClose={() => setAddPodOpen(false)}
      />

      <StayEditorSheet
        key={`stay-${stayEditor.open ? stayEditor.stay?.id ?? 'new' : 'closed'}`}
        open={stayEditor.open}
        initial={stayEditor.stay}
        members={trip.members}
        onSave={handleSaveStay}
        onDelete={handleDeleteStay}
        onClose={() => setStayEditor({ open: false, stay: null })}
      />
    </div>
  );
}
