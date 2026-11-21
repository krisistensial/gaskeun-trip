import type { SharedTrip, Transaction, TripMember } from '../types/trip';

export interface MemberContributionSummary {
  member: TripMember;
  paidPool: number;
  targetPool: number;
  remainingPool: number;
  progressPct: number;
  depositCount: number;
  deposits: Transaction[];
}

export interface PendingReimburseItem {
  transaction: Transaction;
  payerName: string;
}

export interface LedgerSummary {
  activeMemberCount: number;
  poolTarget: number;
  poolCollected: number;
  poolSpent: number;
  poolLeft: number;
  poolProgressPct: number;

  fundraiseTarget: number;
  fundraiseCollected: number;
  fundraiseSpent: number;
  fundraiseLeft: number;
  fundraiseProgressPct: number;

  totalSpent: number;
  pendingReimburseTotal: number;
  pendingReimburseItems: PendingReimburseItem[];

  memberContributions: MemberContributionSummary[];
  topContributors: MemberContributionSummary[];
}

/**
 * Pure financial calculator for the unified Transaction IN/OUT ledger.
 *
 * Anti-Double-Deduction Guarantee:
 * - An Expense OUT with `paidOutOfPocket: true` deducts `poolLeft` or `fundraiseLeft`
 *   EXACTLY ONCE (via its single `direction: 'out'` entry).
 * - Marking it settled (`reimbursed: true`) only clears it from `pendingReimburseItems`
 *   and NEVER deducts the pocket balance a second time.
 */
export function calculateLedger(trip: SharedTrip): LedgerSummary {
  const { poolTargetPerPerson, fundraiseTarget, includeTentative } = trip.financeConfig;

  const includedMembers = trip.members.filter(
    (m) => m.status === 'confirmed' || includeTentative,
  );
  const memberById = new Map(trip.members.map((m) => [m.id, m]));

  const poolTarget = includedMembers.length * poolTargetPerPerson;

  let poolCollected = 0;
  let poolSpent = 0;
  let fundraiseCollected = 0;
  let fundraiseSpent = 0;

  const depositsByMember = new Map<string, Transaction[]>();
  const pendingReimburseItems: PendingReimburseItem[] = [];

  for (const tx of trip.transactions) {
    const amount = Math.max(0, Math.round(tx.amount));

    if (tx.pocket === 'pool') {
      if (tx.direction === 'in') {
        poolCollected += amount;
        if (tx.memberId) {
          const list = depositsByMember.get(tx.memberId) ?? [];
          list.push(tx);
          depositsByMember.set(tx.memberId, list);
        }
      } else {
        poolSpent += amount;
      }
    } else if (tx.pocket === 'fundraise') {
      if (tx.direction === 'in') {
        fundraiseCollected += amount;
      } else {
        fundraiseSpent += amount;
      }
    }

    if (
      tx.direction === 'out' &&
      (tx.pocket === 'pool' || tx.pocket === 'fundraise') &&
      tx.paidOutOfPocket &&
      !tx.reimbursed
    ) {
      const payer = tx.paidByMemberId ? memberById.get(tx.paidByMemberId) : undefined;
      pendingReimburseItems.push({
        transaction: tx,
        payerName: payer?.name ?? 'Crew',
      });
    }
  }

  const poolLeft = poolCollected - poolSpent;
  const fundraiseLeft = fundraiseCollected - fundraiseSpent;
  const totalSpent = poolSpent + fundraiseSpent;
  const pendingReimburseTotal = pendingReimburseItems.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.transaction.amount)),
    0,
  );

  const memberContributions: MemberContributionSummary[] = trip.members.map((member) => {
    const deposits = (depositsByMember.get(member.id) ?? []).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    const paidPool = deposits.reduce((sum, tx) => sum + Math.max(0, Math.round(tx.amount)), 0);
    const isCounted = member.status === 'confirmed' || includeTentative;
    const targetPool = isCounted ? poolTargetPerPerson : 0;
    const remainingPool = Math.max(0, targetPool - paidPool);
    const progressPct =
      targetPool > 0 ? Math.min(100, Math.round((paidPool / targetPool) * 100)) : 0;

    return {
      member,
      paidPool,
      targetPool,
      remainingPool,
      progressPct,
      depositCount: deposits.length,
      deposits,
    };
  });

  const topContributors = [...memberContributions]
    .filter((entry) => entry.member.status === 'confirmed' || includeTentative)
    .sort((a, b) => b.paidPool - a.paidPool || a.member.name.localeCompare(b.member.name));

  const poolProgressPct =
    poolTarget > 0 ? Math.min(100, Math.round((poolCollected / poolTarget) * 100)) : 0;
  const fundraiseProgressPct =
    fundraiseTarget > 0
      ? Math.min(100, Math.round((fundraiseCollected / fundraiseTarget) * 100))
      : 0;

  return {
    activeMemberCount: includedMembers.length,
    poolTarget,
    poolCollected,
    poolSpent,
    poolLeft,
    poolProgressPct,

    fundraiseTarget,
    fundraiseCollected,
    fundraiseSpent,
    fundraiseLeft,
    fundraiseProgressPct,

    totalSpent,
    pendingReimburseTotal,
    pendingReimburseItems,

    memberContributions,
    topContributors,
  };
}

/**
 * Pure helper to mark an out-of-pocket Expense OUT as settled.
 * Only flips `reimbursed: true` without creating a duplicate OUT entry.
 */
export function markTransactionSettled(
  transactions: Transaction[],
  transactionId: string,
  timestamp = new Date().toISOString(),
): Transaction[] {
  return transactions.map((tx) =>
    tx.id === transactionId && tx.direction === 'out' && tx.paidOutOfPocket
      ? { ...tx, reimbursed: true, updatedAt: timestamp }
      : tx,
  );
}

/**
 * Calculate total personal spend (Layer 2 local ledger).
 */
export function calculatePersonalTotal(personalTransactions: Transaction[]): number {
  return personalTransactions
    .filter((tx) => tx.pocket === 'personal')
    .reduce((sum, tx) => sum + Math.max(0, Math.round(tx.amount)), 0);
}

export function formatIDR(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  const formatted = abs.toLocaleString('en-US');
  return amount < 0 ? `-Rp ${formatted}` : `Rp ${formatted}`;
}

export function formatCompactIDR(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const rounded = Math.round((abs / 1_000_000) * 100) / 100;
    const label = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(2).replace(/\.?0+$/, '');
    return `${sign}Rp ${label}M`;
  }
  if (abs >= 1_000) {
    const rounded = Math.round((abs / 1_000) * 10) / 10;
    const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
    return `${sign}Rp ${label}k`;
  }
  return `${sign}Rp ${abs}`;
}
