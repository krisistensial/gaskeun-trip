import { describe, expect, it } from 'vitest';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { SharedTrip } from '../types/trip';
import {
  appendEditLog,
  extractOnlineMembers,
  formatRelativeLogTime,
  getVisibleOtherOnlineMembers,
  inferEditLogCategory,
  MAX_EDIT_LOG_ENTRIES,
} from './activityLog';

const baseTrip = seedData as unknown as SharedTrip;

describe('activityLog & live crew presence helpers', () => {
  it('infers accurate edit categories across Plan, Wallet, Crew, Prep, Album, and Settings', () => {
    expect(
      inferEditLogCategory(baseTrip, { ...baseTrip, itinerary: [...baseTrip.itinerary] }),
    ).toBe('plan');
    expect(
      inferEditLogCategory(baseTrip, { ...baseTrip, transactions: [...baseTrip.transactions] }),
    ).toBe('wallet');
    expect(
      inferEditLogCategory(baseTrip, { ...baseTrip, groupPrep: [...baseTrip.groupPrep] }),
    ).toBe('prep');
    expect(
      inferEditLogCategory(baseTrip, { ...baseTrip, contentIdeas: [] }),
    ).toBe('album');
    expect(
      inferEditLogCategory(baseTrip, { ...baseTrip, transportPods: [...baseTrip.transportPods] }),
    ).toBe('crew');
    expect(
      inferEditLogCategory(baseTrip, { ...baseTrip, crewEditPin: '5678' }),
    ).toBe('settings');
  });

  it('prepends edit entries with actor metadata and caps log size at MAX_EDIT_LOG_ENTRIES', () => {
    const prefilled = Array.from({ length: MAX_EDIT_LOG_ENTRIES }, (_, idx) => ({
      id: `old-${idx}`,
      actorId: 'm-kris',
      actorName: 'Kris',
      action: `Old edit ${idx}`,
      category: 'plan' as const,
      timestamp: '2026-11-24T10:00:00.000Z',
    }));
    const prev: SharedTrip = { ...baseTrip, editLog: prefilled };
    const next: SharedTrip = { ...prev, transactions: [...prev.transactions] };

    const updatedLog = appendEditLog(
      prev,
      next,
      { id: 'm-rani', name: 'Rani' },
      'Transaction saved',
      '2026-11-25T10:30:00.000Z',
    );

    expect(updatedLog).toHaveLength(MAX_EDIT_LOG_ENTRIES);
    expect(updatedLog[0]).toMatchObject({
      actorId: 'm-rani',
      actorName: 'Rani',
      action: 'Transaction saved',
      category: 'wallet',
      timestamp: '2026-11-25T10:30:00.000Z',
    });
  });

  it('formats relative timestamps cleanly', () => {
    const now = Date.parse('2026-11-25T10:30:00.000Z');
    expect(formatRelativeLogTime('2026-11-25T10:29:40.000Z', now)).toBe('Just now');
    expect(formatRelativeLogTime('2026-11-25T10:15:00.000Z', now)).toBe('15m ago');
    expect(formatRelativeLogTime('2026-11-25T07:30:00.000Z', now)).toBe('3h ago');
  });

  it('deduplicates multi-tab presence, excludes self, and slices to max 3 overlapping avatars', () => {
    const [m1, m2, m3, m4, m5] = baseTrip.members;
    const rawPresence = {
      [`${m1.id}:tabA`]: [{ memberId: m1.id, name: m1.name, initials: m1.initials, joinedAt: '2026-11-25T10:00:00Z' }],
      [`${m2.id}:tabA`]: [{ memberId: m2.id, name: m2.name, initials: m2.initials, joinedAt: '2026-11-25T10:01:00Z' }],
      [`${m2.id}:tabB`]: [{ memberId: m2.id, name: m2.name, initials: m2.initials, joinedAt: '2026-11-25T10:05:00Z' }],
      [`${m3.id}:tabA`]: [{ memberId: m3.id, name: m3.name, initials: m3.initials, joinedAt: '2026-11-25T10:02:00Z' }],
      [`${m4.id}:tabA`]: [{ memberId: m4.id, name: m4.name, initials: m4.initials, joinedAt: '2026-11-25T10:03:00Z' }],
      [`${m5.id}:tabA`]: [{ memberId: m5.id, name: m5.name, initials: m5.initials, joinedAt: '2026-11-25T10:04:00Z' }],
    };

    const allOnline = extractOnlineMembers(rawPresence, baseTrip.members);
    // m2 duplicated across 2 tabs should only appear once
    expect(allOnline.map((u) => u.memberId)).toEqual([m1.id, m2.id, m3.id, m4.id, m5.id]);

    // When m1 is the current user: 4 others online, max 3 visible in stack, overflow = 1
    const stack4 = getVisibleOtherOnlineMembers(allOnline, m1.id);
    expect(stack4.others.map((u) => u.memberId)).toEqual([m2.id, m3.id, m4.id, m5.id]);
    expect(stack4.visibleStack.map((u) => u.memberId)).toEqual([m2.id, m3.id, m4.id]);
    expect(stack4.overflowCount).toBe(1);

    // When only 1 other is online -> stack has 1 avatar
    const stack1 = getVisibleOtherOnlineMembers(allOnline.slice(0, 2), m1.id);
    expect(stack1.visibleStack.map((u) => u.memberId)).toEqual([m2.id]);
    expect(stack1.overflowCount).toBe(0);

    // When only self is online -> stack is empty
    const stack0 = getVisibleOtherOnlineMembers(allOnline.slice(0, 1), m1.id);
    expect(stack0.visibleStack).toEqual([]);
  });
});
