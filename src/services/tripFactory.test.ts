import { describe, expect, it } from 'vitest';
import { buildNewTrip, generateDaysRange, hashPin, verifyPin } from './tripFactory';

describe('Trip Factory & Crew PIN Verification', () => {
  it('verifies pilot Solo–Jogja Crew PIN 1234 against stored SHA-256 hash', async () => {
    const pilotHash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
    expect(await verifyPin('1234', pilotHash)).toBe(true);
    expect(await verifyPin('9999', pilotHash)).toBe(false);
  });

  it('generates inclusive TripDays plus Ideas bucket', () => {
    const days = generateDaysRange('2027-02-11', '2027-02-14');
    expect(days).toHaveLength(5);
    expect(days[0]).toMatchObject({ dayLabel: 'Thu', dateNum: '11' });
    expect(days[3]).toMatchObject({ dayLabel: 'Sun', dateNum: '14' });
    expect(days[4].isIdeas).toBe(true);
  });

  it('builds a valid new SharedTrip with custom code and hashed PIN', async () => {
    const trip = await buildNewTrip({
      title: 'Bali Escape',
      startDate: '2027-05-01',
      startTime: '08:30',
      endDate: '2027-05-03',
      creatorName: 'Kris',
      crewPin: '4321',
      poolTargetPerPerson: 1_500_000,
      fundraiseTarget: 500_000,
      customCode: 'bali-27',
    });

    expect(trip.code).toBe('BALI-27');
    expect(trip.days).toHaveLength(4); // 3 days + Ideas
    expect(trip.members).toHaveLength(1);
    expect(trip.members[0].isCreator).toBe(true);
    expect(trip.crewPinHash).toBe(await hashPin('4321'));
    expect(trip.financeConfig.poolTargetPerPerson).toBe(1_500_000);
  });
});
