import { describe, expect, it } from 'vitest';
import {
  computeKaiBookingOpenIso,
  datetimeLocalWibToIso,
  formatTicketOpenWib,
  isoToDatetimeLocalWib,
  parseCalendarDate,
  resolveTrainTicketDrops,
} from './trainTickets';

describe('trainTickets KAI H-45 countdown service', () => {
  it('parses ISO and display travel dates into timezone-safe calendar dates', () => {
    expect(parseCalendarDate('2027-02-11')).toEqual({ year: 2027, month: 2, day: 11 });
    expect(parseCalendarDate('Thu, Feb 11, 2027')).toEqual({ year: 2027, month: 2, day: 11 });
    expect(parseCalendarDate('Mon, Feb 15, 2027')).toEqual({ year: 2027, month: 2, day: 15 });
    expect(parseCalendarDate('15 Feb 2027')).toEqual({ year: 2027, month: 2, day: 15 });
  });

  it('computes exact KAI H-45 00:00 WIB ticket drop timestamps for Solo-Jogja', () => {
    expect(computeKaiBookingOpenIso('Thu, Feb 11, 2027')).toBe('2026-12-28T00:00:00+07:00');
    expect(computeKaiBookingOpenIso('Mon, Feb 15, 2027')).toBe('2027-01-01T00:00:00+07:00');
  });

  it('converts datetime-local WIB values cleanly in both directions', () => {
    const iso = datetimeLocalWibToIso('2026-12-28T00:00');
    expect(iso).toBe('2026-12-28T00:00:00+07:00');
    expect(isoToDatetimeLocalWib(iso)).toBe('2026-12-28T00:00');
    expect(formatTicketOpenWib(iso)).toEqual({
      short: 'Dec 28 · 00:00',
      full: 'Dec 28, 2026 · 00:00 WIB',
    });
  });

  it('resolves outbound & return countdowns, soon/open states, and auto-hides strip when both booked', () => {
    const baseTrip = {
      startDate: '2027-02-11',
      endDate: '2027-02-14',
      trainPass: {
        trainName: 'KA Bengawan (Economy)',
        outboundCode: 'KA 246',
        outboundRoute: 'PSE → PWS',
        outboundTime: '09:14 – 18:20 WIB',
        outboundDate: 'Thu, Feb 11, 2027',
        returnRoute: 'LPN → PSE',
        returnTime: '00:26 – 08:20 WIB',
        returnDate: 'Mon, Feb 15, 2027',
      },
    };

    // 2 days before outbound drop (Dec 26, 2026 00:00 WIB) -> both soon (<= 7d)
    const dec26 = Date.parse('2026-12-26T00:00:00+07:00');
    const resolvedSoon = resolveTrainTicketDrops(baseTrip, dec26);
    expect(resolvedSoon?.shouldShowHomeStrip).toBe(true);
    expect(resolvedSoon?.outbound.status).toBe('soon');
    expect(resolvedSoon?.outbound.countdown.days).toBe(2);
    expect(resolvedSoon?.returnLeg?.status).toBe('soon');
    expect(resolvedSoon?.returnLeg?.countdown.days).toBe(6);

    // Outbound open & custom override on return
    const dec28Noon = Date.parse('2026-12-28T12:00:00+07:00');
    const resolvedCustom = resolveTrainTicketDrops(
      {
        ...baseTrip,
        trainPass: {
          ...baseTrip.trainPass,
          returnTicketOpenAt: '2027-01-02T09:00:00+07:00',
        },
      },
      dec28Noon,
    );
    expect(resolvedCustom?.outbound.status).toBe('open');
    expect(resolvedCustom?.returnLeg?.isCustom).toBe(true);
    expect(resolvedCustom?.returnLeg?.formattedShortDate).toBe('Jan 2 · 09:00');

    // Both booked -> Home strip automatically hides
    const resolvedBooked = resolveTrainTicketDrops(
      {
        ...baseTrip,
        trainPass: {
          ...baseTrip.trainPass,
          outboundBooked: true,
          returnBooked: true,
        },
      },
      dec26,
    );
    expect(resolvedBooked?.allBooked).toBe(true);
    expect(resolvedBooked?.shouldShowHomeStrip).toBe(false);
  });
});
