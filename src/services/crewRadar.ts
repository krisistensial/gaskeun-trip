import type {
  ConvoyStatusKind,
  CrewLivePin,
  RouteTarget,
  SharedTrip,
} from '../types/trip';
import { getSupabaseClient } from './supabaseSync';

export const LIVE_STREAM_STALE_MS = 65_000;

export const CONVOY_STATUS_META: ReadonlyArray<{
  id: ConvoyStatusKind;
  label: string;
  tone: 'matcha' | 'mint' | 'amber' | 'neutral';
}> = [
  { id: 'otw', label: 'OTW', tone: 'matcha' },
  { id: 'meetup', label: 'At Meetup', tone: 'mint' },
  { id: 'fuel', label: 'Fuel Stop', tone: 'amber' },
  { id: 'break', label: 'Taking a Break', tone: 'neutral' },
  { id: 'arrived', label: 'Arrived', tone: 'mint' },
];

export function getConvoyStatusInfo(status?: ConvoyStatusKind) {
  if (!status) return null;
  return CONVOY_STATUS_META.find((s) => s.id === status) ?? null;
}

/**
 * Computes great-circle distance in meters between two `[lat, lng]` coordinates.
 */
export function haversineDistanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatRadarDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m away`;
  const km = meters / 1000;
  return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km away`;
}

export function isCrewPinLive(pin?: CrewLivePin | null, nowMs = Date.now()): boolean {
  if (!pin?.isLiveStreaming) return false;
  const ts = Date.parse(pin.updatedAt);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts <= LIVE_STREAM_STALE_MS;
}

export function formatPinRelativeAge(iso: string, nowMs = Date.now()): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.round((nowMs - ts) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

/**
 * Merges CrewLivePin maps keeping whichever pin update has the newer timestamp per member.
 */
export function mergeCrewLivePins(
  base?: Record<string, CrewLivePin>,
  incoming?: Record<string, CrewLivePin>,
): Record<string, CrewLivePin> {
  const result: Record<string, CrewLivePin> = { ...(base ?? {}) };
  if (!incoming) return result;
  for (const [memberId, nextPin] of Object.entries(incoming)) {
    if (!nextPin?.memberId || !nextPin.updatedAt) continue;
    const prev = result[memberId];
    if (!prev) {
      result[memberId] = nextPin;
      continue;
    }
    const prevMs = Date.parse(prev.updatedAt) || 0;
    const nextMs = Date.parse(nextPin.updatedAt) || 0;
    if (nextMs >= prevMs) {
      result[memberId] = {
        ...prev,
        ...nextPin,
      };
    }
  }
  return result;
}

/**
 * Builds a clean Crew Radar RouteTarget for opening the Live Crew Map directly from Home.
 */
export function buildCrewRadarTarget(trip: SharedTrip): RouteTarget {
  const datedDays = trip.days.filter((d) => !d.isIdeas);
  const firstDayWithStops =
    datedDays.find((d) => trip.itinerary.some((i) => i.dayId === d.id)) ?? datedDays[0];
  const dayItems = firstDayWithStops
    ? trip.itinerary
        .filter((i) => i.dayId === firstDayWithStops.id)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
    : [];
  const activeStop =
    dayItems.find((s) => s.status === 'active') ??
    dayItems.find((s) => s.coords) ??
    dayItems[0];

  return {
    title: 'Crew Radar',
    subtitle: firstDayWithStops
      ? `${firstDayWithStops.dayLabel} ${firstDayWithStops.dateNum} · ${firstDayWithStops.city}`
      : trip.title,
    address: activeStop?.address,
    parkingNote: activeStop?.parkingNote,
    mapsUrl: activeStop?.mapsUrl,
    coords: activeStop?.coords,
    dayLabel: 'Live Crew Radar',
    dayItems,
    focusedItemId: activeStop?.id,
  };
}

export interface CrewRadarController {
  unsubscribe: () => void;
  broadcastPin: (pin: CrewLivePin) => void;
}

/**
 * Subscribes to foreground live GPS & convoy status broadcasts for a trip code.
 */
export function subscribeToCrewRadar(
  tripCode: string,
  onPinUpdate: (pin: CrewLivePin) => void,
): CrewRadarController {
  const client = getSupabaseClient();
  const normCode = tripCode.trim().toUpperCase();
  if (!client || !normCode) {
    return {
      unsubscribe: () => {},
      broadcastPin: () => {},
    };
  }

  let subscribed = false;
  const channel = client
    .channel(`trip-radar-${normCode}`, {
      config: { broadcast: { self: false } },
    })
    .on('broadcast', { event: 'radar:pin' }, ({ payload }) => {
      if (payload && typeof payload === 'object' && 'memberId' in payload) {
        onPinUpdate(payload as CrewLivePin);
      }
    })
    .subscribe((status) => {
      subscribed = status === 'SUBSCRIBED';
    });

  return {
    unsubscribe: () => {
      subscribed = false;
      void client.removeChannel(channel);
    },
    broadcastPin: (pin) => {
      if (!subscribed) return;
      void channel.send({
        type: 'broadcast',
        event: 'radar:pin',
        payload: { ...pin },
      });
    },
  };
}
