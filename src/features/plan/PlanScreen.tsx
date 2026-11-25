import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarPlus,
  Check,
  Clapperboard,
  FileSpreadsheet,
  Map as MapIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  CornerOrb,
  DayPill,
  EmptyState,
  GlassCard,
  TrailDot,
} from '../../components/atoms';
import { ContentIdeaSheet } from '../../components/organisms/ContentIdeaSheet';
import type { HomePhase } from '../../components/organisms/TripMenuSheet';
import { useHorizontalScrollFade } from '../../hooks/useHorizontalScrollFade';
import {
  formatPlatformLabel,
  mergePlanEntries,
  togglePlanFilter,
  type PlanFilterCategory,
} from '../../services/contentIdeas';
import { exportTripToExcel } from '../../services/excelExporter';
import { primeFeedbackAudio, triggerFeedback } from '../../services/feedback';
import { formatCompactIDR } from '../../services/ledger';
import {
  getGoogleMapsRouteUrl,
  hasGoogleMapsRoute,
  resolvePlanLiveState,
} from '../../services/planSchedule';
import { useBackHandler } from '../../services/pwaHistory';
import { isClosedOnDate } from '../../services/planUtils';
import type {
  ContentIdea,
  ContentIdeaStatus,
  PlanItem,
  PlanItemType,
  RouteTarget,
  SharedTrip,
  TripDay,
} from '../../types/trip';
import {
  ARC_HEIGHT,
  ARC_MAX_X,
  ARC_WIDTH,
  buildDottedArcPath,
  findClosestArcRow,
  getArcX,
} from './arcMath';
import { PlanDetailEditScreen } from './PlanDetailEditScreen';
import './plan.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOT_HALF_SIZE = 14; // .trail-item__dot is 28x28 -> center offset = 14px

/**
 * Detects native CSS Scroll-Driven Animations (`animation-timeline: view()`).
 * When supported (Android Chrome, Chrome Desktop, Edge), 100% of Circular Trail motion
 * runs on the GPU Compositor Thread with ZERO JS scroll listeners or inline style writes.
 */
const SUPPORTS_CSS_SCROLL_ARC =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-timeline', 'view()');

function formatEstimate(cost?: number): string {
  if (cost === undefined) return '—';
  if (cost === 0) return 'Free';
  return formatCompactIDR(cost);
}

function formatStopType(type: PlanItemType): string {
  if (type === 'transit') return 'Transit';
  if (type === 'activity') return 'Activity';
  return 'Place';
}

export interface PlanScreenProps {
  trip: SharedTrip;
  homePhase?: HomePhase;
  activeMemberId: string | null;
  activeMemberName: string;
  canEdit: boolean;
  canDeleteIdeas?: boolean;
  onRequestUnlockPin: () => void;
  onOpenRoute: (target: RouteTarget) => void;
  onUpdateTrip: (updater: (prev: SharedTrip) => SharedTrip, toastMsg?: string) => void;
  onNotify?: (msg: string, tone?: 'success' | 'info' | 'error') => void;
}

export function PlanScreen({
  trip,
  homePhase = 'pre-trip',
  activeMemberId,
  activeMemberName,
  canEdit,
  canDeleteIdeas = canEdit,
  onRequestUnlockPin,
  onOpenRoute,
  onUpdateTrip,
  onNotify,
}: PlanScreenProps) {
  const [viewMode, setViewMode] = useState<'trail' | 'table'>('trail');
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [selectedDayId, setSelectedDayId] = useState<string>(
    () => resolvePlanLiveState(trip.days, trip.itinerary).defaultDayId,
  );
  const [selectedFilters, setSelectedFilters] = useState<PlanFilterCategory[]>([]);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [draftNewStop, setDraftNewStop] = useState<PlanItem | null>(null);
  const [activeIdeaModal, setActiveIdeaModal] = useState<ContentIdea | null>(null);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Record<string, boolean>>({});
  const [stageHeight, setStageHeight] = useState<number>(ARC_HEIGHT);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listInnerRef = useRef<HTMLDivElement | null>(null);
  const dayStripRef = useRef<HTMLDivElement | null>(null);
  const filterRowRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dotRefs = useRef<Map<string, HTMLElement>>(new Map());
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const metricsRef = useRef<{
    halfH: number;
    rows: Array<{ id: string; centerY: number }>;
  }>({ halfH: ARC_HEIGHT / 2, rows: [] });
  const centeredIdRef = useRef<string | null>(null);
  const userInteractedRef = useRef<boolean>(false);

  const dayStripFade = useHorizontalScrollFade(dayStripRef, [trip.days.length, canEdit]);
  const filterRowFade = useHorizontalScrollFade(filterRowRef, [viewMode]);

  const filterKey = selectedFilters.join(',');
  const isContentOnlyFilter =
    selectedFilters.length === 1 && selectedFilters[0] === 'content';

  const selectedDay = trip.days.find((d) => d.id === selectedDayId) ?? trip.days[0];
  const dayLabelStr = selectedDay?.isIdeas
    ? 'Ideas'
    : `${selectedDay?.dayLabel ?? ''} ${selectedDay?.dateNum ?? ''}`.trim();

  const allDayItems = useMemo(
    () =>
      trip.itinerary
        .filter((item) => item.dayId === selectedDay?.id)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [trip.itinerary, selectedDay?.id],
  );

  const timelineEntries = useMemo(
    () => mergePlanEntries(trip.itinerary, trip.contentIdeas, selectedDay?.id, selectedFilters),
    [trip.itinerary, trip.contentIdeas, selectedDay?.id, selectedFilters],
  );

  // Lightweight 60s real-time clock tick so NOW advances automatically on Hari-H without refresh
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowDate(new Date());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Re-sync default day cleanly if user switches to a different trip
  useEffect(() => {
    setSelectedDayId(resolvePlanLiveState(trip.days, trip.itinerary).defaultDayId);
  }, [trip.id]);

  // Exit draft stop creation cleanly if edit rights are hidden (e.g., View-Only Mode enabled)
  useEffect(() => {
    if (!canEdit) {
      setDraftNewStop(null);
    }
  }, [canEdit]);

  const liveState = useMemo(
    () =>
      resolvePlanLiveState(trip.days, trip.itinerary, nowDate, {
        simulateLive: homePhase === 'on-trip',
      }),
    [trip.days, trip.itinerary, nowDate, homePhase],
  );

  const effectiveStatusMap = liveState.stopStatuses;

  const dottedArcPath = useMemo(
    () => buildDottedArcPath(14, 56, stageHeight),
    [stageHeight],
  );

  const activeEditingItem = draftNewStop
    ? draftNewStop
    : editingStopId
      ? trip.itinerary.find((i) => i.id === editingStopId) ?? null
      : null;

  useBackHandler(
    Boolean(activeEditingItem),
    () => {
      setDraftNewStop(null);
      setEditingStopId(null);
    },
    'view',
    'plan-detail-edit',
  );

  /**
   * Pre-measures every row's static vertical center inside `.trail-scroll-viewport`
   * OUTSIDE scroll frames so scrolling triggers ZERO `getBoundingClientRect()` layout reads.
   */
  const measureArcMetrics = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const h = scroller.clientHeight || stageRef.current?.clientHeight || ARC_HEIGHT;
    const halfH = Math.max(120, h / 2);
    const rows: Array<{ id: string; centerY: number }> = [];

    for (const entry of timelineEntries) {
      const rowEl = rowRefs.current.get(entry.id);
      if (!rowEl) continue;
      rows.push({
        id: entry.id,
        centerY: rowEl.offsetTop + rowEl.offsetHeight / 2,
      });
    }

    metricsRef.current = { halfH, rows };
  }, [timelineEntries]);

  /**
   * Silky GPU-composited 60/120fps Arc Geometry:
   * - Reads `scroller.scrollTop` ONCE (zero layout thrashing, zero React setState mid-scroll).
   * - Places every TrailDot at exact `(getArcX(u), y)` on the frozen circular rail.
   * - Updates only `transform: translate3d(...) scale(...)`, `opacity`, and the DOM class
   *   `.trail-item--centered` directly via refs so mobile scrolling stays locked at 60+ fps.
   */
  const syncArcPositions = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let { halfH, rows } = metricsRef.current;
    if (rows.length !== timelineEntries.length) {
      measureArcMetrics();
      ({ halfH, rows } = metricsRef.current);
    }
    if (rows.length === 0) return;

    const scrollTop = scroller.scrollTop;
    let closestId: string | null = null;
    let minDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < rows.length; i += 1) {
      const metric = rows[i];
      const dotEl = dotRefs.current.get(metric.id);
      const cardEl = cardRefs.current.get(metric.id);
      if (!dotEl || !cardEl) continue;

      const u = (metric.centerY - scrollTop - halfH) / halfH;
      const absU = Math.abs(u);

      if (absU < minDist) {
        minDist = absU;
        closestId = metric.id;
      }

      const clampedAbsU = absU > 1 ? 1 : absU;
      const exactX = getArcX(u);
      const focus = Math.pow(1 - clampedAbsU, 1.35);

      const dotScale = 0.86 + focus * 0.24;
      dotEl.style.transform = `translate3d(${(exactX - DOT_HALF_SIZE).toFixed(1)}px, 0, 0) scale(${dotScale.toFixed(3)})`;

      const cardShiftX = exactX - ARC_MAX_X; // 0 at apex -> -28px at top/bottom
      const cardScale = 0.88 + focus * 0.12;
      const cardOpacity = 0.52 + focus * 0.48;
      cardEl.style.transform = `translate3d(${cardShiftX.toFixed(1)}px, 0, 0) scale(${cardScale.toFixed(3)})`;
      cardEl.style.opacity = cardOpacity.toFixed(3);
    }

    if (closestId && closestId !== centeredIdRef.current) {
      const prevId = centeredIdRef.current;
      if (prevId) {
        rowRefs.current.get(prevId)?.classList.remove('trail-item--centered');
      }
      rowRefs.current.get(closestId)?.classList.add('trail-item--centered');
      centeredIdRef.current = closestId;
    }
  }, [timelineEntries.length, measureArcMetrics]);

  // Ensure window scroll starts cleanly at top when Plan or Detail opens so frozen header never clips
  useEffect(() => {
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
  }, [activeEditingItem]);

  // Measure frozen trail stage height so dotted SVG path stays 100% circular (zero stretching)
  useEffect(() => {
    if (viewMode !== 'trail' || activeEditingItem) return;
    const stageEl = stageRef.current;
    if (!stageEl) return;

    const updateSize = () => {
      const h = Math.round(stageEl.clientHeight);
      if (h >= 160) setStageHeight(h);
    };
    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateSize);
      ro.observe(stageEl);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [viewMode, activeEditingItem]);

  // Fallback JS rAF scroll listener ONLY on browsers without CSS `animation-timeline: view()`
  // (Android Chrome & modern browsers run 100% off-main-thread on the GPU Compositor Thread!)
  useEffect(() => {
    if (SUPPORTS_CSS_SCROLL_ARC) return;
    if (viewMode !== 'trail' || activeEditingItem || timelineEntries.length === 0) return;
    const scroller = scrollRef.current;
    const listInner = listInnerRef.current;
    if (!scroller) return;

    let rafId = 0;
    const scheduleSync = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        syncArcPositions();
      });
    };

    const handleLayoutChange = () => {
      measureArcMetrics();
      scheduleSync();
    };

    const markUserInteracted = () => {
      userInteractedRef.current = true;
    };

    measureArcMetrics();
    syncArcPositions();
    const initRaf = window.requestAnimationFrame(() => {
      measureArcMetrics();
      syncArcPositions();
    });

    let listRo: ResizeObserver | null = null;
    if (listInner && typeof ResizeObserver !== 'undefined') {
      listRo = new ResizeObserver(handleLayoutChange);
      listRo.observe(listInner);
    }

    scroller.addEventListener('scroll', scheduleSync, { passive: true });
    scroller.addEventListener('touchstart', markUserInteracted, { passive: true });
    scroller.addEventListener('wheel', markUserInteracted, { passive: true });
    scroller.addEventListener('pointerdown', markUserInteracted, { passive: true });
    window.addEventListener('resize', handleLayoutChange, { passive: true });

    return () => {
      window.cancelAnimationFrame(initRaf);
      if (rafId) window.cancelAnimationFrame(rafId);
      listRo?.disconnect();
      scroller.removeEventListener('scroll', scheduleSync);
      scroller.removeEventListener('touchstart', markUserInteracted);
      scroller.removeEventListener('wheel', markUserInteracted);
      scroller.removeEventListener('pointerdown', markUserInteracted);
      window.removeEventListener('resize', handleLayoutChange);
    };
  }, [viewMode, activeEditingItem, timelineEntries, stageHeight, measureArcMetrics, syncArcPositions]);

  // Tactile Rotary-Wheel Detent + Universal Center Magnetic Rest ("ttrrrrrrrrrr... TEK!")
  // Works on BOTH CSS Scroll-Driven Chrome/Android & fallback browsers with ZERO layout thrashing:
  // - Fast flicks fly unconstrained at 60–120fps on GPU compositor (no scroll-snap braking).
  // - Tracks nearest centered row via cached `metricsRef` and highlights `.trail-item--centered`.
  // - Once finger is released & momentum stops, softly glides the nearest stop right onto
  //   the outermost arc apex (`u = 0`) and fires `settle` ("ting-tek!") haptic & audio.
  useEffect(() => {
    if (viewMode !== 'trail' || activeEditingItem || timelineEntries.length === 0) return;
    const scroller = scrollRef.current;
    const listInner = listInnerRef.current;
    if (!scroller) return;

    const SCROLL_NOTCH_PX = 34; // Rotary wheel notch interval for crisp "ttrrrrrr..." glide feel
    const MIN_TICK_GAP_MS = 38; // Gives Android ERM/LRA motors clean separation between ticks
    const SETTLE_DELAY_MS = 125; // Triggers magnetic center-dock right as momentum ends
    const MAGNET_MIN_DIST_PX = 3; // Only smooth-glide if > 3px away from dead-center apex

    let lastNotchScrollTop = scroller.scrollTop;
    let lastTickTime = 0;
    let needsMagneticSettle = false;
    let pointerActive = false;
    let suppressDetentUntilMs = 0;
    let settleTimerId: number | null = null;
    let settleResetTimerId: number | null = null;

    const clearSettleTimer = () => {
      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
        settleTimerId = null;
      }
    };

    const updateCenteredClassOnly = (scrollTop: number) => {
      if (metricsRef.current.rows.length !== timelineEntries.length) {
        measureArcMetrics();
      }
      const { halfH, rows } = metricsRef.current;
      const match = findClosestArcRow(
        rows,
        scrollTop,
        halfH,
        scroller.scrollHeight - scroller.clientHeight,
      );
      if (match && match.id !== centeredIdRef.current) {
        if (centeredIdRef.current) {
          rowRefs.current.get(centeredIdRef.current)?.classList.remove('trail-item--centered');
        }
        rowRefs.current.get(match.id)?.classList.add('trail-item--centered');
        centeredIdRef.current = match.id;
      }
      return match;
    };

    const runMagneticSettle = () => {
      if (pointerActive || !needsMagneticSettle) return;
      needsMagneticSettle = false;

      const currentTop = scroller.scrollTop;
      const match = updateCenteredClassOnly(currentTop);
      if (!match) return;

      const delta = Math.abs(match.targetScrollTop - currentTop);
      if (delta > MAGNET_MIN_DIST_PX) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        suppressDetentUntilMs = now + 380;
        if (settleResetTimerId !== null) window.clearTimeout(settleResetTimerId);
        settleResetTimerId = window.setTimeout(() => {
          lastNotchScrollTop = scroller.scrollTop;
          settleResetTimerId = null;
        }, 390);
        try {
          scroller.scrollTo({ top: match.targetScrollTop, behavior: 'smooth' });
        } catch {
          scroller.scrollTop = match.targetScrollTop;
        }
      }
      lastNotchScrollTop = match.targetScrollTop;
      triggerFeedback('settle');
    };

    const scheduleSettleCheck = () => {
      clearSettleTimer();
      settleTimerId = window.setTimeout(() => {
        settleTimerId = null;
        runMagneticSettle();
      }, SETTLE_DELAY_MS);
    };

    const handleUserTouchOrWheel = () => {
      userInteractedRef.current = true;
      suppressDetentUntilMs = 0;
      lastNotchScrollTop = scroller.scrollTop;
      primeFeedbackAudio();
    };

    const handlePointerDown = () => {
      pointerActive = true;
      clearSettleTimer();
      handleUserTouchOrWheel();
    };

    const handlePointerUp = () => {
      if (!pointerActive) return;
      pointerActive = false;
      if (needsMagneticSettle) {
        scheduleSettleCheck();
      }
    };

    const handleTouchMovePrime = () => {
      pointerActive = true;
      if (!userInteractedRef.current) {
        userInteractedRef.current = true;
        lastNotchScrollTop = scroller.scrollTop;
      }
      primeFeedbackAudio();
    };

    const handleTrailScrollDetent = () => {
      if (!userInteractedRef.current) {
        lastNotchScrollTop = scroller.scrollTop;
        return;
      }

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const currentTop = scroller.scrollTop;

      if (now < suppressDetentUntilMs) {
        lastNotchScrollTop = currentTop;
        return;
      }

      needsMagneticSettle = true;

      if (SUPPORTS_CSS_SCROLL_ARC) {
        updateCenteredClassOnly(currentTop);
      }

      const moved = Math.abs(currentTop - lastNotchScrollTop);
      if (moved >= SCROLL_NOTCH_PX) {
        if (now - lastTickTime >= MIN_TICK_GAP_MS) {
          triggerFeedback('tick');
          lastTickTime = now;
        }
        const steps = Math.floor(moved / SCROLL_NOTCH_PX);
        lastNotchScrollTop +=
          currentTop > lastNotchScrollTop ? steps * SCROLL_NOTCH_PX : -steps * SCROLL_NOTCH_PX;
      }

      if (!pointerActive) {
        scheduleSettleCheck();
      }
    };

    // Keep cached row offsets fresh when card heights resize (zero reads during scroll frames)
    measureArcMetrics();
    let listRo: ResizeObserver | null = null;
    if (listInner && typeof ResizeObserver !== 'undefined') {
      listRo = new ResizeObserver(() => measureArcMetrics());
      listRo.observe(listInner);
    }

    scroller.addEventListener('touchstart', handlePointerDown, { passive: true });
    scroller.addEventListener('pointerdown', handlePointerDown, { passive: true });
    scroller.addEventListener('touchmove', handleTouchMovePrime, { passive: true });
    window.addEventListener('touchend', handlePointerUp, { passive: true });
    window.addEventListener('touchcancel', handlePointerUp, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    window.addEventListener('pointercancel', handlePointerUp, { passive: true });
    scroller.addEventListener('wheel', handleUserTouchOrWheel, { passive: true });
    scroller.addEventListener('scroll', handleTrailScrollDetent, { passive: true });

    return () => {
      clearSettleTimer();
      if (settleResetTimerId !== null) window.clearTimeout(settleResetTimerId);
      listRo?.disconnect();
      scroller.removeEventListener('touchstart', handlePointerDown);
      scroller.removeEventListener('pointerdown', handlePointerDown);
      scroller.removeEventListener('touchmove', handleTouchMovePrime);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      scroller.removeEventListener('wheel', handleUserTouchOrWheel);
      scroller.removeEventListener('scroll', handleTrailScrollDetent);
    };
  }, [
    viewMode,
    activeEditingItem,
    timelineEntries.length,
    selectedDayId,
    filterKey,
    stageHeight,
    measureArcMetrics,
  ]);

  // Auto-center the active ("Now") or next upcoming stop when switching day/filter
  useEffect(() => {
    if (viewMode !== 'trail' || activeEditingItem || timelineEntries.length === 0) return;
    userInteractedRef.current = false;
    if (centeredIdRef.current) {
      rowRefs.current.get(centeredIdRef.current)?.classList.remove('trail-item--centered');
    }
    centeredIdRef.current = null;

    const targetEntry =
      timelineEntries.find(
        (e) => e.kind === 'stop' && effectiveStatusMap.get(e.id) === 'active',
      ) ??
      timelineEntries.find(
        (e) =>
          (e.kind === 'stop' && effectiveStatusMap.get(e.id) !== 'done') ||
          (e.kind === 'idea' && e.idea.status !== 'shot'),
      ) ??
      timelineEntries[0];

    const raf = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      const rowEl = targetEntry ? rowRefs.current.get(targetEntry.id) : undefined;
      if (scroller && rowEl) {
        const targetTop =
          rowEl.offsetTop - scroller.clientHeight / 2 + rowEl.offsetHeight / 2;
        scroller.scrollTop = Math.max(0, targetTop);
        rowEl.classList.add('trail-item--centered');
        centeredIdRef.current = targetEntry.id;
      }
      measureArcMetrics();
      if (!SUPPORTS_CSS_SCROLL_ARC) {
        syncArcPositions();
      }
    });

    return () => window.cancelAnimationFrame(raf);
  }, [selectedDayId, filterKey, viewMode, activeEditingItem, timelineEntries.length]);

  const handleAddDay = () => {
    if (!canEdit) {
      onRequestUnlockPin();
      return;
    }
    const datedDays = trip.days.filter((d) => !d.isIdeas && d.date);
    const last = datedDays[datedDays.length - 1];
    const nextDateObj = last ? new Date(`${last.date}T00:00:00`) : new Date();
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const iso = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
    const newDay: TripDay = {
      id: `day-${Date.now().toString(36)}`,
      date: iso,
      dayLabel: WEEKDAYS[nextDateObj.getDay()],
      dateNum: String(nextDateObj.getDate()),
      city: last?.city || 'Trip',
    };

    triggerFeedback('success');
    onUpdateTrip((prev) => {
      const ideasIdx = prev.days.findIndex((d) => d.isIdeas);
      const nextDays = [...prev.days];
      if (ideasIdx >= 0) nextDays.splice(ideasIdx, 0, newDay);
      else nextDays.push(newDay);
      return { ...prev, days: nextDays, endDate: iso };
    }, `Added ${newDay.dayLabel} ${newDay.dateNum}`);
    setSelectedDayId(newDay.id);
  };

  const handleAddNewStop = () => {
    if (!canEdit) {
      onRequestUnlockPin();
      return;
    }
    const fresh: PlanItem = {
      id: `it-${Date.now().toString(36)}`,
      dayId: selectedDay?.id ?? trip.days[0]?.id ?? 'day-1',
      type: 'place',
      title: '',
      startTime: '09:00',
      locationHint: '',
      address: '',
      status: selectedDay?.isIdeas ? 'idea' : 'upcoming',
      notes: [],
      notesHtml: '',
    };
    setDraftNewStop(fresh);
    setEditingStopId(null);
  };

  const handleQuickPersistNotesHtml = (itemId: string, notesHtml: string) => {
    onUpdateTrip((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((i) => (i.id === itemId ? { ...i, notesHtml } : i)),
    }));
  };

  const handleQuickPersistCover = (itemId: string, coverUrl: string | undefined) => {
    setFailedPhotoIds((prev) => {
      if (!prev[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    onUpdateTrip((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((i) => (i.id === itemId ? { ...i, coverUrl } : i)),
    }));
  };

  const handleSaveStop = (updated: PlanItem) => {
    triggerFeedback('success');
    setFailedPhotoIds((prev) => {
      if (!prev[updated.id]) return prev;
      const next = { ...prev };
      delete next[updated.id];
      return next;
    });
    onUpdateTrip((prev) => {
      const exists = prev.itinerary.some((i) => i.id === updated.id);
      return {
        ...prev,
        itinerary: exists
          ? prev.itinerary.map((i) => (i.id === updated.id ? updated : i))
          : [...prev.itinerary, updated],
      };
    }, 'Itinerary stop saved');
    setSelectedDayId(updated.dayId);
    setDraftNewStop(null);
    setEditingStopId(null);
  };

  const handleDeleteStop = (itemId: string) => {
    triggerFeedback('warning');
    onUpdateTrip(
      (prev) => ({ ...prev, itinerary: prev.itinerary.filter((i) => i.id !== itemId) }),
      'Stop deleted',
    );
    setDraftNewStop(null);
    setEditingStopId(null);
  };

  const handleToggleIdeaShot = (idea: ContentIdea) => {
    const nextStatus: ContentIdeaStatus = idea.status === 'shot' ? 'to-shoot' : 'shot';
    triggerFeedback(nextStatus === 'shot' ? 'check' : 'uncheck');
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

  const handleSaveIdea = (saved: ContentIdea, isNew: boolean) => {
    triggerFeedback('success');
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
    triggerFeedback('warning');
    onUpdateTrip(
      (prev) => ({
        ...prev,
        contentIdeas: (prev.contentIdeas ?? []).filter((i) => i.id !== ideaId),
      }),
      'Content idea deleted',
    );
  };

  const openExternalGoogleMaps = (stop: PlanItem) => {
    const url = getGoogleMapsRouteUrl(stop);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openDayOfflineRouteMap = () => {
    const fallbackAllStops = trip.itinerary
      .filter((item) => item.status !== 'idea')
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const mapStops = allDayItems.length > 0 ? allDayItems : fallbackAllStops;
    const focused =
      mapStops.find((s) => effectiveStatusMap.get(s.id) === 'active') ??
      mapStops.find((s) => effectiveStatusMap.get(s.id) !== 'done') ??
      mapStops[0];

    onOpenRoute({
      title: focused?.title || `${dayLabelStr || 'Trip'} Route`,
      subtitle: selectedDay?.city
        ? `${dayLabelStr} · ${selectedDay.city}`
        : focused?.locationHint || trip.title,
      address: focused?.address,
      parkingNote: focused?.parkingNote,
      mapsUrl: focused?.mapsUrl,
      coords: focused?.coords,
      dayLabel: dayLabelStr || 'Route',
      dayItems: mapStops,
      focusedItemId: focused?.id,
    });
  };

  if (activeEditingItem) {
    return (
      <PlanDetailEditScreen
        key={activeEditingItem.id}
        trip={trip}
        uploaderName={activeMemberName}
        item={activeEditingItem}
        days={trip.days}
        dayItems={allDayItems}
        isNew={Boolean(draftNewStop)}
        canEdit={canEdit}
        onOpenRoute={onOpenRoute}
        onQuickPersistNotesHtml={handleQuickPersistNotesHtml}
        onQuickPersistCover={handleQuickPersistCover}
        onNotify={onNotify}
        onSave={handleSaveStop}
        onDelete={handleDeleteStop}
        onBack={() => {
          setDraftNewStop(null);
          setEditingStopId(null);
        }}
      />
    );
  }

  return (
    <div className="plan-root">
      {/* FROZEN HEADER: Title, Offline Route Map Icon + Trail|Table Switcher, Day Pills, Filters */}
      <div className="plan-frozen-header">
        <header className="plan-header">
          <h1 className="plan-title">Plan</h1>
          <div className="plan-header-actions">
            <button
              type="button"
              className="plan-map-btn tactile"
              aria-label="Open offline route map"
              title="Offline route map"
              onClick={() => {
                triggerFeedback('tap');
                openDayOfflineRouteMap();
              }}
            >
              <MapIcon size={18} strokeWidth={1.9} />
            </button>
            <div className="plan-view-switch" role="tablist" aria-label="Plan view mode">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'trail'}
                className={`plan-view-btn ${viewMode === 'trail' ? 'plan-view-btn--active' : ''}`}
                onClick={() => {
                  triggerFeedback('tap');
                  setViewMode('trail');
                }}
              >
                Trail
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'table'}
                className={`plan-view-btn ${viewMode === 'table' ? 'plan-view-btn--active' : ''}`}
                onClick={() => {
                  triggerFeedback('tap');
                  setViewMode('table');
                }}
              >
                Table
              </button>
            </div>
          </div>
        </header>

        {/* Vertical Day Strip + Dashed + Day (Editors Only) */}
        <div
          ref={dayStripRef}
          data-fade={dayStripFade.dataFade}
          className="plan-day-strip"
          role="tablist"
          aria-label="Trip days"
        >
          {trip.days.map((day) => (
            <DayPill
              key={day.id}
              variant={day.isIdeas ? 'ideas' : 'day'}
              dayLabel={day.dayLabel}
              dateNum={day.dateNum}
              active={selectedDay?.id === day.id}
              onClick={() => {
                triggerFeedback('tap');
                setSelectedDayId(day.id);
              }}
            />
          ))}
          {canEdit && <DayPill variant="add" onClick={handleAddDay} />}
        </div>

        {/* Multi-Select Category Filter Pills (selecting all collapses to All) */}
        <div
          ref={filterRowRef}
          data-fade={filterRowFade.dataFade}
          className="plan-filter-row plan-filter-row--bleed"
          role="group"
          aria-label="Stop type filter"
        >
          {(['all', 'transit', 'place', 'activity', 'content'] as const).map((f) => {
            const isActive =
              f === 'all' ? selectedFilters.length === 0 : selectedFilters.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={isActive}
                className={[
                  'plan-chip',
                  'tactile',
                  isActive
                    ? f === 'content'
                      ? 'plan-chip--content-active'
                      : 'plan-chip--active'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  triggerFeedback('toggle');
                  setSelectedFilters((prev) => togglePlanFilter(prev, f));
                }}
              >
                {f === 'all' ? 'All' : f === 'content' ? 'Content' : formatStopType(f)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content: Frozen Dotted Circular Arc Trail (03a) or Clean 3-Column Table (03b) */}
      {timelineEntries.length === 0 ? (
        <div className="plan-table-scroll">
          <EmptyState
            icon={
              isContentOnlyFilter ? (
                <Clapperboard size={22} strokeWidth={1.8} />
              ) : (
                <CalendarPlus size={22} strokeWidth={1.8} />
              )
            }
            title={
              isContentOnlyFilter
                ? `No content shoots for ${dayLabelStr}`
                : `No stops for ${dayLabelStr}`
            }
            description={
              isContentOnlyFilter
                ? 'Enable "Show in Plan Rundown" on any idea in Album → Ideas to schedule it here.'
                : canEdit
                  ? 'Tap the floating + button to add a place, transit leg, or group activity.'
                  : 'No stops planned for this day yet.'
            }
            action={
              !isContentOnlyFilter && canEdit ? (
                <Button variant="matcha" size="sm" onClick={handleAddNewStop}>
                  Add First Stop
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : viewMode === 'trail' ? (
        <div
          ref={stageRef}
          className="trail-stage"
          style={{ '--trail-stage-h': `${stageHeight}px` } as CSSProperties}
        >
          {/* 100% Frozen Dotted Circular Arc Rail */}
          <div className="trail-arc-fixed" aria-hidden="true">
            <svg
              className="trail-arc-svg"
              width={ARC_WIDTH}
              height={stageHeight}
              viewBox={`0 0 ${ARC_WIDTH} ${stageHeight}`}
            >
              <path
                d={dottedArcPath}
                fill="none"
                stroke="rgba(74, 116, 104, 0.42)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="1 10"
              />
            </svg>
          </div>

          {/* Dedicated Scroll Viewport with Silky GPU Arc Motion */}
          <div ref={scrollRef} className="trail-scroll-viewport">
            <div ref={listInnerRef} className="trail-list-inner">
              {timelineEntries.map((entry) => {
                if (entry.kind === 'idea') {
                  const idea = entry.idea;
                  const isShot = idea.status === 'shot';
                  const platLabel = formatPlatformLabel(idea.platform, idea.referenceUrl);

                  return (
                    <div
                      key={idea.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(idea.id, el);
                        else rowRefs.current.delete(idea.id);
                      }}
                      className="trail-item"
                    >
                      <div
                        ref={(el) => {
                          if (el) dotRefs.current.set(idea.id, el);
                          else dotRefs.current.delete(idea.id);
                        }}
                        className="trail-item__dot"
                      >
                        <TrailDot status={isShot ? 'content-done' : 'content'} />
                      </div>

                      <div
                        ref={(el) => {
                          if (el) cardRefs.current.set(idea.id, el);
                          else cardRefs.current.delete(idea.id);
                        }}
                        className="trail-item__card-wrap"
                      >
                        <GlassCard
                          variant="clear"
                          padding="md"
                          interactive
                          className={[
                            'plan-content-card',
                            isShot ? 'plan-content-card--shot' : '',
                            idea.thumbnailUrl ? 'plan-content-card--photo' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => setActiveIdeaModal(idea)}
                        >
                          {idea.thumbnailUrl && (
                            <>
                              <img
                                src={idea.thumbnailUrl}
                                alt=""
                                aria-hidden="true"
                                className="card-bg-photo"
                                loading="lazy"
                              />
                              <div className="plan-content-card__scrim" aria-hidden="true" />
                            </>
                          )}

                          <div className="plan-content-head">
                            <span className="plan-content-meta">
                              {idea.time || 'Anytime'} · {platLabel}
                            </span>
                            <span className="plan-content-badge">
                              <Clapperboard size={11} strokeWidth={2.2} />
                              <span>Content</span>
                            </span>
                          </div>

                          <h3
                            className={`plan-content-title ${
                              isShot ? 'plan-content-title--shot' : ''
                            }`}
                          >
                            {idea.title}
                          </h3>

                          {idea.notes && <p className="plan-content-notes">{idea.notes}</p>}

                          <div className="plan-content-actions">
                            {idea.referenceUrl && (
                              <a
                                href={idea.referenceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="plan-content-watch tactile"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span>Watch</span>
                                <ArrowUpRight size={13} strokeWidth={2.2} />
                              </a>
                            )}
                            <button
                              type="button"
                              className={`plan-content-toggle tactile ${
                                isShot ? 'plan-content-toggle--shot' : ''
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleIdeaShot(idea);
                              }}
                            >
                              {isShot && <Check size={12.5} strokeWidth={2.6} />}
                              <span>{isShot ? 'Shot' : 'To Shoot'}</span>
                            </button>
                          </div>
                        </GlassCard>
                      </div>
                    </div>
                  );
                }

                const stop = entry.stop;
                const closedCheck = isClosedOnDate(stop.closedDays, selectedDay?.date);
                const effStatus = effectiveStatusMap.get(stop.id) ?? stop.status;
                const dotStatus =
                  effStatus === 'done' ? 'done' : effStatus === 'active' ? 'active' : 'upcoming';
                const typeLabel = formatStopType(stop.type);
                const showPhoto = Boolean(stop.coverUrl && !failedPhotoIds[stop.id]);

                return (
                  <div
                    key={stop.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(stop.id, el);
                      else rowRefs.current.delete(stop.id);
                    }}
                    className="trail-item"
                  >
                    <div
                      ref={(el) => {
                        if (el) dotRefs.current.set(stop.id, el);
                        else dotRefs.current.delete(stop.id);
                      }}
                      className="trail-item__dot"
                    >
                      <TrailDot status={dotStatus} />
                    </div>

                    <div
                      ref={(el) => {
                        if (el) cardRefs.current.set(stop.id, el);
                        else cardRefs.current.delete(stop.id);
                      }}
                      className="trail-item__card-wrap"
                    >
                      {effStatus === 'done' ? (
                        <GlassCard
                          variant="clear"
                          padding="sm"
                          interactive
                          className={`trail-past-card ${showPhoto ? 'card-has-photo' : ''}`}
                          onClick={() => setEditingStopId(stop.id)}
                        >
                          {showPhoto && (
                            <>
                              <img
                                src={stop.coverUrl}
                                alt=""
                                aria-hidden="true"
                                className="card-bg-photo"
                                loading="lazy"
                                onError={() =>
                                  setFailedPhotoIds((prev) => ({ ...prev, [stop.id]: true }))
                                }
                              />
                              <div className="card-bg-scrim" aria-hidden="true" />
                            </>
                          )}
                          <span className="trail-past-title">
                            {stop.startTime} · {stop.title}
                          </span>
                          <Badge tone="mint">Done</Badge>
                        </GlassCard>
                      ) : effStatus === 'active' ? (
                        <GlassCard
                          variant="spotlight"
                          padding="lg"
                          interactive
                          className={`spotlight-now ${showPhoto ? 'card-has-photo' : ''}`}
                          onClick={() => setEditingStopId(stop.id)}
                        >
                          {showPhoto && (
                            <>
                              <img
                                src={stop.coverUrl}
                                alt=""
                                aria-hidden="true"
                                className="card-bg-photo"
                                loading="lazy"
                                onError={() =>
                                  setFailedPhotoIds((prev) => ({ ...prev, [stop.id]: true }))
                                }
                              />
                              <div className="card-bg-scrim" aria-hidden="true" />
                            </>
                          )}
                          <div className="spotlight-now__top">
                            <span className="spotlight-live-tag">
                              <span className="spotlight-live-dot" aria-hidden="true" />
                              <span>Now · {typeLabel}</span>
                            </span>
                            <span className="spotlight-time">{stop.startTime}</span>
                          </div>
                          <div>
                            <h2 className="spotlight-place">{stop.title}</h2>
                            <p className="spotlight-hint">{stop.locationHint}</p>
                          </div>
                          <div className="spotlight-footer">
                            {closedCheck.closed ? (
                              <Badge
                                tone="coral"
                                icon={<AlertTriangle size={12} strokeWidth={2} />}
                              >
                                Closed {closedCheck.weekdayName?.slice(0, 3)}
                              </Badge>
                            ) : (
                              <span />
                            )}
                            {hasGoogleMapsRoute(stop) && (
                              <Button
                                variant={showPhoto ? 'glass' : 'matcha'}
                                size="sm"
                                className={showPhoto ? 'card-photo-route-btn' : undefined}
                                rightIcon={<ArrowUpRight size={14} strokeWidth={2} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openExternalGoogleMaps(stop);
                                }}
                              >
                                Route
                              </Button>
                            )}
                          </div>
                        </GlassCard>
                      ) : (
                        <GlassCard
                          variant="clear"
                          padding="md"
                          interactive
                          className={['trail-card', showPhoto ? 'card-has-photo' : '']
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => setEditingStopId(stop.id)}
                        >
                          {showPhoto && (
                            <>
                              <img
                                src={stop.coverUrl}
                                alt=""
                                aria-hidden="true"
                                className="card-bg-photo"
                                loading="lazy"
                                onError={() =>
                                  setFailedPhotoIds((prev) => ({ ...prev, [stop.id]: true }))
                                }
                              />
                              <div className="card-bg-scrim" aria-hidden="true" />
                            </>
                          )}
                          <div className="trail-upcoming-head">
                            <span className="trail-upcoming-meta">
                              {stop.startTime}
                              {stop.endTime ? `–${stop.endTime}` : ''} · {typeLabel}
                            </span>
                            {closedCheck.closed ? (
                              <Badge
                                tone="coral"
                                className="plan-warning-pill"
                                icon={<AlertTriangle size={11} strokeWidth={2} />}
                              >
                                Closed
                              </Badge>
                            ) : hasGoogleMapsRoute(stop) ? (
                              <Button
                                variant={showPhoto ? 'glass' : 'ghost'}
                                size="sm"
                                className={showPhoto ? 'card-photo-route-btn' : undefined}
                                rightIcon={<ArrowUpRight size={13} strokeWidth={2} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openExternalGoogleMaps(stop);
                                }}
                              >
                                Route
                              </Button>
                            ) : null}
                          </div>
                          <h3 className="trail-upcoming-title">{stop.title}</h3>
                          {stop.locationHint && (
                            <p className="trail-upcoming-hint">{stop.locationHint}</p>
                          )}
                          {stop.specialScheduleNote && (
                            <div className="plan-schedule-note-wrap">
                              <Badge tone="amber" className="plan-warning-pill">
                                {stop.specialScheduleNote}
                              </Badge>
                            </div>
                          )}
                        </GlassCard>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* 03b_Plan_Table — Strictly 3 columns: TIME | AGENDA | EST. + Export .xlsx */
        <div className="plan-table-scroll">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <GlassCard variant="clear" padding="none" className="plan-table-card">
              <div
                className="plan-table-row"
                style={{
                  paddingTop: 10,
                  paddingBottom: 8,
                  borderBottom: '1px solid var(--hairline)',
                  cursor: 'default',
                }}
              >
                <span className="gk-field__label">TIME</span>
                <span className="gk-field__label">AGENDA</span>
                <span className="gk-field__label" style={{ textAlign: 'right' }}>
                  EST.
                </span>
              </div>
              {timelineEntries.map((entry) => {
                if (entry.kind === 'idea') {
                  const idea = entry.idea;
                  const isShot = idea.status === 'shot';
                  return (
                    <button
                      key={idea.id}
                      type="button"
                      className="plan-table-row plan-table-row--content tactile"
                      onClick={() => setActiveIdeaModal(idea)}
                    >
                      <span className="plan-table-time plan-table-time--content">
                        {idea.time || '—'}
                      </span>
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: '#7A4A0E',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textDecoration: isShot ? 'line-through' : undefined,
                          opacity: isShot ? 0.65 : 1,
                        }}
                      >
                        {idea.title}
                      </span>
                      <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Badge tone={isShot ? 'mint' : 'amber'}>
                          {isShot ? 'Shot' : 'Content'}
                        </Badge>
                      </span>
                    </button>
                  );
                }

                const stop = entry.stop;
                const effStatus = effectiveStatusMap.get(stop.id) ?? stop.status;
                return (
                  <button
                    key={stop.id}
                    type="button"
                    className="plan-table-row tactile"
                    onClick={() => setEditingStopId(stop.id)}
                  >
                    <span className="plan-table-time">{stop.startTime}</span>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textDecoration: effStatus === 'done' ? 'line-through' : undefined,
                        opacity: effStatus === 'done' ? 0.65 : 1,
                      }}
                    >
                      {stop.title}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatEstimate(stop.costEstimate)}
                    </span>
                  </button>
                );
              })}
            </GlassCard>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="glass"
                size="sm"
                leftIcon={<FileSpreadsheet size={14} strokeWidth={1.8} />}
                rightIcon={<ArrowUpRight size={13} strokeWidth={2} />}
                onClick={() => void exportTripToExcel(trip)}
              >
                Export .xlsx
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Glass (+) Button above Dock (Editors Only) */}
      {canEdit && (
        <CornerOrb
          kind="add"
          size="lg"
          ariaLabel="Add itinerary stop"
          className="floating-glass-fab"
          onClick={handleAddNewStop}
        />
      )}

      {/* Two-way synced Content Idea Sheet opened directly from Plan rundown */}
      <ContentIdeaSheet
        open={Boolean(activeIdeaModal)}
        trip={trip}
        idea={activeIdeaModal}
        activeMemberId={activeMemberId}
        activeMemberName={activeMemberName}
        canEditTrip={canEdit}
        canDeleteIdea={canDeleteIdeas}
        defaultDayId={selectedDay?.isIdeas ? undefined : selectedDay?.id}
        onSave={handleSaveIdea}
        onDelete={handleDeleteIdea}
        onClose={() => setActiveIdeaModal(null)}
      />
    </div>
  );
}
