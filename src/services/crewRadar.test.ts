import { describe, expect, it } from 'vitest';
import type { CrewLivePin } from '../types/trip';
import {
  formatPinRelativeAge,
  formatRadarDistance,
  getConvoyStatusInfo,
  haversineDistanceMeters,
  isCrewPinLive,
  LIVE_STREAM_STALE_MS,
  mergeCrewLivePins,
} from './crewRadar';

describe('Crew Radar live GPS & Convoy Status helpers', () => {
  it('calculates haversine distance and formats meters vs kilometers cleanly', () => {
    const meters = haversineDistanceMeters(-7.7956, 110.3695, -7.7929, 110.3658);
    expect(meters).toBeGreaterThan(450);
    expect(meters).toBeLessThan(600);
    expect(formatRadarDistance(320)).toBe('320 m away');
    expect(formatRadarDistance(2450)).toBe('2.5 km away');
  });

  it('determines live streaming freshness and merges pins deterministically by timestamp', () => {
    const now = Date.parse('2026-11-26T10:00:00.000Z');
    const freshPin: CrewLivePin = {
      memberId: 'm-kris',
      memberName: 'Kris',
      lat: -7.7956,
      lng: 110.3695,
      isLiveStreaming: true,
      convoyStatus: 'otw',
      updatedAt: new Date(now - 10_000).toISOString(),
    };
    const stalePin: CrewLivePin = {
      ...freshPin,
      updatedAt: new Date(now - LIVE_STREAM_STALE_MS - 5000).toISOString(),
    };

    expect(isCrewPinLive(freshPin, now)).toBe(true);
    expect(isCrewPinLive(stalePin, now)).toBe(false);
    expect(formatPinRelativeAge(freshPin.updatedAt, now)).toBe('Just now');
    expect(formatPinRelativeAge(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m ago');
    expect(getConvoyStatusInfo('fuel')?.label).toBe('Fuel Stop');

    const older: Record<string, CrewLivePin> = {
      'm-kris': {
        memberId: 'm-kris',
        memberName: 'Kris',
        lat: -7.5,
        lng: 110.8,
        updatedAt: '2026-11-26T09:50:00.000Z',
      },
    };
    const incoming: Record<string, CrewLivePin> = {
      'm-kris': freshPin,
    };
    const merged = mergeCrewLivePins(older, incoming);
    expect(merged['m-kris'].lat).toBe(-7.7956);
    expect(merged['m-kris'].convoyStatus).toBe('otw');
  });
});
