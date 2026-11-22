import type { PlanItem, TripDay } from '../types/trip';

/**
 * Pure itinerary validation & persistence utilities:
 * - Google Maps URL validator
 * - Closed-day schedule conflict detector
 * - PlanItem save payload builder (guarantees `coverUrl` preservation)
 */

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function isValidMapsUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host === 'maps.app.goo.gl') return path.length > 1;
    if (host === 'goo.gl' && path.startsWith('/maps')) return true;
    if (host === 'maps.google.com' || host.endsWith('.maps.google.com')) return true;
    if (
      (host === 'google.com' || host === 'www.google.com' || host.endsWith('.google.co.id')) &&
      path.startsWith('/maps')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function normalizeExternalUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getWeekdayFromIsoDate(isoDate: string | undefined | null): number {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate.trim())) return -1;
  const parsed = new Date(`${isoDate.trim()}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getDay();
}

export function isClosedOnDate(
  closedDays: number[] | undefined,
  isoDate: string | undefined | null,
): { closed: boolean; weekdayName: string | null } {
  if (!Array.isArray(closedDays) || closedDays.length === 0) {
    return { closed: false, weekdayName: null };
  }
  const dow = getWeekdayFromIsoDate(isoDate);
  if (dow < 0) return { closed: false, weekdayName: null };
  const closed = closedDays.includes(dow);
  return {
    closed,
    weekdayName: closed ? WEEKDAY_NAMES[dow] : null,
  };
}

/**
 * Builds the final persisted `PlanItem` payload on save, guaranteeing that
 * uploaded cover photo URLs / dataUrls (`coverUrl`) are always preserved.
 */
export function buildSavedPlanItem(params: {
  draft: PlanItem;
  selectedDay?: TripDay;
  showEndTime: boolean;
  notesHtml: string;
  hasNoteText: boolean;
}): PlanItem {
  const { draft, selectedDay, showEndTime, notesHtml, hasNoteText } = params;
  const cleanCoverUrl = draft.coverUrl?.trim() || undefined;
  return {
    ...draft,
    title: draft.title.trim() || 'Untitled Stop',
    endTime: showEndTime ? draft.endTime : undefined,
    coverUrl: cleanCoverUrl,
    mapsVerified: isValidMapsUrl(draft.mapsUrl),
    status: selectedDay?.isIdeas
      ? 'idea'
      : draft.status === 'idea'
        ? 'upcoming'
        : draft.status,
    notesHtml: hasNoteText ? notesHtml : '',
    notes: hasNoteText ? draft.notes : [],
  };
}
