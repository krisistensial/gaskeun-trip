import type { PlanItem, PlanItemStatus, TripDay } from '../types/trip';

export type TripClockPhase = 'pre-trip' | 'on-trip' | 'post-trip';

export interface PlanLiveOptions {
  /**
   * When true (e.g. user manually enabled `Live Trail View` preview in Profile & Settings),
   * highlights the first scheduled stop as `active` even before Day 1 so the live preview
   * remains interactive without polluting default pre-trip mode.
   */
  simulateLive?: boolean;
}

export interface PlanLiveState {
  phase: TripClockPhase;
  /** True only when the real device date falls on a scheduled trip day (Day 1..Day N). */
  isTripLive: boolean;
  /** Local device calendar date in YYYY-MM-DD format. */
  todayIso: string;
  /** Default day to open on Plan: Day 1 pre/post-trip, or today's matching day on Hari-H. */
  defaultDayId: string;
  /** Matching trip day ID when `isTripLive === true`, otherwise null. */
  liveDayId: string | null;
  /** Real-time active (`NOW`) stop ID, or null when pre-trip/post-trip/between stops. */
  activeStopId: string | null;
  /** Effective display status for every itinerary stop ID. */
  stopStatuses: Map<string, PlanItemStatus>;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseTimeToMinutes(hhmm?: string): number {
  if (!hhmm) return -1;
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return -1;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return -1;
  }
  return h * 60 + m;
}

/**
 * Normalizes any legacy or raw stop status (including legacy `'now'` strings)
 * into a clean `PlanItemStatus`.
 */
export function sanitizeStopStatus(raw: unknown): PlanItemStatus {
  if (raw === 'idea') return 'idea';
  if (raw === 'done') return 'done';
  if (raw === 'active') return 'active';
  return 'upcoming';
}

/**
 * Extracts a valid `http://` or `https://` Google Maps / route URL from a stop
 * (returns `null` if missing, whitespace-only, or not a valid HTTP(S) URL).
 */
export function getGoogleMapsRouteUrl(
  stop?: Pick<PlanItem, 'mapsUrl'> | null,
): string | null {
  const raw = stop?.mapsUrl;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Returns `true` ONLY when a stop has a non-empty, valid `http://` or `https://`
 * Google Maps URL configured in `stop.mapsUrl`.
 */
export function hasGoogleMapsRoute(
  stop?: Pick<PlanItem, 'mapsUrl'> | null,
): boolean {
  return getGoogleMapsRouteUrl(stop) !== null;
}

/**
 * Pure real-time schedule resolver for the `Plan` & `Home` views.
 *
 * Accepts either:
 * - `resolvePlanLiveState(days, itinerary, nowDate, options)` (full stop status evaluation), or
 * - `resolvePlanLiveState(days, nowDate)` (date/day-only evaluation).
 */
export function resolvePlanLiveState(
  days: TripDay[],
  itineraryOrNow: PlanItem[] | Date = [],
  nowDateArg?: Date,
  options?: PlanLiveOptions,
): PlanLiveState {
  const itinerary: PlanItem[] = Array.isArray(itineraryOrNow) ? itineraryOrNow : [];
  const nowDate: Date =
    itineraryOrNow instanceof Date ? itineraryOrNow : nowDateArg ?? new Date();
  const simulateLive = Boolean(options?.simulateLive);

  const todayIso = toLocalIsoDate(nowDate);
  const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes();

  const datedDays = days
    .filter((d) => !d.isIdeas && ISO_DATE_RE.test(d.date))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const firstDayId = datedDays[0]?.id ?? days[0]?.id ?? 'day-1';
  const firstDate = datedDays[0]?.date ?? null;
  const lastDate = datedDays[datedDays.length - 1]?.date ?? null;

  const dayDateById = new Map<string, string>();
  const ideasDayIds = new Set<string>();
  for (const d of days) {
    if (d.isIdeas) ideasDayIds.add(d.id);
    if (ISO_DATE_RE.test(d.date)) dayDateById.set(d.id, d.date);
  }

  const stopStatuses = new Map<string, PlanItemStatus>();

  // 1. Pre-Trip (before Day 1) — clean slate: Day 1 default, zero NOW, all stops upcoming
  if (!firstDate || todayIso < firstDate) {
    let previewActiveId: string | null = null;
    if (simulateLive) {
      const firstDayStops = itinerary
        .filter((s) => s.dayId === firstDayId && s.status !== 'idea' && !ideasDayIds.has(s.dayId))
        .slice()
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const fallbackStop =
        firstDayStops[0] ??
        itinerary.find((s) => s.status !== 'idea' && !ideasDayIds.has(s.dayId));
      previewActiveId = fallbackStop?.id ?? null;
    }

    for (const stop of itinerary) {
      if (stop.status === 'idea' || ideasDayIds.has(stop.dayId)) {
        stopStatuses.set(stop.id, 'idea');
      } else if (previewActiveId && stop.id === previewActiveId) {
        stopStatuses.set(stop.id, 'active');
      } else {
        stopStatuses.set(stop.id, 'upcoming');
      }
    }

    return {
      phase: 'pre-trip',
      isTripLive: false,
      todayIso,
      defaultDayId: firstDayId,
      liveDayId: null,
      activeStopId: previewActiveId,
      stopStatuses,
    };
  }

  // 2. Post-Trip (after the last trip day) — Day 1 default, zero NOW, all scheduled stops done
  if (lastDate && todayIso > lastDate) {
    for (const stop of itinerary) {
      if (stop.status === 'idea' || ideasDayIds.has(stop.dayId)) {
        stopStatuses.set(stop.id, 'idea');
      } else {
        stopStatuses.set(stop.id, 'done');
      }
    }

    return {
      phase: 'post-trip',
      isTripLive: false,
      todayIso,
      defaultDayId: firstDayId,
      liveDayId: null,
      activeStopId: null,
      stopStatuses,
    };
  }

  // 3. On-Trip / Hari-H (todayIso falls within Day 1..Day N)
  const matchingDay = datedDays.find((d) => d.date === todayIso) ?? null;
  const liveDayId = matchingDay?.id ?? null;
  const defaultDayId = liveDayId ?? firstDayId;

  // Evaluate today's stops strictly by real clock (startTime..endTime or startTime..nextStartTime)
  let activeStopId: string | null = null;
  const todayStops = liveDayId
    ? itinerary
        .filter((s) => s.dayId === liveDayId && s.status !== 'idea' && !ideasDayIds.has(s.dayId))
        .slice()
        .sort((a, b) => {
          const am = parseTimeToMinutes(a.startTime);
          const bm = parseTimeToMinutes(b.startTime);
          if (am !== bm) return am - bm;
          return a.title.localeCompare(b.title);
        })
    : [];

  const todayStatusById = new Map<string, PlanItemStatus>();
  for (let i = 0; i < todayStops.length; i += 1) {
    const stop = todayStops[i];
    const startM = parseTimeToMinutes(stop.startTime);
    if (startM < 0) {
      todayStatusById.set(stop.id, 'upcoming');
      continue;
    }

    const explicitEndM = parseTimeToMinutes(stop.endTime);
    const nextStartM =
      i + 1 < todayStops.length ? parseTimeToMinutes(todayStops[i + 1].startTime) : -1;

    let endM: number;
    if (explicitEndM > startM) {
      endM = explicitEndM;
    } else if (nextStartM > startM) {
      endM = nextStartM;
    } else {
      endM = Math.min(24 * 60, startM + 60);
    }

    if (nowMins >= startM && nowMins < endM) {
      todayStatusById.set(stop.id, 'active');
      if (activeStopId === null) activeStopId = stop.id;
    } else if (nowMins >= endM) {
      todayStatusById.set(stop.id, 'done');
    } else {
      todayStatusById.set(stop.id, 'upcoming');
    }
  }

  for (const stop of itinerary) {
    if (stop.status === 'idea' || ideasDayIds.has(stop.dayId)) {
      stopStatuses.set(stop.id, 'idea');
      continue;
    }

    if (liveDayId && stop.dayId === liveDayId) {
      // Allow an editor's explicit manual `done` toggle on Hari-H; otherwise follow live clock
      if (stop.status === 'done') {
        stopStatuses.set(stop.id, 'done');
        if (activeStopId === stop.id) activeStopId = null;
      } else {
        stopStatuses.set(stop.id, todayStatusById.get(stop.id) ?? 'upcoming');
      }
      continue;
    }

    const stopDayDate = dayDateById.get(stop.dayId);
    if (stopDayDate && stopDayDate < todayIso) {
      stopStatuses.set(stop.id, 'done');
    } else {
      stopStatuses.set(stop.id, 'upcoming');
    }
  }

  return {
    phase: 'on-trip',
    isTripLive: true,
    todayIso,
    defaultDayId,
    liveDayId,
    activeStopId,
    stopStatuses,
  };
}
