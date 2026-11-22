import { describe, expect, it } from 'vitest';
import { buildTrainSlotsForLayout } from './TrainSeatMap';

describe('KAI Train Seat Map Builder', () => {
  it('generates 3-2 Economy layout (A B C | D E) and preserves existing crew assignments', () => {
    const slots = buildTrainSlotsForLayout(
      { format: '3-2', carNumber: 'Car 3', startRow: 10, endRow: 11, facingRows: true },
      [
        { role: '10A', memberId: 'm-kris' },
        { role: '10E', memberId: 'm-chika' },
      ],
    );
    expect(slots).toHaveLength(10); // 2 rows * 5 seats
    expect(slots.map((s) => s.role)).toEqual([
      '10A', '10B', '10C', '10D', '10E',
      '11A', '11B', '11C', '11D', '11E',
    ]);
    expect(slots.find((s) => s.role === '10A')?.memberId).toBe('m-kris');
    expect(slots.find((s) => s.role === '10E')?.memberId).toBe('m-chika');
  });

  it('generates 2-2 Executive layout (A B | C D) cleanly', () => {
    const slots = buildTrainSlotsForLayout({
      format: '2-2',
      carNumber: 'Car 1',
      startRow: 4,
      endRow: 5,
      facingRows: false,
    });
    expect(slots).toHaveLength(8); // 2 rows * 4 seats
    expect(slots.map((s) => s.role)).toEqual([
      '4A', '4B', '4C', '4D',
      '5A', '5B', '5C', '5D',
    ]);
  });
});
