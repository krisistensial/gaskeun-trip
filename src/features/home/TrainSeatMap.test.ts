import { describe, expect, it } from 'vitest';
import { assignOrSwapTrainSeat, buildTrainSlotsForLayout } from './TrainSeatMap';

describe('KAI Train Seat Map Builder & Auto-Swap', () => {
  it('generates 3-2 Economy layout (A B C | D E) and preserves existing crew assignments', () => {
    const slots = buildTrainSlotsForLayout(
      { format: '3-2', carNumber: 'Coach 3', startRow: 10, endRow: 11, facingRows: false },
      [
        { role: '10A', memberId: 'm-kris' },
        { role: '10E', memberId: 'm-chika' },
      ],
    );
    expect(slots).toHaveLength(10);
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
      carNumber: 'Coach 1',
      startRow: 4,
      endRow: 5,
      facingRows: false,
    });
    expect(slots).toHaveLength(8);
    expect(slots.map((s) => s.role)).toEqual([
      '4A', '4B', '4C', '4D',
      '5A', '5B', '5C', '5D',
    ]);
  });

  it('auto-swaps seats when assigning an already-seated rider to an occupied seat (zero duplicates)', () => {
    const initial = [
      { role: '10A', memberId: 'm-kris' },
      { role: '10B', memberId: 'm-rani' },
      { role: '10C', memberId: null },
    ];

    // Swap Kris (10A) into Rani's seat (10B) -> Rani moves to 10A!
    const swapped = assignOrSwapTrainSeat(initial, 1, 'm-kris');
    expect(swapped[0].memberId).toBe('m-rani');
    expect(swapped[1].memberId).toBe('m-kris');
    expect(swapped[2].memberId).toBeNull();

    // Move Kris (10B) into open seat (10C) -> 10B clears automatically!
    const moved = assignOrSwapTrainSeat(swapped, 2, 'm-kris');
    expect(moved[1].memberId).toBeNull();
    expect(moved[2].memberId).toBe('m-kris');
    expect(moved.filter((s) => s.memberId === 'm-kris')).toHaveLength(1);
  });
});
