import type { SharedTrip, TrainPassInfo } from '../types/trip';

export const KAI_ADVANCE_DAYS = 45;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export type TicketDropStatus = 'booked' | 'open' | 'soon' | 'upcoming' | 'unset';

export interface TicketCountdownParts {
  days: number;
  hours: string;
  minutes: string;
  seconds: string;
}

export interface TrainTicketLegDrop {
  leg: 'outbound' | 'return';
  label: string;
  route: string;
  travelDateLabel: string;
  openAtIso: string | null;
  isCustom: boolean;
  booked: boolean;
  status: TicketDropStatus;
  countdown: TicketCountdownParts;
  formattedShortDate: string;
  formattedFullDate: string;
}

export interface ResolvedTrainTicketDrops {
  outbound: TrainTicketLegDrop;
  returnLeg: TrainTicketLegDrop | null;
  hasCustomSchedule: boolean;
  allBooked: boolean;
  shouldShowHomeStrip: boolean;
}

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  mei: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  agu: 8,
  agustus: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  des: 12,
  desember: 12,
};

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

/**
 * Parses ISO `YYYY-MM-DD`, ISO timestamps, or display dates like `Thu, Feb 11, 2027`
 * into a timezone-safe calendar `{ year, month, day }`.
 */
export function parseCalendarDate(
  raw?: string | null,
): { year: number; month: number; day: number } | null {
  if (!raw) return null;
  const clean = raw.trim();
  if (!clean) return null;

  // 1. ISO date prefix: YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // 2. Display format: "Thu, Feb 11, 2027" or "Feb 11, 2027"
  const mdyMatch = clean.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (mdyMatch) {
    const month = MONTH_NAME_MAP[mdyMatch[1].toLowerCase()];
    const day = Number(mdyMatch[2]);
    const year = Number(mdyMatch[3]);
    if (month && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // 3. Day-first display format: "11 Feb 2027"
  const dmyMatch = clean.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = MONTH_NAME_MAP[dmyMatch[2].toLowerCase()];
    const year = Number(dmyMatch[3]);
    if (month && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  return null;
}

/**
 * Computes KAI Access booking open time: H-45 (default) at 00:00 WIB (+07:00).
 */
export function computeKaiBookingOpenIso(
  travelDateRaw?: string | null,
  advanceDays = KAI_ADVANCE_DAYS,
): string | null {
  const parsed = parseCalendarDate(travelDateRaw);
  if (!parsed) return null;
  const utcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day) - advanceDays * DAY_MS;
  const target = new Date(utcMs);
  const y = target.getUTCFullYear();
  const m = pad2(target.getUTCMonth() + 1);
  const d = pad2(target.getUTCDate());
  return `${y}-${m}-${d}T00:00:00+07:00`;
}

/**
 * Formats an ISO timestamp in WIB (+07:00) consistently across devices.
 */
export function formatTicketOpenWib(
  iso?: string | null,
): { short: string; full: string } {
  if (!iso) return { short: 'Not set', full: 'Not set' };
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { short: 'Not set', full: 'Not set' };
  const wib = new Date(ms + WIB_OFFSET_MS);
  const month = SHORT_MONTHS[wib.getUTCMonth()] ?? 'Jan';
  const day = wib.getUTCDate();
  const year = wib.getUTCFullYear();
  const hh = pad2(wib.getUTCHours());
  const mm = pad2(wib.getUTCMinutes());
  return {
    short: `${month} ${day} · ${hh}:${mm}`,
    full: `${month} ${day}, ${year} · ${hh}:${mm} WIB`,
  };
}

/**
 * Converts a WIB ISO string into `<input type="datetime-local" />` value (`YYYY-MM-DDTHH:mm`).
 */
export function isoToDatetimeLocalWib(iso?: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const wib = new Date(ms + WIB_OFFSET_MS);
  return `${wib.getUTCFullYear()}-${pad2(wib.getUTCMonth() + 1)}-${pad2(wib.getUTCDate())}T${pad2(wib.getUTCHours())}:${pad2(wib.getUTCMinutes())}`;
}

/**
 * Converts a `<input type="datetime-local" />` value (`YYYY-MM-DDTHH:mm`) into a WIB ISO timestamp.
 */
export function datetimeLocalWibToIso(localValue?: string | null): string | undefined {
  const clean = (localValue ?? '').trim();
  const m = clean.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!m) return undefined;
  return `${m[1]}T${m[2]}:${m[3] ?? '00'}+07:00`;
}

export function getTicketCountdownParts(
  targetIso: string | null,
  nowMs = Date.now(),
): TicketCountdownParts {
  if (!targetIso) {
    return { days: 0, hours: '00', minutes: '00', seconds: '00' };
  }
  const targetMs = Date.parse(targetIso);
  if (!Number.isFinite(targetMs)) {
    return { days: 0, hours: '00', minutes: '00', seconds: '00' };
  }
  const diff = Math.max(0, targetMs - nowMs);
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return {
    days,
    hours: pad2(hours),
    minutes: pad2(minutes),
    seconds: pad2(seconds),
  };
}

function buildLegDrop(params: {
  leg: 'outbound' | 'return';
  label: string;
  route: string;
  travelDateRaw?: string;
  customOpenAt?: string;
  booked?: boolean;
  nowMs: number;
}): TrainTicketLegDrop {
  const customIso =
    params.customOpenAt && Number.isFinite(Date.parse(params.customOpenAt))
      ? params.customOpenAt.trim()
      : null;
  const openAtIso = customIso ?? computeKaiBookingOpenIso(params.travelDateRaw);
  const booked = Boolean(params.booked);
  const targetMs = openAtIso ? Date.parse(openAtIso) : NaN;

  let status: TicketDropStatus = 'unset';
  if (booked) {
    status = 'booked';
  } else if (Number.isFinite(targetMs)) {
    const remaining = targetMs - params.nowMs;
    if (remaining <= 0) {
      status = 'open';
    } else if (remaining <= 7 * DAY_MS) {
      status = 'soon';
    } else {
      status = 'upcoming';
    }
  }

  const formatted = formatTicketOpenWib(openAtIso);
  return {
    leg: params.leg,
    label: params.label,
    route: params.route,
    travelDateLabel: params.travelDateRaw ?? '',
    openAtIso,
    isCustom: Boolean(customIso),
    booked,
    status,
    countdown: getTicketCountdownParts(openAtIso, params.nowMs),
    formattedShortDate: formatted.short,
    formattedFullDate: formatted.full,
  };
}

export function resolveTrainTicketDrops(
  trip: Pick<SharedTrip, 'startDate' | 'endDate' | 'trainPass'>,
  nowMs = Date.now(),
): ResolvedTrainTicketDrops | null {
  const pass: TrainPassInfo | undefined = trip.trainPass;
  if (!pass) return null;

  const outbound = buildLegDrop({
    leg: 'outbound',
    label: 'Outbound',
    route: pass.outboundRoute || 'Outbound',
    travelDateRaw: pass.outboundDate || trip.startDate,
    customOpenAt: pass.outboundTicketOpenAt,
    booked: pass.outboundBooked,
    nowMs,
  });

  const hasReturn = Boolean(
    pass.returnRoute?.trim() ||
      pass.returnDate?.trim() ||
      pass.returnTicketOpenAt?.trim(),
  );
  const returnLeg = hasReturn
    ? buildLegDrop({
        leg: 'return',
        label: 'Return',
        route: pass.returnRoute || 'Return',
        travelDateRaw: pass.returnDate || trip.endDate,
        customOpenAt: pass.returnTicketOpenAt,
        booked: pass.returnBooked,
        nowMs,
      })
    : null;

  const activeLegs = returnLeg ? [outbound, returnLeg] : [outbound];
  const allBooked = activeLegs.every((l) => l.booked);
  const hasAnyPendingDrop = activeLegs.some((l) => !l.booked && Boolean(l.openAtIso));

  return {
    outbound,
    returnLeg,
    hasCustomSchedule: outbound.isCustom || Boolean(returnLeg?.isCustom),
    allBooked,
    shouldShowHomeStrip: !allBooked && hasAnyPendingDrop,
  };
}
