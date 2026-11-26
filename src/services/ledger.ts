import type {
  BudgetPocket,
  SharedTrip,
  Transaction,
  TripMember,
} from '../types/trip';

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

export interface BudgetPocketSummary {
  pocket: BudgetPocket;
  allocatedFromPool: number;
  allocatedFromFundraise: number;
  allocatedTotal: number;
  spent: number;
  remaining: number;
  progressPct: number;
  isOverBudget: boolean;
  transactions: Transaction[];
}

export interface LedgerSummary {
  activeMemberCount: number;
  poolTarget: number;
  poolCollected: number;
  poolSpent: number;
  poolLeft: number;
  poolAllocated: number;
  poolUnallocated: number;
  poolProgressPct: number;

  fundraiseTarget: number;
  fundraiseCollected: number;
  fundraiseSpent: number;
  fundraiseLeft: number;
  fundraiseAllocated: number;
  fundraiseUnallocated: number;
  fundraiseProgressPct: number;

  /** Unified Combined Treasury metrics (Pool + Fundraise) */
  combinedCollected: number;
  combinedTarget: number;
  combinedNetBalance: number;
  combinedUnallocated: number;
  totalAllocatedToPockets: number;
  totalPocketSpent: number;
  totalPocketRemaining: number;
  pockets: BudgetPocketSummary[];

  totalSpent: number;
  pendingReimburseTotal: number;
  pendingReimburseItems: PendingReimburseItem[];

  memberContributions: MemberContributionSummary[];
  topContributors: MemberContributionSummary[];
}

/**
 * Pure two-layer fund-accounting calculator:
 *
 * Layer 1 (Funding Sources -> Combined Treasury):
 *   - Real inflows enter `pool` (Crew Contributions) and `fundraise`.
 *   - Combined Inflow = `poolCollected + fundraiseCollected`.
 *
 * Layer 2 (Virtual Budget Pockets / Envelopes):
 *   - Allocating money from Pool/Fundraise into a `BudgetPocket` reserves internal funds
 *     (`poolAllocated`, `fundraiseAllocated`) without recording an expense (`Spent`).
 *   - Expenses (`direction: 'out'`) with `budgetPocketId` deduct that pocket's balance once.
 *   - Direct expenses without `budgetPocketId` deduct unallocated Pool/Fundraise once.
 *
 * Accounting Equation Invariant (always exact):
 *   `combinedNetBalance === combinedCollected - totalSpent`
 *   `combinedNetBalance === combinedUnallocated + totalPocketRemaining`
 *
 * Anti-Double-Deduction Guarantee:
 *   - An Expense OUT with `paidOutOfPocket: true` deducts balance EXACTLY ONCE.
 *   - Marking `reimbursed: true` clears `pendingReimburseItems` without deducting again.
 */
export function calculateLedger(trip: SharedTrip): LedgerSummary {
  const { poolTargetPerPerson, fundraiseTarget, includeTentative } = trip.financeConfig;

  const includedMembers = trip.members.filter(
    (m) => m.status === 'confirmed' || includeTentative,
  );
  const memberById = new Map(trip.members.map((m) => [m.id, m]));
  const rawPockets = Array.isArray(trip.budgetPockets) ? trip.budgetPockets : [];
  const validPocketIds = new Set(rawPockets.map((p) => p.id));

  const poolTarget = includedMembers.length * poolTargetPerPerson;

  let poolCollected = 0;
  let poolDirectSpent = 0;
  let fundraiseCollected = 0;
  let fundraiseDirectSpent = 0;

  const depositsByMember = new Map<string, Transaction[]>();
  const pocketTxById = new Map<string, Transaction[]>();
  const pendingReimburseItems: PendingReimburseItem[] = [];

  for (const tx of trip.transactions) {
    const amount = Math.max(0, Math.round(tx.amount));
    const targetPocketId =
      tx.direction === 'out' && tx.budgetPocketId && validPocketIds.has(tx.budgetPocketId)
        ? tx.budgetPocketId
        : undefined;

    if (tx.pocket === 'pool') {
      if (tx.direction === 'in') {
        poolCollected += amount;
        if (tx.memberId) {
          const list = depositsByMember.get(tx.memberId) ?? [];
          list.push(tx);
          depositsByMember.set(tx.memberId, list);
        }
      } else if (targetPocketId) {
        const list = pocketTxById.get(targetPocketId) ?? [];
        list.push(tx);
        pocketTxById.set(targetPocketId, list);
      } else {
        poolDirectSpent += amount;
      }
    } else if (tx.pocket === 'fundraise') {
      if (tx.direction === 'in') {
        fundraiseCollected += amount;
      } else if (targetPocketId) {
        const list = pocketTxById.get(targetPocketId) ?? [];
        list.push(tx);
        pocketTxById.set(targetPocketId, list);
      } else {
        fundraiseDirectSpent += amount;
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

  let poolAllocated = 0;
  let fundraiseAllocated = 0;
  let totalPocketSpent = 0;

  const pockets: BudgetPocketSummary[] = rawPockets.map((pocket) => {
    let allocatedFromPool = 0;
    let allocatedFromFundraise = 0;
    for (const alloc of pocket.allocations ?? []) {
      const val = Math.max(0, Math.round(alloc.amount));
      if (alloc.source === 'pool') allocatedFromPool += val;
      else if (alloc.source === 'fundraise') allocatedFromFundraise += val;
    }

    const allocatedTotal = allocatedFromPool + allocatedFromFundraise;
    const txList = (pocketTxById.get(pocket.id) ?? []).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    const spent = txList.reduce(
      (sum, tx) => sum + Math.max(0, Math.round(tx.amount)),
      0,
    );
    const remaining = allocatedTotal - spent;
    const progressPct =
      allocatedTotal > 0 ? Math.min(100, Math.round((spent / allocatedTotal) * 100)) : 0;

    poolAllocated += allocatedFromPool;
    fundraiseAllocated += allocatedFromFundraise;
    totalPocketSpent += spent;

    return {
      pocket,
      allocatedFromPool,
      allocatedFromFundraise,
      allocatedTotal,
      spent,
      remaining,
      progressPct,
      isOverBudget: remaining < 0,
      transactions: txList,
    };
  });

  const poolLeft = poolCollected - poolDirectSpent;
  const fundraiseLeft = fundraiseCollected - fundraiseDirectSpent;
  const poolUnallocated = poolCollected - poolDirectSpent - poolAllocated;
  const fundraiseUnallocated = fundraiseCollected - fundraiseDirectSpent - fundraiseAllocated;

  const combinedCollected = poolCollected + fundraiseCollected;
  const combinedTarget = poolTarget + fundraiseTarget;
  const totalAllocatedToPockets = poolAllocated + fundraiseAllocated;
  const totalPocketRemaining = totalAllocatedToPockets - totalPocketSpent;
  const totalSpent = poolDirectSpent + fundraiseDirectSpent + totalPocketSpent;
  const combinedNetBalance = combinedCollected - totalSpent;
  const combinedUnallocated = poolUnallocated + fundraiseUnallocated;

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
    poolSpent: poolDirectSpent,
    poolLeft,
    poolAllocated,
    poolUnallocated,
    poolProgressPct,

    fundraiseTarget,
    fundraiseCollected,
    fundraiseSpent: fundraiseDirectSpent,
    fundraiseLeft,
    fundraiseAllocated,
    fundraiseUnallocated,
    fundraiseProgressPct,

    combinedCollected,
    combinedTarget,
    combinedNetBalance,
    combinedUnallocated,
    totalAllocatedToPockets,
    totalPocketSpent,
    totalPocketRemaining,
    pockets,

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

export interface MemberSplitSummary {
  member: TripMember;
  shareTotal: number;
  frontedTotal: number;
  /** Positive = owed money back, Negative = owes for split items */
  netBalance: number;
  txCount: number;
}

export interface SplitSettlementItem {
  from: TripMember;
  to: TripMember;
  amount: number;
}

export interface SplitBillSummary {
  splitTxCount: number;
  splitTotalAmount: number;
  memberSummaries: MemberSplitSummary[];
  settlements: SplitSettlementItem[];
}

/**
 * Computes per-member shares & suggested settlements across expenses that specify
 * `splitMemberIds` (selective split bill per transaction).
 */
export function computeSplitBillSummary(
  transactions: readonly Transaction[],
  members: readonly TripMember[],
): SplitBillSummary {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const shareById = new Map<string, number>();
  const frontedById = new Map<string, number>();
  const txCountById = new Map<string, number>();

  let splitTxCount = 0;
  let splitTotalAmount = 0;

  for (const tx of transactions) {
    if (tx.direction !== 'out' || (tx.pocket !== 'pool' && tx.pocket !== 'fundraise')) {
      continue;
    }
    const participants = Array.isArray(tx.splitMemberIds)
      ? Array.from(new Set(tx.splitMemberIds)).filter((id) => memberById.has(id))
      : [];
    if (participants.length === 0) continue;

    const amount = Math.max(0, Math.round(tx.amount));
    if (amount <= 0) continue;

    splitTxCount += 1;
    splitTotalAmount += amount;

    const baseShare = Math.floor(amount / participants.length);
    let remainder = amount - baseShare * participants.length;

    for (const id of participants) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      shareById.set(id, (shareById.get(id) ?? 0) + baseShare + extra);
      txCountById.set(id, (txCountById.get(id) ?? 0) + 1);
    }

    if (tx.paidOutOfPocket && !tx.reimbursed && tx.paidByMemberId && memberById.has(tx.paidByMemberId)) {
      frontedById.set(
        tx.paidByMemberId,
        (frontedById.get(tx.paidByMemberId) ?? 0) + amount,
      );
    }
  }

  const memberSummaries: MemberSplitSummary[] = members
    .filter((m) => (shareById.get(m.id) ?? 0) > 0 || (frontedById.get(m.id) ?? 0) > 0)
    .map((member) => {
      const shareTotal = shareById.get(member.id) ?? 0;
      const frontedTotal = frontedById.get(member.id) ?? 0;
      return {
        member,
        shareTotal,
        frontedTotal,
        netBalance: frontedTotal - shareTotal,
        txCount: txCountById.get(member.id) ?? 0,
      };
    })
    .sort((a, b) => b.shareTotal - a.shareTotal);

  const debtors = memberSummaries
    .filter((s) => s.netBalance < -1)
    .map((s) => ({ member: s.member, remaining: Math.abs(s.netBalance) }))
    .sort((a, b) => b.remaining - a.remaining);
  const creditors = memberSummaries
    .filter((s) => s.netBalance > 1)
    .map((s) => ({ member: s.member, remaining: s.netBalance }))
    .sort((a, b) => b.remaining - a.remaining);

  const settlements: SplitSettlementItem[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].remaining, creditors[j].remaining);
    if (pay >= 1) {
      settlements.push({
        from: debtors[i].member,
        to: creditors[j].member,
        amount: Math.round(pay),
      });
    }
    debtors[i].remaining -= pay;
    creditors[j].remaining -= pay;
    if (debtors[i].remaining <= 1) i += 1;
    if (creditors[j].remaining <= 1) j += 1;
  }

  return {
    splitTxCount,
    splitTotalAmount,
    memberSummaries,
    settlements,
  };
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
