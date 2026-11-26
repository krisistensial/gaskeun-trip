import { describe, expect, it } from 'vitest';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { ChatMessage, SharedTrip } from '../types/trip';
import { buildTripRecapData, hasTripEnded } from './tripRecap';

const pilotTrip = seedData as unknown as SharedTrip;

describe('tripRecap', () => {
  it('detects whether trip end date has passed accurately', () => {
    expect(hasTripEnded('2027-02-14', new Date('2027-02-14T18:00:00+07:00'))).toBe(false);
    expect(hasTripEnded('2027-02-14', new Date('2027-02-15T01:00:00+07:00'))).toBe(true);
    expect(hasTripEnded('', new Date('2027-02-15T01:00:00+07:00'))).toBe(false);
  });

  it('computes recap stats, top chatter, top sticker, and awards', () => {
    const [m0, m1] = pilotTrip.members;
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        tripCode: pilotTrip.code,
        senderId: m0.id,
        senderName: m0.name,
        kind: 'text',
        text: 'Gas pol!',
        reactions: {},
        createdAt: '2027-02-11T08:00:00Z',
      },
      {
        id: 'm2',
        tripCode: pilotTrip.code,
        senderId: m0.id,
        senderName: m0.name,
        kind: 'sticker',
        stickerId: 'stk-gas',
        text: 'Gas!',
        reactions: {},
        createdAt: '2027-02-11T08:01:00Z',
      },
      {
        id: 'm3',
        tripCode: pilotTrip.code,
        senderId: m1.id,
        senderName: m1.name,
        kind: 'sticker',
        stickerId: 'stk-gas',
        text: 'Gas!',
        reactions: {},
        createdAt: '2027-02-11T08:02:00Z',
      },
      {
        id: 'm4',
        tripCode: pilotTrip.code,
        senderId: m1.id,
        senderName: m1.name,
        kind: 'text',
        text: 'Deleted msg',
        reactions: {},
        deleted: true,
        createdAt: '2027-02-11T08:03:00Z',
      },
    ];

    const recap = buildTripRecapData({
      trip: pilotTrip,
      messages,
      polls: [
        {
          id: 'p1',
          tripCode: pilotTrip.code,
          question: 'Makan di mana?',
          options: [
            { id: 'o1', label: 'Gudeg', voterIds: [m0.id] },
            { id: 'o2', label: 'Sate', voterIds: [] },
          ],
          createdBy: m0.id,
          createdByName: m0.name,
          createdAt: '2027-02-11T09:00:00Z',
        },
      ],
      albumPhotos: [],
      nowDate: new Date('2027-02-16T09:00:00+07:00'),
    });

    expect(recap.tripCode).toBe(pilotTrip.code);
    expect(recap.isTripCompleted).toBe(true);
    expect(recap.daysCount).toBeGreaterThanOrEqual(4);
    expect(recap.messagesCount).toBe(3); // excludes deleted message
    expect(recap.pollsCount).toBe(1);
    expect(recap.topChatter).toEqual({ name: m0.name, count: 2 });
    expect(recap.topSticker?.count).toBe(2);
    expect(recap.badges.some((b) => b.label === 'Chat Legend' && b.winner === m0.name)).toBe(true);
    expect(recap.badges.some((b) => b.label === 'Signature Sticker')).toBe(true);
  });
});
