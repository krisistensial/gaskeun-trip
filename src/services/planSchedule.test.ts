import { describe, expect, it } from 'vitest';
import type { PlanItem, TripDay } from '../types/trip';
import { resolvePlanLiveState } from './planSchedule';

const DAYS: TripDay[] = [
  { id: 'day-1', date: '2027-02-11', dayLabel: 'Thu', dateNum: '11', city: 'Solo' },
  { id: 'day-2', date: '2027-02-12', dayLabel: 'Fri', dateNum: '12', city: 'Solo → Jogja' },
  { id: 'day-3', date: '2027-02-13', dayLabel: 'Sat', dateNum: '13', city: 'Jogja' },
  { id: 'day-4', date: '2027-02-14', dayLabel: 'Sun', dateNum: '14', city: 'Jogja → Home' },
  { id: 'day-ideas', date: '', dayLabel: 'Ideas', dateNum: '', city: 'Wishlist', isIdeas: true },
];

const STOPS: PlanItem[] = [
  {
    id: 'it-1',
    dayId: 'day-1',
    type: 'transit',
    title: 'KA Bengawan to Solo',
    startTime: '09:14',
    endTime: '18:20',
    locationHint: 'PSE → PWS',
    address: 'Stasiun Purwosari',
    status: 'upcoming',
    notes: [],
  },
  {
    id: 'it-3',
    dayId: 'day-2',
    type: 'place',
    title: 'Solo Morning Loop',
    startTime: '07:30',
    endTime: '11:30',
    locationHint: 'Soto Triwindu',
    address: 'Surakarta',
    status: 'upcoming',
    notes: [],
  },
  {
    id: 'it-5',
    dayId: 'day-2',
    type: 'place',
    title: 'Warung Pojok Mbak Yuni',
    startTime: '11:45',
    locationHint: 'Kotabaru',
    address: 'Yogyakarta',
    status: 'upcoming',
    notes: [],
  },
  {
    id: 'it-4',
    dayId: 'day-2',
    type: 'place',
    title: 'Gua Maria Ratuning Katentreman',
    startTime: '13:30',
    endTime: '15:30',
    locationHint: 'Klaten',
    address: 'Jogonalan, Klaten',
    status: 'upcoming',
    notes: [],
  },
  {
    id: 'it-night',
    dayId: 'day-2',
    type: 'place',
    title: 'Waroeng Jeep Corner Dinner',
    startTime: '18:00',
    endTime: '20:00',
    locationHint: 'Banguntapan',
    address: 'Yogyakarta',
    status: 'upcoming',
    notes: [],
  },
  {
    id: 'it-7',
    dayId: 'day-3',
    type: 'place',
    title: 'Goa Maria Ganjuran',
    startTime: '08:30',
    endTime: '10:00',
    locationHint: 'Bantul',
    address: 'Bantul',
    // Even if a stale snapshot had `active` or `done`, pre-trip must override to `upcoming`
    status: 'active',
    notes: [],
  },
  {
    id: 'it-idea-1',
    dayId: 'day-ideas',
    type: 'place',
    title: 'Pasar Mustokoweni',
    startTime: '08:00',
    locationHint: 'Jetis',
    address: 'Yogyakarta',
    status: 'idea',
    notes: [],
  },
];

describe('Real-time Plan schedule resolver (resolvePlanLiveState)', () => {
  it('pre-trip (2026-11-24): defaults to Day 1, hides NOW, and marks all stops upcoming', () => {
    const preTripDate = new Date(2026, 10, 24, 10, 30, 0);
    const state = resolvePlanLiveState(DAYS, STOPS, preTripDate);

    expect(state.phase).toBe('pre-trip');
    expect(state.isTripLive).toBe(false);
    expect(state.defaultDayId).toBe('day-1');
    expect(state.liveDayId).toBeNull();
    expect(state.activeStopId).toBeNull();

    // Every scheduled stop is upcoming (stale `active`/`done` is stripped pre-trip)
    expect(state.stopStatuses.get('it-1')).toBe('upcoming');
    expect(state.stopStatuses.get('it-3')).toBe('upcoming');
    expect(state.stopStatuses.get('it-4')).toBe('upcoming');
    expect(state.stopStatuses.get('it-7')).toBe('upcoming');
    // Ideas bucket preserves `idea` status
    expect(state.stopStatuses.get('it-idea-1')).toBe('idea');
  });

  it('on-trip / Hari-H (2027-02-12 15:00): selects Day 2, activates 13:30–15:30 stop as NOW, morning done, evening upcoming', () => {
    const day2Afternoon = new Date(2027, 1, 12, 15, 0, 0);
    const state = resolvePlanLiveState(DAYS, STOPS, day2Afternoon);

    expect(state.phase).toBe('on-trip');
    expect(state.isTripLive).toBe(true);
    expect(state.defaultDayId).toBe('day-2');
    expect(state.liveDayId).toBe('day-2');
    expect(state.activeStopId).toBe('it-4');

    // Day 1 (past day) -> done
    expect(state.stopStatuses.get('it-1')).toBe('done');
    // Day 2 morning & midday stops -> done
    expect(state.stopStatuses.get('it-3')).toBe('done');
    expect(state.stopStatuses.get('it-5')).toBe('done');
    // Day 2 13:30–15:30 stop -> active (NOW)
    expect(state.stopStatuses.get('it-4')).toBe('active');
    // Day 2 evening stop -> upcoming
    expect(state.stopStatuses.get('it-night')).toBe('upcoming');
    // Day 3 (future day) -> upcoming
    expect(state.stopStatuses.get('it-7')).toBe('upcoming');
  });

  it('post-trip (2027-02-15): defaults to Day 1, clears NOW, and marks all scheduled stops done', () => {
    const postTripDate = new Date(2027, 1, 15, 9, 0, 0);
    const state = resolvePlanLiveState(DAYS, STOPS, postTripDate);

    expect(state.phase).toBe('post-trip');
    expect(state.isTripLive).toBe(false);
    expect(state.defaultDayId).toBe('day-1');
    expect(state.liveDayId).toBeNull();
    expect(state.activeStopId).toBeNull();

    expect(state.stopStatuses.get('it-1')).toBe('done');
    expect(state.stopStatuses.get('it-3')).toBe('done');
    expect(state.stopStatuses.get('it-4')).toBe('done');
    expect(state.stopStatuses.get('it-night')).toBe('done');
    expect(state.stopStatuses.get('it-7')).toBe('done');
    expect(state.stopStatuses.get('it-idea-1')).toBe('idea');
  });

  it('preserves Live Trail View manual preview when simulateLive is explicitly enabled pre-trip', () => {
    const preTripDate = new Date(2026, 10, 24, 10, 30, 0);
    const preview = resolvePlanLiveState(DAYS, STOPS, preTripDate, { simulateLive: true });

    expect(preview.phase).toBe('pre-trip');
    expect(preview.isTripLive).toBe(false);
    expect(preview.defaultDayId).toBe('day-1');
    expect(preview.activeStopId).toBe('it-1');
    expect(preview.stopStatuses.get('it-1')).toBe('active');
    expect(preview.stopStatuses.get('it-7')).toBe('upcoming');
  });
});
