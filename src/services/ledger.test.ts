import { describe, expect, it } from 'vitest';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { SharedTrip } from '../types/trip';
import { calculateLedger, formatCompactIDR, markTransactionSettled } from './ledger';

const pilotTrip = seedData as unknown as SharedTrip;

describe('Ledger Calculator — Solo–Jogja Pilot & Anti-Double-Deduction', () => {
  it('calculates Pool Target, Collected, Spent, Pool Left, Fundraise Left & Top Contributors accurately', () => {
    const summary = calculateLedger(pilotTrip);

    // 9 confirmed riders * 700,000 = 6,300,000 (Valen tentative excluded by default)
    expect(summary.activeMemberCount).toBe(9);
    expect(summary.poolTarget).toBe(6_300_000);

    // Sum of all Pool IN deposits = 2,480,000
    expect(summary.poolCollected).toBe(2_480_000);
    expect(summary.poolProgressPct).toBe(39);

    // Pool OUT expenses: 100,000 (Fuel 5 Bikes) + 25,000 (Parking Ganjuran) = 125,000
    expect(summary.poolSpent).toBe(125_000);
    expect(summary.poolLeft).toBe(2_355_000);

    // Fundraise IN = 33,500, OUT = 0
    expect(summary.fundraiseTarget).toBe(1_200_000);
    expect(summary.fundraiseCollected).toBe(33_500);
    expect(summary.fundraiseSpent).toBe(0);
    expect(summary.fundraiseLeft).toBe(33_500);

    // Pending reimburse: Fuel 5 Bikes (Rp 100,000 paid out of pocket by Kris)
    expect(summary.pendingReimburseTotal).toBe(100_000);
    expect(summary.pendingReimburseItems).toHaveLength(1);
    expect(summary.pendingReimburseItems[0].payerName).toBe('Kris');

    // Top Contributors ranking (#1 Kris 555k, #2 Rani 500k, #3 Chika 495k)
    expect(summary.topContributors[0].member.name).toBe('Kris');
    expect(summary.topContributors[0].paidPool).toBe(555_000);
    expect(summary.topContributors[1].member.name).toBe('Rani');
    expect(summary.topContributors[1].paidPool).toBe(500_000);
    expect(summary.topContributors[2].member.name).toBe('Chika');
    expect(summary.topContributors[2].paidPool).toBe(495_000);
  });

  it('recalculates Pool Target dynamically when toggling tentative rider (Valen)', () => {
    const withValen: SharedTrip = {
      ...pilotTrip,
      financeConfig: {
        ...pilotTrip.financeConfig,
        includeTentative: true,
      },
    };
    const summary = calculateLedger(withValen);
    expect(summary.activeMemberCount).toBe(10);
    expect(summary.poolTarget).toBe(7_000_000);
  });

  it('NEVER double-deducts Pool Left or Fundraise Left when marking settled (including repeated calls)', () => {
    const withFundraiseOut: SharedTrip = {
      ...pilotTrip,
      transactions: [
        ...pilotTrip.transactions,
        {
          id: 'tx-out-snack-box',
          tripId: pilotTrip.id,
          direction: 'out',
          pocket: 'fundraise',
          title: 'Packaging Boxes',
          amount: 15_000,
          date: '2026-11-10',
          paidOutOfPocket: true,
          paidByMemberId: 'm-chika',
          reimbursed: false,
          createdAt: '2026-11-10T10:00:00+07:00',
          updatedAt: '2026-11-10T10:00:00+07:00',
        },
      ],
    };

    const before = calculateLedger(withFundraiseOut);
    expect(before.poolLeft).toBe(2_355_000);
    expect(before.fundraiseLeft).toBe(18_500);
    expect(before.pendingReimburseTotal).toBe(115_000);

    // Mark Pool out-of-pocket settled, then call a second time to assert idempotency
    const afterPoolSettle = markTransactionSettled(
      markTransactionSettled(withFundraiseOut.transactions, 'tx-out-fuel-solo'),
      'tx-out-fuel-solo',
    );
    const midSummary = calculateLedger({ ...withFundraiseOut, transactions: afterPoolSettle });
    expect(midSummary.poolSpent).toBe(before.poolSpent);
    expect(midSummary.poolLeft).toBe(before.poolLeft);
    expect(midSummary.pendingReimburseTotal).toBe(15_000);

    // Mark Fundraise out-of-pocket settled
    const afterAllSettled = markTransactionSettled(afterPoolSettle, 'tx-out-snack-box');
    const finalSummary = calculateLedger({ ...withFundraiseOut, transactions: afterAllSettled });
    expect(finalSummary.fundraiseSpent).toBe(before.fundraiseSpent);
    expect(finalSummary.fundraiseLeft).toBe(before.fundraiseLeft);
    expect(finalSummary.poolLeft).toBe(before.poolLeft);
    expect(finalSummary.totalSpent).toBe(before.totalSpent);
    expect(finalSummary.pendingReimburseTotal).toBe(0);
    expect(finalSummary.pendingReimburseItems).toHaveLength(0);
  });

  it('formats compact IDR labels cleanly', () => {
    expect(formatCompactIDR(2_355_000)).toBe('Rp 2.36M');
    expect(formatCompactIDR(555_000)).toBe('Rp 555k');
    expect(formatCompactIDR(33_500)).toBe('Rp 33.5k');
  });

  it('reconciles Combined Treasury & multi-source Budget Pockets with zero double counting', () => {
    const withPockets: SharedTrip = {
      ...pilotTrip,
      budgetPockets: [
        {
          id: 'pkt-transport',
          name: 'Transport & Fuel',
          emoji: '🛵',
          allocations: [
            { id: 'a1', source: 'pool', amount: 800_000, createdAt: '2026-11-25T08:00:00Z' },
            { id: 'a2', source: 'fundraise', amount: 25_000, createdAt: '2026-11-25T08:00:00Z' },
          ],
          createdAt: '2026-11-25T08:00:00Z',
          updatedAt: '2026-11-25T08:00:00Z',
        },
      ],
      transactions: [
        ...pilotTrip.transactions,
        {
          id: 'tx-pocket-rent',
          tripId: pilotTrip.id,
          direction: 'out',
          pocket: 'pool',
          budgetPocketId: 'pkt-transport',
          title: 'Motorbike Deposit',
          amount: 300_000,
          date: '2026-11-25',
          createdAt: '2026-11-25T09:00:00Z',
          updatedAt: '2026-11-25T09:00:00Z',
        },
      ],
    };

    const s = calculateLedger(withPockets);

    // Combined inflow = Pool (2,480,000) + Fundraise (33,500) = 2,513,500
    expect(s.combinedCollected).toBe(2_513_500);

    // Direct pool spent = 125,000, Pocket spent = 300,000 -> Total spent = 425,000
    expect(s.poolSpent).toBe(125_000);
    expect(s.totalPocketSpent).toBe(300_000);
    expect(s.totalSpent).toBe(425_000);
    expect(s.combinedNetBalance).toBe(2_088_500);

    // Allocations: Pool gave 800,000, Fundraise gave 25,000 -> Free unallocated drops cleanly
    expect(s.poolAllocated).toBe(800_000);
    expect(s.poolUnallocated).toBe(2_480_000 - 125_000 - 800_000);
    expect(s.fundraiseAllocated).toBe(25_000);
    expect(s.fundraiseUnallocated).toBe(33_500 - 25_000);

    // Pocket breakdown & Accounting Equation Invariant:
    // combinedNetBalance === combinedUnallocated + totalPocketRemaining
    expect(s.pockets[0].allocatedTotal).toBe(825_000);
    expect(s.pockets[0].spent).toBe(300_000);
    expect(s.pockets[0].remaining).toBe(525_000);
    expect(s.combinedUnallocated + s.totalPocketRemaining).toBe(s.combinedNetBalance);
  });
});
