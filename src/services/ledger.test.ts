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

  it('NEVER double-deducts Pool Left when marking an out-of-pocket expense Settled', () => {
    const before = calculateLedger(pilotTrip);
    const updatedTx = markTransactionSettled(pilotTrip.transactions, 'tx-out-fuel-solo');
    const after = calculateLedger({ ...pilotTrip, transactions: updatedTx });

    // Balance & spent MUST stay identical — zero double deduction!
    expect(after.poolSpent).toBe(before.poolSpent);
    expect(after.poolLeft).toBe(before.poolLeft);
    expect(after.totalSpent).toBe(before.totalSpent);

    // Pending reimburse clears cleanly to 0
    expect(after.pendingReimburseTotal).toBe(0);
    expect(after.pendingReimburseItems).toHaveLength(0);
  });

  it('formats compact IDR labels cleanly', () => {
    expect(formatCompactIDR(2_355_000)).toBe('Rp 2.36M');
    expect(formatCompactIDR(555_000)).toBe('Rp 555k');
    expect(formatCompactIDR(33_500)).toBe('Rp 33.5k');
  });
});
