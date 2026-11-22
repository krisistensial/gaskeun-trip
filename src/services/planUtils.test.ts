import { describe, expect, it } from 'vitest';
import type { PlanItem, TripDay } from '../types/trip';
import {
  buildSavedPlanItem,
  isClosedOnDate,
  isValidMapsUrl,
  normalizeExternalUrl,
} from './planUtils';

describe('Plan Utilities — mapsValidator & closedDays Detection', () => {
  describe('isValidMapsUrl', () => {
    it('accepts valid Google Maps short & full URLs with or without protocol', () => {
      expect(isValidMapsUrl('maps.app.goo.gl/triwindu-solo')).toBe(true);
      expect(isValidMapsUrl('https://maps.app.goo.gl/goa-maria-ganjuran')).toBe(true);
      expect(isValidMapsUrl('https://www.google.com/maps/place/Goa+Maria+Ganjuran')).toBe(true);
      expect(isValidMapsUrl('https://goo.gl/maps/abc123')).toBe(true);
      expect(isValidMapsUrl('https://maps.google.com/?q=-7.9261,110.3193')).toBe(true);
    });

    it('rejects empty, non-Maps, or malformed links', () => {
      expect(isValidMapsUrl('')).toBe(false);
      expect(isValidMapsUrl(undefined)).toBe(false);
      expect(isValidMapsUrl('https://instagram.com/reel/abc')).toBe(false);
      expect(isValidMapsUrl('https://maps.app.goo.gl/')).toBe(false);
      expect(isValidMapsUrl('not a url at all')).toBe(false);
    });

    it('normalizes protocol cleanly for opening external Google Maps', () => {
      expect(normalizeExternalUrl('maps.app.goo.gl/triwindu-solo')).toBe(
        'https://maps.app.goo.gl/triwindu-solo',
      );
      expect(normalizeExternalUrl('https://maps.app.goo.gl/triwindu-solo')).toBe(
        'https://maps.app.goo.gl/triwindu-solo',
      );
    });
  });

  describe('isClosedOnDate', () => {
    it('flags Warung Pojok Mbak Yuni (closed Sat & Sun) accurately', () => {
      const closedSatSun = [0, 6];
      expect(isClosedOnDate(closedSatSun, '2027-02-12')).toEqual({
        closed: false,
        weekdayName: null,
      }); // Friday
      expect(isClosedOnDate(closedSatSun, '2027-02-13')).toEqual({
        closed: true,
        weekdayName: 'Saturday',
      }); // Saturday
      expect(isClosedOnDate(closedSatSun, '2027-02-14')).toEqual({
        closed: true,
        weekdayName: 'Sunday',
      }); // Sunday
    });

    it('flags Warung Lotek Pak Mul (closed Sunday only) accurately', () => {
      const closedSun = [0];
      expect(isClosedOnDate(closedSun, '2027-02-13').closed).toBe(false); // Saturday
      expect(isClosedOnDate(closedSun, '2027-02-14')).toEqual({
        closed: true,
        weekdayName: 'Sunday',
      });
    });

    it('returns false safely for Ideas bucket (empty date) or open-daily stops', () => {
      expect(isClosedOnDate([0, 6], '').closed).toBe(false);
      expect(isClosedOnDate(undefined, '2027-02-13').closed).toBe(false);
    });
  });

  describe('buildSavedPlanItem', () => {
    const day3: TripDay = {
      id: 'day-3',
      date: '2027-02-13',
      dayLabel: 'Sat',
      dateNum: '13',
      city: 'Jogja',
    };

    const baseDraft: PlanItem = {
      id: 'it-7',
      dayId: 'day-3',
      type: 'place',
      title: 'Goa Maria Ganjuran',
      startTime: '08:30',
      locationHint: 'Bambanglipuro, Bantul',
      address: 'Jl. Ganjuran',
      mapsUrl: 'https://maps.app.goo.gl/goa-maria-ganjuran',
      status: 'active',
      notes: [],
    };

    it('preserves uploaded Supabase coverUrl and local dataUrl cleanly on save', () => {
      const supabaseUrl =
        'https://example.supabase.co/storage/v1/object/public/trip-assets/SOLO-27/plan-123.jpg';
      const savedRemote = buildSavedPlanItem({
        draft: { ...baseDraft, coverUrl: supabaseUrl },
        selectedDay: day3,
        showEndTime: false,
        notesHtml: '<div>Bring umbrella</div>',
        hasNoteText: true,
      });
      expect(savedRemote.coverUrl).toBe(supabaseUrl);
      expect(savedRemote.mapsVerified).toBe(true);

      const localDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      const savedLocal = buildSavedPlanItem({
        draft: { ...baseDraft, coverUrl: localDataUrl },
        selectedDay: day3,
        showEndTime: false,
        notesHtml: '',
        hasNoteText: false,
      });
      expect(savedLocal.coverUrl).toBe(localDataUrl);

      const savedRemoved = buildSavedPlanItem({
        draft: { ...baseDraft, coverUrl: '   ' },
        selectedDay: day3,
        showEndTime: false,
        notesHtml: '',
        hasNoteText: false,
      });
      expect(savedRemoved.coverUrl).toBeUndefined();
    });
  });
});
